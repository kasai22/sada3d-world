import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { MAX_INLINE_ANALYSIS_BYTES } from "@/lib/custom-print/types";
import { ModelTooComplexError } from "@/lib/errors";
import { MODEL_LIMITS, analyzeModel } from "@/lib/models";
import { isValidStoredAnalysis } from "@/lib/models/analysis-store";

/**
 * Model limits and the analysis cache.
 *
 * The limits are tested with small injected values rather than two-million-
 * triangle files: the property under test is that the parser refuses *before*
 * doing the work, with a typed error, and that holds at any size.
 */

type Vertex = readonly [number, number, number];
type Triangle = readonly [Vertex, Vertex, Vertex];

const A: Vertex = [0, 0, 0];
const B: Vertex = [10, 0, 0];
const C: Vertex = [0, 10, 0];
const D: Vertex = [0, 0, 10];

/** A closed tetrahedron: four triangles. */
const TETRAHEDRON: readonly Triangle[] = [
  [A, C, B],
  [A, B, D],
  [A, D, C],
  [B, C, D],
];

function binaryStl(triangles: readonly Triangle[]): Uint8Array {
  const bytes = new Uint8Array(84 + 50 * triangles.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangles.length, true);

  triangles.forEach((triangle, index) => {
    const base = 84 + index * 50 + 12;
    triangle.forEach((vertex, corner) => {
      vertex.forEach((value, axis) => view.setFloat32(base + corner * 12 + axis * 4, value, true));
    });
  });

  return bytes;
}

function asciiStl(triangles: readonly Triangle[]): Uint8Array {
  const facets = triangles
    .map(
      (triangle) =>
        `facet normal 0 0 0\nouter loop\n${triangle.map((v) => `vertex ${v.join(" ")}`).join("\n")}\nendloop\nendfacet`,
    )
    .join("\n");
  return new TextEncoder().encode(`solid test\n${facets}\nendsolid test\n`);
}

function isTooComplex(error: unknown): boolean {
  return error instanceof ModelTooComplexError && /more than/.test(error.message);
}

test("the inline analysis limit is one value, and fits a function body with framing to spare", () => {
  assert.equal(MODEL_LIMITS.maxInlineAnalysisBytes, MAX_INLINE_ANALYSIS_BYTES);
  assert.ok(MAX_INLINE_ANALYSIS_BYTES + 64 * 1024 < 4.5 * 1024 * 1024);
});

test("a binary STL over the triangle limit is refused with a typed error", async () => {
  const bytes = binaryStl(TETRAHEDRON);

  await assert.rejects(
    analyzeModel({ fileName: "part.stl", bytes, limits: { ...MODEL_LIMITS, maxTriangles: 2 } }),
    isTooComplex,
  );

  // The same file under the real limits is analysed normally.
  const analysis = await analyzeModel({ fileName: "part.stl", bytes });
  assert.equal(analysis.triangleCount.state, "available");
});

test("an ASCII STL over the triangle limit is refused with a typed error", async () => {
  await assert.rejects(
    analyzeModel({
      fileName: "part.stl",
      bytes: asciiStl(TETRAHEDRON),
      limits: { ...MODEL_LIMITS, maxTriangles: 2 },
    }),
    isTooComplex,
  );
});

test("an OBJ over the vertex limit is refused with a typed error", async () => {
  const vertices = Array.from({ length: 20 }, (_, index) => `v ${index} 0 0`).join("\n");
  const bytes = new TextEncoder().encode(`${vertices}\nf 1 2 3\n`);

  await assert.rejects(
    analyzeModel({ fileName: "part.obj", bytes, limits: { ...MODEL_LIMITS, maxVertices: 3 } }),
    isTooComplex,
  );
});

test("a stored analysis is used only when it describes these bytes and is well-formed", async () => {
  const bytes = binaryStl(TETRAHEDRON);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const analysis = await analyzeModel({ fileName: "part.stl", bytes });

  // Through JSON, as it comes back from a jsonb column.
  const stored = JSON.parse(JSON.stringify(analysis)) as Record<string, unknown>;
  assert.equal(isValidStoredAnalysis(stored, sha256), true);

  // Keyed by another file's hash.
  const other = createHash("sha256").update("another file").digest("hex");
  assert.equal(isValidStoredAnalysis(stored, other), false);

  // A NaN written to jsonb comes back as null.
  const box = analysis.boundingBox;
  const nan = JSON.parse(
    JSON.stringify({ ...analysis, boundingBox: { ...box, size: { ...box.size, x: Number.NaN } } }),
  );
  assert.equal(isValidStoredAnalysis(nan, sha256), false);

  assert.equal(isValidStoredAnalysis({ ...stored, objectCount: (analysis.objectCount ?? 0) + 1 }, sha256), false);
  assert.equal(isValidStoredAnalysis({ ...stored, objects: [{}] }, sha256), false);
  assert.equal(isValidStoredAnalysis({ ...stored, volume: { state: "available" } }, sha256), false);
  assert.equal(isValidStoredAnalysis(null, sha256), false);
  assert.equal(isValidStoredAnalysis(stored, "not-a-hash"), false);
});
