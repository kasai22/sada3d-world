import ledgerFile from "./decisions/business-decisions.json";

/**
 * The business decision ledger — explicit Reality 3D decisions, and nothing else.
 *
 * ── Why a ledger ─────────────────────────────────────────────────────────
 *
 * Stage 19.8 turned business and manufacturing decisions into data the system
 * enforces. Every approval the storefront, the configurator, the quote engine
 * and launch readiness act on is a record here with a reference, an approver
 * and a date. The application never infers an approval from the existence of a
 * value: a material in the configurator without an APPROVED record here is not
 * offered.
 *
 * ── Fail closed ──────────────────────────────────────────────────────────
 *
 * A record that fails validation is not applied. Two records that conflict — the
 * same kind and subject, the same date, different outcomes — are both withheld.
 * Nothing is thrown at module load: an invalid ledger makes the system offer
 * *less*, and `content:verify` and `content:decisions` report why.
 *
 * ── Append-only ──────────────────────────────────────────────────────────
 *
 * A changed decision is a new record with a later `approvedOn`. The latest
 * effective record for a kind and subject wins.
 *
 * Pure: imports nothing but the ledger file, so the configurator (a client
 * bundle) can read it.
 */

export const DECISION_KINDS = [
  "manufacturing-platform",
  "manufacturing-process",
  "material",
  "material-colours",
  "finish",
  "layer-heights",
  "manufacturing-limitation",
  "launch-target",
  "catalog-policy",
] as const;

export type DecisionKind = (typeof DECISION_KINDS)[number];
export type DecisionOutcome = "APPROVED" | "NOT_APPROVED";

export interface DecisionApproval {
  reference: string;
  approvedBy: string;
  /** ISO date, YYYY-MM-DD. */
  approvedOn: string;
}

export interface DecisionRecord {
  id: string;
  kind: DecisionKind;
  subject: string;
  decision: DecisionOutcome;
  values?: Record<string, unknown>;
  rationale?: string;
  approval: DecisionApproval;
}

export interface DecisionLedger {
  schemaVersion: 1;
  description?: string;
  decisions: DecisionRecord[];
}

export interface DecisionIssue {
  recordId: string;
  message: string;
}

/* ------------------------------------------------------------------ *
 * Schema
 * ------------------------------------------------------------------ */

