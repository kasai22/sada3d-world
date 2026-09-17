import type { LaunchStage } from "@/payload/workflow";
import type { Product as PayloadProduct } from "@/payload-types";

import type { ApprovalStatus, ManufacturingReadiness, MediaReadiness, PriceReadiness } from "./analytics/catalog";
import type { OpsTone } from "./labels";

/**
 * Product vocabulary for Reality 3D Admin (Stage 22.5). Pure and client-safe.
 * Every status is a word as well as a tone, so colour never carries it alone.
 */

type ProductClass = NonNullable<PayloadProduct["productClass"]>;

export const STAGE_LABEL: Record<LaunchStage, string> = {
  "NOT READY": "Not ready",
  "READY FOR REVIEW": "Ready for review",
  APPROVED: "Approved, unpublished",
  "LAUNCH READY": "Launch ready",
};

export const LAUNCH_TONE: Record<LaunchStage, OpsTone> = {
  "NOT READY": "danger",
  "READY FOR REVIEW": "warning",
  APPROVED: "info",
  "LAUNCH READY": "success",
};

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  draft: "Draft",
  proposed: "Proposed",
  provisional: "Provisional",
  approved: "Approved",
  archived: "Archived",
};

export const CLASS_LABEL: Record<ProductClass, string> = {
  STANDARD_CATALOG_PRODUCT: "Standard",
  CONFIGURABLE_PRODUCT: "Configurable",
  QUOTE_ONLY_PRODUCT: "Quote only",
};

export const READINESS_TONE: Record<string, OpsTone> = {
  APPROVED: "success",
  QUOTE_ONLY: "success",
  PROVISIONAL: "warning",
  PROPOSED: "warning",
  COMING_SOON: "info",
  NOT_APPROVED: "danger",
  MISSING: "danger",
  UNKNOWN: "neutral",
};

export const MEDIA_LABEL: Record<MediaReadiness, string> = {
  APPROVED: "Approved",
  PROPOSED: "Awaiting approval",
  MISSING: "Missing",
  UNKNOWN: "Unknown",
};

export const MANUFACTURING_LABEL: Record<ManufacturingReadiness, string> = {
  APPROVED: "Approved",
  NOT_APPROVED: "Not approved",
  COMING_SOON: "Coming soon",
  UNKNOWN: "Unknown",
};

const PRICE_LABEL: Record<PriceReadiness, string> = {
  APPROVED: "Price approved",
  PROVISIONAL: "Provisional price",
  QUOTE_ONLY: "Priced by quote",
  MISSING: "No price",
  UNKNOWN: "Price unknown",
};

export const priceLabel = (readiness: PriceReadiness) => PRICE_LABEL[readiness];
