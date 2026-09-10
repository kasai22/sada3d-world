/**
 * Geometry analysis.
 *
 * Measured facts about a file, and nothing else. Every number here was computed
 * from vertices the file actually contains; nothing is estimated, inferred from
 * how a model "looks", or carried over from a similar part.
 *
 * ── The three categories this phase keeps apart ──────────────────────────
 *
 *   FILE FACT            "Bounding dimensions: 82 × 41 × 16 mm"   ← this module
 *   MANUFACTURING RULE   "Fits the selected process"              ← manufacturability
 *   PRICE                "Estimated total: ₹X"                    ← pricing
 *
 * They are computed by different modules, typed differently and displayed
 * differently, because blurring them is how a measurement starts reading as a
 * promise.
 *
 * ── Why every number is wrapped ──────────────────────────────────────────
 *
 * A bounding box can always be computed from any non-empty mesh. A solid volume
 * cannot: it is only meaningful for a closed, consistently-oriented surface, and
 * an open mesh has no inside. Returning `0` there, or returning the divergence
 * sum anyway, would be inventing a fact.
 *
 * So each measurement carries its own state, unit and provenance, and the UI
 * has to handle "unavailable" to show anything at all. That is deliberate: it
 * is what stops an unmeasured value rendering as `0 mm³`.
 */

/* ------------------------------------------------------------------ *
 * Units
 * ------------------------------------------------------------------ */

/**
 * Units a model file can declare.
 *
 * The 3MF core specification's set exactly. STL and OBJ declare nothing, which
 * is a different situation and is represented differently below.
 */
export type ModelUnit =
  | "micron"
  | "millimeter"
  | "centimeter"
  | "inch"
  | "foot"
  | "meter";

/** Millimetres per unit. The one conversion table. */
export const UNIT_TO_MM: Readonly<Record<ModelUnit, number>> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
};

/**
 * How the unit was determined.
 *
 * `declared` means the file said so. `assumed` means it did not, and the value
 * is this project's documented convention rather than a fact about the file —
 * which is a distinction a customer is entitled to see, because a part assumed
 * to be in millimetres and actually drawn in inches is 25.4× wrong.
 *
 * Nothing is ever inferred from the *size* of the geometry. A 3 mm part and a
 * 3 inch part look identical to a parser, and guessing between them by
 * plausibility is exactly the kind of invention this codebase refuses.
 */
export interface UnitResolution {
  unit: ModelUnit;
  declared: boolean;
  /** Millimetres per file unit. */
  scaleToMm: number;
  /** Why this unit, in one line. Shown where the assumption matters. */
  note: string;
}

/* ------------------------------------------------------------------ *
 * Measurements
 * ------------------------------------------------------------------ */

export type MeasurementUnit = "mm" | "mm2" | "mm3" | "count";

/**
 * Where a number came from.
 *
 * `mesh` is computed from triangles. `header` is stated by the file's own
 * header and confirmed against its length. `container` is stated by package
 * metadata. A customer reading "42 triangles" is entitled to know whether that
 * was counted or quoted.
 */
export type MeasurementSource = "mesh" | "header" | "container";

export type Measurement =
  | {
      state: "available";
      value: number;
      unit: MeasurementUnit;
      source: MeasurementSource;
    }
  /** Not computable for this model. The reason says what stopped it. */
  | { state: "unavailable"; unit: MeasurementUnit; reason: string }
  /** Computed, and the result cannot be trusted. */
  | { state: "invalid"; unit: MeasurementUnit; reason: string };

export function measured(
  value: number,
  unit: MeasurementUnit,
  source: MeasurementSource,
): Measurement {
  return { state: "available", value, unit, source };
}

export function unavailable(unit: MeasurementUnit, reason: string): Measurement {
  return { state: "unavailable", unit, reason };
}

export function invalid(unit: MeasurementUnit, reason: string): Measurement {
  return { state: "invalid", unit, reason };
}

