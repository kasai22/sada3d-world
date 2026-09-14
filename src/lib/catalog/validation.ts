import {
  CATALOG_CATEGORIES,
  validateFact,
  type CommercialDefinition,
  type Fact,
  RETIRED_PRODUCT_IDS,
  RETIRED_SLUGS,
  VERIFIED_MODELS,
  type CatalogEntry,
  type CategoryDefinition,
} from "@/content/catalog";
import { MATERIALS as MATERIAL_CONTENT } from "@/content/materials";
import { qualityOptionsFor } from "@/lib/custom-print/options";

import { effectivePriceApproval } from "./commerce";
import { AVAILABILITY, COLORS, MATERIALS, TECHNOLOGIES } from "./taxonomy";
import { APPROVAL_STATUSES, type Product } from "./types";

/**
 * Product and catalog validation.
 *
 * ── Where it runs ────────────────────────────────────────────────────────
 *
 *   npm test               against the canonical catalog and fixtures
 *   content:import/reset   before the first write; a product that fails is
 *                          written as a draft and never published
 *   content:verify         against what Payload actually serves
 *
 * One implementation for all three, so "valid" cannot mean one thing in a test
 * and another at import.
 *
 * ── What it is for ───────────────────────────────────────────────────────
 *
 * The pre-reset catalog published an SLS part in resin, test records named
 * `payload_test`, and a coupler whose description did not match its model. Each
 * of those is a rule below. Validation is deliberately strict and structural:
 * it refuses what is impossible or unsupported, and it does not judge whether
 * a description is good — that is review, not code.
 */

export type ValidationCode =
  | "missing-id"
  | "placeholder-id"
  | "retired-id"
  | "missing-name"
  | "test-data"
  | "invalid-slug"
  | "retired-slug"
  | "missing-summary"
  | "missing-category"
  | "category-not-leaf"
  | "invalid-browse-category"
  | "category-mismatch"
  | "invalid-material"
  | "invalid-technology"
  | "incompatible-material-technology"
  | "invalid-availability"
  | "invalid-price"
  | "invalid-currency"
  | "invalid-price-status"
  | "invalid-color"
  | "color-not-offered"
  | "invalid-quality"
  | "missing-visual"
  | "invalid-model"
  | "invalid-image"
  | "unsupported-claim"
  | "duplicate-id"
  | "duplicate-slug"
  | "orphan-product"
  | "empty-category"
  | "duplicate-category"
  | "missing-price-basis"
  | "invalid-approval-status"
  | "missing-approval-record"
  | "unapproved-price"
  | "invalid-price-approval"
  | "publication-conflict"
  | "invalid-commercial-definition";

export interface ValidationIssue {
  /** The product id, slug or category the issue is about. */
  subject: string;
  code: ValidationCode;
  message: string;
}

/* ------------------------------------------------------------------ *
 * Rules shared by the checks
 * ------------------------------------------------------------------ */

/** Lower-case words separated by single hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The stable application id shape: "p-" and at least three digits. */
const PRODUCT_ID = /^p-\d{3,}$/;

/**
 * Words that mark a record as development data wherever they appear in an
 * identifier or a name. `payload_test`, `SKU001` and `product-001` are the real
 * examples this was written against.
 */
const TEST_DATA =
  /(^|[^a-z])(test|demo|dummy|sample|placeholder|lorem|todo|tbd)([^a-z]|$)|payload[_-]?test|^sku[-_]?\d+$|^product[-_]?\d+$/i;

/**
 * Claims no approved data supports.
 *
 * The repository holds no datasheet, test result, certification, stock record
 * or production schedule, so none of these may appear in product copy. Each
 * pattern names the kind of claim, not a specific wording, so a paraphrase is
 * still caught.
 */
