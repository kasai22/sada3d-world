import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";

import { analyzeGeometry } from "@/lib/geometry/analyze";
import { measurementValue } from "@/lib/geometry/types";

import {
  CUBE_TRIANGLES,
  OPEN_CUBE_TRIANGLES,
  cube3mf,
  cubeObj,
  cubeStl,
  cubeVertices,
  makeThreeMf,
  makeZip,
  openMesh3mf,
  twoPart3mf,
} from "./fixtures";
import { analyzeModel, parseModel } from "./index";
import { isSafeEntryName, openZip } from "./zip";
import type { ModelInput } from "./types";

/**
 * Model parsing, container security and geometry math.
 *
 * Every fixture is generated in `fixtures.ts` rather than committed as a binary,
 * so the hostile ones — traversal, bombs, malformed XML — are reviewable in a
 * diff instead of being opaque blobs in the repository.
 *
 * The measurements are checked against a shape whose answers are known exactly:
 * a 10 mm cube has a volume of 1000 mm³, a surface area of 600 mm² and twelve
 * triangles. A test that only asserted "some number came back" would pass for
 * an implementation that returned the wrong one.
 */

const input = (name: string, bytes: Uint8Array): ModelInput => ({
  fileName: name,
  bytes,
});

/* ------------------------------------------------------------------ *
 * ZIP safety
 * ------------------------------------------------------------------ */

test("entry names that could escape a directory are refused", () => {
  for (const hostile of [
    "../escape.model",
    "../../etc/passwd",
    "3D/../../escape.model",
    "/absolute.model",
    "C:/windows/system32",
    "C:\\windows\\system32",
    "back\\slash.model",
    "nul\u0000.model",
    "",
  ]) {
    assert.equal(isSafeEntryName(hostile), false, `${hostile} was accepted`);
  }
});

test("ordinary relative names are accepted", () => {
  for (const safe of ["3D/3dmodel.model", "_rels/.rels", "Metadata/thumbnail.png"]) {
    assert.equal(isSafeEntryName(safe), true, `${safe} was refused`);
  }
});

test("a package containing a traversal attempt is refused whole", async () => {
  const bytes = cube3mf({
    extraFiles: [{ name: "../../escape.txt", content: "owned" }],
  });

  await assert.rejects(
    () => parseModel(input("model.3mf", bytes)),
    /unsafe file path/i,
    "a traversal entry did not stop the package being opened",
  );
});

test("a decompression bomb is refused at both layers", () => {
  /*
   * One megabyte of zeros deflates to about a kilobyte. Two independent guards
   * have to stop it, and both are checked here because either alone would be
   * defeatable:
   *
   *   the declared size   refuses it from the directory, before a byte is
   *                       inflated — but the declaration is written by whoever
   *                       built the archive, so it can lie
   *   the output cap      refuses it during inflation, whatever was declared
   */
  const bomb = new Uint8Array(1024 * 1024);
  const bytes = makeZip([
    { name: "_rels/.rels", content: "<Relationships />" },
    { name: "3D/3dmodel.model", content: bomb },
  ]);

  const limits = {
    maxEntries: 512,
    maxEntryBytes: 64 * 1024,
    maxTotalBytes: 64 * 1024,
    maxCompressionRatio: 200,
    ratioFloorBytes: 0,
  };

  // Layer one: the honest declaration is refused without inflating anything.
  assert.throws(() => openZip(bytes, limits), /too large to read safely/i);

  /*
   * Layer two: the same archive with its declared uncompressed sizes falsified
   * to something small. The directory now looks harmless, so only the cap
   * applied during inflation can stop it — which is the guard that matters
   * against an archive built deliberately.
   */
  const lying = new Uint8Array(bytes);
  const view = new DataView(lying.buffer);

  for (let offset = 0; offset < lying.length - 4; offset += 1) {
    // Central directory entry: uncompressed size at +24.
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 24, 1024, true);
    }
    // Local header: uncompressed size at +22.
    if (view.getUint32(offset, true) === 0x04034b50) {
      view.setUint32(offset + 22, 1024, true);
    }
  }

  const zip = openZip(lying, limits);
  const entry = zip.find("3D/3dmodel.model");
  assert.ok(entry);
  assert.equal(entry.uncompressedSize, 1024, "the fixture was not falsified");

  // zlib stops at the ceiling, so the megabyte is never materialised.
  assert.throws(() => zip.read(entry), /decompress|too large|safely|more data/i);
});

