import { ModelTooComplexError } from "@/lib/errors";
import type { ParsedMesh, ParsedModel, ParsedObject } from "@/lib/models/types";

import {
  invalid,
  measured,
  unavailable,
  type AnalysisWarning,
  type BoundingBox,
  type Dimensions,
  type GeometryAnalysisResult,
  type Measurement,
  type ObjectAnalysis,
  type TopologyReport,
} from "./types";

/**
 * The geometry math.
 *
 * Pure and deterministic: the same triangles always produce the same numbers.
 * No clock, no randomness, no I/O, no three.js — which is what lets it run on
 * the server, in a test, and in a browser from the same source.
 *
 * ── What is computed, and what is refused ────────────────────────────────
 *
 *   bounding box    always, from any non-empty mesh
 *   triangle count  always, by counting
 *   surface area    always: the sum of triangle areas needs no topology
 *   volume          only for a closed, consistently-oriented surface
 *
 * That last line is the important one. The divergence theorem gives a number
 * for any set of triangles, and for an open surface that number is arithmetic
 * rather than a volume — it depends on where the origin happens to be. A mesh
 * with a hole in it has no inside, so it has no volume, and the result says
 * `unavailable` with the reason rather than a figure a customer might be
 * charged against.
 *
 * ── Memory (Stage 18) ────────────────────────────────────────────────────
 *
 * The topology check used to key a Map by strings — a vertex key per corner and
 * an edge key per directed edge — and then built the whole map a second time for
 * the aggregate. Measured, that was roughly a gigabyte per half-million
 * triangles. It now interns each quantised vertex into an integer id in a typed
 * hash table, records each directed edge as one number in a typed array, and
 * reads topology by sorting that array once. The answers are identical — the
 * vertex identity is still exact equality of quantised coordinates, and the
 * edge rules are unchanged — and `analyze.test.ts` checks them against the
 * previous algorithm. Aggregate totals are gathered in the same pass as the
 * per-object ones, in the same order, so every sum is bit-for-bit what it was.
 */

/* ------------------------------------------------------------------ *
 * Vectors, without a vector library
 * ------------------------------------------------------------------ */

/** Triangles arrive as nine consecutive floats: three vertices, xyz each. */
const FLOATS_PER_TRIANGLE = 9;

/**
 * Half the magnitude of the cross product of two edges.
 *
 * Exact for any triangle, and needs no topology — which is why surface area is
 * available where volume is not.
 */
function triangleArea(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;

  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;

  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
}

/**
 * Six times the signed volume of the tetrahedron from the origin to a triangle.
 *
 * Summed over a closed, consistently-oriented surface, the origin cancels and
 * the total is six times the enclosed volume. Over an open surface it does not
 * cancel, which is precisely why this is only used when the topology check
 * passes.
 */
function signedVolumeSix(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  return (
    ax * (by * cz - bz * cy) +
    ay * (bz * cx - bx * cz) +
    az * (bx * cy - by * cx)
  );
}

/* ------------------------------------------------------------------ *
 * Vertex identity
 * ------------------------------------------------------------------ */

/**
 * Quantisation grid for matching vertices.
 *
 * Two triangles that share an edge frequently disagree in the last bits of a
 * float — the same corner written twice by an exporter. Comparing raw floats
 * would report every such edge as a boundary and call every real solid open.
 * The grid is fine enough that two genuinely distinct vertices are never merged
 * at any scale a printed part occupies, and coarse enough to absorb float noise.
 */
const QUANTUM = 1e-6;

/**
 * Directed edges are stored as `from × EDGE_BASE + to`. With both ids below
 * 2^26 the key is an exact integer below 2^52, so a Float64Array holds it
 * without loss and sorts it numerically.
 */
const EDGE_BASE = 67_108_864;

/**
 * Quantised vertex → integer id, by open addressing over typed arrays.
 *
 * Equality is exact comparison of the three quantised coordinates, which is the
 * same identity the previous string key (`"qx,qy,qz"`) expressed: two doubles
 * format to the same string exactly when they are equal. The hash only decides
 * where to look, so a collision costs a probe and never merges two vertices.
 */
class VertexIndex {
  private slots: Int32Array;
  private mask: number;
  private coords: Float64Array;
  size = 0;