/** The value, or undefined. For callers that genuinely handle absence. */
export function measurementValue(measurement: Measurement): number | undefined {
  return measurement.state === "available" ? measurement.value : undefined;
}

/* ------------------------------------------------------------------ *
 * Topology
 * ------------------------------------------------------------------ */

/**
 * What the surface is, as far as the triangles say.
 *
 * `closed` — every edge is shared by exactly two triangles with opposite
 *            winding. A solid volume is meaningful.
 * `open`   — at least one edge belongs to one triangle. There are holes, so
 *            there is no inside and no volume.
 * `non_manifold` — an edge is shared by more than two triangles, or windings
 *            disagree. The surface does not describe a solid.
 * `unknown` — not determined, e.g. nothing was parsed.
 */
export type MeshTopology = "closed" | "open" | "non_manifold" | "unknown";

export interface TopologyReport {
  topology: MeshTopology;
  /** Edges belonging to exactly one triangle. */
  boundaryEdges: number;
  /** Edges belonging to more than two triangles. */
  nonManifoldEdges: number;
  /** Triangles with zero area, which contribute nothing and skew nothing. */
  degenerateTriangles: number;
}

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

export interface Dimensions {
  /** Millimetres, after unit conversion. */
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox {
  min: Dimensions;
  max: Dimensions;
  size: Dimensions;
}

/**
 * A warning about the analysis itself.
 *
 * Not a manufacturing judgement — that is `checkManufacturability`. This is
 * "the file has something in it that made measuring harder or impossible".
 */
export interface AnalysisWarning {
  code:
    | "degenerate_triangles"
    | "non_finite_coordinates"
    | "open_mesh"
    | "non_manifold_mesh"
    | "empty_object"
    | "unit_assumed"
    | "unsupported_metadata"
    | "truncated_analysis";
  message: string;
  /** The object this is about, when it is about one. */
  objectId?: string;
}

/** One manufacturable object from the file. */
export interface ObjectAnalysis {
  /** The file's own identifier for the object. */
  id: string;
  /** The file's own name, where it has one. Never invented. */
  name?: string;
  meshCount: number;
  triangleCount: Measurement;
  boundingBox: BoundingBox;
  volume: Measurement;
  surfaceArea: Measurement;
  topology: TopologyReport;
}

/**
 * The whole analysis.
 *
 * `objects` is per-part; the top-level measurements are the aggregate. Both are
 * present because a manufacturing layer needs both questions answered — how big
 * is the whole thing, and what are the individual parts — and merging multiple
 * objects into one silently would answer neither.
 */
export interface GeometryAnalysisResult {
  /** Content-derived. The same bytes always produce the same id. */
  identity: string;
  format: AnalyzableFormat;
  unit: UnitResolution;
  /** Objects the file declares as separate manufacturable things. */
  objectCount: number;
  meshCount: number;
  triangleCount: Measurement;
  /** The extent of everything together, in millimetres. */
  boundingBox: BoundingBox;
  /** Sum of the objects' volumes, available only when every object's is. */
  volume: Measurement;
  surfaceArea: Measurement;
  topology: TopologyReport;
  objects: readonly ObjectAnalysis[];
  warnings: readonly AnalysisWarning[];
}

/**
 * Formats the mesh analyser handles.
 *
 * STEP is deliberately absent and is not a gap to be filled here. It is a
 * boundary-representation format: there are no triangles to count, and putting
 * it through a mesh parser would produce either an error or, worse, a number.
 * The custom-print flow accepts STEP as a file and says plainly that geometry
 * analysis is not available for it.
 */
export type AnalyzableFormat = "3mf" | "stl" | "obj";

export const ANALYZABLE_FORMATS: readonly AnalyzableFormat[] = ["3mf", "stl", "obj"];

/** The order the interface should prefer, best first. */
export const PREFERRED_FORMATS: readonly AnalyzableFormat[] = ["3mf", "stl", "obj"];
