import {
  CONFIGURATOR_FDM_QUALITIES,
  CONFIGURATOR_FINISHES,
  CONFIGURATOR_MATERIALS,
  CONFIGURATOR_COLOURS,
  FINISH_OPTIONS,
  MATERIAL_OPTIONS,
  QUALITY_OPTIONS,
} from "@/lib/custom-print/options";

import {
  LEDGER,
  LIMITATION_TOPICS,
  approvedColours,
  approvedLayerHeights,
  decisionFor,
  platformFor,
  type DecisionRecord,
} from "./decisions";
import { capabilityStatus } from "./capabilities";
import { known, missing, proposed, type ApprovalReference, type Fact } from "./facts";

/**
 * Manufacturing capability specification — the canonical record.
 *
 * ── Stage 19.8: built from explicit decisions ────────────────────────────
 *
 * Every APPROVED or BLOCKED value below comes from a record in the business
 * decision ledger (`decisions/business-decisions.json`), carrying its reference,
 * approver and date. Nothing is approved here by default: a capability with no
 * decision stays PROPOSED (the software can describe it) or MISSING (nobody has
 * supplied it). `MANUFACTURING_CAPABILITY.md` is generated from this module and a
 * test fails if the two drift.
 *
 * Printer specifications the business supplied from the manufacturer's
 * documentation are recorded as KNOWN technical facts with that source. They
 * are properties of the machine, not Reality 3D production guarantees: a wall
 * thickness, feature size, accuracy or tolerance is never derived from them.
 */

export type ApprovalState =
  | { state: "NOT_APPROVED" }
  | { state: "APPROVED"; approval: ApprovalReference; decisionId: string }
  | { state: "BLOCKED"; note: string; approval: ApprovalReference; decisionId: string };

const OPTIONS = "lib/custom-print/options.ts (software definitions)";
const MANUFACTURABILITY = "lib/manufacturing/manufacturability.ts";
const MACHINE = "lib/manufacturing/machine.ts (job state machine)";
const INSPECT = "lib/custom-print/inspect.ts + lib/models (upload and analysis)";
const VALIDATION = "requires Reality 3D manufacturing validation";

const refOf = (record: DecisionRecord): ApprovalReference => ({ ...record.approval });

const approvedFact = <T>(value: T, record: DecisionRecord): Fact<T> => ({
  state: "APPROVED",
  value,
  approval: { ...refOf(record), reference: `${record.approval.reference} [${record.id}]` },
});

const blockedFact = <T>(note: string, record: DecisionRecord): Fact<T> => ({
  state: "BLOCKED",
  note: `${note} [${record.id}: ${record.approval.reference}]`,
});

/** The approval state a process or material decision gives, if any. */
function approvalOf(record: DecisionRecord | undefined): ApprovalState {
  if (!record) return { state: "NOT_APPROVED" };
  return record.decision === "APPROVED"
    ? { state: "APPROVED", approval: refOf(record), decisionId: record.id }
    : {
        state: "BLOCKED",
        note: record.rationale ?? "Not approved.",
        approval: refOf(record),
        decisionId: record.id,
      };
}

/* ------------------------------------------------------------------ *
 * Technologies
 * ------------------------------------------------------------------ */

export interface TechnologySpec {
  value: "fdm" | "sla";
  name: string;
  status: Fact<string>;
  printer: Fact<string>;
  buildEnvelopeMm: Fact<{ x: number; y: number; z: number }>;
  materials: Fact<readonly string[]>;
  layerHeights: Fact<readonly string[]>;
  tooling: Fact<string>;
  maxHotendTemperature: Fact<string>;
  supportedGeometry: Fact<string>;
  knownLimitations: Fact<readonly string[]>;
  fileTypes: Fact<readonly string[]>;
  leadTime: Fact<string>;
  postProcessing: Fact<readonly string[]>;
  inspection: Fact<string>;
  approval: ApprovalState;
}

const FILE_TYPES = known(
  ["STL (analysed)", "3MF (analysed)", "OBJ (analysed)", "STEP/STP (accepted, not analysed)"],
  INSPECT,
);

const GEOMETRY = known(
  "A closed, manifold mesh. Open or non-manifold meshes are refused as blocking; files without a unit are measured assuming millimetres and flagged.",
  MANUFACTURABILITY,
);