  constructor(expected: number) {
    let capacity = 1024;
    while (capacity < expected * 2) capacity *= 2;
    this.slots = new Int32Array(capacity);
    this.mask = capacity - 1;
    this.coords = new Float64Array(Math.max(expected, 256) * 3);
  }

  private static hash(x: number, y: number, z: number): number {
    // Low and high 32 bits of each coordinate, so large coordinates still spread.
    let h = Math.imul(x | 0, 0x9e3779b1);
    h ^= Math.imul((x / 4294967296) | 0, 0x7feb352d);
    h ^= Math.imul(y | 0, 0x85ebca6b);
    h ^= Math.imul((y / 4294967296) | 0, 0x846ca68b);
    h ^= Math.imul(z | 0, 0xc2b2ae35);
    h ^= Math.imul((z / 4294967296) | 0, 0x27d4eb2f);
    h ^= h >>> 16;
    h = Math.imul(h, 0x45d9f3b);
    h ^= h >>> 16;
    return h;
  }

  intern(x: number, y: number, z: number): number {
    const coords = this.coords;
    const slots = this.slots;
    let slot = VertexIndex.hash(x, y, z) & this.mask;

    for (;;) {
      const entry = slots[slot] ?? 0;
      if (entry === 0) break;

      const base = (entry - 1) * 3;
      if (coords[base] === x && coords[base + 1] === y && coords[base + 2] === z) {
        return entry - 1;
      }
      slot = (slot + 1) & this.mask;
    }

    const id = this.size;
    if (id >= EDGE_BASE - 1) {
      throw new ModelTooComplexError(
        "This model has more distinct vertices than can be analysed.",
      );
    }

    if ((id + 1) * 3 > coords.length) {
      const grown = new Float64Array(coords.length * 2);
      grown.set(coords);
      this.coords = grown;
    }

    this.coords[id * 3] = x;
    this.coords[id * 3 + 1] = y;
    this.coords[id * 3 + 2] = z;
    slots[slot] = id + 1;
    this.size += 1;

    if (this.size * 2 > slots.length) this.rehash();
    return id;
  }

  private rehash(): void {
    const capacity = this.slots.length * 2;
    const slots = new Int32Array(capacity);
    const mask = capacity - 1;

    for (let id = 0; id < this.size; id += 1) {
      const base = id * 3;
      let slot =
        VertexIndex.hash(this.coords[base] ?? 0, this.coords[base + 1] ?? 0, this.coords[base + 2] ?? 0) & mask;
      while ((slots[slot] ?? 0) !== 0) slot = (slot + 1) & mask;
      slots[slot] = id + 1;
    }

    this.slots = slots;
    this.mask = mask;
  }
}

/* ------------------------------------------------------------------ *
 * Accumulation
 * ------------------------------------------------------------------ */

