/**
 * Homepage content.
 *
 * Local, structured, and typed so Phase 14 can swap the source for Payload
 * without touching the section components.
 *
 * ── The rule this file now follows ───────────────────────────────────────
 *
 * Nothing here states a capability as a literal. Every figure the homepage
 * shows is either derived from the constant the software actually enforces —
 * the materials the configurator offers, the layer heights it offers, the
 * quantities it accepts — or it is not shown.
 *
 * That is a stricter rule than "mark it PLACEHOLDER and fix it later", which is
 * what this file did before Stage 19 and which had produced a homepage
 * advertising a tolerance nothing measures, a third print technology no
 * material in the system can be printed with, and eight featured products, two
 * of which did not exist. A number written by hand drifts from the software
 * silently; a number derived from the software cannot.
 *
 * Where a real value is genuinely unknown, the honest sentence is the content:
 * "confirmed per part at quote". It is not a placeholder for a figure.
 */

import type { IconName } from "@/components/core";
import {
  FINISH_OPTIONS,
  MATERIAL_OPTIONS,
  QUALITY_OPTIONS,
} from "@/lib/custom-print/options";
import { MAX_QUANTITY, MIN_QUANTITY } from "@/lib/custom-print/types";
import { capabilityStatus } from "@/content/catalog/capabilities";
import {
  BROWSE_CATEGORIES,
  categoryDescription,
  categoryLabel,
  TECHNOLOGIES as APPROVED_TECHNOLOGIES,
} from "@/lib/catalog/taxonomy";
import { ROUTES, categoryHref } from "@/lib/routes";

/* ------------------------------------------------------------------ *
 * 02 — What you can create
 * ------------------------------------------------------------------ */

export interface Category {
  /** Zero-padded index shown beside the title. */
  index: string;
  name: string;
  /** One technical line. No marketing adjectives. */
  descriptor: string;
  href: string;
}

/**
 * The category index, derived from the catalog.
 *
 * Content reset: this was eight hand-written rows — seven category pages and
 * custom print — written for a 36-product catalog. After the reset five of those
 * seven pages would have been 404s. Rows are now the browse categories that
 * actually have published parts, named and described by the canonical category
 * tree, followed by custom print, which is always available. A category added
 * with its first product appears here without anyone editing this file.
 */
export function homeCategories(browseCategories: readonly string[]): readonly Category[] {
  return [
  ...browseCategories.map((value) => ({
    name: categoryLabel(value) ?? value,
    descriptor: categoryDescription(value) ?? "",
    href: categoryHref(value),
  })),
  {
    name: "Custom Products",
    descriptor: "Your geometry, manufactured to your specification.",
    href: ROUTES.customPrint,
  },
].map((category, index) => ({ index: String(index + 1).padStart(2, "0"), ...category }));
}

/** The repository seed's index. Pages pass the served catalog's categories. */
export const CATEGORIES: readonly Category[] = homeCategories(BROWSE_CATEGORIES);

/* ------------------------------------------------------------------ *
 * 03 / 06 — Manufacturing flow
 * ------------------------------------------------------------------ */

/** Codes of approved processes, e.g. ["FDM"]. */
const APPROVED_PROCESS_CODES = APPROVED_TECHNOLOGIES.map((technology) => technology.label);

export interface WorkflowStep {
  index: string;
  name: string;
  summary: string;
  /** Technical note rendered in mono beneath the step. */
  meta: string;
  icon: IconName;
}