const INSPECTION = missing<string>(
  `Inspection criteria — MISSING, ${VALIDATION}. A quality_check stage exists in the job state machine (${MACHINE}), but what is checked and against what acceptance criteria is not defined.`,
);

function fdmSpec(): TechnologySpec {
  const process = decisionFor("manufacturing-process", "fdm");
  const platform = platformFor("fdm");
  const materialDecisions = CONFIGURATOR_MATERIALS.filter((m) => m.technology === "fdm");
  const approvedNames = MATERIAL_OPTIONS.filter((m) => m.technology === "fdm").map((m) => m.name);
  const layerRecord = decisionFor("layer-heights", "fdm");
  const specSource = platform ? `${platform.specificationReference}, supplied by Reality 3D [${platform.record.id}]` : "";

  return {
    value: "fdm",
    name: "Fused deposition modelling",
    status: process ? (process.decision === "APPROVED" ? approvedFact("Approved initial launch process", process) : blockedFact("Not approved", process)) : proposed("Offered in the configurator", OPTIONS),
    printer: platform ? approvedFact(platform.printer, platform.record) : missing("No FDM printer is recorded."),
    buildEnvelopeMm: platform ? approvedFact(platform.buildVolumeMm, platform.record) : missing("No machine or build volume is recorded."),
    materials: (() => {
      const records = materialDecisions
        .map((m) => decisionFor("material", m.value))
        .filter((r): r is DecisionRecord => r?.decision === "APPROVED");
      if (approvedNames.length === 0 || records.length === 0) {
        return proposed(materialDecisions.map((m) => m.name), OPTIONS);
      }
      const latest = [...records].sort((a, b) => a.approval.approvedOn.localeCompare(b.approval.approvedOn)).at(-1)!;
      return {
        state: "APPROVED" as const,
        value: approvedNames,
        approval: {
          reference: records.map((r) => `${r.id}`).join(", ") + ` — ${latest.approval.reference}`,
          approvedBy: latest.approval.approvedBy,
          approvedOn: latest.approval.approvedOn,
        },
      };
    })(),
    layerHeights:
      layerRecord?.decision === "APPROVED"
        ? approvedFact(QUALITY_OPTIONS.map((q) => `${q.layerHeight} (${q.label})`), layerRecord)
        : proposed(CONFIGURATOR_FDM_QUALITIES.map((q) => q.layerHeight), OPTIONS),
    tooling: platform?.includedNozzle
      ? known(
          `${platform.includedNozzle} included; optional nozzle sizes ${(platform.optionalNozzleSizesMm ?? []).map((n) => `${n} mm`).join(", ") || "none recorded"}. Printer specification, not a production guarantee.`,
          specSource,
        )
      : missing("Nozzle and tooling are not recorded."),
    maxHotendTemperature: platform?.maxHotendTemperatureC
      ? known(`${platform.maxHotendTemperatureC} °C maximum hotend temperature (printer specification).`, specSource)
      : missing("Not recorded."),
    supportedGeometry: GEOMETRY,
    knownLimitations: known(
      platform
        ? [
            `Parts larger than the ${platform.buildVolumeMm.x} × ${platform.buildVolumeMm.y} × ${platform.buildVolumeMm.z} mm build volume in every orientation are refused before quoting.`,
            "No minimum wall or minimum feature check is configured: neither value has been validated.",
            "Part count is measured but no maximum is set.",
          ]
        : ["No build volume, minimum wall or minimum feature check is configured."],
      MANUFACTURABILITY,
    ),
    fileTypes: FILE_TYPES,
    leadTime: missing(`No production lead time has been set — ${VALIDATION}.`),
    postProcessing: known(
      [
        `Offered: ${FINISH_OPTIONS.map((f) => `${f.label} (${f.description})`).join("; ")}`,
        `Not offered — no approval: ${CONFIGURATOR_FINISHES.filter((f) => f.postProcessing).map((f) => f.label).join(", ")}`,
      ],
      OPTIONS,
    ),
    inspection: INSPECTION,
    approval: approvalOf(process),
  };
}

