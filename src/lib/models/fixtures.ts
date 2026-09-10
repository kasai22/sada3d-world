import { crc32 } from "node:zlib";
import { deflateRawSync } from "node:zlib";

/**
 * Deterministic test fixtures, built in code.
 *
 * No binary blobs in the repository. Every fixture is generated from a few
 * lines here, which means they are reviewable in a diff, they cannot rot, and a
 * hostile one — a traversal attempt, a decompression bomb — can be constructed
 * without committing an actual malicious file to source control.
 *
 * Everything is deterministic: the same call always produces byte-identical
 * output, so a test asserting on an identity hash is stable.
 */

/* ------------------------------------------------------------------ *
 * ZIP writing
 * ------------------------------------------------------------------ */

export interface ZipFile {
  name: string;
  content: Uint8Array | string;
  /** Deflate by default; stored where a test needs a known ratio. */
  store?: boolean;
}

function bytesOf(content: Uint8Array | string): Uint8Array {
  return typeof content === "string" ? new TextEncoder().encode(content) : content;
}

/**
 * Writes a minimal but valid ZIP.
 *
 * Enough of the format for a reader to walk: local headers, the file data, the
 * central directory and the end-of-central-directory record. Timestamps are
 * fixed at zero so output is reproducible.
 */
export function makeZip(files: readonly ZipFile[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const raw = bytesOf(file.content);
    const deflated = file.store ? raw : deflateRawSync(raw);
    // Deflate can exceed the input on tiny or incompressible content.
    const useStore = file.store || deflated.length >= raw.length;
    const data = useStore ? raw : deflated;
    const method = useStore ? 0 : 8;
    const checksum = crc32(Buffer.from(raw));

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);

    chunks.push(local, data);

    const entry = new Uint8Array(46 + name.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint16(8, 0, true);
    entryView.setUint16(10, method, true);
    entryView.setUint32(16, checksum, true);
    entryView.setUint32(20, data.length, true);
    entryView.setUint32(24, raw.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);

    offset += local.length + data.length;
  }

  const directorySize = central.reduce((sum, entry) => sum + entry.length, 0);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);

  const total =
    chunks.reduce((sum, chunk) => sum + chunk.length, 0) + directorySize + end.length;
  const output = new Uint8Array(total);

  let cursor = 0;
  for (const chunk of [...chunks, ...central, end]) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }

  return output;
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

/** A unit cube's eight corners, scaled. */
export function cubeVertices(size = 10, offset = 0): number[][] {
  const s = size;
  const o = offset;
  return [
    [o, o, o],
    [o + s, o, o],
    [o + s, o + s, o],
    [o, o + s, o],
    [o, o, o + s],
    [o + s, o, o + s],
    [o + s, o + s, o + s],
    [o, o + s, o + s],
  ];
}

/**
 * The twelve triangles of a closed cube, wound consistently outward.
 *
 * Consistent winding is the point: the topology check reads directed edges, so
 * a cube wound inconsistently would be reported non-manifold — which is correct
 * behaviour and is why the closed fixture has to be genuinely correct.
 */
export const CUBE_TRIANGLES: readonly (readonly [number, number, number])[] = [
  [0, 2, 1], [0, 3, 2],
  [4, 5, 6], [4, 6, 7],
  [0, 1, 5], [0, 5, 4],
  [1, 2, 6], [1, 6, 5],
  [2, 3, 7], [2, 7, 6],
  [3, 0, 4], [3, 4, 7],
];

/** The cube with one face removed: ten triangles, an open surface. */
export const OPEN_CUBE_TRIANGLES = CUBE_TRIANGLES.slice(0, 10);

/* ------------------------------------------------------------------ *
 * 3MF
 * ------------------------------------------------------------------ */

const CORE_NAMESPACE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";

const RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel0" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

export interface ThreeMfObject {
  id: string;
  name?: string;
  vertices: number[][];
  triangles: readonly (readonly [number, number, number])[];
}

export interface ThreeMfOptions {
  unit?: string;
  objects: readonly ThreeMfObject[];
  /** Build items. Omit to place every object once with no transform. */
  build?: readonly { objectId: string; transform?: string }[];
  metadata?: Readonly<Record<string, string>>;
  /** Extra xmlns declarations, to exercise unsupported-extension reporting. */
  extraNamespaces?: Readonly<Record<string, string>>;
  /** Replaces the model part entirely, for malformed-XML fixtures. */
  rawModel?: string;
  /** Extra package entries, for traversal fixtures. */
  extraFiles?: readonly ZipFile[];
  omitRelationships?: boolean;
}