export const WORKFLOW: readonly WorkflowStep[] = [
  {
    index: "01",
    name: "Upload",
    summary: "Send us your digital model.",
    // The four extensions lib/custom-print/inspect.ts actually accepts.
    meta: "STL · 3MF · OBJ · STEP",
    icon: "upload",
  },
  {
    index: "02",
    name: "Configure",
    summary: "Choose material, quality and finish.",
    // Counted from the options the configurator offers, so the claim cannot
    // outlive the list. It previously read "5 MATERIALS · 3 LAYER HEIGHTS" as
    // a literal, which happened to be right and would have stayed written
    // after the lists changed.
    // Stage 19.7: the layer heights are FDM's; resin has none approved.
    meta: `${MATERIAL_OPTIONS.length} MATERIALS · ${QUALITY_OPTIONS.length} FDM LAYER HEIGHTS`,
    icon: "settings-2",
  },
  {
    index: "03",
    name: "Manufacture",
    summary: "We produce the part on our machines.",
    // SLS was removed here in Stage 19. See the note above TECHNOLOGIES.
    // Stage 19.8: processes with an approved decision only — SLA is not approved.
    meta: APPROVED_PROCESS_CODES.join(" · "),
    icon: "cpu",
  },
  {
    index: "04",
    name: "Deliver",
    summary: "Your design arrives as a physical object.",
    // Tracking is real — a shipment carries a carrier and a tracking number —
    // but only once the parcel is dispatched, and only when the carrier record
    // exists. "Tracked to your door" promised more than the shipment model
    // holds.
    meta: "TRACKED FROM DISPATCH",
    icon: "package",
  },
];

/* ------------------------------------------------------------------ *
 * 04 — Materials
 *
 * Moved to content/materials.ts in Stage 19 and re-exported here.
 *
 * The material descriptions existed in three places — this file, the catalog
 * taxonomy and the custom-print options — and the Materials collection names
 * that triplication as the reason it exists. /materials needed a fourth, which
 * was the point at which one of them had to become the source. The re-export
 * keeps `lib/content/plan.ts` and the homepage showcase reading the same
 * import they always did.
 * ------------------------------------------------------------------ */

export { MATERIALS } from "./materials";
export type { Material, MaterialSurface } from "./materials";

/* ------------------------------------------------------------------ *
 * 05 — Featured products
 *
 * Stage 19.6: no list here. Featuring is the `featured` flag on a product, and
 * only approved products with an approved photo or render are shown — see
 * `lib/catalog/featured.ts`. There is no product id in this file to go stale.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 07 — Industries
 * ------------------------------------------------------------------ */

export interface Industry {
  index: string;
  name: string;
  summary: string;
  /** Wide panels take two grid columns; the mix creates the editorial rhythm. */
  span: "wide" | "narrow";
}

export const INDUSTRIES: readonly Industry[] = [
  {
    index: "01",
    name: "Product designers",
    summary:
      "Iterate form and fit before committing to tooling. Order one part or a short run.",
    span: "wide",
  },
  {
    index: "02",
    name: "Engineering companies",
    summary: "Jigs, fixtures and replacement components, made to drawing.",
    span: "narrow",
  },
  {
    index: "03",
    name: "Startups",
    summary: "Build a working prototype without a factory behind you.",
    span: "narrow",
  },
  {
    index: "04",
    name: "Architects",
    summary: "Scale models and facade studies with clean, presentable surfaces.",
    span: "wide",
  },
  {
    index: "05",
    name: "Hobbyists",
    summary: "Print what your own machine cannot.",
    span: "narrow",
  },
  {
    index: "06",
    name: "Education",
    summary: "Teaching models and lab hardware, produced on request.",
    span: "narrow",
  },
  {
    index: "07",
    name: "Consumers",
    summary:
      "Buy a finished object, or bring a design and have it made for you.",
    span: "narrow",
  },
];

/* ------------------------------------------------------------------ *
 * 08 — Manufacturing capabilities
 *
 * Every figure below is derived from a constant the software enforces. Nothing
 * here is a measurement of Reality 3D's machines, because the repository contains
 * no machine telemetry and no process capability study — so none is asserted.
 *
 * Removed in Stage 19, and why:
 *
 *   · "±0.1 MM — Typical FDM tolerance". Nothing in the system measures a
 *     produced part. A tolerance is the single most load-bearing number an
 *     engineering customer reads, and this one had no source at all.
 *   · "24 / 7 — Ordering". True of any website, and it described the checkout
 *     rather than the factory in a block headed Capabilities.
 *   · "SLS". See TECHNOLOGIES below.
 * ------------------------------------------------------------------ */