function slaSpec(): TechnologySpec {
  const process = decisionFor("manufacturing-process", "sla");
  const blocked = (what: string) =>
    process?.decision === "NOT_APPROVED" ? blockedFact<string>(`${what}: SLA is not approved for launch`, process) : missing<string>(`${what} is not recorded.`);

  return {
    value: "sla",
    name: "Stereolithography",
    status:
      process?.decision === "NOT_APPROVED"
        ? blockedFact(process.rationale ?? "Not approved", process)
        : process
          ? approvedFact("Approved process", process)
          : proposed("Resin has a software definition", OPTIONS),
    printer: blocked("SLA printer"),
    buildEnvelopeMm: missing("No SLA machine or build volume is recorded."),
    materials: process?.decision === "NOT_APPROVED" ? blockedFact("Resin: not offered", process) : proposed(["Resin"], OPTIONS),
    layerHeights: missing("No SLA layer height is recorded. FDM layer heights are never offered for resin."),
    tooling: blocked("Resin system and cure process"),
    maxHotendTemperature: missing("Not applicable to SLA; not recorded."),
    supportedGeometry: GEOMETRY,
    knownLimitations: known(["The configurator refuses FDM layer heights for resin (Stage 19.7)."], OPTIONS),
    fileTypes: FILE_TYPES,
    leadTime: missing("No production lead time has been set."),
    postProcessing: missing("Resin washing and post-curing are not described."),
    inspection: INSPECTION,
    approval: approvalOf(process),
  };
}

export const TECHNOLOGIES: readonly TechnologySpec[] = [fdmSpec(), slaSpec()];

/* ------------------------------------------------------------------ *
 * Material capability matrix
 * ------------------------------------------------------------------ */

export interface MaterialCapability {
  material: string;
  name: string;
  technology: "fdm" | "sla";
  status: Fact<string>;
  colours: Fact<readonly string[]>;
  layerHeights: Fact<readonly string[]>;
  finishes: Fact<readonly string[]>;
  approval: ApprovalState;
}

const colourName = (value: string) => CONFIGURATOR_COLOURS.find((c) => c.value === value)?.label ?? value;
const colourNameFromHex = (hex: string) =>
  CONFIGURATOR_COLOURS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.label ?? hex;

export const MATERIAL_CAPABILITIES: readonly MaterialCapability[] = CONFIGURATOR_MATERIALS.map((option) => {
  const materialDecision = decisionFor("material", option.value);
  const processDecision = decisionFor("manufacturing-process", option.technology);
  const offered = MATERIAL_OPTIONS.some((m) => m.value === option.value);

  const colourRecord = [...LEDGER.effective.values()].find(
    (r) => r.kind === "material-colours" && r.decision === "APPROVED" && (r.values?.materials as string[]).includes(option.value),
  );
  const layerRecord = decisionFor("layer-heights", option.technology);

  const approval: ApprovalState =
    materialDecision?.decision === "NOT_APPROVED"
      ? approvalOf(materialDecision)
      : processDecision?.decision === "NOT_APPROVED"
        ? approvalOf(processDecision)
        : offered
          ? approvalOf(materialDecision)
          : { state: "NOT_APPROVED" };

  const notOffered = (what: string): Fact<readonly string[]> =>
    approval.state === "BLOCKED"
      ? { state: "BLOCKED", note: `${what}: ${option.name} is not approved for launch [${approval.decisionId}]` }
      : proposed(option.colors.map(colourNameFromHex), OPTIONS);

  return {
    material: option.value,
    name: option.name,
    technology: option.technology,
    status:
      approval.state === "APPROVED"
        ? approvedFact(`Approved for launch on ${option.technology.toUpperCase()}`, materialDecision!)
        : approval.state === "BLOCKED"
          ? { state: "BLOCKED", note: `${approval.note} [${approval.decisionId}]` }
          : proposed(`Defined for ${option.technology.toUpperCase()}; no decision`, OPTIONS),
    colours:
      offered && colourRecord
        ? approvedFact(approvedColours(option.value).map(colourName), colourRecord)
        : notOffered("Colours"),
    layerHeights:
      offered && layerRecord?.decision === "APPROVED" && option.technology === "fdm"
        ? approvedFact(approvedLayerHeights("fdm"), layerRecord)
        : option.technology === "sla"
          ? approval.state === "BLOCKED"
            ? { state: "BLOCKED", note: `No SLA layer height; ${option.name} not approved [${approval.decisionId}]` }
            : missing("No SLA layer height is recorded.")
          : notOffered("Layer heights"),
    finishes: offered
      ? known(FINISH_OPTIONS.map((f) => `${f.label} (as printed)`), `${OPTIONS} — post-processing finishes are not approved`)
      : approval.state === "BLOCKED"
        ? { state: "BLOCKED", note: `Finishes: ${option.name} not approved for launch [${approval.decisionId}]` }
        : proposed(CONFIGURATOR_FINISHES.map((f) => f.label), OPTIONS),
    approval,
  };
});

