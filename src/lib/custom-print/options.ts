/**
 * Custom print configuration options — the offering a customer can order.
 *
 * ── Stage 19.8: the offering follows approved decisions ──────────────────
 *
 * Until Stage 19.8 this file *was* the offering, and its own header said it was
 * "not a statement of verified manufacturing capability". It now separates the
 * two:
 *
 *   CONFIGURATOR_*   what the software can describe — every material, colour,
 *                    layer height and finish it has definitions for
 *   MATERIAL_OPTIONS, QUALITY_OPTIONS, FINISH_OPTIONS
 *                    what may be offered — the definitions an APPROVED business
 *                    decision in `content/catalog/decisions` allows
 *
 * Every consumer — the configurator, the quote engine, the cart, product
 * validation, the storefront facets — reads the offered lists, so a material
 * that exists here without an approval cannot be selected, quoted, carted or
 * published. The existence of a definition is never an approval.
 *
 * No prices appear here. `lib/pricing` owns pricing.
 */

import type { PropertyRating } from "@/components/commerce";
import {
  TECHNOLOGY_DEFINITIONS,
  capabilityStatus,
  comingSoonMessage,
  processOf,
  type CapabilityStatus,
} from "@/content/catalog/capabilities";
import {
  approvedColours,
  approvedLayerHeights,
  isApproved,
} from "@/content/catalog/decisions";

export interface MaterialOption {
  /** Matches the catalog material taxonomy. */
  value: string;
  name: string;
  /** Chemical or process name. */
  code: string;
  description: string;
  properties: { strength: PropertyRating; flexibility: PropertyRating; heat: PropertyRating };
  /** Hex values offered for this material. */
  colors: readonly string[];
  /** The process this material is printed with. */
  technology: "fdm" | "sla";
}

/* ------------------------------------------------------------------ *
 * What the software can describe
 * ------------------------------------------------------------------ */

/** The colour vocabulary: every colour any definition may refer to. */
export const CONFIGURATOR_COLOURS: readonly { value: string; label: string; hex: string }[] = [
  { value: "black", label: "Black", hex: "#050506" },
  { value: "graphite", label: "Graphite", hex: "#2A2E35" },
  { value: "titanium", label: "Titanium", hex: "#6C737C" },
  { value: "grey", label: "Grey", hex: "#A9B0B9" },
  { value: "white", label: "White", hex: "#F4F6F8" },
  { value: "orange", label: "Orange", hex: "#FF6B00" },
  { value: "blue", label: "Blue", hex: "#4DA3FF" },
];

const hexOf = (value: string) => CONFIGURATOR_COLOURS.find((colour) => colour.value === value)?.hex;

/**
 * Every material the software has a definition for, with the colours the
 * pre-Stage-19.8 configurator listed. Not an offering — see MATERIAL_OPTIONS.
 */
export const CONFIGURATOR_MATERIALS: readonly MaterialOption[] = [
  {
    value: "pla",
    name: "PLA",
    code: "Polylactic acid",
    description: "The default. Dimensionally stable, sharp detail, matte finish.",
    properties: { strength: 3, flexibility: 2, heat: 2 },
    colors: ["#F4F6F8", "#050506", "#FF6B00", "#6C737C"],
    technology: processOf("pla")!,
  },
  {
    value: "petg",
    name: "PETG",
    code: "Glycol-modified PET",
    // Stage 19.8: "chemically resistant" removed — no data supports the claim.
    description: "Tougher than PLA. Semi-gloss surface.",
    properties: { strength: 4, flexibility: 3, heat: 4 },
    colors: ["#F4F6F8", "#050506", "#4DA3FF"],
    technology: processOf("petg")!,
  },
  {
    value: "abs",
    name: "ABS",
    code: "Acrylonitrile butadiene styrene",
    // Stage 19.9: "machinable, vapour-smoothable" removed — it read as a service offered.
    description: "Impact-resistant engineering thermoplastic.",
    properties: { strength: 4, flexibility: 3, heat: 5 },
    colors: ["#050506", "#A9B0B9"],
    technology: processOf("abs")!,
  },
  {
    value: "tpu",
    name: "TPU",
    code: "Thermoplastic polyurethane",
    description: "Elastomeric. Gaskets, dampers, protective housings.",
    properties: { strength: 3, flexibility: 5, heat: 3 },
    colors: ["#050506", "#FF6B00"],
    technology: processOf("tpu")!,
  },
  {
    value: "resin",
    name: "Resin",
    code: "SLA photopolymer",
    // Stage 19.9: no resolution claim — no SLA process is approved or specified.
    description: "Photopolymer resin, cured layer by layer.",
    properties: { strength: 3, flexibility: 1, heat: 3 },
    colors: ["#A9B0B9", "#050506"],
    technology: processOf("resin")!,
  },
];

export interface QualityOption {
  value: string;
  label: string;
  layerHeight: string;
  description: string;
}

/** FDM qualities the software can describe: nozzle layer heights. */
export const CONFIGURATOR_FDM_QUALITIES: readonly QualityOption[] = [
  {
    value: "standard",
    label: "Standard",
    layerHeight: "0.20 MM",
    description: "Fastest option. Visible layers, suitable for fit and function.",
  },
  {
    value: "precision",
    label: "Precision",
    layerHeight: "0.16 MM",
    description: "Balanced detail and print time. The usual choice.",
  },
  {
    value: "high-detail",
    label: "High detail",
    layerHeight: "0.12 MM",
    description: "Finest layers. Longer on the machine.",
  },
];