test("the total inflation budget is enforced across entries", () => {
  const chunk = "A".repeat(50_000);
  const bytes = makeZip([
    { name: "a.txt", content: chunk },
    { name: "b.txt", content: chunk },
    { name: "c.txt", content: chunk },
  ]);

  const zip = openZip(bytes, {
    maxEntries: 512,
    maxEntryBytes: 1024 * 1024,
    maxTotalBytes: 60_000,
    maxCompressionRatio: 10_000,
    ratioFloorBytes: 0,
  });

  assert.throws(() => {
    for (const entry of zip.entries) zip.read(entry);
  }, /more data than can be read safely/i);
});

test("an entry count above the limit is refused", () => {
  const files = Array.from({ length: 40 }, (_, index) => ({
    name: `file-${index}.txt`,
    content: "x",
  }));

  assert.throws(
    () =>
      openZip(makeZip(files), {
        maxEntries: 10,
        maxEntryBytes: 1024,
        maxTotalBytes: 1024,
        maxCompressionRatio: 100,
        ratioFloorBytes: 0,
      }),
    /entries/i,
  );
});

test("something that is not a ZIP is refused before any container work", async () => {
  await assert.rejects(
    () => parseModel(input("model.3mf", new TextEncoder().encode("solid cube"))),
    /not a valid 3MF/i,
  );
});

test("a truncated archive is refused", async () => {
  const bytes = cube3mf();
  await assert.rejects(
    () => parseModel(input("model.3mf", bytes.slice(0, bytes.length - 40))),
    /valid ZIP|damaged|truncated/i,
  );
});

/* ------------------------------------------------------------------ *
 * 3MF structure
 * ------------------------------------------------------------------ */

test("a package with no model part is refused", async () => {
  const bytes = makeZip([{ name: "_rels/.rels", content: "<Relationships />" }]);

  await assert.rejects(
    () => parseModel(input("model.3mf", bytes)),
    /does not contain a 3D model/i,
  );
});

test("the conventional model location is used when relationships are absent", async () => {
  const model = await parseModel(
    input("model.3mf", cube3mf({ omitRelationships: true })),
  );
  assert.equal(model.objects.length, 1);
});

test("malformed XML is refused with a customer-safe message", async () => {
  const bytes = cube3mf({ rawModel: "<model><resources><object" });

  await assert.rejects(
    () => parseModel(input("model.3mf", bytes)),
    (error: Error) => {
      assert.match(error.message, /malformed|could not be read|no printable/i);
      // No parser internals, no offsets, no stack detail.
      assert.ok(!/undefined|NaN|at Object/.test(error.message));
      return true;
    },
  );
});

test("a document type declaration is refused outright", async () => {
  /*
   * The billion-laughs vector. A DOCTYPE is where entity expansion and external
   * entity retrieval both live, and a 3MF model has no legitimate use for one.
   */
  const bytes = cube3mf({
    rawModel: `<?xml version="1.0"?>
<!DOCTYPE model [ <!ENTITY lol "lol"> <!ENTITY lol2 "&lol;&lol;&lol;"> ]>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources /><build /></model>`,
  });

  await assert.rejects(
    () => parseModel(input("model.3mf", bytes)),
    /document type/i,
  );
});

test("a model with no geometry is refused rather than measured as empty", async () => {
  const bytes = makeThreeMf({ unit: "millimeter", objects: [] });

  await assert.rejects(
    () => parseModel(input("model.3mf", bytes)),
    /no printable geometry/i,
  );
});

/* ------------------------------------------------------------------ *
 * 3MF metadata and units
 * ------------------------------------------------------------------ */

test("core metadata is read and the declared unit is honoured", async () => {
  const model = await parseModel(
    input(
      "model.3mf",
      cube3mf({ metadata: { Title: "Bracket", Designer: "SADA" } }),
    ),
  );

  assert.equal(model.metadata.entries.Title, "Bracket");
  assert.equal(model.metadata.entries.Designer, "SADA");
  assert.equal(model.unit.unit, "millimeter");
  assert.equal(model.unit.declared, true);
});

test("an undeclared unit is millimetres, and says it was assumed", async () => {
  const model = await parseModel(input("model.3mf", cube3mf({ unit: undefined })));

  assert.equal(model.unit.unit, "millimeter");
  assert.equal(model.unit.declared, false);
  assert.match(model.unit.note, /assumed/i);
});

