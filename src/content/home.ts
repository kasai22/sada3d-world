/**
 * Homepage content.
 *
 * Local, structured, and typed so Phase 14 can swap the source for Payload
 * without touching the section components. Nothing here is fetched — the
 * homepage has no backend dependency.
 *
 * Anything that reads as a factual claim about SADA 3D's real capacity is
 * marked PLACEHOLDER and must be confirmed before launch.
 */

import type { IconName } from "@/components/core";
import type { ProductMeta } from "@/components/commerce";

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

export const CATEGORIES: readonly Category[] = [
  {
    index: "01",
    name: "Mechanical",
    descriptor: "Precision components, functional parts, custom assemblies.",
    href: "/shop/mechanical",
  },
  {
    index: "02",
    name: "Automotive",
    descriptor: "Interior fittings, exterior trim, replacement components.",
    href: "/shop/automotive",
  },
  {
    index: "03",
    name: "Industrial",
    descriptor: "Jigs, fixtures, tooling and line-side spares.",
    href: "/shop/industrial",
  },
  {
    index: "04",
    name: "Lifestyle",
    descriptor: "Home objects, organisation, considered everyday pieces.",
    href: "/shop/lifestyle",
  },
  {
    index: "05",
    name: "Architecture",
    descriptor: "Scale models, facade studies, presentation pieces.",
    href: "/shop/architecture",
  },
  {
    index: "06",
    name: "Prototyping",
    descriptor: "Form studies, fit checks, iteration before tooling.",
    href: "/shop/prototyping",
  },
  {
    index: "07",
    name: "Components",
    descriptor: "Brackets, housings, couplers, fasteners, mounts.",
    href: "/shop/components",
  },
  {
    index: "08",
    name: "Custom Products",
    descriptor: "Your geometry, manufactured to your specification.",
    href: "/custom-print",
  },
];

/* ------------------------------------------------------------------ *
 * 03 / 06 — Manufacturing flow
 * ------------------------------------------------------------------ */

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
    meta: "STL · STEP · OBJ · 3MF",
    icon: "upload",
  },
  {
    index: "02",
    name: "Configure",
    summary: "Choose material, quality and finish.",
    meta: "5 MATERIALS · 3 LAYER HEIGHTS",
    icon: "settings-2",
  },
  {
    index: "03",
    name: "Manufacture",
    summary: "We produce the part on our machines.",
    meta: "FDM · SLA · SLS",
    icon: "cpu",
  },
  {
    index: "04",
    name: "Deliver",
    summary: "Your design arrives as a physical object.",
    meta: "TRACKED TO YOUR DOOR",
    icon: "package",
  },
];

/* ------------------------------------------------------------------ *
 * 04 — Materials
 * ------------------------------------------------------------------ */

/** Drives the CSS surface treatment so each material reads physically distinct. */
export type MaterialSurface = "matte" | "gloss" | "machined" | "soft" | "translucent";

export interface Material {
  name: string;
  /** Chemical or process name. */
  code: string;
  description: string;
  /** 1–5 each. */
  properties: { strength: number; flexibility: number; heat: number };
  applications: readonly string[];
  colors: readonly string[];
  /** Relative to PLA. */
  multiplier: string;
  surface: MaterialSurface;
}

export const MATERIALS: readonly Material[] = [
  {
    name: "PLA",
    code: "Polylactic acid",
    description:
      "The default. Dimensionally stable, sharp detail, matte finish.",
    properties: { strength: 3, flexibility: 2, heat: 2 },
    applications: ["Prototypes", "Display parts", "Low-load components"],
    colors: ["#F4F6F8", "#050506", "#FF6B00", "#6C737C"],
    multiplier: "1.0",
    surface: "matte",
  },
  {
    name: "PETG",
    code: "Glycol-modified PET",
    description: "Tougher and chemically resistant. Semi-gloss surface.",
    properties: { strength: 4, flexibility: 3, heat: 4 },
    applications: ["Enclosures", "Brackets", "Outdoor parts"],
    colors: ["#F4F6F8", "#050506", "#4DA3FF"],
    multiplier: "1.2",
    surface: "gloss",
  },
  {
    name: "ABS",
    code: "Acrylonitrile butadiene styrene",
    description: "Impact resistant, machinable, vapour-smoothable.",
    properties: { strength: 4, flexibility: 3, heat: 5 },
    applications: ["Housings", "Automotive trim", "Tooling"],
    colors: ["#050506", "#A9B0B9"],
    multiplier: "1.3",
    surface: "machined",
  },
  {
    name: "TPU",
    code: "Thermoplastic polyurethane",
    description: "Elastomeric. Gaskets, dampers, protective housings.",
    properties: { strength: 3, flexibility: 5, heat: 3 },
    applications: ["Gaskets", "Dampers", "Grips"],
    colors: ["#050506", "#FF6B00"],
    multiplier: "1.6",
    surface: "soft",
  },
  {
    name: "Resin",
    code: "SLA photopolymer",
    description: "Highest resolution. Fine features and smooth surfaces.",
    properties: { strength: 3, flexibility: 1, heat: 3 },
    applications: ["Miniatures", "Dental", "Jewellery masters"],
    colors: ["#A9B0B9", "#050506"],
    multiplier: "2.1",
    surface: "translucent",
  },
];

