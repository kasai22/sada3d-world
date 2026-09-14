/**
 * Material content — the editorial half of what Reality 3D offers.
 *
 * ── What this file may say, and what it may not ──────────────────────────
 *
 * It describes materials in the terms a customer chooses between them with:
 * what each one is, what it is good at, what it is not, what it looks like
 * finished. Those are editorial judgements, and they are the judgements a
 * material page exists to make.
 *
 * It states no engineering value. No tensile strength, no heat-deflection
 * temperature, no density, no tolerance, no chemical-resistance rating, no
 * certification. The repository holds no datasheet and no test result for any
 * of these materials, so there is nothing here to state one from, and a
 * plausible-looking figure on a materials page is the most damaging kind of
 * invention there is — it is the number an engineer designs against.
 *
 * The 1–5 property scales are explicitly *relative*, are labelled as such
 * wherever they render, and rank the five materials against each other. They
 * are not measurements and are never shown with units.
 *
 * ── What is derived rather than written ──────────────────────────────────
 *
 * Which technologies a material is printed with, how many catalog parts use it,
 * and whether it is offered for custom work are read from the catalog and the
 * configurator by the page. They are facts about the system, so the system
 * answers them.
 */

import { capabilityStatus, type CapabilityStatus } from "@/content/catalog/capabilities";
import { COLORS } from "@/lib/catalog/taxonomy";
import { configuratorMaterial, materialOption } from "@/lib/custom-print/options";
import type { MaterialValue, TechnologyValue } from "@/lib/catalog/types";

import type { InformationalPage, Publishable } from "./pages";

/** Drives the CSS surface treatment so each material reads physically distinct. */
export type MaterialSurface = "matte" | "gloss" | "machined" | "soft" | "translucent";

export interface Material extends Publishable {
  /** The facet value the catalog and the quote engine narrow against. */
  value: MaterialValue;
  name: string;
  /** Chemical or process name. */
  code: string;
  description: string;
  /**
   * The processes this material is printed with.
   *
   * A physical constraint, not a preference: thermoplastics are extruded (FDM),
   * photopolymer resin is cured (SLA). `validateProduct` rejects any product that
   * pairs a material with a technology not listed here, so this list is what
   * makes "FDM + resin" impossible to publish.
   */
  technologies: readonly TechnologyValue[];
  /** Relative, 1–5, against the other four materials. Never a measurement. */
  properties: { strength: number; flexibility: number; heat: number };
  applications: readonly string[];
  /**
   * Colour facet values, not hex.
   *
   * These were hex strings until Stage 19, which meant the homepage rendered a
   * swatch nobody could name and the colour vocabulary existed twice. Taxonomy
   * values carry both the name and the swatch, and are the same values the shop
   * filters on — so "PLA in black" on this page and `?color=black` in the
   * catalog are now the same claim rather than two that resemble each other.
   *
   * Content reset: these are now exactly the colours the custom-print
   * configurator offers for the material (`MATERIAL_OPTIONS`), which is the
   * offering a customer can actually order. The two lists had drifted — this
   * page listed five PLA colours where four can be ordered. A test holds them
   * equal, and a product may only offer colours its material has.
   */
  colors: readonly string[];
  /**
   * Stage 19.9: AVAILABLE (an approved decision), COMING_SOON (on the roadmap,
   * not approved) or UNAVAILABLE. Derived, never written. Publication follows it:
   * only an AVAILABLE material is published as an orderable material.
   */
  availability: CapabilityStatus;
  surface: MaterialSurface;
  /** One line each: the reason somebody picks this material. */
  bestFor: readonly string[];
  /** Search metadata for the material's CMS record. */
  seo: { title: string; description: string };
  /**
   * The honest counterweight.
   *
   * A materials page that lists only strengths makes the choice harder, not
   * easier, because every material then looks correct. These stay qualitative
   * and comparative — never a limit expressed as a number.
   */
  avoidFor: readonly string[];
}