interface Accumulator {
  triangles: number;
  degenerate: number;
  nonFinite: number;
  area: number;
  signedVolumeSix: number;
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

function newAccumulator(): Accumulator {
  return {
    triangles: 0,
    degenerate: 0,
    nonFinite: 0,
    area: 0,
    signedVolumeSix: 0,
    minX: Infinity, minY: Infinity, minZ: Infinity,
    maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
  };
}

function trianglesIn(meshes: readonly ParsedMesh[]): number {
  return meshes.reduce(
    (sum, mesh) => sum + Math.floor(mesh.positions.length / FLOATS_PER_TRIANGLE),
    0,
  );
}

/** Adds one measurable triangle's area, volume term and extent. */
function include(
  into: Accumulator,
  area: number,
  volumeSix: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): void {
  into.area += area;
  into.signedVolumeSix += volumeSix;

  if (ax < into.minX) into.minX = ax;
  if (ay < into.minY) into.minY = ay;
  if (az < into.minZ) into.minZ = az;
  if (bx < into.minX) into.minX = bx;
  if (by < into.minY) into.minY = by;
  if (bz < into.minZ) into.minZ = bz;
  if (cx < into.minX) into.minX = cx;
  if (cy < into.minY) into.minY = cy;
  if (cz < into.minZ) into.minZ = cz;

  if (ax > into.maxX) into.maxX = ax;
  if (ay > into.maxY) into.maxY = ay;
  if (az > into.maxZ) into.maxZ = az;
  if (bx > into.maxX) into.maxX = bx;
  if (by > into.maxY) into.maxY = by;
  if (bz > into.maxZ) into.maxZ = bz;
  if (cx > into.maxX) into.maxX = cx;
  if (cy > into.maxY) into.maxY = cy;
  if (cz > into.maxZ) into.maxZ = cz;
}

/**
 * Folds one object's triangles into its accumulator and the model's total, and
 * records its directed edges.
 *
 * Coordinates are scaled to millimetres as they are read, so everything
 * downstream — bounds, area, volume — is already in the normalised unit.
 *
 * Returns the edge keys, unsorted, for exactly the triangles that count towards
 * topology: finite and of non-zero area.
 */
function accumulateObject(
  object: ParsedObject,
  scale: number,
  vertices: VertexIndex,
  into: Accumulator,
  total: Accumulator,
): Float64Array {
  const edges = new Float64Array(trianglesIn(object.meshes) * 3);
  let edgeCount = 0;

  for (const mesh of object.meshes) {
    const positions = mesh.positions;
    const count = Math.floor(positions.length / FLOATS_PER_TRIANGLE);

    for (let t = 0; t < count; t += 1) {
      const o = t * FLOATS_PER_TRIANGLE;

      /*
       * `?? NaN`, not `?? 0`. The loop is bounded by floor(length / 9) so a short
       * read cannot happen — but if it ever could, NaN routes the triangle into
       * the non-finite path below, where it is excluded and reported.
       */
      const ax = (positions[o] ?? NaN) * scale;
      const ay = (positions[o + 1] ?? NaN) * scale;
      const az = (positions[o + 2] ?? NaN) * scale;
      const bx = (positions[o + 3] ?? NaN) * scale;
      const by = (positions[o + 4] ?? NaN) * scale;
      const bz = (positions[o + 5] ?? NaN) * scale;
      const cx = (positions[o + 6] ?? NaN) * scale;
      const cy = (positions[o + 7] ?? NaN) * scale;
      const cz = (positions[o + 8] ?? NaN) * scale;

      const finite =
        Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(az) &&
        Number.isFinite(bx) && Number.isFinite(by) && Number.isFinite(bz) &&
        Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(cz);

      if (!finite) {
        /*
         * A NaN or Infinity anywhere would poison the bounds, the area and the
         * volume for the whole model. The triangle is excluded and counted, and
         * the count becomes a warning.
         */
        into.nonFinite += 1;
        total.nonFinite += 1;
        continue;
      }

      into.triangles += 1;
      total.triangles += 1;

      const area = triangleArea(ax, ay, az, bx, by, bz, cx, cy, cz);
      if (area === 0) {
        // Zero-area triangles contribute nothing to area or volume and would add
        // spurious edges to the topology check, so they are excluded from both.
        into.degenerate += 1;
        total.degenerate += 1;
        continue;
      }

      const volumeSix = signedVolumeSix(ax, ay, az, bx, by, bz, cx, cy, cz);
      include(into, area, volumeSix, ax, ay, az, bx, by, bz, cx, cy, cz);
      include(total, area, volumeSix, ax, ay, az, bx, by, bz, cx, cy, cz);

      const a = vertices.intern(Math.round(ax / QUANTUM), Math.round(ay / QUANTUM), Math.round(az / QUANTUM));
      const b = vertices.intern(Math.round(bx / QUANTUM), Math.round(by / QUANTUM), Math.round(bz / QUANTUM));
      const c = vertices.intern(Math.round(cx / QUANTUM), Math.round(cy / QUANTUM), Math.round(cz / QUANTUM));

      edges[edgeCount] = a * EDGE_BASE + b;
      edges[edgeCount + 1] = b * EDGE_BASE + c;
      edges[edgeCount + 2] = c * EDGE_BASE + a;
      edgeCount += 3;
    }
  }

  return edges.subarray(0, edgeCount);
}

/* ------------------------------------------------------------------ *
 * Topology
 * ------------------------------------------------------------------ */

/** How many times `key` occurs in a sorted array. */
function occurrences(sorted: Float64Array, key: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((sorted[middle] ?? 0) < key) low = middle + 1;
    else high = middle;
  }

  let end = low;
  while (end < sorted.length && sorted[end] === key) end += 1;
  return end - low;
}

/**
 * Reads directed edges as a topology verdict. Sorts `edges` in place.
 *
 * For a closed, consistently-oriented surface every directed edge A→B appears
 * exactly once and its reverse B→A appears exactly once. Anything else says
 * what kind of "else" it is.
 */