/* ------------------------------------------------------------------ *
 * 05 — Featured products
 * ------------------------------------------------------------------ */

export interface FeaturedProduct {
  slug: string;
  name: string;
  material: string;
  color: string;
  /** Pre-formatted for the locale. */
  price: string;
  badge?: string;
  meta: readonly ProductMeta[];
}

export const FEATURED_PRODUCTS: readonly FeaturedProduct[] = [
  {
    slug: "precision-gear",
    name: "Precision Gear",
    material: "PLA",
    color: "Black",
    price: "₹399",
    badge: "In stock",
    meta: [
      { label: "Layer", value: "0.16 MM" },
      { label: "Weight", value: "34 G" },
    ],
  },
  {
    slug: "hex-drive-coupler",
    name: "Hex Drive Coupler",
    material: "ABS",
    color: "Titanium",
    price: "₹640",
    badge: "New",
    meta: [
      { label: "Layer", value: "0.12 MM" },
      { label: "Weight", value: "58 G" },
    ],
  },
  {
    slug: "optical-mount",
    name: "Optical Mount",
    material: "Resin",
    color: "Grey",
    price: "₹1,240",
    badge: "SLA",
    meta: [
      { label: "Layer", value: "0.05 MM" },
      { label: "Weight", value: "46 G" },
    ],
  },
  {
    slug: "damping-bushing",
    name: "Damping Bushing",
    material: "TPU",
    color: "Black",
    price: "₹180",
    meta: [
      { label: "Shore", value: "95A" },
      { label: "Weight", value: "12 G" },
    ],
  },
  {
    slug: "cable-bracket",
    name: "Cable Bracket",
    material: "PETG",
    color: "Graphite",
    price: "₹249",
    meta: [
      { label: "Layer", value: "0.20 MM" },
      { label: "Weight", value: "21 G" },
    ],
  },
  {
    slug: "manifold-housing",
    name: "Manifold Housing",
    material: "PETG",
    color: "Carbon",
    price: "₹890",
    meta: [
      { label: "Layer", value: "0.16 MM" },
      { label: "Weight", value: "112 G" },
    ],
  },
  {
    slug: "planetary-carrier",
    name: "Planetary Carrier",
    material: "PLA",
    color: "Orange",
    price: "₹520",
    meta: [
      { label: "Layer", value: "0.16 MM" },
      { label: "Weight", value: "61 G" },
    ],
  },
  {
    slug: "sensor-enclosure",
    name: "Sensor Enclosure",
    material: "ABS",
    color: "Black",
    price: "₹760",
    meta: [
      { label: "Layer", value: "0.20 MM" },
      { label: "Weight", value: "88 G" },
    ],
  },
];

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
 * PLACEHOLDER. Every figure below is illustrative and must be replaced with
 * confirmed operational data before launch. Do not present these as verified
 * specifications.
 * ------------------------------------------------------------------ */

export interface CapabilityMetric {
  value: string;
  label: string;
}

export const CAPABILITY_METRICS: readonly CapabilityMetric[] = [
  { value: "±0.1 MM", label: "Typical FDM tolerance" },
  { value: "0.05 MM", label: "Finest layer height" },
  { value: "24 / 7", label: "Ordering" },
  { value: "5", label: "Stock materials" },
];

export interface Technology {
  code: string;
  name: string;
  summary: string;
  detail: string;
}

export const TECHNOLOGIES: readonly Technology[] = [
  {
    code: "FDM",
    name: "Fused deposition modelling",
    summary: "Functional parts in engineering thermoplastics.",
    detail: "0.12 – 0.28 MM LAYERS",
  },
  {
    code: "SLA",
    name: "Stereolithography",
    summary: "Fine features and smooth surfaces from photopolymer resin.",
    detail: "0.05 MM LAYERS",
  },
  {
    code: "SLS",
    name: "Selective laser sintering",
    summary: "Support-free geometry in nylon powder.",
    detail: "0.10 MM LAYERS",
  },
];