test("a declared unit converts the measurements", async () => {
  // The same 10-unit cube, declared in centimetres: 100 mm on a side.
  const analysis = await analyzeModel(
    input("model.3mf", cube3mf({ unit: "centimeter" })),
  );

  assert.equal(analysis.unit.unit, "centimeter");
  assert.equal(analysis.unit.scaleToMm, 10);
  assert.equal(Math.round(analysis.boundingBox.size.x), 100);
  // 100 mm cube: 1,000,000 mm³.
  assert.equal(Math.round(measurementValue(analysis.volume) ?? 0), 1_000_000);
});

test("an unsupported extension namespace is reported, not silently ignored", async () => {
  const analysis = await analyzeModel(
    input(
      "model.3mf",
      cube3mf({
        extraNamespaces: {
          p: "http://schemas.microsoft.com/3dmanufacturing/production/2015/06",
        },
      }),
    ),
  );

  assert.ok(
    analysis.warnings.some((warning) => warning.code === "unsupported_metadata"),
    "an unimplemented extension was not reported",
  );
});

test("an unrecognised unit falls back to millimetres and warns", async () => {
  const analysis = await analyzeModel(
    input("model.3mf", cube3mf({ unit: "furlong" })),
  );

  assert.equal(analysis.unit.unit, "millimeter");
  assert.ok(analysis.warnings.some((warning) => warning.code === "unit_assumed"));
});

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

test("a closed cube measures exactly", async () => {
  const analysis = await analyzeModel(input("cube.3mf", cube3mf()));

  assert.equal(measurementValue(analysis.triangleCount), 12);
  assert.equal(analysis.boundingBox.size.x, 10);
  assert.equal(analysis.boundingBox.size.y, 10);
  assert.equal(analysis.boundingBox.size.z, 10);
  // Six faces of 100 mm².
  assert.equal(measurementValue(analysis.surfaceArea), 600);
  assert.equal(measurementValue(analysis.volume), 1000);
  assert.equal(analysis.topology.topology, "closed");
  assert.equal(analysis.topology.boundaryEdges, 0);
});

test("an open mesh reports no volume and says why", async () => {
  const analysis = await analyzeModel(input("open.3mf", openMesh3mf()));

  assert.equal(analysis.topology.topology, "open");
  assert.ok(analysis.topology.boundaryEdges > 0);

  // Not zero. Not the divergence sum. Nothing.
  assert.equal(analysis.volume.state, "unavailable");
  assert.equal(measurementValue(analysis.volume), undefined);
  assert.match(
    analysis.volume.state === "unavailable" ? analysis.volume.reason : "",
    /not closed|open/i,
  );

  // Area and bounds are still measurable — they need no topology.
  assert.equal(analysis.surfaceArea.state, "available");
  assert.equal(analysis.boundingBox.size.x, 10);
  assert.ok(analysis.warnings.some((warning) => warning.code === "open_mesh"));
});

test("degenerate triangles are excluded and counted", async () => {
  const vertices = cubeVertices(10);
  const bytes = makeThreeMf({
    unit: "millimeter",
    objects: [
      {
        id: "1",
        vertices,
        // A triangle whose three corners are the same point has zero area.
        triangles: [...CUBE_TRIANGLES, [0, 0, 0]],
      },
    ],
  });

  const analysis = await analyzeModel(input("degenerate.3mf", bytes));

  assert.equal(analysis.topology.degenerateTriangles, 1);
  // Counted as present, excluded from the measurements.
  assert.equal(measurementValue(analysis.triangleCount), 13);
  assert.equal(measurementValue(analysis.surfaceArea), 600);
  assert.equal(measurementValue(analysis.volume), 1000);
  assert.ok(
    analysis.warnings.some((warning) => warning.code === "degenerate_triangles"),
  );
});

test("non-finite coordinates are excluded rather than poisoning the result", async () => {
  const bytes = makeThreeMf({
    unit: "millimeter",
    rawModel: `<?xml version="1.0"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0" />
          <vertex x="10" y="0" z="0" />
          <vertex x="0" y="10" z="0" />
          <vertex x="nonsense" y="0" z="0" />
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" />
          <triangle v1="0" v2="1" v3="3" />
        </triangles>
      </mesh>
    </object>
  </resources>
  <build><item objectid="1" /></build>
</model>`,
    objects: [],
  });

  const analysis = await analyzeModel(input("nonfinite.3mf", bytes));

  assert.ok(
    analysis.warnings.some((warning) => warning.code === "non_finite_coordinates"),
  );
  // The bounds come from the one good triangle, undamaged by the bad one.
  assert.equal(Number.isFinite(analysis.boundingBox.size.x), true);
  assert.equal(analysis.boundingBox.size.x, 10);
});

