import { measurementValue, type GeometryAnalysisResult } from "@/lib/geometry/types";

/**
 * Manufacturability assessment.
 *
 * The seam between a measurement and a manufacturing judgement:
 *
 *   analyzeGeometry()        what the file says       ← facts
 *          ↓
 *   checkManufacturability() what the shop can make   ← rules
 *          ↓
 *   calculateQuote()         what it costs            ← price
 *
 * Kept separate from the geometry math on purpose. A bounding box is a property
 * of a file and never changes; whether that box fits a machine is a property of
 * the shop floor and changes when a machine is bought or retired. Baking the
 * second into the first would mean re-deriving measurements every time the
 * equipment list changed.
 *
 * ── What this deliberately does not contain ──────────────────────────────
 *
 * **No machine limits.** SADA 3D has no published build volume, no minimum wall
 * thickness, no maximum part count and no material-specific constraints in this
 * repository, so none is asserted here. Inventing "must fit within 256 × 256 ×
 * 256 mm" would be inventing a manufacturing capability.
 *
 * What it does instead is report the findings that need no machine to be true:
 * a mesh with holes cannot be sliced reliably whatever the printer, a file
 * whose unit was assumed might be 25.4× off, and a model using an unimplemented
 * extension has only been partly understood.
 *
 * `MachineConstraints` is the shape a future manufacturing configuration fills
 * in. Until one exists the assessment reports `constraints: "unconfigured"`, and
 * the interface says the size check has not been performed rather than implying
 * the part passed it.
 */

export type ManufacturabilityCode =
  /** Larger than the configured build volume. Requires constraints. */
  | "oversized"
  /** Small enough that features may not survive. Requires constraints. */
  | "minimum_feature"
  | "open_mesh"
  | "non_manifold"
  | "degenerate_geometry"
  | "excessive_part_count"
  | "unit_assumed"
  | "unsupported_format_feature"
  | "analysis_incomplete";

/** How much a finding should stop. */
export type ManufacturabilitySeverity =
  /** Cannot be manufactured as supplied. */
  | "blocking"
  /** Can proceed, and the customer should know. */
  | "advisory";

export interface ManufacturabilityFinding {
  code: ManufacturabilityCode;
  severity: ManufacturabilitySeverity;
  /** Written for a customer. Says what was found, not what to do about it. */
  message: string;
  objectId?: string;
}

/**
 * The machine limits an assessment would check against.
 *
 * Empty today, and its absence is reported rather than defaulted. A default
 * build volume would be a claim about equipment this repository knows nothing
 * about.
 */
export interface MachineConstraints {
  /** Millimetres. */
  buildVolumeMm?: { x: number; y: number; z: number };
  /** Millimetres. Features below this may not resolve. */
  minimumFeatureMm?: number;
  maxPartCount?: number;
}

export interface ManufacturabilityAssessment {
  /** False when any finding is blocking. */
  manufacturable: boolean;
  findings: readonly ManufacturabilityFinding[];
  /**
   * Whether machine limits were available to check against.
   *
   * `unconfigured` means the size and feature checks did not run. The interface
   * must not read that as "passed".
   */
  constraints: "configured" | "unconfigured";
}

/**
 * Assesses an analysis against what is known.
 *
 * Everything here follows from the measurement plus a rule that holds for any
 * additive process. Nothing depends on a specific machine unless constraints
 * were supplied.
 */
