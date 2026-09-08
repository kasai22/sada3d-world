/**
 * Custom print configuration options.
 *
 * PROVISIONAL. These are the choices the interface offers, not a statement of
 * verified manufacturing capability. Every value here must be confirmed against
 * real machine and process capability before launch, and replaced by Payload in
 * Phase 14.
 *
 * Specifically: this list does not assert that every material is compatible
 * with every uploaded model. Manufacturing compatibility depends on geometry
 * and is decided by the analysis layer, which does not exist yet.
 *
 * No prices appear here. Phase 8 owns pricing.
 */

import type { PropertyRating } from "@/components/commerce";

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
}

export const MATERIAL_OPTIONS: readonly MaterialOption[] = [
  {
    value: "pla",
    name: "PLA",
    code: "Polylactic acid",
    description: "The default. Dimensionally stable, sharp detail, matte finish.",
    properties: { strength: 3, flexibility: 2, heat: 2 },
    colors: ["#F4F6F8", "#050506", "#FF6B00", "#6C737C"],
  },
  {
    value: "petg",
    name: "PETG",
    code: "Glycol-modified PET",
    description: "Tougher and chemically resistant. Semi-gloss surface.",
    properties: { strength: 4, flexibility: 3, heat: 4 },
    colors: ["#F4F6F8", "#050506", "#4DA3FF"],
  },
  {
    value: "abs",
    name: "ABS",
    code: "Acrylonitrile butadiene styrene",
    description: "Impact resistant, machinable, vapour-smoothable.",
    properties: { strength: 4, flexibility: 3, heat: 5 },
    colors: ["#050506", "#A9B0B9"],
  },
  {
    value: "tpu",
    name: "TPU",
    code: "Thermoplastic polyurethane",
    description: "Elastomeric. Gaskets, dampers, protective housings.",
    properties: { strength: 3, flexibility: 5, heat: 3 },
    colors: ["#050506", "#FF6B00"],
  },
  {
    value: "resin",
    name: "Resin",
    code: "SLA photopolymer",
    description: "Highest resolution. Fine features and smooth surfaces.",
    properties: { strength: 3, flexibility: 1, heat: 3 },
    colors: ["#A9B0B9", "#050506"],
  },
];

export interface QualityOption {
  value: string;
  label: string;
  layerHeight: string;
  description: string;
}

export const QUALITY_OPTIONS: readonly QualityOption[] = [
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
}

export const FINISH_OPTIONS: readonly FinishOption[] = [
  {
    value: "standard",
    label: "Standard",
    description: "As it comes off the machine, with supports removed.",
  },
  {
    value: "smooth",
    label: "Smoothed",
    description: "Surface worked back to reduce layer lines.",
  },
  {
    value: "matte",
    label: "Matte",
    description: "Uniform low-sheen surface across the part.",
  },
];

export function materialOption(value: string | undefined) {
  return MATERIAL_OPTIONS.find((option) => option.value === value);
}

export function qualityOption(value: string | undefined) {
  return QUALITY_OPTIONS.find((option) => option.value === value);
}

export function finishOption(value: string | undefined) {
  return FINISH_OPTIONS.find((option) => option.value === value);
}