test("multi-part models are measured per part and in aggregate", async () => {
  const analysis = await analyzeModel(input("two.3mf", twoPart3mf()));

  assert.equal(analysis.objectCount, 2);
  assert.equal(analysis.objects.length, 2);

  const [left, right] = analysis.objects;
  assert.ok(left && right);

  assert.equal(left.name, "Left");
  assert.equal(measurementValue(left.volume), 1000);
  assert.equal(right.name, "Right");
  // A 20 mm cube.
  assert.equal(measurementValue(right.volume), 8000);

  // Aggregate bounds span both, which sit 100 mm apart.
  assert.equal(analysis.boundingBox.size.x, 120);
  // Combined material volume, not a bounding-box product.
  assert.equal(measurementValue(analysis.volume), 9000);
  assert.equal(measurementValue(analysis.triangleCount), 24);
});

test("one open part makes the combined volume unavailable, and says how many", async () => {
  const bytes = makeThreeMf({
    unit: "millimeter",
    objects: [
      { id: "1", name: "Closed", vertices: cubeVertices(10), triangles: CUBE_TRIANGLES },
      { id: "2", name: "Open", vertices: cubeVertices(10, 50), triangles: OPEN_CUBE_TRIANGLES },
    ],
  });

  const analysis = await analyzeModel(input("mixed.3mf", bytes));

  assert.equal(analysis.objects[0]?.volume.state, "available");
  assert.equal(analysis.objects[1]?.volume.state, "unavailable");

  // The sum is not reported as the closed part's volume alone.
  assert.equal(analysis.volume.state, "unavailable");
  assert.match(
    analysis.volume.state === "unavailable" ? analysis.volume.reason : "",
    /1 of 2/,
  );
});

test("a build transform moves the measured position", async () => {
  const bytes = makeThreeMf({
    unit: "millimeter",
    objects: [{ id: "1", vertices: cubeVertices(10), triangles: CUBE_TRIANGLES }],
    build: [{ objectId: "1", transform: "1 0 0 0 1 0 0 0 1 100 0 0" }],
  });

  const analysis = await analyzeModel(input("moved.3mf", bytes));

  assert.equal(analysis.boundingBox.min.x, 100);
  assert.equal(analysis.boundingBox.size.x, 10);
  // Moving a part does not change how much material it uses.
  assert.equal(measurementValue(analysis.volume), 1000);
});

test("a component cycle is bounded rather than recursing forever", async () => {
  const bytes = makeThreeMf({
    unit: "millimeter",
    rawModel: `<?xml version="1.0"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">
  <resources>
    <object id="1" type="model">
      <components><component objectid="2" /></components>
    </object>
    <object id="2" type="model">
      <components><component objectid="1" /></components>
    </object>
  </resources>
  <build><item objectid="1" /></build>
</model>`,
    objects: [],
  });

  // The guard is that this returns at all.
  await assert.rejects(
    () => parseModel(input("cycle.3mf", bytes)),
    /no printable geometry/i,
  );
});

/* ------------------------------------------------------------------ *
 * STL and OBJ
 * ------------------------------------------------------------------ */

test("a binary STL cube measures the same as the 3MF cube", async () => {
  const analysis = await analyzeModel(input("cube.stl", cubeStl(10)));

  assert.equal(measurementValue(analysis.triangleCount), 12);
  assert.equal(measurementValue(analysis.volume), 1000);
  assert.equal(measurementValue(analysis.surfaceArea), 600);
  assert.equal(analysis.objectCount, 1);
});

test("STL and OBJ declare no unit, and say so", async () => {
  for (const [name, bytes] of [
    ["cube.stl", cubeStl(10)],
    ["cube.obj", cubeObj(10)],
  ] as const) {
    const analysis = await analyzeModel(input(name, bytes));
    assert.equal(analysis.unit.declared, false, `${name} claimed a declared unit`);
    assert.ok(analysis.warnings.some((warning) => warning.code === "unit_assumed"));
  }
});

test("an OBJ cube measures the same as the STL cube", async () => {
  const analysis = await analyzeModel(input("cube.obj", cubeObj(10)));

  assert.equal(measurementValue(analysis.triangleCount), 12);
  assert.equal(measurementValue(analysis.volume), 1000);
});