export function checkManufacturability(
  analysis: GeometryAnalysisResult,
  constraints?: MachineConstraints,
): ManufacturabilityAssessment {
  const findings: ManufacturabilityFinding[] = [];

  /* ---- topology: true for every process ---- */

  for (const object of analysis.objects) {
    if (object.topology.topology === "open") {
      findings.push({
        code: "open_mesh",
        severity: "blocking",
        message: `${object.name ?? "This part"} is not a closed surface. A mesh with holes has no inside, so it cannot be sliced reliably.`,
        ...(object.id ? { objectId: object.id } : {}),
      });
    }

    if (object.topology.topology === "non_manifold") {
      findings.push({
        code: "non_manifold",
        severity: "blocking",
        message: `${object.name ?? "This part"} is non-manifold — edges are shared by more than two faces — so it does not describe a solid.`,
        ...(object.id ? { objectId: object.id } : {}),
      });
    }

    if (object.topology.degenerateTriangles > 0) {
      findings.push({
        code: "degenerate_geometry",
        severity: "advisory",
        message: `${object.name ?? "This part"} contains ${object.topology.degenerateTriangles} zero-area ${object.topology.degenerateTriangles === 1 ? "triangle" : "triangles"}. They were excluded from the measurements.`,
        ...(object.id ? { objectId: object.id } : {}),
      });
    }
  }

  /* ---- what the analysis itself could not establish ---- */

  if (!analysis.unit.declared) {
    findings.push({
      code: "unit_assumed",
      severity: "advisory",
      message: `${analysis.format.toUpperCase()} files do not record a unit. These dimensions assume millimetres — check them against your design before ordering.`,
    });
  }

  if (analysis.warnings.some((warning) => warning.code === "unsupported_metadata")) {
    findings.push({
      code: "unsupported_format_feature",
      severity: "advisory",
      message:
        "This model uses format extensions that were not interpreted. Only its core geometry has been measured.",
    });
  }

  if (analysis.warnings.some((warning) => warning.code === "truncated_analysis")) {
    findings.push({
      code: "analysis_incomplete",
      severity: "advisory",
      message:
        "Part of this model could not be read, so the measurements describe less than the whole file.",
    });
  }

  /* ---- machine limits, only where there are any ---- */

  if (!constraints) {
    return {
      manufacturable: !findings.some((finding) => finding.severity === "blocking"),
      findings,
      /*
       * Said plainly. No build volume is configured, so nothing was checked
       * against one — which is different from having checked and passed.
       */
      constraints: "unconfigured",
    };
  }

  const size = analysis.boundingBox.size;

  if (constraints.buildVolumeMm) {
    const limit = constraints.buildVolumeMm;
    // Sorted both ways: a part that does not fit as drawn may fit rotated, and
    // refusing it without checking would refuse something makeable.
    const part = [size.x, size.y, size.z].sort((a, b) => a - b);
    const volume = [limit.x, limit.y, limit.z].sort((a, b) => a - b);

    if (part.some((value, index) => value > (volume[index] ?? 0))) {
      findings.push({
        code: "oversized",
        severity: "blocking",
        message: `This model measures ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm, which does not fit the build volume in any orientation.`,
      });
    }
  }

  if (constraints.minimumFeatureMm !== undefined) {
    const smallest = Math.min(size.x, size.y, size.z);
    if (smallest > 0 && smallest < constraints.minimumFeatureMm) {
      findings.push({
        code: "minimum_feature",
        severity: "advisory",
        message: `The smallest dimension is ${smallest.toFixed(2)} mm, at or below the minimum feature size. Detail may not resolve.`,
      });
    }
  }

  if (
    constraints.maxPartCount !== undefined &&
    analysis.objectCount > constraints.maxPartCount
  ) {
    findings.push({
      code: "excessive_part_count",
      severity: "blocking",
      message: `This model contains ${analysis.objectCount} parts, above the ${constraints.maxPartCount} that can be quoted automatically.`,
    });
  }

  return {
    manufacturable: !findings.some((finding) => finding.severity === "blocking"),
    findings,
    constraints: "configured",
  };
}

/**
 * The machine constraints this deployment knows about.
 *
 * None. There is no approved build volume, minimum feature size or part-count
 * limit in this repository, and returning invented ones would produce an
 * assessment that reads as authoritative and is not. When manufacturing
 * configuration exists, this is the one function that changes.
 */
export function configuredConstraints(): MachineConstraints | undefined {
  return undefined;
}

/**
 * Geometry facts, reduced to what a quote may be given.
 *
 * A projection rather than the analysis itself: the quote engine has no use for
 * topology, warnings or per-object detail, and passing the whole result would
 * invite a pricing rule to start depending on something that is not a
 * commercial input.
 */
export function toQuoteGeometry(analysis: GeometryAnalysisResult) {
  return {
    dimensionsMm: { ...analysis.boundingBox.size },
    volumeMm3: measurementValue(analysis.volume),
    surfaceAreaMm2: measurementValue(analysis.surfaceArea),
    triangleCount: measurementValue(analysis.triangleCount),
    partCount: analysis.objectCount,
  };
}
