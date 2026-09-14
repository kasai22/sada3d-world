import { BRAND } from "../../lib/brand";

import roadmapFile from "./roadmap.json";
import {
  COLOUR_VALUES,
  LEDGER,
  approvedColours,
  isApproved,
  type ResolvedLedger,
} from "./decisions";

/**
 * Capability status — what Reality 3D can make now, what is coming, and what is
 * not offered (Stage 19.9).
 *
 * ── Three states, one derivation ─────────────────────────────────────────
 *
 *   AVAILABLE    an APPROVED business decision in the ledger allows it. The only
 *                state that can be selected, quoted, carted, ordered or used by a
 *                publishable product.
 *   COMING_SOON  not approved, and on the roadmap (`roadmap.json`). Visible to
 *                customers as a future capability; refused everywhere else.
 *   UNAVAILABLE  not approved and not on the roadmap.
 *
 * AVAILABLE is decided by the ledger and nothing else. A roadmap entry cannot
 * make anything available: the roadmap is read only after the ledger has said
 * no. Approving a Coming Soon capability later is a ledger record, after which
 * its roadmap entry is simply ignored.
 *
 * Not to be confused with Payload draft/published, product approval, technical
 * validity or price approval — each of those is a separate question about a
 * product, not about a capability.
 *
 * ── Pure and alias-free ──────────────────────────────────────────────────
 *
 * Imports only the ledger, the roadmap file and the site constants, so the
 * configurator (a client bundle) and the Payload config (loaded by the CLI
 * without path aliases) can both read it.
 */

export const CAPABILITY_STATUSES = ["AVAILABLE", "COMING_SOON", "UNAVAILABLE"] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export type CapabilityKind = "technology" | "material" | "finish" | "colour";

export const CAPABILITY_STATUS_LABEL: Record<CapabilityStatus, string> = {
  AVAILABLE: "Available",
  COMING_SOON: "Coming soon",
  UNAVAILABLE: "Not available",
};

/* ------------------------------------------------------------------ *
 * Vocabulary — what the software can describe. Never an offering.
 * ------------------------------------------------------------------ */

export interface CapabilityDefinition {
  kind: CapabilityKind;
  value: string;
  label: string;
}

export const TECHNOLOGY_DEFINITIONS: readonly (CapabilityDefinition & { name: string })[] = [
  { kind: "technology", value: "fdm", label: "FDM", name: "Fused deposition modelling" },
  { kind: "technology", value: "sla", label: "SLA", name: "Stereolithography" },
  { kind: "technology", value: "sls", label: "SLS", name: "Selective laser sintering" },
];

/** Each material and the one process it is printed with: the canonical material → process record. */
export const MATERIAL_DEFINITIONS: readonly (CapabilityDefinition & { process: "fdm" | "sla" })[] = [
  { kind: "material", value: "pla", label: "PLA", process: "fdm" },
  { kind: "material", value: "petg", label: "PETG", process: "fdm" },
  { kind: "material", value: "abs", label: "ABS", process: "fdm" },
  { kind: "material", value: "tpu", label: "TPU", process: "fdm" },
  { kind: "material", value: "resin", label: "Resin", process: "sla" },
];

export const FINISH_DEFINITIONS: readonly (CapabilityDefinition & { processOutput: boolean })[] = [
  // Standard is the part as printed: the output of an available process, not post-processing.
  { kind: "finish", value: "standard", label: "Standard", processOutput: true },
  { kind: "finish", value: "smooth", label: "Smoothed", processOutput: false },
  { kind: "finish", value: "matte", label: "Matte", processOutput: false },
];