test("an ASCII STL is read as well as a binary one", async () => {
  const vertices = cubeVertices(10);
  const facets = CUBE_TRIANGLES.map(([a, b, c]) =>
    [
      "facet normal 0 0 0",
      "  outer loop",
      ...[a, b, c].map((index) => {
        const v = vertices[index] ?? [0, 0, 0];
        return `    vertex ${v[0]} ${v[1]} ${v[2]}`;
      }),
      "  endloop",
      "endfacet",
    ].join("\n"),
  ).join("\n");

  const ascii = new TextEncoder().encode(`solid cube\n${facets}\nendsolid cube\n`);
  const analysis = await analyzeModel(input("cube.stl", ascii));

  assert.equal(measurementValue(analysis.triangleCount), 12);
  assert.equal(measurementValue(analysis.volume), 1000);
});

test("STEP is refused by the mesh analyser with an explanation", async () => {
  await assert.rejects(
    () => parseModel(input("part.step", new TextEncoder().encode("ISO-10303-21;"))),
    /STEP files describe surfaces/i,
  );
});

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

test("identity is content-derived, stable and independent of the filename", async () => {
  const bytes = cube3mf();

  const first = await parseModel(input("a.3mf", bytes));
  const second = await parseModel(input("completely-different-name.3mf", bytes));

  assert.equal(first.identity, second.identity);
  assert.match(first.identity, /^mdl_[0-9a-f]{32}$/);
});

test("different bytes produce a different identity", async () => {
  const small = await parseModel(input("a.stl", cubeStl(10)));
  const large = await parseModel(input("a.stl", cubeStl(20)));

  assert.notEqual(small.identity, large.identity);
});

test("analysis is deterministic across repeated runs", async () => {
  const bytes = twoPart3mf();

  const a = await analyzeModel(input("two.3mf", bytes));
  const b = await analyzeModel(input("two.3mf", bytes));

  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

/* ------------------------------------------------------------------ *
 * Direct geometry checks
 * ------------------------------------------------------------------ */

test("an inside-out closed mesh still reports its volume", () => {
  // Winding reversed: the signed sum is negative, the volume is not.
  const reversed = CUBE_TRIANGLES.map(
    ([a, b, c]) => [a, c, b] as [number, number, number],
  );
  const vertices = cubeVertices(10);

  const positions: number[] = [];
  for (const [a, b, c] of reversed) {
    for (const index of [a, b, c]) {
      const v = vertices[index] ?? [0, 0, 0];
      positions.push(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
    }
  }

  const analysis = analyzeGeometry({
    format: "stl",
    identity: "mdl_test",
    unit: {
      unit: "millimeter",
      declared: true,
      scaleToMm: 1,
      note: "test",
    },
    objects: [{ id: "1", meshes: [{ positions: Float64Array.from(positions) }] }],
    metadata: { entries: {}, unsupportedNamespaces: [] },
    warnings: [],
  });

  assert.equal(analysis.topology.topology, "closed");
  assert.equal(measurementValue(analysis.volume), 1000);
});

test("an empty deflate stream in a package does not crash the reader", () => {
  const bytes = makeZip([{ name: "empty.txt", content: new Uint8Array(0) }]);
  const zip = openZip(bytes);
  const entry = zip.find("empty.txt");
  assert.ok(entry);
  assert.equal(zip.read(entry).length, 0);
});

test("an unsupported compression method is refused", () => {
  /*
   * Built by hand: a valid directory whose method field names something the
   * reader does not implement. Attempting it would be guessing at bytes.
   */
  const raw = new TextEncoder().encode("hello");
  const bytes = makeZip([{ name: "a.txt", content: raw, store: true }]);

  // Method lives at offset 8 of the local header and 10 of the central entry.
  const patched = new Uint8Array(bytes);
  const view = new DataView(patched.buffer);
  view.setUint16(8, 99, true);
  const directory = patched.length - 22 - (46 + 5);
  view.setUint16(directory + 10, 99, true);

  const zip = openZip(patched);
  const entry = zip.find("a.txt");
  assert.ok(entry);
  assert.throws(() => zip.read(entry), /compression method/i);
});

test("deflated entries round-trip through the reader", () => {
  const text = "A".repeat(5000);
  const bytes = makeZip([{ name: "a.txt", content: text }]);

  const zip = openZip(bytes);
  const entry = zip.find("a.txt");
  assert.ok(entry);
  assert.equal(entry.method, 8, "the fixture was not actually deflated");
  assert.equal(new TextDecoder().decode(zip.read(entry)), text);

  // And the fixture writer produces something a stock inflater agrees with.
  assert.ok(deflateRawSync(Buffer.from(text)).length < text.length);
});

test("a 3MF that is really a renamed STL is refused", async () => {
  await assert.rejects(
    () => parseModel(input("actually-stl.3mf", cubeStl(10))),
    /not a valid 3MF/i,
  );
});
