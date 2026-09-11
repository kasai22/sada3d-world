import assert from "node:assert/strict";
import { test } from "node:test";

import type { ParsedModel, ParsedObject } from "@/lib/models/types";

import { analyzeGeometry } from "./analyze";
import type { TopologyReport } from "./types";

/**
 * The Stage 18 analyser against the algorithm it replaced.
 *
 * Stage 18 changed how topology is computed — typed-array vertex ids and sorted
 * numeric edge keys instead of string-keyed maps — for memory, not for results.
 * The claim is that every answer is identical. This file keeps the previous
 * algorithm as a reference and compares the two on meshes chosen to stress the
 * places they could diverge: shared and unshared vertices, near-coincident
 * vertices inside and outside the quantisation grid, negative zero, very large
 * coordinates, duplicated and reversed triangles, degenerate and non-finite
 * triangles, and edges shared between separate objects.
 */

/* ------------------------------------------------------------------ *
 * The previous algorithm, verbatim in its logic
 * ------------------------------------------------------------------ */

const QUANTUM = 1e-6;

function referenceKey(x: number, y: number, z: number): string {
  return `${Math.round(x / QUANTUM)},${Math.round(y / QUANTUM)},${Math.round(z / QUANTUM)}`;
}

interface Reference {
  triangles: number;
  degenerate: number;
  nonFinite: number;
  area: number;
  volumeSix: number;
  min: [number, number, number];
  max: [number, number, number];
  edges: Map<string, number>;
}

function referenceAccumulate(objects: readonly ParsedObject[], scale: number): Reference {
  const into: Reference = {
    triangles: 0,
    degenerate: 0,
    nonFinite: 0,
    area: 0,
    volumeSix: 0,
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
    edges: new Map(),
  };

  for (const object of objects) {
    for (const mesh of object.meshes) {
      const p = mesh.positions;
      for (let t = 0; t < Math.floor(p.length / 9); t += 1) {
        const v = Array.from({ length: 9 }, (_, i) => (p[t * 9 + i] ?? NaN) * scale);
        if (!v.every(Number.isFinite)) {
          into.nonFinite += 1;
          continue;
        }
        into.triangles += 1;
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = v as [number, number, number, number, number, number, number, number, number];
        const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const area = Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
        if (area === 0) {
          into.degenerate += 1;
          continue;
        }
        into.area += area;
        into.volumeSix += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
        for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] as const) {
          into.min = [Math.min(into.min[0], x), Math.min(into.min[1], y), Math.min(into.min[2], z)];
          into.max = [Math.max(into.max[0], x), Math.max(into.max[1], y), Math.max(into.max[2], z)];
        }
        const ka = referenceKey(ax, ay, az), kb = referenceKey(bx, by, bz), kc = referenceKey(cx, cy, cz);
        for (const key of [`${ka}|${kb}`, `${kb}|${kc}`, `${kc}|${ka}`]) {
          into.edges.set(key, (into.edges.get(key) ?? 0) + 1);
        }
      }
    }
  }

  return into;
}

function referenceTopology(reference: Reference): TopologyReport {
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const [key, forward] of reference.edges) {
    const [from, to] = key.split("|") as [string, string];
    const backward = reference.edges.get(`${to}|${from}`) ?? 0;
    if (forward > 1) nonManifoldEdges += 1;
    else if (backward === 0) boundaryEdges += 1;
    else if (backward > 1) nonManifoldEdges += 1;
  }
  return {
    topology:
      reference.triangles === 0 ? "unknown" : nonManifoldEdges > 0 ? "non_manifold" : boundaryEdges > 0 ? "open" : "closed",
    boundaryEdges,
    nonManifoldEdges,
    degenerateTriangles: reference.degenerate,
  };
}

/* ------------------------------------------------------------------ *
 * Mesh generation
 * ------------------------------------------------------------------ */

/** Deterministic PRNG, so a failure reproduces. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUBE = [
  [0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0],
  [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10],
] as const;

const CUBE_FACES = [
  [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
  [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
] as const;

function cube(offset = 0, jitter: () => number = () => 0): number[] {
  return CUBE_FACES.flatMap((face) =>
    face.flatMap((index) => CUBE[index].map((value) => value + offset + jitter())),
  );
}

function object(id: string, ...meshes: number[][]): ParsedObject {
  return { id, meshes: meshes.map((values) => ({ positions: Float64Array.from(values) })) };
}

function model(objects: ParsedObject[], scale = 1): ParsedModel {
  return {
    format: "3mf",
    identity: "mdl_test",
    unit: { unit: "millimeter", declared: true, scaleToMm: scale, note: "" },
    objects,
    metadata: { entries: {}, unsupportedNamespaces: [] },
    warnings: [],
  };
}

function soup(rng: () => number, triangles: number, grid: number): number[] {
  // Coordinates on a coarse grid, so random triangles share vertices and edges
  // often enough to produce open, closed-looking and non-manifold regions.
  return Array.from({ length: triangles * 9 }, () => Math.floor(rng() * grid));
}

/* ------------------------------------------------------------------ *
 * Comparison
 * ------------------------------------------------------------------ */