function readTopology(triangles: number, degenerate: number, edges: Float64Array): TopologyReport {
  edges.sort();

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;

  for (let index = 0; index < edges.length; ) {
    const key = edges[index] ?? 0;
    let next = index + 1;
    while (next < edges.length && edges[next] === key) next += 1;

    const forward = next - index;
    const from = Math.floor(key / EDGE_BASE);
    const to = key - from * EDGE_BASE;
    const backward = occurrences(edges, to * EDGE_BASE + from);

    if (forward > 1) nonManifoldEdges += 1;
    else if (backward === 0) boundaryEdges += 1;
    else if (backward > 1) nonManifoldEdges += 1;

    index = next;
  }

  const topology =
    triangles === 0
      ? "unknown"
      : nonManifoldEdges > 0
        ? "non_manifold"
        : boundaryEdges > 0
          ? "open"
          : "closed";

  return {
    topology,
    boundaryEdges,
    nonManifoldEdges,
    degenerateTriangles: degenerate,
  };
}

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

const EMPTY_BOX: BoundingBox = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 0, y: 0, z: 0 },
  size: { x: 0, y: 0, z: 0 },
};

function boundsOf(accumulator: Accumulator): BoundingBox {
  if (!Number.isFinite(accumulator.minX)) return EMPTY_BOX;

  const min: Dimensions = {
    x: accumulator.minX,
    y: accumulator.minY,
    z: accumulator.minZ,
  };
  const max: Dimensions = {
    x: accumulator.maxX,
    y: accumulator.maxY,
    z: accumulator.maxZ,
  };

  return {
    min,
    max,
    size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
  };
}

/**
 * The volume, or the reason there is not one.
 *
 * The topology gate is the whole point of this function. An open or
 * non-manifold surface does not enclose a region, so no figure is produced —
 * not zero, not the divergence sum, nothing.
 */
function volumeOf(accumulator: Accumulator, topology: TopologyReport): Measurement {
  if (accumulator.triangles === 0) {
    return unavailable("mm3", "This object contains no triangles.");
  }

  if (topology.topology === "open") {
    return unavailable(
      "mm3",
      `This mesh is not closed — ${topology.boundaryEdges} open ${
        topology.boundaryEdges === 1 ? "edge" : "edges"
      }. A surface with holes does not enclose a volume.`,
    );
  }

  if (topology.topology === "non_manifold") {
    return unavailable(
      "mm3",
      "This mesh is non-manifold, so it does not describe a solid and has no volume.",
    );
  }

  const volume = accumulator.signedVolumeSix / 6;

  if (!Number.isFinite(volume)) {
    return invalid("mm3", "The volume could not be computed from these coordinates.");
  }

  /*
   * A closed surface wound inside-out gives a negative sum. The magnitude is
   * still the enclosed volume, so the sign is dropped rather than the result
   * being refused.
   */
  return measured(Math.abs(volume), "mm3", "mesh");
}

function objectAnalysis(
  object: ParsedObject,
  accumulator: Accumulator,
  topology: TopologyReport,
  warnings: AnalysisWarning[],
): ObjectAnalysis {
  if (accumulator.triangles === 0) {
    warnings.push({
      code: "empty_object",
      message: `Object ${object.name ?? object.id} contains no triangles.`,
      objectId: object.id,
    });
  }

  if (accumulator.degenerate > 0) {
    warnings.push({
      code: "degenerate_triangles",
      message: `${accumulator.degenerate} zero-area ${
        accumulator.degenerate === 1 ? "triangle was" : "triangles were"
      } found and excluded from the measurements.`,
      objectId: object.id,
    });
  }

  if (accumulator.nonFinite > 0) {
    warnings.push({
      code: "non_finite_coordinates",
      message: `${accumulator.nonFinite} ${
        accumulator.nonFinite === 1 ? "triangle has" : "triangles have"
      } coordinates that are not finite numbers and were excluded.`,
      objectId: object.id,
    });
  }

  if (topology.topology === "open") {
    warnings.push({
      code: "open_mesh",
      message: `Object ${object.name ?? object.id} is not a closed surface, so its volume cannot be measured.`,
      objectId: object.id,
    });
  }

  if (topology.topology === "non_manifold") {
    warnings.push({
      code: "non_manifold_mesh",
      message: `Object ${object.name ?? object.id} is non-manifold, so its volume cannot be measured.`,
      objectId: object.id,
    });
  }

  return {
    id: object.id,
    ...(object.name ? { name: object.name } : {}),
    meshCount: object.meshes.length,
    triangleCount: measured(accumulator.triangles, "count", "mesh"),
    boundingBox: boundsOf(accumulator),
    volume: volumeOf(accumulator, topology),
    surfaceArea:
      accumulator.triangles === 0
        ? unavailable("mm2", "This object contains no triangles.")
        : measured(accumulator.area, "mm2", "mesh"),
    topology,
  };
}