/**
 * The five materials the manufacturing domain knows.
 *
 * `value` must stay inside `MaterialValue`: the union is what the cart, the
 * quote engine and the order domain narrow against, which is why the *set* of
 * materials is code and only their description is content.
 */
export const MATERIALS: readonly Material[] = [
  {
    value: "pla",
    status: statusOf("pla"),
    name: "PLA",
    code: "Polylactic acid",
    description: "The default. Dimensionally stable, sharp detail, matte finish.",
    properties: { strength: 3, flexibility: 2, heat: 2 },
    applications: ["Prototypes", "Display parts", "Low-load components"],
    colors: coloursOf("pla"),
    availability: capabilityStatus("material", "pla"),
    technologies: technologiesOf("pla"),
    seo: { title: "PLA", description: "PLA for Reality 3D parts: what it is for, what to avoid, and the colours it is offered in." },
    surface: "matte",
    bestFor: [
      "Parts where the shape matters more than the load it carries.",
      "Fine geometry that has to come off the machine crisp.",
      "The first version of something, before the design is settled.",
    ],
    avoidFor: [
      "Anything that will sit in a hot car or near a heat source.",
      "Parts that flex repeatedly in use. PLA is stiff, and stiff eventually cracks.",
    ],
  },
  {
    value: "petg",
    status: statusOf("petg"),
    name: "PETG",
    code: "Glycol-modified PET",
    description: "Tougher than PLA. Semi-gloss surface.",
    properties: { strength: 4, flexibility: 3, heat: 4 },
    applications: ["Enclosures", "Brackets", "Outdoor parts"],
    colors: coloursOf("petg"),
    availability: capabilityStatus("material", "petg"),
    technologies: technologiesOf("petg"),
    seo: { title: "PETG", description: "PETG for Reality 3D parts: what it is for, what to avoid, and the colours it is offered in." },
    surface: "gloss",
    bestFor: [
      "Parts that take a knock and have to keep their shape.",
      "Enclosures and brackets that live outside the workshop.",
      "The usual answer when PLA is not quite enough.",
    ],
    avoidFor: [
      "The very finest surface detail. PETG rounds sharp edges slightly.",
    ],
  },
  {
    value: "abs",
    status: statusOf("abs"),
    name: "ABS",
    code: "Acrylonitrile butadiene styrene",
    // Stage 19.9: no machining or smoothing claim — nothing about ABS is offered yet.
    description: "Impact-resistant engineering thermoplastic.",
    properties: { strength: 4, flexibility: 3, heat: 5 },
    applications: ["Housings", "Automotive trim", "Tooling"],
    colors: coloursOf("abs"),
    availability: capabilityStatus("material", "abs"),
    technologies: technologiesOf("abs"),
    seo: { title: "ABS", description: "ABS for Reality 3D parts: what it is for, what to avoid, and the colours it is offered in." },
    surface: "machined",
    bestFor: [
      "Parts you intend to drill, tap or sand after printing.",
      "Automotive interior fittings and anything that runs warm.",
      "Housings that need to survive being dropped.",
    ],
    avoidFor: [
      "Large flat parts, which are the hardest shape to hold flat in ABS.",
    ],
  },
  {
    value: "tpu",
    status: statusOf("tpu"),
    name: "TPU",
    code: "Thermoplastic polyurethane",
    description: "Elastomeric. Gaskets, dampers, protective housings.",
    properties: { strength: 3, flexibility: 5, heat: 3 },
    applications: ["Gaskets", "Dampers", "Grips"],
    colors: coloursOf("tpu"),
    availability: capabilityStatus("material", "tpu"),
    technologies: technologiesOf("tpu"),
    seo: { title: "TPU", description: "TPU for Reality 3D parts: what it is for, what to avoid, and the colours it is offered in." },
    surface: "soft",
    bestFor: [
      "Anything that has to compress, seal, grip or absorb vibration.",
      "Parts that must bend in service and return to shape.",
    ],
    avoidFor: [
      "Structural parts. TPU deflects under load, which is the point of it.",
      "Tight-tolerance fits, because a flexible part does not hold one.",
    ],
  },
  {
    value: "resin",
    status: statusOf("resin"),
    name: "Resin",
    code: "SLA photopolymer",
    // Stage 19.9: no resolution claim — no SLA process is approved or specified.
    description: "Photopolymer resin, cured layer by layer.",
    properties: { strength: 3, flexibility: 1, heat: 3 },
    applications: ["Miniatures", "Dental", "Jewellery masters"],
    colors: coloursOf("resin"),
    availability: capabilityStatus("material", "resin"),
    technologies: technologiesOf("resin"),
    seo: { title: "Resin", description: "SLA resin for Reality 3D parts: what it is for, what to avoid, and the colours it is offered in." },
    surface: "translucent",
    bestFor: [
      "Detail too fine for a nozzle to reproduce.",
      "Surfaces that must read as finished without post-processing.",
      "Inspection fixtures and models where the surface is the deliverable.",
    ],
    avoidFor: [
      "Parts that take impact. Resin is the most brittle of the five.",
      "Anything left in sunlight, which continues to cure it.",
    ],
  },
];