const UNSUPPORTED_CLAIMS: readonly { pattern: RegExp; claim: string }[] = [
  { pattern: /±|\btolerances?\b/i, claim: "a tolerance" },
  { pattern: /\bcertif(ied|ication)\b|\bISO\s?\d{3,}/i, claim: "a certification" },
  { pattern: /\btensile\b|\bMPa\b|\bGPa\b/i, claim: "a strength value" },
  { pattern: /heat[- ]deflection|\bHDT\b|°\s?C\b/i, claim: "a temperature rating" },
  { pattern: /\bdensity\b|g\/cm/i, claim: "a density" },
  { pattern: /food[- ]safe|medical[- ]grade|biocompatible/i, claim: "a safety or grade rating" },
  { pattern: /chemical(ly)?[- ]resistan/i, claim: "a chemical-resistance rating" },
  { pattern: /\bin stock\b|\bships? (in|within)\b|\blead time\b|\bnext[- ]day\b/i, claim: "stock or lead time" },
  { pattern: /\bguarantee[ds]?\b|\bwarrant(y|ied)\b/i, claim: "a guarantee" },
  { pattern: /\bweighs?\b|\bweight\b/i, claim: "a weight" },
  { pattern: /print time/i, claim: "a print time" },
];

interface CategoryIndex {
  /** Every node value → its root's value. */
  root: Map<string, string>;
  /** Every node value → itself and all of its ancestors. */
  ancestors: Map<string, readonly string[]>;
  leaves: Set<string>;
  roots: Set<string>;
}

function indexCategories(tree: readonly CategoryDefinition[]): CategoryIndex {
  const root = new Map<string, string>();
  const ancestors = new Map<string, readonly string[]>();
  const leaves = new Set<string>();
  const roots = new Set(tree.map((node) => node.value));

  const walk = (nodes: readonly CategoryDefinition[], trail: readonly string[]) => {
    for (const node of nodes) {
      const path = [...trail, node.value];
      root.set(node.value, trail[0] ?? node.value);
      ancestors.set(node.value, path);
      if (!node.children?.length) leaves.add(node.value);
      else walk(node.children, path);
    }
  };
  walk(tree, []);

  return { root, ancestors, leaves, roots };
}

const CATEGORY_INDEX = indexCategories(CATALOG_CATEGORIES);

const MATERIAL_VALUES = new Set(MATERIALS.map((entry) => entry.value));
const TECHNOLOGY_VALUES = new Set(TECHNOLOGIES.map((entry) => entry.value));
const AVAILABILITY_VALUES = new Set(AVAILABILITY.map((entry) => entry.value));
const COLOR_VALUES = new Set(COLORS.map((entry) => entry.value));

function materialRecord(value: string) {
  return MATERIAL_CONTENT.find((entry) => entry.value === value);
}

/* ------------------------------------------------------------------ *
 * validateProduct
 * ------------------------------------------------------------------ */

export interface ProductValidationOptions {
  /**
   * The category tree to validate against. Defaults to the canonical one;
   * tests pass their own.
   */
  categories?: readonly CategoryDefinition[];
}

/**
 * Every reason this product may not be published. Empty means it may.
 *
 * Returns all issues rather than the first, so an operator fixes a record once.
 */