/**
 * Analyses a parsed model.
 *
 * Objects are measured individually and then aggregated. They are never merged
 * first: a file with four separate parts is four things to make, and folding
 * them into one mesh would lose the count, the per-part dimensions and — where
 * one part is open and three are closed — the fact that only one of them is
 * unmeasurable.
 */
export function analyzeGeometry(model: ParsedModel): GeometryAnalysisResult {
  const warnings: AnalysisWarning[] = [];
  const scale = model.unit.scaleToMm;

  if (!model.unit.declared) {
    warnings.push({
      code: "unit_assumed",
      message: model.unit.note,
    });
  }

  for (const note of model.warnings) warnings.push(note);

  const totalTriangles = model.objects.reduce(
    (sum, object) => sum + trianglesIn(object.meshes),
    0,
  );

  // Vertex ids are shared across objects so edges two parts share still match.
  const vertices = new VertexIndex(Math.ceil(totalTriangles * 0.6));
  const total = newAccumulator();
  const edgeSets: Float64Array[] = [];

  const objects = model.objects.map((object) => {
    const accumulator = newAccumulator();
    const edges = accumulateObject(object, scale, vertices, accumulator, total);
    const topology = readTopology(accumulator.triangles, accumulator.degenerate, edges);
    edgeSets.push(edges);
    return objectAnalysis(object, accumulator, topology, warnings);
  });

  /* ---- aggregate ---- */

  /*
   * One object: the model's edge set is that object's, already read. Several:
   * the union, so an edge shared by two parts is judged across both — exactly
   * what running every triangle through one map used to decide.
   */
  let topology: TopologyReport;
  const [onlyObject] = objects;

  if (objects.length === 1 && onlyObject) {
    topology = { ...onlyObject.topology };
  } else {
    const union = new Float64Array(edgeSets.reduce((sum, set) => sum + set.length, 0));
    let offset = 0;
    for (const set of edgeSets) {
      union.set(set, offset);
      offset += set.length;
    }
    topology = readTopology(total.triangles, total.degenerate, union);
  }

  /*
   * The aggregate volume is the sum of the objects' volumes, and only when
   * every one of them has one. Running the divergence sum across all objects
   * together would double-count where two parts overlap in space and would
   * produce a figure for a set containing one open part, which is exactly the
   * invention this module refuses.
   */
  const volumes = objects.map((object) => object.volume);
  const unmeasurable = volumes.filter((volume) => volume.state !== "available");

  // Already filtered to the non-available states, so the reason is present.
  const firstReason = unmeasurable[0]?.reason;

  const volume: Measurement =
    objects.length === 0
      ? unavailable("mm3", "This model contains no objects.")
      : unmeasurable.length > 0
        ? unavailable(
            "mm3",
            objects.length === 1 && firstReason !== undefined
              ? firstReason
              : unmeasurable.length === objects.length
                ? "No object in this model encloses a measurable volume."
                : `${unmeasurable.length} of ${objects.length} objects do not enclose a measurable volume, so the combined volume is not known.`,
          )
        : measured(
            volumes.reduce(
              (sum, entry) => sum + (entry.state === "available" ? entry.value : 0),
              0,
            ),
            "mm3",
            "mesh",
          );

  return {
    identity: model.identity,
    format: model.format,
    unit: model.unit,
    objectCount: objects.length,
    meshCount: model.objects.reduce((sum, object) => sum + object.meshes.length, 0),
    triangleCount: measured(total.triangles, "count", "mesh"),
    boundingBox: boundsOf(total),
    volume,
    surfaceArea:
      total.triangles === 0
        ? unavailable("mm2", "This model contains no triangles.")
        : measured(total.area, "mm2", "mesh"),
    topology,
    objects,
    warnings,
  };
}