/**
 * The process a material is printed with, read from the configurator offering.
 * Stage 19.7: one record of material → technology, not two that must agree.
 */
function technologiesOf(value: MaterialValue): readonly TechnologyValue[] {
  const option = configuratorMaterial(value);
  if (!option) throw new Error(`No configurator offering for material "${value}".`);
  return [option.technology];
}

/**
 * Published only when the material is offered — an APPROVED material decision on
 * an APPROVED process (Stage 19.8). ABS and resin stay described, as drafts, so
 * that approving them later is a decision rather than a rewrite.
 */
function statusOf(value: MaterialValue): "published" | "draft" {
  return materialOption(value) ? "published" : "draft";
}

/**
 * The colours offered for an approved material, as colour values. A draft
 * material keeps the colours its old configurator definition listed, which are
 * not offered.
 */
function coloursOf(value: MaterialValue): readonly string[] {
  const option = materialOption(value) ?? configuratorMaterial(value);
  return (option?.colors ?? [])
    .map((hex) => COLORS.find((colour) => colour.hex.toLowerCase() === hex.toLowerCase())?.value)
    .filter((colour): colour is string => Boolean(colour));
}

/** Stage 19.9: roadmap materials — shown as coming soon, never as orderable. */
export function comingSoonMaterials(): readonly Material[] {
  return MATERIALS.filter((entry) => entry.availability === "COMING_SOON");
}

/** Look a material's editorial record up by its facet value. */
export function material(value: string): Material | undefined {
  return MATERIALS.find((entry) => entry.value === value);
}

/** Swatch name and hex for a colour value, from the one colour vocabulary. */
export function colorSwatch(value: string) {
  return COLORS.find((color) => color.value === value);
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export const MATERIALS_PAGE: InformationalPage = {
  slug: "materials",
  status: "published",
  seo: {
    title: "Materials",
    description:
      "PLA, PETG and TPU: what each material is for, what it is not for, and which Reality 3D parts are made in it. ABS and resin are coming soon.",
    path: "/materials",
    index: true,
  },
  intro: {
    eyebrow: "Materials",
    title: "Materials for the job.",
    lead: "Material decides how a part performs, how it is finished, how long it lasts and what it costs. Three are available now, and the difference between them is the difference between a part that works and one that only looks right. More materials are coming soon.",
  },
};

/**
 * What a customer is told where a technical figure would otherwise go.
 *
 * This sentence is the content, not a stand-in for content. Reality 3D publishes
 * no material datasheets, so the page says where a real answer comes from — a
 * quote against the actual part — rather than printing a number that would look
 * like one.
 */
export const TECHNICAL_DATA_NOTE =
  "Ratings are relative and compare the materials on this page with each other. They are not measured values. Reality 3D publishes no material datasheets, tolerances or certifications, so none appear here — if your part depends on a specific figure, send the geometry and we will confirm it against the part before you order.";
