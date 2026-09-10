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
 * Topology
 * ------------------------------------------------------------------ */

/**
 * Quantised vertex key.
 *
 * Two triangles that share an edge frequently disagree in the last bits of a
 * float — the same corner written twice by an exporter. Comparing raw floats
 * would report every such edge as a boundary and call every real solid open.
 *
 * Quantising to a fixed grid is what makes edge matching work in practice. The
 * grid is fine enough that two genuinely distinct vertices are never merged at
 * any scale a printed part occupies, and coarse enough to absorb float noise.
 */
const QUANTUM = 1e-6;

function vertexKey(x: number, y: number, z: number): string {
  // `| 0`-free rounding: Math.round keeps this correct for large coordinates.
  const qx = Math.round(x / QUANTUM);
  const qy = Math.round(y / QUANTUM);
  const qz = Math.round(z / QUANTUM);
  return `${qx},${qy},${qz}`;
}

interface Accumulator {
  triangles: number;
  degenerate: number;
  nonFinite: number;
  area: number;
  signedVolumeSix: number;
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  /** Directed edge → how many triangles traverse it in that direction. */
  edges: Map<string, number>;
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
    edges: new Map(),
  };
}

/** Records a directed edge. Winding is what makes orientation checkable. */
function addEdge(edges: Map<string, number>, from: string, to: string): void {
  const key = `${from}|${to}`;
  edges.set(key, (edges.get(key) ?? 0) + 1);
}

/**
 * Folds one mesh's triangles into the accumulator.
 *
 * Coordinates are scaled to millimetres as they are read, so everything
 * downstream — bounds, area, volume — is already in the normalised unit and
 * nothing has to remember to convert later.
 */
function accumulate(mesh: ParsedMesh, scale: number, into: Accumulator): void {
  const positions = mesh.positions;
  const count = Math.floor(positions.length / FLOATS_PER_TRIANGLE);

  for (let t = 0; t < count; t += 1) {
    const o = t * FLOATS_PER_TRIANGLE;

    /*
     * `?? NaN`, not `?? 0`. The loop is bounded by floor(length / 9) so a short
     * read cannot happen — but if it ever could, NaN routes the triangle into
     * the non-finite path below, where it is excluded and reported. Defaulting
     * to zero would silently measure it as a point at the origin and quietly
     * enlarge the bounding box of every model it happened to.
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
       * the count becomes a warning — silently dropping it would make the
       * measurements quietly wrong instead of loudly incomplete.
       */
      into.nonFinite += 1;
      continue;
    }

    into.triangles += 1;

    const area = triangleArea(ax, ay, az, bx, by, bz, cx, cy, cz);
    if (area === 0) {
      // Zero-area triangles contribute nothing to area or volume and would add
      // spurious edges to the topology check, so they are excluded from both.
      into.degenerate += 1;
      continue;
    }

    into.area += area;
    into.signedVolumeSix += signedVolumeSix(ax, ay, az, bx, by, bz, cx, cy, cz);

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

    const ka = vertexKey(ax, ay, az);
    const kb = vertexKey(bx, by, bz);
    const kc = vertexKey(cx, cy, cz);

    addEdge(into.edges, ka, kb);
    addEdge(into.edges, kb, kc);
    addEdge(into.edges, kc, ka);
  }
}

/**
 * Reads the edge map as a topology verdict.
 *
 * For a closed, consistently-oriented surface every directed edge A→B appears
 * exactly once and its reverse B→A appears exactly once. Anything else says
 * what kind of "else" it is.
 */
function readTopology(accumulator: Accumulator): TopologyReport {
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;

  for (const [key, forward] of accumulator.edges) {
    const separator = key.indexOf("|");
    const from = key.slice(0, separator);
    const to = key.slice(separator + 1);
    const backward = accumulator.edges.get(`${to}|${from}`) ?? 0;

    if (forward > 1) nonManifoldEdges += 1;
    else if (backward === 0) boundaryEdges += 1;
    else if (backward > 1) nonManifoldEdges += 1;
  }

  const topology =
    accumulator.triangles === 0
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
    degenerateTriangles: accumulator.degenerate,
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
   * being refused — an inverted normal is a modelling detail, not a reason to
   * withhold a measurement.
   */
  return measured(Math.abs(volume), "mm3", "mesh");
}

function analyseObject(
  object: ParsedObject,
  scale: number,
  warnings: AnalysisWarning[],
): ObjectAnalysis {
  const accumulator = newAccumulator();
  for (const mesh of object.meshes) accumulate(mesh, scale, accumulator);

  const topology = readTopology(accumulator);

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

  const objects = model.objects.map((object) =>
    analyseObject(object, scale, warnings),
  );

  /* ---- aggregate ---- */

  const total = newAccumulator();
  for (const object of model.objects) {
    for (const mesh of object.meshes) accumulate(mesh, scale, total);
  }

  const topology = readTopology(total);

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
            /*
             * With one object, its own reason is the useful one — "this mesh is
             * not closed, 20 open edges" tells the customer what to fix, where a
             * summary would only tell them something is wrong.
             */
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