/* ------------------------------------------------------------------ *
 * Manufacturing limitations policy
 * ------------------------------------------------------------------ */

export interface LimitationPolicy {
  topic: string;
  policy: Fact<string>;
  /** Whether a customer ordering needs this stated before launch. */
  requiredForLaunch: boolean;
}

const BASE_LIMITATIONS: Readonly<Record<string, { policy: Fact<string>; requiredForLaunch: boolean }>> = {
  "Maximum build volume": { policy: missing(`No machine envelope recorded — ${VALIDATION}.`), requiredForLaunch: true },
  "Minimum wall thickness": { policy: missing(`MISSING — ${VALIDATION}. Not derived from the printer specification.`), requiredForLaunch: true },
  "Minimum feature size": { policy: missing(`MISSING — ${VALIDATION}. MachineConstraints.minimumFeatureMm is unset.`), requiredForLaunch: true },
  "Dimensional accuracy": { policy: missing(`MISSING — ${VALIDATION}.`), requiredForLaunch: true },
  "Production tolerance": { policy: missing(`MISSING — ${VALIDATION}. No tolerance is published or implied; product copy is validated to state none.`), requiredForLaunch: false },
  "Unsupported overhangs": { policy: missing(`No validated overhang limit — ${VALIDATION}.`), requiredForLaunch: false },
  Bridging: { policy: missing(`No validated bridge limit — ${VALIDATION}.`), requiredForLaunch: false },
  "Hole accuracy": { policy: missing(`MISSING — ${VALIDATION}.`), requiredForLaunch: false },
  "Press-fit expectations": { policy: missing(`No policy — ${VALIDATION}.`), requiredForLaunch: false },
  Threads: { policy: missing(`No policy on printed threads — ${VALIDATION}.`), requiredForLaunch: false },
  "Moving assemblies": { policy: missing(`No policy on print-in-place or clearance — ${VALIDATION}.`), requiredForLaunch: false },
  Orientation: { policy: missing(`Who chooses print orientation, and whether the customer is told, is not defined — ${VALIDATION}.`), requiredForLaunch: false },
  Warping: { policy: missing(`No validated policy — ${VALIDATION}.`), requiredForLaunch: false },
  "Support structures": { policy: proposed("The Standard finish is described as 'with supports removed'; no policy on support marks.", OPTIONS), requiredForLaunch: false },
  "Surface finish": { policy: known("Only the Standard (as printed) finish is offered; Smoothed and Matte post-processing are not approved.", OPTIONS), requiredForLaunch: false },
  "Material shrinkage": { policy: missing(`No compensation policy — ${VALIDATION}.`), requiredForLaunch: false },
  "Post-processing": { policy: missing(`No post-processing is approved — ${VALIDATION}.`), requiredForLaunch: false },
  "Colour limitations": { policy: known("Each approved material is offered only in its approved colours; see the matrix.", `${OPTIONS} + decision ledger`), requiredForLaunch: false },
  "Large multipart assemblies": { policy: known("Parts in a file are counted; there is no maximum and no assembly service.", MANUFACTURABILITY), requiredForLaunch: false },
  "Inspection criteria": { policy: missing(`MISSING — ${VALIDATION}.`), requiredForLaunch: false },
  "Mesh integrity": { policy: known("Open and non-manifold meshes are refused before quoting.", MANUFACTURABILITY), requiredForLaunch: false },
  Units: { policy: known("STL and OBJ carry no unit; millimetres are assumed and the customer is told to check.", MANUFACTURABILITY), requiredForLaunch: false },
  "File analysis limits": { policy: known("Up to 2,000,000 triangles and 4,000,000 vertices are analysed; larger files are refused as too complex.", "lib/models/limits.ts"), requiredForLaunch: false },
};