function assertMatchesReference(subject: ParsedModel, label: string): void {
  const result = analyzeGeometry(subject);
  const scale = subject.unit.scaleToMm;

  const total = referenceAccumulate(subject.objects, scale);
  assert.deepEqual(result.topology, referenceTopology(total), `${label}: aggregate topology`);
  assert.equal(result.triangleCount.state === "available" && result.triangleCount.value, total.triangles, `${label}: triangles`);
  if (total.triangles > 0 && result.surfaceArea.state === "available") {
    assert.equal(result.surfaceArea.value, total.area, `${label}: area is not bit-identical`);
  }

  subject.objects.forEach((entry, index) => {
    const reference = referenceAccumulate([entry], scale);
    const analysed = result.objects[index];
    assert.ok(analysed);
    assert.deepEqual(analysed.topology, referenceTopology(reference), `${label}: object ${index} topology`);

    if (analysed.volume.state === "available") {
      assert.equal(analysed.volume.value, Math.abs(reference.volumeSix / 6), `${label}: object ${index} volume`);
    }
    if (reference.triangles - reference.degenerate > 0) {
      assert.deepEqual(
        [analysed.boundingBox.min.x, analysed.boundingBox.min.y, analysed.boundingBox.min.z],
        reference.min,
        `${label}: object ${index} bounds`,
      );
    }
  });
}

test("a closed cube and its variants read exactly as before", () => {
  const closed = cube();
  const reversed = closed.slice(0, 9 * 11).concat([closed[9 * 11 + 6], closed[9 * 11 + 7], closed[9 * 11 + 8], closed[9 * 11 + 3], closed[9 * 11 + 4], closed[9 * 11 + 5], closed[9 * 11], closed[9 * 11 + 1], closed[9 * 11 + 2]] as number[]);

  assertMatchesReference(model([object("closed", closed)]), "closed");
  assertMatchesReference(model([object("open", closed.slice(0, 9 * 10))]), "open");
  assertMatchesReference(model([object("duplicate", closed, closed.slice(0, 9))]), "duplicated triangle");
  assertMatchesReference(model([object("reversed", reversed)]), "one reversed triangle");
  assertMatchesReference(model([object("scaled", closed)], 25.4), "inch scale");
});

test("vertices inside and outside the quantisation grid match as before", () => {
  const rng = random(7);
  assertMatchesReference(model([object("inside", cube(0, () => (rng() - 0.5) * 1e-7))]), "jitter below quantum");
  assertMatchesReference(model([object("outside", cube(0, () => (rng() - 0.5) * 1e-4))]), "jitter above quantum");
});

test("negative zero, huge coordinates, degenerate and non-finite triangles match as before", () => {
  const negativeZero = cube().map((value) => (value === 0 ? -0 : value));
  const huge = cube(1e9);
  const withDegenerate = cube().concat([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const withNaN = cube().concat([0, 0, 0, NaN, 1, 1, 2, 2, 2, Infinity, 0, 0, 1, 1, 1, 2, 2, 2]);

  assertMatchesReference(model([object("negative-zero", negativeZero)]), "negative zero");
  assertMatchesReference(model([object("huge", huge)]), "huge coordinates");
  assertMatchesReference(model([object("degenerate", withDegenerate)]), "degenerate");
  assertMatchesReference(model([object("non-finite", withNaN)]), "non-finite");
});

test("edges shared between objects are judged across the model as before", () => {
  const full = cube();
  assertMatchesReference(
    model([object("half-a", full.slice(0, 9 * 6)), object("half-b", full.slice(9 * 6))]),
    "cube split across two objects",
  );
  assertMatchesReference(model([object("a", cube()), object("b", cube(20)), object("empty")]), "separate parts and an empty object");
});

test("random triangle soups match the previous algorithm exactly", () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const rng = random(seed);
    const objects = Array.from({ length: 1 + (seed % 3) }, (_, index) =>
      object(`soup-${index}`, soup(rng, 20 + Math.floor(rng() * 200), 3 + (seed % 5))),
    );
    assertMatchesReference(model(objects), `seed ${seed}`);
  }
});