export function makeThreeMfModelXml(options: ThreeMfOptions): string {
  if (options.rawModel !== undefined) return options.rawModel;

  const namespaces = Object.entries(options.extraNamespaces ?? {})
    .map(([prefix, uri]) => ` xmlns:${prefix}="${uri}"`)
    .join("");

  const unit = options.unit ? ` unit="${options.unit}"` : "";

  const metadata = Object.entries(options.metadata ?? {})
    .map(([name, value]) => `    <metadata name="${name}">${value}</metadata>`)
    .join("\n");

  const objects = options.objects
    .map((object) => {
      const vertices = object.vertices
        .map(([x, y, z]) => `        <vertex x="${x}" y="${y}" z="${z}" />`)
        .join("\n");
      const triangles = object.triangles
        .map(([a, b, c]) => `        <triangle v1="${a}" v2="${b}" v3="${c}" />`)
        .join("\n");

      return `    <object id="${object.id}" type="model"${
        object.name ? ` name="${object.name}"` : ""
      }>
      <mesh>
        <vertices>
${vertices}
        </vertices>
        <triangles>
${triangles}
        </triangles>
      </mesh>
    </object>`;
    })
    .join("\n");

  const buildItems: readonly { objectId: string; transform?: string }[] =
    options.build ?? options.objects.map((object) => ({ objectId: object.id }));

  const build = buildItems
    .map(
      (item) =>
        `    <item objectid="${item.objectId}"${
          item.transform ? ` transform="${item.transform}"` : ""
        } />`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="${CORE_NAMESPACE}"${namespaces}${unit}>
${metadata}
  <resources>
${objects}
  </resources>
  <build>
${build}
  </build>
</model>`;
}

export function makeThreeMf(options: ThreeMfOptions): Uint8Array {
  const files: ZipFile[] = [];

  if (!options.omitRelationships) {
    files.push({ name: "_rels/.rels", content: RELATIONSHIPS });
  }

  files.push({ name: "3D/3dmodel.model", content: makeThreeMfModelXml(options) });
  files.push(...(options.extraFiles ?? []));

  return makeZip(files);
}

/** A closed 10 mm cube: one object, twelve triangles, volume 1000 mm³. */
export function cube3mf(overrides: Partial<ThreeMfOptions> = {}): Uint8Array {
  return makeThreeMf({
    unit: "millimeter",
    objects: [{ id: "1", name: "Cube", vertices: cubeVertices(10), triangles: CUBE_TRIANGLES }],
    ...overrides,
  });
}

/** Two separate cubes, so multi-part behaviour has something to measure. */
export function twoPart3mf(): Uint8Array {
  return makeThreeMf({
    unit: "millimeter",
    objects: [
      { id: "1", name: "Left", vertices: cubeVertices(10), triangles: CUBE_TRIANGLES },
      { id: "2", name: "Right", vertices: cubeVertices(20, 100), triangles: CUBE_TRIANGLES },
    ],
  });
}

/** A cube missing one face. Closed geometry minus two triangles. */
export function openMesh3mf(): Uint8Array {
  return makeThreeMf({
    unit: "millimeter",
    objects: [
      { id: "1", name: "Open", vertices: cubeVertices(10), triangles: OPEN_CUBE_TRIANGLES },
    ],
  });
}

/* ------------------------------------------------------------------ *
 * STL
 * ------------------------------------------------------------------ */

/** A binary STL of the given triangles. */
export function makeBinaryStl(
  vertices: number[][],
  triangles: readonly (readonly [number, number, number])[],
): Uint8Array {
  const bytes = new Uint8Array(84 + triangles.length * 50);
  const view = new DataView(bytes.buffer);

  view.setUint32(80, triangles.length, true);

  let offset = 84;
  for (const [a, b, c] of triangles) {
    // Normal, left at zero: the analyser recomputes from the winding.
    offset += 12;

    for (const index of [a, b, c]) {
      const vertex = vertices[index] ?? [0, 0, 0];
      view.setFloat32(offset, vertex[0] ?? 0, true);
      view.setFloat32(offset + 4, vertex[1] ?? 0, true);
      view.setFloat32(offset + 8, vertex[2] ?? 0, true);
      offset += 12;
    }

    offset += 2;
  }

  return bytes;
}

export function cubeStl(size = 10): Uint8Array {
  return makeBinaryStl(cubeVertices(size), CUBE_TRIANGLES);
}

/* ------------------------------------------------------------------ *
 * OBJ
 * ------------------------------------------------------------------ */

export function cubeObj(size = 10): Uint8Array {
  const vertices = cubeVertices(size)
    .map(([x, y, z]) => `v ${x} ${y} ${z}`)
    .join("\n");
  const faces = CUBE_TRIANGLES.map(([a, b, c]) => `f ${a + 1} ${b + 1} ${c + 1}`).join(
    "\n",
  );

  return new TextEncoder().encode(`# fixture\n${vertices}\n${faces}\n`);
}