export const LIMITATIONS: readonly LimitationPolicy[] = LIMITATION_TOPICS.map((topic) => {
  const base = BASE_LIMITATIONS[topic];
  if (!base) throw new Error(`No base policy for limitation "${topic}".`);
  const decision = decisionFor("manufacturing-limitation", topic);
  return {
    topic,
    requiredForLaunch: base.requiredForLaunch,
    policy:
      decision?.decision === "APPROVED"
        ? approvedFact(String(decision.values?.policy), decision)
        : decision
          ? blockedFact(decision.rationale ?? "Not approved", decision)
          : base.policy,
  };
});

/* ------------------------------------------------------------------ *
 * Derived verdicts
 * ------------------------------------------------------------------ */

export function technologySpec(value: string): TechnologySpec | undefined {
  return TECHNOLOGIES.find((technology) => technology.value === value);
}

export function materialCapability(material: string): MaterialCapability | undefined {
  return MATERIAL_CAPABILITIES.find((capability) => capability.material === material);
}

export interface CapabilityVerdict {
  approved: boolean;
  reasons: string[];
}

/**
 * Whether a material on a process is approved manufacturing capability.
 *
 * An unsupported pairing (FDM + resin) is never approved, whatever the records
 * say, because it is not a capability at all.
 */
export function capabilityVerdict(material: string, technology: string): CapabilityVerdict {
  const reasons: string[] = [];
  const tech = technologySpec(technology);
  const capability = materialCapability(material);

  if (!tech) reasons.push(`${technology.toUpperCase()} is not a supported technology`);
  if (!capability) reasons.push(`${material} is not a supported material`);
  if (tech && capability && capability.technology !== tech.value) {
    reasons.push(
      `${capability.name} is printed with ${capability.technology.toUpperCase()}, not ${tech.value.toUpperCase()} — unsupported combination`,
    );
  }
  const soon = (kind: "technology" | "material", value: string) =>
    capabilityStatus(kind, value) === "COMING_SOON" ? " — coming soon, not available for production" : "";
  if (tech && tech.approval.state !== "APPROVED") {
    reasons.push(
      soon("technology", tech.value)
        ? `Manufacturing process not approved: ${tech.value.toUpperCase()}${soon("technology", tech.value)}`
        : tech.approval.state === "BLOCKED"
        ? `Manufacturing process not approved: ${tech.value.toUpperCase()} (${tech.approval.note})`
        : `Manufacturing process not approved: ${tech.value.toUpperCase()}`,
    );
  }
  if (capability && capability.approval.state !== "APPROVED") {
    reasons.push(
      soon("material", capability.material)
        ? `Material not approved: ${capability.name}${soon("material", capability.material)}`
        : capability.approval.state === "BLOCKED"
        ? `Material not approved: ${capability.name} (${capability.approval.note})`
        : `Material not approved: ${capability.name} on ${capability.technology.toUpperCase()}`,
    );
  }
  return { approved: reasons.length === 0, reasons };
}

/** At least one process is approved and every material offered is approved on an approved process. */
export function processesAndMaterialsApproved(): boolean {
  const offered = MATERIAL_CAPABILITIES.filter((c) => MATERIAL_OPTIONS.some((m) => m.value === c.material));
  return (
    TECHNOLOGIES.some((t) => t.approval.state === "APPROVED") &&
    offered.length > 0 &&
    offered.every((c) => c.approval.state === "APPROVED" && technologySpec(c.technology)?.approval.state === "APPROVED")
  );
}

/** Launch-required limitations not yet stated (neither APPROVED nor KNOWN). */
export function missingLaunchLimitations(): string[] {
  return LIMITATIONS.filter(
    (limitation) =>
      limitation.requiredForLaunch &&
      limitation.policy.state !== "APPROVED" &&
      limitation.policy.state !== "KNOWN",
  ).map((limitation) => limitation.topic);
}

/**
 * Manufacturing capability approved for launch: processes and materials approved
 * AND every launch-required limitation stated. Anything less is not approved.
 */
export function manufacturingApproved(): boolean {
  return processesAndMaterialsApproved() && missingLaunchLimitations().length === 0;
}

export type ManufacturingStatus = "APPROVED" | "PARTIALLY APPROVED" | "NOT APPROVED";

export function manufacturingStatus(): ManufacturingStatus {
  if (manufacturingApproved()) return "APPROVED";
  return TECHNOLOGIES.some((t) => t.approval.state === "APPROVED") ? "PARTIALLY APPROVED" : "NOT APPROVED";
}