const ID = /^BD-\d{4}-\d{2}-\d{2}-\d{2,}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const PROCESSES = new Set(["fdm", "sla"]);
const MATERIALS = new Set(["pla", "petg", "abs", "tpu", "resin"]);
/** The colour vocabulary. Exported for the capability model; colour names are never invented. */
export const COLOUR_VALUES: ReadonlySet<string> = new Set(["black", "graphite", "titanium", "grey", "white", "orange", "blue"]);
/** Finishes the software can describe (Stage 19.9: approvable, none approved). */
export const FINISH_VALUES: ReadonlySet<string> = new Set(["standard", "smooth", "matte"]);
const CATALOG_POLICIES = new Set(["catalog-strategy", "sales-claims", "initial-products"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;

function volume(value: unknown): boolean {
  return isRecord(value) && positive(value.x) && positive(value.y) && positive(value.z);
}

/** Every reason one record is malformed. Semantics that need the configurator are checked elsewhere. */
export function validateDecisionRecord(record: unknown, limitationTopics: ReadonlySet<string>): DecisionIssue[] {
  const id = isRecord(record) && typeof record.id === "string" ? record.id : "(no id)";
  const issues: string[] = [];

  if (!isRecord(record)) return [{ recordId: id, message: "A decision must be an object." }];

  if (typeof record.id !== "string" || !ID.test(record.id)) issues.push('id must look like "BD-YYYY-MM-DD-NN".');
  if (!DECISION_KINDS.includes(record.kind as DecisionKind)) issues.push(`kind "${String(record.kind)}" is not a decision kind.`);
  if (record.decision !== "APPROVED" && record.decision !== "NOT_APPROVED") {
    issues.push('decision must be "APPROVED" or "NOT_APPROVED" — nothing is approved by omission.');
  }

  const approval = record.approval;
  if (
    !isRecord(approval) ||
    typeof approval.reference !== "string" || !approval.reference.trim() ||
    typeof approval.approvedBy !== "string" || !approval.approvedBy.trim() ||
    typeof approval.approvedOn !== "string" || !ISO_DATE.test(approval.approvedOn) ||
    Number.isNaN(Date.parse(approval.approvedOn))
  ) {
    issues.push("approval requires a reference, an approver and an ISO approvedOn date.");
  }

  const subject = typeof record.subject === "string" ? record.subject : "";
  const values = isRecord(record.values) ? record.values : undefined;
  const approved = record.decision === "APPROVED";

  switch (record.kind) {
    case "manufacturing-platform":
      if (!PROCESSES.has(subject)) issues.push(`subject "${subject}" is not a process.`);
      if (approved) {
        if (typeof values?.printer !== "string" || !values.printer.trim()) issues.push("values.printer is required.");
        if (!volume(values?.buildVolumeMm)) issues.push("values.buildVolumeMm needs positive x, y and z.");
        if (typeof values?.specificationReference !== "string") issues.push("values.specificationReference is required.");
      }
      break;
    case "manufacturing-process":
      if (!PROCESSES.has(subject)) issues.push(`subject "${subject}" is not a process.`);
      break;
    case "material":
      if (!MATERIALS.has(subject)) issues.push(`subject "${subject}" is not a material.`);
      break;
    case "material-colours": {
      const materials = values?.materials;
      const colours = values?.colours;
      if (!Array.isArray(materials) || materials.length === 0 || !materials.every((m) => MATERIALS.has(String(m)))) {
        issues.push("values.materials must list known materials.");
      }
      if (!Array.isArray(colours) || colours.length === 0 || !colours.every((c) => COLOUR_VALUES.has(String(c)))) {
        issues.push("values.colours must list colours from the colour vocabulary; colour names are never invented.");
      }
      break;
    }
    case "layer-heights":
      if (!PROCESSES.has(subject)) issues.push(`subject "${subject}" is not a process.`);
      if (!Array.isArray(values?.layerHeights) || !(values.layerHeights as unknown[]).every((h) => typeof h === "string")) {
        issues.push("values.layerHeights must be a list of layer heights.");
      }
      break;
    case "manufacturing-limitation":
      if (!limitationTopics.has(subject)) issues.push(`"${subject}" is not a documented manufacturing limitation.`);
      if (approved && (typeof values?.policy !== "string" || !values.policy.trim())) {
        issues.push("An approved limitation needs values.policy stating it.");
      }
      break;
    case "launch-target":
      if (subject !== "catalog") issues.push('subject must be "catalog".');
      if (approved && !(Number.isInteger(values?.minimumLaunchReadyProducts) && Number(values?.minimumLaunchReadyProducts) >= 1)) {
        issues.push("values.minimumLaunchReadyProducts must be a whole number of at least 1.");
      }
      break;
    case "finish":
      if (!FINISH_VALUES.has(subject)) issues.push(`subject "${subject}" is not a finish.`);
      break;
    case "catalog-policy":
      if (!CATALOG_POLICIES.has(subject)) issues.push(`"${subject}" is not a catalog policy.`);
      break;
  }

  return issues.map((message) => ({ recordId: id, message }));
}

export interface ResolvedLedger {
  /** Valid, non-conflicting records, latest per kind and subject. */
  effective: ReadonlyMap<string, DecisionRecord>;
  /** Every valid record, in ledger order: the audit trail. */
  accepted: readonly DecisionRecord[];
  issues: readonly DecisionIssue[];
}

const key = (kind: string, subject: string) => `${kind}::${subject}`;

/** Canonical JSON for comparing two records regardless of key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function recordsEqual(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

export function resolveLedger(ledger: unknown, limitationTopics: ReadonlySet<string>): ResolvedLedger {
  const issues: DecisionIssue[] = [];

  if (!isRecord(ledger) || ledger.schemaVersion !== 1 || !Array.isArray(ledger.decisions)) {
    return {
      effective: new Map(),
      accepted: [],
      issues: [{ recordId: "(ledger)", message: "The ledger must have schemaVersion 1 and a decisions array." }],
    };
  }

  const accepted: DecisionRecord[] = [];
  const byId = new Map<string, DecisionRecord>();

  for (const raw of ledger.decisions) {
    const recordIssues = validateDecisionRecord(raw, limitationTopics);
    if (recordIssues.length > 0) {
      issues.push(...recordIssues);
      continue;
    }
    const record = raw as DecisionRecord;
    const existing = byId.get(record.id);
    if (existing) {
      if (!recordsEqual(existing, record)) {
        issues.push({ recordId: record.id, message: "Two different records share this id." });
        accepted.splice(accepted.indexOf(existing), 1);
      }
      continue;
    }
    byId.set(record.id, record);
    accepted.push(record);
  }

  const effective = new Map<string, DecisionRecord>();
  const conflicted = new Set<string>();

  for (const record of accepted) {
    const k = key(record.kind, record.subject);
    const current = effective.get(k);
    if (!current || record.approval.approvedOn > current.approval.approvedOn) {
      effective.set(k, record);
      conflicted.delete(k);
    } else if (record.approval.approvedOn === current.approval.approvedOn && !recordsEqual(
      { decision: current.decision, values: current.values },
      { decision: record.decision, values: record.values },
    )) {
      conflicted.add(k);
    }
  }

  for (const k of conflicted) {
    const record = effective.get(k)!;
    effective.delete(k);
    issues.push({
      recordId: record.id,
      message: `Conflicting decisions for ${k.replace("::", " ")} on ${record.approval.approvedOn}; neither is applied.`,
    });
  }

  return { effective, accepted, issues };
}

/* ------------------------------------------------------------------ *
 * The committed ledger
 * ------------------------------------------------------------------ */

/**
 * The limitation topics a decision may address. Kept here, not imported from
 * `manufacturing.ts`, because that module reads this one.
 */
export const LIMITATION_TOPICS: readonly string[] = [
  "Maximum build volume",
  "Minimum wall thickness",
  "Minimum feature size",
  "Dimensional accuracy",
  "Production tolerance",
  "Unsupported overhangs",
  "Bridging",
  "Hole accuracy",
  "Press-fit expectations",
  "Threads",
  "Moving assemblies",
  "Orientation",
  "Warping",
  "Support structures",
  "Surface finish",
  "Material shrinkage",
  "Post-processing",
  "Colour limitations",
  "Large multipart assemblies",
  "Inspection criteria",
  "Mesh integrity",
  "Units",
  "File analysis limits",
];

export const LEDGER: ResolvedLedger = resolveLedger(ledgerFile, new Set(LIMITATION_TOPICS));

/** The effective decision for a kind and subject, if one exists. */
export function decisionFor(kind: DecisionKind, subject: string, ledger: ResolvedLedger = LEDGER) {
  return ledger.effective.get(key(kind, subject));
}

export function isApproved(kind: DecisionKind, subject: string, ledger: ResolvedLedger = LEDGER): boolean {
  return decisionFor(kind, subject, ledger)?.decision === "APPROVED";
}

/** Materials approved for launch whose process is approved too. */
export function approvedMaterials(ledger: ResolvedLedger = LEDGER, processOf: (material: string) => string): string[] {
  return [...MATERIALS].filter(
    (material) =>
      isApproved("material", material, ledger) && isApproved("manufacturing-process", processOf(material), ledger),
  );
}

/** Colour values approved for a material, from the latest colour decision naming it. */
export function approvedColours(material: string, ledger: ResolvedLedger = LEDGER): string[] {
  const records = [...ledger.effective.values()]
    .filter((record) => record.kind === "material-colours" && record.decision === "APPROVED")
    .filter((record) => (record.values?.materials as string[]).includes(material))
    .sort((a, b) => a.approval.approvedOn.localeCompare(b.approval.approvedOn));
  const latest = records[records.length - 1];
  return latest ? [...(latest.values?.colours as string[])] : [];
}

export function approvedLayerHeights(process: string, ledger: ResolvedLedger = LEDGER): string[] {
  const record = decisionFor("layer-heights", process, ledger);
  return record?.decision === "APPROVED" ? [...(record.values?.layerHeights as string[])] : [];
}

export interface PlatformDecision {
  printer: string;
  buildVolumeMm: { x: number; y: number; z: number };
  includedNozzle?: string;
  optionalNozzleSizesMm?: number[];
  maxHotendTemperatureC?: number;
  specificationReference: string;
  record: DecisionRecord;
}

export function platformFor(process: string, ledger: ResolvedLedger = LEDGER): PlatformDecision | undefined {
  const record = decisionFor("manufacturing-platform", process, ledger);
  if (record?.decision !== "APPROVED" || !record.values) return undefined;
  const v = record.values;
  return {
    printer: String(v.printer),
    buildVolumeMm: v.buildVolumeMm as PlatformDecision["buildVolumeMm"],
    ...(typeof v.includedNozzle === "string" ? { includedNozzle: v.includedNozzle } : {}),
    ...(Array.isArray(v.optionalNozzleSizesMm) ? { optionalNozzleSizesMm: v.optionalNozzleSizesMm as number[] } : {}),
    ...(typeof v.maxHotendTemperatureC === "number" ? { maxHotendTemperatureC: v.maxHotendTemperatureC } : {}),
    specificationReference: String(v.specificationReference),
    record,
  };
}

/** The approved launch target, if the business has decided one. */
export function launchTargetDecision(ledger: ResolvedLedger = LEDGER): { value: number; record: DecisionRecord } | undefined {
  const record = decisionFor("launch-target", "catalog", ledger);
  return record?.decision === "APPROVED"
    ? { value: Number(record.values?.minimumLaunchReadyProducts), record }
    : undefined;
}