export function validateProduct(
  product: Product,
  options: ProductValidationOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const subject = product.id || product.slug || "(unidentified product)";
  const fail = (code: ValidationCode, message: string) =>
    issues.push({ subject, code, message });

  const categories = options.categories
    ? indexCategories(options.categories)
    : CATEGORY_INDEX;

  /* ---- identity ---- */

  if (!product.id?.trim()) {
    fail("missing-id", "It has no stable product id.");
  } else if (RETIRED_PRODUCT_IDS.has(product.id)) {
    fail(
      "retired-id",
      `Id "${product.id}" belonged to the pre-reset catalog. Stale carts may still hold it, so it can never name a different product.`,
    );
  } else if (!PRODUCT_ID.test(product.id) || TEST_DATA.test(product.id)) {
    fail("placeholder-id", `Id "${product.id}" is not a stable application id (expected p-NNN).`);
  }

  if (!product.name?.trim()) fail("missing-name", "It has no name.");

  if ([product.id, product.slug, product.name].some((value) => TEST_DATA.test(value ?? ""))) {
    fail("test-data", "Its id, slug or name reads as test or development data.");
  }

  if (!product.slug || !SLUG.test(product.slug)) {
    fail("invalid-slug", `Slug "${product.slug}" is not lower-case words joined by hyphens.`);
  } else if (RETIRED_SLUGS.has(product.slug)) {
    fail("retired-slug", `Slug "${product.slug}" belonged to the pre-reset catalog.`);
  } else if (product.slug === product.id) {
    fail("invalid-slug", "The slug is the internal id; customer URLs must not expose it.");
  }

  if (!product.summary?.trim()) fail("missing-summary", "It has no summary line.");

  /* ---- taxonomy ---- */

  if (!product.category || !categories.root.has(product.category)) {
    fail("missing-category", `Category "${product.category}" is not in the category tree.`);
  } else if (!categories.leaves.has(product.category)) {
    fail("category-not-leaf", `Category "${product.category}" has sub-categories; file the product in one of them.`);
  }

  if (!categories.roots.has(product.browseCategory)) {
    fail("invalid-browse-category", `"${product.browseCategory}" is not a top-level category.`);
  } else if (
    categories.root.has(product.category) &&
    categories.root.get(product.category) !== product.browseCategory
  ) {
    fail(
      "category-mismatch",
      `"${product.category}" sits under "${categories.root.get(product.category)}", not "${product.browseCategory}".`,
    );
  }

  /* ---- manufacturing ---- */

  const offered = product.materials?.length ? product.materials : [product.material];

  if (!MATERIAL_VALUES.has(product.material)) {
    fail("invalid-material", `"${product.material}" is not a supported material.`);
  }
  if (product.materials?.length && !product.materials.includes(product.material)) {
    fail("invalid-material", "The default material is not among the materials offered.");
  }
  for (const value of offered) {
    if (!MATERIAL_VALUES.has(value)) {
      fail("invalid-material", `Offered material "${value}" is not a supported material.`);
    }
  }

  if (!TECHNOLOGY_VALUES.has(product.technology)) {
    fail(
      "invalid-technology",
      `"${product.technology}" is not a technology Reality 3D offers.`,
    );
  } else {
    for (const value of offered) {
      const record = materialRecord(value);
      if (record && !record.technologies.includes(product.technology)) {
        fail(
          "incompatible-material-technology",
          `${product.technology.toUpperCase()} cannot print ${record.name}; ${record.name} is printed with ${record.technologies.map((t) => t.toUpperCase()).join(" or ")}.`,
        );
      }
    }
  }

  if (!COLOR_VALUES.has(product.color)) {
    fail("invalid-color", `"${product.color}" is not a colour in the colour vocabulary.`);
  }
  const colors = product.colors?.length ? product.colors : [product.color];
  if (product.colors?.length && !product.colors.includes(product.color)) {
    fail("invalid-color", "The default colour is not among the colours offered.");
  }
  for (const color of colors) {
    if (!COLOR_VALUES.has(color)) {
      fail("invalid-color", `Offered colour "${color}" is not in the colour vocabulary.`);
      continue;
    }
    for (const value of offered) {
      const record = materialRecord(value);
      if (record && !record.colors.includes(color)) {
        fail("color-not-offered", `${record.name} is not offered in ${color}.`);
      }
    }
  }

  // Stage 19.7: qualities belong to the material's process — FDM layer heights
  // for FDM materials, the single unstated SLA quality for resin.
  for (const option of product.qualityOptions ?? []) {
    const offered = qualityOptionsFor(product.material);
    const known = offered.find((entry) => entry.value === option.value);
    if (!known || known.label !== option.label || known.layerHeight !== option.layerHeight) {
      fail(
        "invalid-quality",
        `Quality "${option.value}" (${option.layerHeight}) is not a quality the configurator offers for ${product.material}.`,
      );
    }
  }

  /* ---- approval ---- */

  if (!product.approvalStatus || !APPROVAL_STATUSES.includes(product.approvalStatus)) {
    fail("invalid-approval-status", "The product has no valid approval status.");
  }

  /* ---- commerce ---- */

  if (!AVAILABILITY_VALUES.has(product.availability)) {
    fail(
      "invalid-availability",
      product.availability === "in-stock"
        ? "No stock records are maintained, so a part cannot be listed as in stock."
        : `"${product.availability}" is not a supported availability.`,
    );
  }

  if (typeof product.price !== "number" || !Number.isInteger(product.price) || product.price < 0) {
    fail("invalid-price", "The price must be a whole, non-negative number of rupees.");
  }
  if (product.currency !== "INR") fail("invalid-currency", `"${product.currency}" is not INR.`);

  if (!product.priceStatus) {
    fail("invalid-price-status", "The price is not marked verified, provisional or quote-only.");
  } else if ((product.priceStatus === "quote-only") !== (product.price === 0)) {
    fail(
      "invalid-price-status",
      product.price === 0
        ? "A price of 0 means quote-only, but the price is not marked quote-only."
        : "A quote-only product must have a price of 0.",
    );
  }

  /* ---- visual ---- */

  if (!product.image && !product.model) {
    fail("missing-visual", "It has neither an image nor a verified 3D model.");
  }

  if (product.image) {
    const { src, alt, kind } = product.image;
    if (!src?.trim() || !alt?.trim()) {
      fail("invalid-image", "The image needs both a source and alternative text.");
    }
    if (kind !== "photo" && kind !== "render") {
      // An image nobody has classified is how placeholder media gets published.
      fail("invalid-image", "The image is not marked as a product photo or an approved render.");
    }
    if (src && !/^(\/catalog\/|\/payload-api\/media\/|https:\/\/)/.test(src)) {
      fail("invalid-image", `Image "${src}" is not a catalog asset (/catalog/…) or a CMS media file.`);
    }
    // Stage 19.8: a repository image is filed under its own product's slug, so an
    // image of one product cannot be attached to another by pointing at its file.
    if (src?.startsWith("/catalog/") && !src.startsWith(`/catalog/${product.slug}/`)) {
      fail("invalid-image", `Image "${src}" is not filed under /catalog/${product.slug}/, so it is not this product's media.`);
    }
    if (/placeholder|stock|sample|dummy|lorem/i.test(src ?? "")) {
      fail("invalid-image", `Image "${src}" is named as placeholder media.`);
    }
    const approval = product.image.approval;
    if (approval && (!approval.reference?.trim() || !approval.approvedBy?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(approval.approvedOn ?? ""))) {
      fail("invalid-image", "The image approval needs a reference, an approver and an ISO date.");
    }
  }

  if (product.model) {
    const verified = VERIFIED_MODELS.find((asset) => asset.url === product.model?.url);
    const extension = product.model.url.split(".").pop()?.toLowerCase();

    if (extension !== product.model.format) {
      fail("invalid-model", `Model "${product.model.url}" does not have a .${product.model.format} extension.`);
    } else if (!verified) {
      fail("invalid-model", `Model "${product.model.url}" is not a verified model asset.`);
    } else if (verified.format !== product.model.format) {
      fail("invalid-model", `Model "${product.model.url}" is recorded as ${verified.format}.`);
    }
  }

  /* ---- claims ---- */

  const copy = [
    product.name,
    product.summary,
    product.description ?? "",
    product.badge ?? "",
    ...(product.applications ?? []),
    ...(product.materialNotes ?? []),
    ...(product.specifications ?? []).flatMap((row) => [row.label, row.value]),
  ].join("\n");

  for (const { pattern, claim } of UNSUPPORTED_CLAIMS) {
    if (pattern.test(copy)) {
      fail("unsupported-claim", `The copy states ${claim}, and no approved data supports one.`);
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ *
 * validateCatalog
 * ------------------------------------------------------------------ */

export interface CatalogValidation {
  /** True when nothing blocks the import. */
  ok: boolean;
  /** Everything that blocks the import or the publication of an entry. */
  issues: ValidationIssue[];
  /** Entries intended for publication that passed every check. */
  publishable: CatalogEntry[];
  /** Entries that will be written as drafts, with the reasons (if any). */
  drafts: { entry: CatalogEntry; issues: ValidationIssue[] }[];
}

/**
 * The whole catalog, checked as one thing.
 *
 * A draft may be incomplete — that is what a draft is — so its product issues
 * are reported against it without failing the catalog. Everything structural
 * (duplicates, orphans, empty categories) and every issue on an entry intended
 * for publication fails it.
 */
/**
 * Checks that an entry's commercial claims have evidence behind them.
 *
 * Technical, not commercial: saying "approved" without an approval record, or
 * "approved price" without a price approval in effect, is a false record — it
 * blocks the import. Whether the product is *commercially ready* is a separate
 * question, answered by `assessCommercial`.
 */
export function validateEntryApprovals(entry: CatalogEntry, now: Date = new Date()): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { product } = entry;
  const fail = (code: ValidationCode, message: string) =>
    issues.push({ subject: product.id, code, message });
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;

  if (product.approvalStatus === "approved") {
    const record = entry.approval;
    if (!record?.approvedBy.trim() || !record.reference.trim() || !isoDate.test(record.approvedOn)) {
      fail("missing-approval-record", "Marked approved, but no approval record (approver, ISO date, reference) exists.");
    }
  }

  if (entry.intent === "publish" && (product.approvalStatus === "draft" || product.approvalStatus === "archived")) {
    fail("publication-conflict", `A ${product.approvalStatus} product cannot be published.`);
  }

  for (const record of entry.priceApprovals ?? []) {
    if (!Number.isInteger(record.amount) || record.amount <= 0) {
      fail("invalid-price-approval", `Price approval of ${record.amount} is not a positive whole number of rupees.`);
    }
    if (record.currency !== "INR") fail("invalid-price-approval", "Price approvals are in INR.");
    if (!isoDate.test(record.effectiveFrom) || Number.isNaN(Date.parse(record.effectiveFrom))) {
      fail("invalid-price-approval", `"${record.effectiveFrom}" is not an ISO effective date.`);
    }
    if (!record.reference.trim() || !record.approvedBy.trim()) {
      fail("invalid-price-approval", "A price approval needs an approver and a reference.");
    }
  }

  if (product.priceStatus === "approved") {
    const effective = effectivePriceApproval(entry.priceApprovals ?? [], now);
    if (!effective) {
      fail("unapproved-price", "Marked as an approved price, but no price approval is in effect.");
    } else if (effective.amount !== product.price) {
      fail(
        "unapproved-price",
        `The approved price in effect is ₹${effective.amount}, but the product carries ₹${product.price}.`,
      );
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ *
 * Commercial definition (Stage 19.7)
 * ------------------------------------------------------------------ */

const factNames: readonly [string, (commercial: CommercialDefinition) => Fact<unknown>][] = [
  ["productClass", (c) => c.productClass],
  ["sku", (c) => c.sku],
  ["customer", (c) => c.customer],
  ["useCase", (c) => c.useCase],
  ["pricingModel", (c) => c.pricingModel],
  ["copy", (c) => c.copy],
  ["weightGrams", (c) => c.weightGrams],
  ["visual.required", (c) => c.visual.required],
  ["visual.renderSpecification", (c) => c.visual.renderSpecification],
  ["featured", (c) => c.featured],
];

function openQuestionProblems(product: Product, commercial: CommercialDefinition): string[] {
  return (commercial.openQuestions ?? []).flatMap((question) =>
    validateFact(question.answer, `${product.id} open question "${question.id}"`),
  );
}

/** Technical problems with a commercial definition: malformed facts and contradictions. */
export function validateCommercialDefinition(
  product: Product,
  commercial: CommercialDefinition | undefined,
): string[] {
  if (!commercial) return ["Missing commercial catalog definition"];

  const problems = [
    ...factNames.flatMap(([name, pick]) => validateFact(pick(commercial), `${product.id} ${name}`)),
    ...openQuestionProblems(product, commercial),
  ];
  const value = <T>(fact: Fact<T>) => ("value" in fact ? fact.value : undefined);

  const model = value(commercial.pricingModel);
  const productClass = value(commercial.productClass);
  const quoteOnlyPrice = product.priceStatus === "quote-only";

  if (model !== undefined && (model === "QUOTE_ONLY") !== quoteOnlyPrice) {
    problems.push(
      model === "QUOTE_ONLY"
        ? `${product.id}: pricing model is QUOTE_ONLY but the price status is ${product.priceStatus}`
        : `${product.id}: price status is quote-only but the pricing model is ${model}`,
    );
  }
  if (productClass !== undefined && model !== undefined && (productClass === "QUOTE_ONLY_PRODUCT") !== (model === "QUOTE_ONLY")) {
    problems.push(`${product.id}: product class ${productClass} contradicts pricing model ${model}`);
  }
  if (productClass === "CUSTOM_MANUFACTURING_SERVICE") {
    problems.push(`${product.id}: a custom manufacturing service is not a catalog product`);
  }

  const visual = value(commercial.visual.required);
  const kind = product.image?.kind;
  if (visual && kind && (visual === "REAL_PHOTO") !== (kind === "photo")) {
    problems.push(`${product.id}: the visual requirement is ${visual} but the image is a ${kind}`);
  }

  return problems;
}

export function validateCatalog(
  entries: readonly CatalogEntry[],
  categories: readonly CategoryDefinition[] = CATALOG_CATEGORIES,
  now: Date = new Date(),
): CatalogValidation {
  const issues: ValidationIssue[] = [];
  const publishable: CatalogEntry[] = [];
  const drafts: CatalogValidation["drafts"] = [];

  const index = indexCategories(categories);

  /* ---- the tree itself ---- */

  const seenCategories = new Set<string>();
  const walk = (nodes: readonly CategoryDefinition[]) => {
    for (const node of nodes) {
      if (seenCategories.has(node.value)) {
        issues.push({ subject: node.value, code: "duplicate-category", message: "Two categories share this value." });
      }
      seenCategories.add(node.value);
      if (!SLUG.test(node.value) || TEST_DATA.test(`${node.value} ${node.label}`)) {
        issues.push({ subject: node.value, code: "test-data", message: `Category "${node.label}" is not a customer-facing category.` });
      }
      if (node.children) walk(node.children);
    }
  };
  walk(categories);

  /* ---- products ---- */

  const ids = new Set<string>();
  const slugs = new Set<string>();

  for (const entry of entries) {
    const { product } = entry;

    if (ids.has(product.id)) {
      issues.push({ subject: product.id, code: "duplicate-id", message: "Two products share this id." });
    }
    ids.add(product.id);

    if (slugs.has(product.slug)) {
      issues.push({ subject: product.slug, code: "duplicate-slug", message: "Two products share this slug." });
    }
    slugs.add(product.slug);

    if (!index.root.has(product.category)) {
      issues.push({
        subject: product.id,
        code: "orphan-product",
        message: `Filed under "${product.category}", which is not in the category tree.`,
      });
    }

    const productIssues = [
      ...validateProduct(product, { categories }),
      ...validateEntryApprovals(entry, now),
      ...validateCommercialDefinition(product, entry.commercial).map((message) => ({
        subject: product.id,
        code: "invalid-commercial-definition" as const,
        message,
      })),
    ];
    if (!entry.priceBasis.trim()) {
      productIssues.push({ subject: product.id, code: "missing-price-basis", message: "Where the price came from is not recorded." });
    }

    if (entry.intent === "publish") {
      if (productIssues.length === 0) publishable.push(entry);
      else issues.push(...productIssues);
    } else {
      drafts.push({ entry, issues: productIssues });
    }
  }

  /* ---- no empty categories ---- */

  const used = new Set<string>();
  for (const entry of entries) {
    for (const value of index.ancestors.get(entry.product.category) ?? []) used.add(value);
  }

  for (const value of index.root.keys()) {
    if (!used.has(value)) {
      issues.push({
        subject: value,
        code: "empty-category",
        message: "No product is filed in this category. Add the category with its first product.",
      });
    }
  }

  return { ok: issues.length === 0, issues, publishable, drafts };
}