export interface FinishOption {
  value: string;
  label: string;
  description: string;
  /** True for a finish that adds work after printing. */
  postProcessing: boolean;
}

/** Finishes the software can describe. */
export const CONFIGURATOR_FINISHES: readonly FinishOption[] = [
  {
    value: "standard",
    label: "Standard",
    description: "As it comes off the machine, with supports removed.",
    postProcessing: false,
  },
  {
    value: "smooth",
    label: "Smoothed",
    description: "Surface worked back to reduce layer lines.",
    postProcessing: true,
  },
  {
    value: "matte",
    label: "Matte",
    description: "Uniform low-sheen surface across the part.",
    postProcessing: true,
  },
];

export function configuratorMaterial(value: string | undefined) {
  return CONFIGURATOR_MATERIALS.find((option) => option.value === value);
}

/* ------------------------------------------------------------------ *
 * What may be offered
 * ------------------------------------------------------------------ */

/**
 * Materials with an APPROVED material decision on an APPROVED process, in the
 * colours approved for them. Colours come from the decision, not from the old
 * definition: TPU was defined in black and orange, and is offered in the
 * approved black and white.
 */
export const MATERIAL_OPTIONS: readonly MaterialOption[] = CONFIGURATOR_MATERIALS.filter(
  (option) => capabilityStatus("material", option.value) === "AVAILABLE",
)
  .map((option) => ({
    ...option,
    colors: approvedColours(option.value)
      .map(hexOf)
      .filter((hex): hex is string => Boolean(hex)),
  }))
  .filter((option) => option.colors.length > 0);

/** FDM layer heights with an APPROVED decision. */
export const QUALITY_OPTIONS: readonly QualityOption[] = isApproved("manufacturing-process", "fdm")
  ? CONFIGURATOR_FDM_QUALITIES.filter((quality) => approvedLayerHeights("fdm").includes(quality.layerHeight))
  : [];

/**
 * SLA quality.
 *
 * No SLA layer height is recorded, and SLA is not an approved process, so no
 * SLA material is offered and this list is never reached through
 * `qualityOptionsFor`. It stays defined so that an FDM layer height can never
 * be substituted for resin if SLA is approved later without its own heights.
 */
export const SLA_QUALITY_OPTIONS: readonly QualityOption[] = [
  {
    value: "standard",
    label: "Standard",
    layerHeight: "Confirmed at quote",
    description:
      "No SLA layer height has been approved; it is confirmed against your part before production.",
  },
];

/**
 * Finishes offered.
 *
 * Standard is the part as printed — the output of the approved FDM process
 * itself, with no work added. Smoothed and Matte are post-processing, and no
 * business decision approves them, so they are not offered (Stage 19.8).
 */
export const FINISH_OPTIONS: readonly FinishOption[] = CONFIGURATOR_FINISHES.filter(
  (finish) => capabilityStatus("finish", finish.value) === "AVAILABLE",
);

/* ------------------------------------------------------------------ *
 * What is coming (Stage 19.9) — shown, never selectable
 * ------------------------------------------------------------------ */

/**
 * Materials on the roadmap. Shown as COMING SOON with no colours, ratings or
 * price: nothing about how Reality 3D would make them has been decided. The
 * quote engine, cart and checkout refuse every one of them.
 */
export const COMING_SOON_MATERIALS: readonly Pick<MaterialOption, "value" | "name" | "code" | "description" | "technology">[] =
  CONFIGURATOR_MATERIALS.filter((option) => capabilityStatus("material", option.value) === "COMING_SOON").map(
    ({ value, name, code, description, technology }) => ({ value, name, code, description, technology }),
  );

/** Finishes on the roadmap. Refused by the quote engine, cart and checkout. */
export const COMING_SOON_FINISHES: readonly FinishOption[] = CONFIGURATOR_FINISHES.filter(
  (finish) => capabilityStatus("finish", finish.value) === "COMING_SOON",
);

export interface TechnologyOption {
  value: string;
  label: string;
  name: string;
  status: CapabilityStatus;
}

/** Processes that are available or coming soon, for the configurator's process summary. */
export const TECHNOLOGY_OPTIONS: readonly TechnologyOption[] = TECHNOLOGY_DEFINITIONS.map((technology) => ({
  value: technology.value,
  label: technology.label,
  name: technology.name,
  status: capabilityStatus("technology", technology.value),
})).filter((technology) => technology.status !== "UNAVAILABLE");

export { comingSoonMessage };

export function materialOption(value: string | undefined) {
  return MATERIAL_OPTIONS.find((option) => option.value === value);
}

/** The qualities offered for a material, by its process. Unoffered material → none. */
export function qualityOptionsFor(material: string | undefined): readonly QualityOption[] {
  const option = materialOption(material);
  if (!option) return [];
  return option.technology === "sla" ? SLA_QUALITY_OPTIONS : QUALITY_OPTIONS;
}

/**
 * A quality by value, for a material. Without a material the FDM list is
 * searched, which is what every caller before Stage 19.7 meant.
 */
export function qualityOption(value: string | undefined, material?: string) {
  const options = material === undefined ? QUALITY_OPTIONS : qualityOptionsFor(material);
  return options.find((option) => option.value === value);
}

export function finishOption(value: string | undefined) {
  return FINISH_OPTIONS.find((option) => option.value === value);
}