export interface CapabilityMetric {
  value: string;
  label: string;
}

/** The finest layer height the configurator will actually accept an order at. */
const FINEST_LAYER_HEIGHT = QUALITY_OPTIONS.reduce((finest, option) =>
  parseFloat(option.layerHeight) < parseFloat(finest.layerHeight) ? option : finest,
).layerHeight;

export const CAPABILITY_METRICS: readonly CapabilityMetric[] = [
  { value: String(MATERIAL_OPTIONS.length), label: "Materials offered" },
  { value: FINEST_LAYER_HEIGHT, label: "Finest FDM layer height" },
  { value: String(FINISH_OPTIONS.length), label: "Finishes" },
  { value: `${MIN_QUANTITY} – ${MAX_QUANTITY}`, label: "Units per order" },
];

export interface Technology {
  code: string;
  name: string;
  summary: string;
  detail: string;
}

/** The coarsest and finest layer heights on offer, for the FDM detail line. */
const LAYER_RANGE = (() => {
  const heights = QUALITY_OPTIONS.map((option) => parseFloat(option.layerHeight)).sort(
    (a, b) => a - b,
  );
  return `${heights[0]?.toFixed(2)} – ${heights[heights.length - 1]?.toFixed(2)} MM LAYERS`;
})();

/**
 * The print technologies the storefront claims.
 *
 * ── SLS was removed in Stage 19 ──────────────────────────────────────────
 *
 * It was listed on the hero, in the workflow and here, and nothing in the
 * product supported it:
 *
 *   · `MaterialValue` is pla | petg | abs | tpu | resin. There is no powder
 *     material in the system, and SLS prints powder.
 *   · The custom-print configurator offers no SLS material and no SLS layer
 *     height; its three qualities are FDM layer heights.
 *   · Exactly one catalog part claimed `technology: "sls"`, and it claimed
 *     `material: "resin"` alongside it — a combination that does not exist.
 *     That part is now SLA, which is what resin is printed with.
 *
 * So the claim was not merely unverified, it was contradicted by the data
 * behind it. `TechnologyValue` still admits "sls" — the domain may describe it,
 * and the CMS enum already contains it — but the storefront stops advertising
 * it until a real powder material and a real machine exist to back it. Adding
 * it back is adding it to this list.
 */
const ALL_TECHNOLOGIES: readonly Technology[] = [
  {
    code: "FDM",
    name: "Fused deposition modelling",
    summary: "Functional parts in engineering thermoplastics.",
    detail: LAYER_RANGE,
  },
  {
    code: "SLA",
    name: "Stereolithography",
    // Stage 19.9: SLA is coming soon. No machine, layer height, tolerance or
    // lead time exists for it, so none is shown — only its status.
    summary: "Photopolymer resin, cured layer by layer.",
    detail: "COMING SOON",
  },
];

/**
 * Stage 19.8: the technologies the storefront claims are those with an APPROVED
 * manufacturing decision. SLA is described above so that approving it later is a
 * decision, not a copy change — until then it is not claimed.
 */
export const TECHNOLOGIES: readonly Technology[] = ALL_TECHNOLOGIES.filter(
  (technology) => capabilityStatus("technology", technology.code.toLowerCase()) === "AVAILABLE",
);

/** Stage 19.9: processes on the roadmap — shown muted as coming soon, never as a current capability. */
export const COMING_SOON_TECHNOLOGIES: readonly Technology[] = ALL_TECHNOLOGIES.filter(
  (technology) => capabilityStatus("technology", technology.code.toLowerCase()) === "COMING_SOON",
);

/** The one roadmap sentence. No dates: none has been decided. */
export const ROADMAP_NOTE = "More materials and manufacturing processes are coming soon.";