export const COLOUR_DEFINITIONS: readonly CapabilityDefinition[] = [...COLOUR_VALUES].map((value) => ({
  kind: "colour",
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

const DEFINITIONS: Record<CapabilityKind, readonly CapabilityDefinition[]> = {
  technology: TECHNOLOGY_DEFINITIONS,
  material: MATERIAL_DEFINITIONS,
  finish: FINISH_DEFINITIONS,
  colour: COLOUR_DEFINITIONS,
};

export function capabilityDefinition(kind: CapabilityKind, value: string | undefined): CapabilityDefinition | undefined {
  return DEFINITIONS[kind].find((definition) => definition.value === value);
}

/** The process a material is printed with, or undefined for an unknown material. */
export function processOf(material: string | undefined): "fdm" | "sla" | undefined {
  return MATERIAL_DEFINITIONS.find((definition) => definition.value === material)?.process;
}

/* ------------------------------------------------------------------ *
 * The roadmap
 * ------------------------------------------------------------------ */

export interface RoadmapEntry {
  kind: CapabilityKind;
  value: string;
  /** Where the roadmap decision was stated. Not an approval. */
  reference: string;
}

export interface ResolvedRoadmap {
  entries: readonly RoadmapEntry[];
  issues: readonly string[];
}

const ROADMAP_KEYS = new Set(["kind", "value", "reference"]);

/**
 * Validates a roadmap. An invalid entry is dropped (it shows nothing), and an
 * entry may carry nothing but its identity and a reference — no date, no
 * timeline, no specification, no approver.
 */
export function resolveRoadmap(file: unknown): ResolvedRoadmap {
  const issues: string[] = [];
  const entries: RoadmapEntry[] = [];
  const record = file as { schemaVersion?: unknown; entries?: unknown };

  if (!record || record.schemaVersion !== 1 || !Array.isArray(record.entries)) {
    return { entries, issues: ["The roadmap must have schemaVersion 1 and an entries array."] };
  }

  const seen = new Set<string>();
  for (const raw of record.entries as Record<string, unknown>[]) {
    const label = `${String(raw?.kind)} ${String(raw?.value)}`;
    const extra = Object.keys(raw ?? {}).filter((key) => !ROADMAP_KEYS.has(key));
    if (extra.length > 0) {
      issues.push(`${label}: only kind, value and reference are allowed — not ${extra.join(", ")}. A roadmap states no timelines or specifications.`);
      continue;
    }
    if (!Object.hasOwn(DEFINITIONS, String(raw.kind))) {
      issues.push(`${label}: "${String(raw.kind)}" is not a capability kind.`);
      continue;
    }
    if (!capabilityDefinition(raw.kind as CapabilityKind, raw.value as string)) {
      issues.push(`${label}: not a capability the software can describe; nothing is invented for the roadmap.`);
      continue;
    }
    if (typeof raw.reference !== "string" || !raw.reference.trim()) {
      issues.push(`${label}: a roadmap entry needs a reference.`);
      continue;
    }
    const key = `${raw.kind}::${raw.value}`;
    if (seen.has(key)) {
      issues.push(`${label}: listed twice.`);
      continue;
    }
    seen.add(key);
    entries.push({ kind: raw.kind as CapabilityKind, value: raw.value as string, reference: raw.reference });
  }
  return { entries, issues };
}

export const ROADMAP: ResolvedRoadmap = resolveRoadmap(roadmapFile);

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

/** Whether the ledger makes a capability available. The roadmap is never consulted. */
function available(kind: CapabilityKind, value: string, ledger: ResolvedLedger): boolean {
  if (!capabilityDefinition(kind, value)) return false;
  switch (kind) {
    case "technology":
      return isApproved("manufacturing-process", value, ledger);
    case "material": {
      const process = processOf(value)!;
      return (
        isApproved("material", value, ledger) &&
        isApproved("manufacturing-process", process, ledger) &&
        approvedColours(value, ledger).length > 0
      );
    }
    case "finish": {
      const finish = FINISH_DEFINITIONS.find((definition) => definition.value === value)!;
      return finish.processOutput
        ? MATERIAL_DEFINITIONS.some((material) => available("material", material.value, ledger))
        : isApproved("finish", value, ledger);
    }
    case "colour":
      return MATERIAL_DEFINITIONS.some(
        (material) => available("material", material.value, ledger) && approvedColours(material.value, ledger).includes(value),
      );
  }
}

export function capabilityStatus(
  kind: CapabilityKind,
  value: string | undefined,
  ledger: ResolvedLedger = LEDGER,
  roadmap: ResolvedRoadmap = ROADMAP,
): CapabilityStatus {
  if (!value) return "UNAVAILABLE";
  if (available(kind, value, ledger)) return "AVAILABLE";
  return roadmap.entries.some((entry) => entry.kind === kind && entry.value === value) ? "COMING_SOON" : "UNAVAILABLE";
}

export const isAvailable = (kind: CapabilityKind, value: string | undefined, ledger?: ResolvedLedger, roadmap?: ResolvedRoadmap) =>
  capabilityStatus(kind, value, ledger, roadmap) === "AVAILABLE";

export const isComingSoon = (kind: CapabilityKind, value: string | undefined, ledger?: ResolvedLedger, roadmap?: ResolvedRoadmap) =>
  capabilityStatus(kind, value, ledger, roadmap) === "COMING_SOON";

export interface CapabilityRow extends CapabilityDefinition {
  status: CapabilityStatus;
}

/** Every definition of a kind with its status, in vocabulary order. */
export function capabilities(kind: CapabilityKind, ledger?: ResolvedLedger, roadmap?: ResolvedRoadmap): CapabilityRow[] {
  return DEFINITIONS[kind].map((definition) => ({ ...definition, status: capabilityStatus(kind, definition.value, ledger, roadmap) }));
}

/* ------------------------------------------------------------------ *
 * Messages — one wording everywhere
 * ------------------------------------------------------------------ */

/** "ABS printing is coming soon to Reality 3D." */
export function comingSoonMessage(kind: CapabilityKind, value: string): string {
  const label = capabilityDefinition(kind, value)?.label ?? value;
  switch (kind) {
    case "material":
    case "technology":
      return `${label} printing is coming soon to ${BRAND.name}.`;
    case "finish":
      return `The ${label} finish is coming soon to ${BRAND.name}.`;
    case "colour":
      return `${label} is coming soon to ${BRAND.name}.`;
  }
}

/**
 * Why a capability cannot be used, or undefined when it can. The server's
 * refusal text: a Coming Soon capability is named as such, so the customer is
 * told it is planned — and still refused.
 */
export function unavailableReason(
  kind: CapabilityKind,
  value: string | undefined,
  ledger?: ResolvedLedger,
  roadmap?: ResolvedRoadmap,
): string | undefined {
  const status = capabilityStatus(kind, value, ledger, roadmap);
  if (status === "AVAILABLE") return undefined;
  if (status === "COMING_SOON") {
    const message = comingSoonMessage(kind, value!);
    return `Capability currently unavailable — ${message.startsWith("The ") ? `t${message.slice(1)}` : message}`;
  }
  const noun = kind === "technology" ? "manufacturing process" : kind;
  return `That ${noun} is not currently offered.`;
}
