import { hexShaftSpacer } from "./products/mechanical/hex-shaft-spacer";
import { planetaryGearSet } from "./products/mechanical/planetary-gear-set";
import { spurGear24t } from "./products/mechanical/spur-gear-24t";
import type { CatalogEntry } from "./types";

/**
 * The canonical catalog.
 *
 * One file per product under `products/<browse category>/`, listed here in
 * catalog order. This list is what `content:import` and `content:reset` write
 * to Payload and what `content:verify` compares Payload against.
 *
 * Deliberately small. The reset replaced 36 records with no photography and
 * hand-written prices with the products that can be stood behind today: each
 * one has a parsed, measured 3D model, specifications read off that model, and
 * a price derived from the pricing engine. See the report in the reset summary
 * for what is still missing before any of them is REAL.
 */
export const CATALOG_ENTRIES: readonly CatalogEntry[] = [
  spurGear24t,
  planetaryGearSet,
  hexShaftSpacer,
];

export { CATALOG_CATEGORIES } from "./taxonomy";
export { MODEL_ASSETS, VERIFIED_MODELS } from "./models";
export { RETIRED_PRODUCT_IDS, RETIRED_SLUGS } from "./retired";
export {
  LAUNCH_POLICY,
  MANUFACTURING_CAPABILITY,
  PRICING_RULES_APPROVAL,
  type BusinessApproval,
} from "./approvals";
export * from "./facts";
export {
  LIMITATIONS,
  MATERIAL_CAPABILITIES,
  TECHNOLOGIES as MANUFACTURING_TECHNOLOGIES,
  capabilityVerdict,
  manufacturingApproved,
  manufacturingStatus,
  processesAndMaterialsApproved,
  materialCapability,
  missingLaunchLimitations,
  technologySpec,
  type CapabilityVerdict,
  type LimitationPolicy,
  type ManufacturingStatus,
  type MaterialCapability,
  type TechnologySpec,
} from "./manufacturing";
export type {
  CatalogEntry,
  CommercialDefinition,
  OpenQuestion,
  PricingModel,
  ProductClass,
  VisualType,
  ProductApproval,
  CategoryDefinition,
  ModelAsset,
  PublicationIntent,
} from "./types";
