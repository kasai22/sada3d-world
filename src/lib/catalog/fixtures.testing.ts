import { CATALOG_ENTRIES, type CatalogEntry, type CommercialDefinition } from "@/content/catalog";

import type { CapabilityVerdict } from "@/content/catalog";

import type { Product } from "./types";

/**
 * Test fixtures for launch readiness — NOT catalog data.
 *
 * A launch-ready product needs every business input approved, and none is in
 * the real catalog. These fixtures show what the system does *once* inputs are
 * approved, so each approval below is labelled as a fixture and references
 * nothing real. Only test files import this module.
 */

const APPROVAL = { reference: "TEST FIXTURE — not a business decision", approvedOn: "2026-09-20", approvedBy: "Test fixture" };

const spur = CATALOG_ENTRIES.find((entry) => entry.product.id === "p-101")!;

export const FIXTURE_NOW = new Date("2026-10-01T12:00:00.000Z");

export const APPROVED_CAPABILITY = (): CapabilityVerdict => ({ approved: true, reasons: [] });

export const APPROVED_COMMERCIAL: CommercialDefinition = {
  productClass: { state: "APPROVED", value: "STANDARD_CATALOG_PRODUCT", approval: APPROVAL },
  sku: { state: "APPROVED", value: "FIXTURE-SKU-1", approval: APPROVAL },
  customer: { state: "APPROVED", value: ["Fixture customers"], approval: APPROVAL },
  useCase: { state: "APPROVED", value: "Fixture use case", approval: APPROVAL },
  pricingModel: { state: "APPROVED", value: "FIXED", approval: APPROVAL },
  copy: { state: "APPROVED", value: "Fixture copy", approval: APPROVAL },
  weightGrams: { state: "MISSING", note: "Not measured" },
  visual: {
    required: { state: "APPROVED", value: "REAL_PHOTO", approval: APPROVAL },
    renderSpecification: { state: "MISSING", note: "A photo is required, not a render" },
    owner: "Content",
  },
  featured: { state: "APPROVED", value: true, approval: APPROVAL },
};

export const launchReadyProduct: Product = {
  ...spur.product,
  approvalStatus: "approved",
  priceStatus: "approved",
  featured: true,
  image: {
    src: "/catalog/spur-gear-24t/front.jpg",
    alt: "24-tooth spur gear in black PLA",
    kind: "photo",
    approval: { reference: APPROVAL.reference, approvedBy: APPROVAL.approvedBy, approvedOn: APPROVAL.approvedOn },
  },
};

export const launchReadyEntry: CatalogEntry = {
  ...spur,
  product: launchReadyProduct,
  approval: { approvedBy: APPROVAL.approvedBy, approvedOn: APPROVAL.approvedOn, reference: APPROVAL.reference },
  priceApprovals: [
    { amount: spur.product.price, currency: "INR", effectiveFrom: "2026-09-20", reference: APPROVAL.reference, approvedBy: APPROVAL.approvedBy },
  ],
  commercial: APPROVED_COMMERCIAL,
};
