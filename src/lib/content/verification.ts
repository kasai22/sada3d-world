import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Payload } from "payload";

import {
  CATALOG_ENTRIES,
  MANUFACTURING_TECHNOLOGIES,
  MATERIAL_CAPABILITIES,
  manufacturingStatus,
  type CatalogEntry,
} from "@/content/catalog";
import { ROADMAP, capabilities, type CapabilityKind, type CapabilityStatus } from "@/content/catalog/capabilities";
import type { PriceApprovalRecord } from "@/lib/catalog/commerce";
import { entryFromPayloadDoc } from "@/lib/catalog/payload-entry";
import type { Product as PayloadProduct } from "@/payload-types";
import type { Product } from "@/lib/catalog/types";
import { validateCatalog, type ValidationIssue } from "@/lib/catalog/validation";

import { planCategories, planMaterials, planProducts } from "./plan";
import { auditLaunchReadiness, type ReadinessReport } from "./readiness";
import {
  buildParityReport,
  compareCategories,
  compareMaterials,
  compareRows,
  type ContentParity,
  type ParityReport,
} from "./verify";

/**
 * Content verification against a live Payload instance.
 *
 * What `npm run content:verify` reports, and what `content:reset` runs as its
 * last step. Four independent questions, every one of which must pass:
 *
 *   1. CATALOG     does the canonical catalog validate?
 *   2. READINESS   is anything published BLOCKING?
 *   3. PARITY      does Payload serve exactly the canonical published products,
 *                  categories and materials — field for field, and through the
 *                  same query engine, facets included?
 *   4. INVENTORY   does Payload hold exactly the canonical documents, drafts
 *                  included — no stale record left behind unpublished-but-present
 *                  that a later publish could resurrect?
 *
 * Reads the catalog **uncached and with access rules applied**, so products are
 * compared as an anonymous visitor would be served them.
 */

export interface InventoryDifference {
  collection: string;
  missing: string[];
  extra: string[];
  statusMismatch: string[];
}

export interface VerificationReport {
  catalog: { ok: boolean; issues: ValidationIssue[] };
  readiness: ReadinessReport;
  products: ParityReport;
  categories: ContentParity;
  materials: ContentParity;
  /** Stage 19.7: every product's commercial definition, drafts included. */
  commercial: ContentParity;
  /** Stage 19.8: administrator-managed products — assessed, never compared to the seed. */
  adminManaged: string[];
  /** Approved images whose files do not exist under public/. Blocking. */
  missingMediaFiles: string[];
  /** CMS products that cannot be mapped to a catalog product at all. Blocking. */
  unmappable: string[];
  /** Stage 19.9: invalid entries in src/content/catalog/roadmap.json. Blocking. */
  roadmapIssues: string[];
  inventory: InventoryDifference[];
  blocking: number;
  parity: boolean;
  ok: boolean;
}

type Doc = Record<string, unknown> & { id: number; _status?: string };

function values(rows: unknown): string[] {
  return Array.isArray(rows)
    ? rows.map((row) => String((row as { value?: unknown; hex?: unknown }).value ?? (row as { hex?: unknown }).hex))
    : [];
}

export async function verifyContent(
  payload: Payload,
  loadPublishedCatalog: () => Promise<readonly Product[]>,
): Promise<VerificationReport> {
  const catalogValidation = validateCatalog(CATALOG_ENTRIES);

  /* ---- ownership: seed products are compared to the repository; admin products are not ---- */

  const all = async (collection: "products" | "categories" | "materials") =>
    (await payload.find({ collection, depth: 0, pagination: false, overrideAccess: true }))
      .docs as unknown as Doc[];

  const storedProducts = await all("products");
  const adminManaged = new Set(
    storedProducts.filter((doc) => doc.source === "admin").map((doc) => String(doc.productId)),
  );

  /* ---- products, as the public sees them ---- */

  const published = await loadPublishedCatalog();
  // Parity: the repository seed against the seed products Payload serves.
  const products = buildParityReport(published.filter((product) => !adminManaged.has(product.id)));

  /*
   * Readiness: every product in the CMS, seed or administrator-managed, judged
   * by its own record through the same mapping the admin and the storefront use.
   */
  const populated = (
    await payload.find({ collection: "products", depth: 1, pagination: false, overrideAccess: true })
  ).docs as unknown as PayloadProduct[];
  const approvalDocs = (
    await payload.find({ collection: "price-approvals", depth: 0, pagination: false, overrideAccess: true })
  ).docs as unknown as Doc[];
  const idToProductId = new Map(storedProducts.map((doc) => [doc.id, String(doc.productId)]));
  const approvalsByProduct = new Map<string, PriceApprovalRecord[]>();
  for (const doc of approvalDocs) {
    const productId = idToProductId.get(doc.product as number);
    if (!productId) continue;
    approvalsByProduct.set(productId, [
      ...(approvalsByProduct.get(productId) ?? []),
      {
        amount: Number(doc.amount),
        currency: "INR",
        effectiveFrom: String(doc.effectiveFrom).slice(0, 10),
        reference: String(doc.reference),
        approvedBy: String(doc.approvedBy),
      },
    ]);
  }

  const entries: CatalogEntry[] = [];
  const unmappable: string[] = [];
  for (const doc of populated) {
    const result = entryFromPayloadDoc(doc, approvalsByProduct.get(doc.productId) ?? []);
    if (result.ok) entries.push(result.entry);
    else unmappable.push(`${result.productId}: ${result.reason}`);
  }
  const publishedIds = new Set(published.map((product) => product.id));
  const readiness = auditLaunchReadiness(
    entries.filter((entry) => publishedIds.has(entry.product.id)).map((entry) => entry.product),
    entries,
  );

  /* ---- approved media must exist as files ---- */

  const missingMediaFiles = entries
    .map((entry) => entry.product.image?.src)
    .filter((src): src is string => Boolean(src?.startsWith("/catalog/")))
    .filter((src) => !existsSync(join(process.cwd(), "public", src)));

  /* ---- categories and materials, as the public sees them ---- */

  const publicCategories = (
    await payload.find({ collection: "categories", depth: 1, pagination: false, overrideAccess: false })
  ).docs as unknown as Doc[];

  const categories = compareCategories(
    planCategories()
      .filter((row) => row.status === "published")
      .map((row) => ({
        value: row.value,
        name: row.name,
        description: row.description,
        parent: row.parent,
        isBrowse: row.isBrowse,
        browseOrder: row.isBrowse ? row.browseOrder : 0,
      })),
    publicCategories.map((doc) => ({
      value: doc.value,
      name: doc.name,
      description: doc.description ?? undefined,
      parent:
        doc.parent && typeof doc.parent === "object"
          ? (doc.parent as { value: string }).value
          : null,
      isBrowse: Boolean(doc.isBrowse),
      browseOrder: doc.isBrowse ? doc.browseOrder : 0,
    })),
  );

  const publicMaterials = (
    await payload.find({ collection: "materials", depth: 0, pagination: false, overrideAccess: false })
  ).docs as unknown as Doc[];

  const materials = compareMaterials(
    planMaterials()
      .filter((row) => row.status === "published")
      .map((row) => ({ ...row, status: undefined })),
    publicMaterials.map((doc) => {
      const seo = (doc.seo ?? {}) as { title?: string | null; description?: string | null };
      const properties = (doc.properties ?? {}) as Record<string, unknown>;
      return {
        value: doc.value,
        name: doc.name,
        code: doc.code ?? undefined,
        description: doc.description ?? undefined,
        properties: {
          strength: properties.strength,
          flexibility: properties.flexibility,
          heat: properties.heat,
        },
        technologies: doc.technologies ?? [],
        applications: values(doc.applications),
        bestFor: values(doc.bestFor),
        avoidFor: values(doc.avoidFor),
        surface: doc.surface ?? undefined,
        swatches: values(doc.swatches),
        seo: { title: seo.title ?? undefined, description: seo.description ?? undefined },
      };
    }),
  );

  /* ---- inventory: every document, drafts included ---- */

  const inventory: InventoryDifference[] = [];

  const check = (
    collection: string,
    expected: { key: string; status: string }[],
    stored: Doc[],
    keyOf: (doc: Doc) => string,
  ) => {
    const expectedKeys = new Map(expected.map((row) => [row.key, row.status]));
    const storedKeys = new Map(stored.map((doc) => [keyOf(doc), doc._status ?? "draft"]));

    const difference: InventoryDifference = {
      collection,
      missing: [...expectedKeys.keys()].filter((key) => !storedKeys.has(key)),
      extra: [...storedKeys.keys()].filter((key) => !expectedKeys.has(key)),
      statusMismatch: [...expectedKeys]
        .filter(([key, status]) => storedKeys.has(key) && storedKeys.get(key) !== status)
        .map(([key, status]) => `${key} (expected ${status}, found ${storedKeys.get(key)})`),
    };

    if (difference.missing.length || difference.extra.length || difference.statusMismatch.length) {
      inventory.push(difference);
    }
  };

  check(
    "products",
    planProducts()
      .filter((row) => !adminManaged.has(row.productId))
      .map((row) => ({ key: row.productId, status: row.status })),
    storedProducts.filter((doc) => doc.source !== "admin"),
    (doc) => String(doc.productId),
  );
  check(
    "categories",
    planCategories().map((row) => ({ key: row.value, status: row.status })),
    await all("categories"),
    (doc) => String(doc.value),
  );
  check(
    "materials",
    planMaterials().map((row) => ({ key: row.value, status: row.status })),
    await all("materials"),
    (doc) => String(doc.value),
  );

  /* ---- price approvals: append-only, so compared as a set ---- */

  const productKeys = idToProductId;
  const approvalKey = (r: { product: string; amount: unknown; effectiveFrom: unknown; reference: unknown }) =>
    `${r.product} ₹${String(r.amount)} from ${String(r.effectiveFrom).slice(0, 10)} (${String(r.reference)})`;

  const expectedApprovals = new Set(
    planProducts().filter((row) => !adminManaged.has(row.productId)).flatMap((row) =>
      row.priceApprovals.map((record) => approvalKey({ product: row.productId, ...record })),
    ),
  );
  const storedApprovals = new Set(
    (
      (await payload.find({ collection: "price-approvals", depth: 0, pagination: false, overrideAccess: true }))
        .docs as unknown as Doc[]
    )
      .filter((doc) => !adminManaged.has(productKeys.get(doc.product as number) ?? ""))
      .map((doc) =>
      approvalKey({
        product: productKeys.get(doc.product as number) ?? `payload:${String(doc.product)}`,
        amount: doc.amount,
        effectiveFrom: doc.effectiveFrom,
        reference: doc.reference,
      }),
    ),
  );
  const approvalDifference: InventoryDifference = {
    collection: "price-approvals",
    missing: [...expectedApprovals].filter((key) => !storedApprovals.has(key)),
    extra: [...storedApprovals].filter((key) => !expectedApprovals.has(key)),
    statusMismatch: [],
  };
  if (approvalDifference.missing.length || approvalDifference.extra.length) inventory.push(approvalDifference);

  /* ---- commercial definitions of seed products, field for field ---- */

  const approvalOf = (value: unknown) => {
    const record = (value ?? {}) as { reference?: string | null; approvedBy?: string | null; approvedOn?: string | null };
    return record.reference
      ? { reference: record.reference, approvedBy: record.approvedBy ?? null, approvedOn: record.approvedOn ? String(record.approvedOn).slice(0, 10) : null }
      : null;
  };

  const commercial = compareRows(
    "commercial",
    planProducts()
      .filter((row) => !adminManaged.has(row.productId))
      .map((row) => ({
        value: row.productId,
        sku: row.sku,
        productClass: row.productClass,
        pricingModel: row.pricingModel,
        customers: row.customers,
        useCase: row.useCase,
        visualRequirement: row.visualRequirement,
        renderSpecification: row.renderSpecification,
        weightGrams: row.weightGrams,
        commercialApproval: row.commercialApproval,
        openQuestions: row.openQuestions,
      })),
    storedProducts
      .filter((doc) => doc.source !== "admin")
      .map((doc) => ({
        value: String(doc.productId),
        sku: doc.sku ?? null,
        productClass: doc.productClass ?? null,
        pricingModel: doc.pricingModel ?? null,
        customers: values(doc.customers),
        useCase: doc.useCase ?? null,
        visualRequirement: doc.visualRequirement ?? null,
        renderSpecification: doc.renderSpecification ?? null,
        weightGrams: doc.weightGrams ?? null,
        commercialApproval: approvalOf(doc.commercialApproval),
        openQuestions: ((doc.openQuestions as Record<string, unknown>[] | null) ?? []).map((row) => ({
          questionId: row.questionId,
          question: row.question,
          answer: row.answer ?? "unanswered",
          reference: row.reference ?? null,
          approvedBy: row.approvedBy ?? null,
          approvedOn: row.approvedOn ? String(row.approvedOn).slice(0, 10) : null,
        })),
      })),
    [
      "sku", "productClass", "pricingModel", "customers", "useCase", "visualRequirement",
      "renderSpecification", "weightGrams", "commercialApproval", "openQuestions",
    ],
  );

  // Stage 19.9: an invalid roadmap entry is a content error in the repository — blocking, and shows nothing.
  const roadmapIssues = [...ROADMAP.issues];

  const blocking =
    catalogValidation.issues.length +
    readiness.counts.blocking +
    missingMediaFiles.length +
    unmappable.length +
    roadmapIssues.length;
  const parity = products.ok && categories.ok && materials.ok && commercial.ok && inventory.length === 0;

  return {
    catalog: { ok: catalogValidation.ok, issues: catalogValidation.issues },
    readiness,
    products,
    categories,
    materials,
    commercial,
    inventory,
    adminManaged: [...adminManaged],
    missingMediaFiles,
    unmappable,
    roadmapIssues,
    blocking,
    parity,
    ok: blocking === 0 && parity,
  };
}

/** Human-readable report. Names and counts only — never a credential. */
/**
 * The headline verdicts, as `content:verify` prints them.
 *
 * ENGINEERING COMPLETE (Technical, Parity) ≠ BUSINESS APPROVED (Commercial,
 * Manufacturing, Pricing, Media) ≠ LAUNCH READY. Each is its own line.
 */
const names = (items: readonly { name: string; value?: string; approval: { state: string } }[], approved: boolean) =>
  items
    .filter((item) => (item.approval.state === "APPROVED") === approved)
    .map((item) => (item.value && item.value.length <= 4 ? item.value.toUpperCase() : item.name))
    .join(", ") || "none";

const STATUS_TEXT: Record<CapabilityStatus, string> = {
  AVAILABLE: "AVAILABLE",
  COMING_SOON: "COMING SOON",
  UNAVAILABLE: "UNAVAILABLE",
};

/**
 * Capability status, kind by kind (Stage 19.9). COMING SOON is listed apart
 * from AVAILABLE and is never counted as approved manufacturing capability —
 * the Manufacturing line above and the launch gate read approvals only.
 */
export function capabilitySummary(): string[] {
  const row = (label: string, kind: CapabilityKind, collapseUnavailable = false) => {
    const rows = capabilities(kind);
    const shown = collapseUnavailable ? rows.filter((entry) => entry.status !== "UNAVAILABLE") : rows;
    const hidden = rows.length - shown.length;
    return (
      `  ${label.padEnd(16)}${shown.map((entry) => `${entry.label} — ${STATUS_TEXT[entry.status]}`).join(" · ")}` +
      (hidden > 0 ? ` · ${hidden} other${hidden === 1 ? "" : "s"} UNAVAILABLE` : "")
    );
  };
  return [
    "Capabilities:     AVAILABLE = approved · COMING SOON = roadmap, not approved, refused everywhere · UNAVAILABLE",
    row("Technology:", "technology"),
    row("Materials:", "material"),
    row("Finishes:", "finish"),
    row("Colours:", "colour", true),
  ];
}

export function launchSummary(report: VerificationReport): string[] {
  const r = report.readiness;
  const m = r.manufacturing;
  const products = r.findings.length;
  const lines = [
    `Technical:        ${report.blocking === 0 ? "PASS" : `BLOCKING (${report.blocking})`}`,
    `Commercial:       ${r.commercial.completeDefinitions === products && r.commercial.approvedProducts === products && products > 0 ? "APPROVED" : "NOT READY"}` +
      ` — ${r.commercial.approvedProducts}/${products} products approved, ${r.commercial.completeDefinitions}/${products} commercial definitions approved`,
    `Manufacturing:    ${manufacturingStatus()}` +
      ` — approved: ${names(MANUFACTURING_TECHNOLOGIES, true)}; ${names(MATERIAL_CAPABILITIES, true)}` +
      ` · not approved: ${names(MANUFACTURING_TECHNOLOGIES, false)}; ${names(MATERIAL_CAPABILITIES, false)}` +
      ` · launch limitations missing: ${m.limitations.missingForLaunch.join(", ") || "none"}`,
    ...capabilitySummary(),
    `Media:            ${r.media.missing === 0 && products > 0 ? "COMPLETE" : "BLOCKED"} — ${r.media.complete} approved · ${r.media.missing} missing`,
    `Catalog size:     ${r.catalog.defined} defined · ${r.catalog.published} published · ${r.catalog.launchReady} launch-ready / ${r.catalog.target} target (gap ${r.catalog.gap})`,
    `Featured:         ${r.featured.eligible.length} eligible · ${r.featured.blocked.length} flagged but blocked`,
    `Pricing:          ${r.pricing.approved} approved · ${r.pricing.provisional} provisional · ${r.pricing.quoteOnly} quote-only · ${r.pricing.missing} missing`,
    `Parity:           ${report.parity ? "PASS" : "FAIL"}`,
    `Launch:           ${r.launch.ready && report.ok ? "READY" : "NOT READY"}`,
  ];
  for (const reason of r.launch.reasons) lines.push(`  · ${reason}`);
  return lines;
}

export function printVerification(report: VerificationReport, log = console.log, error = console.error): void {
  log(`\nvalidateCatalog: ${report.catalog.ok ? "PASS" : "FAIL"} (${report.catalog.issues.length} issue(s))`);
  for (const issue of report.catalog.issues) error(`  ${issue.subject} [${issue.code}] ${issue.message}`);

  const { counts } = report.readiness;
  log(`readiness: ${counts.real} real · ${counts.provisional} provisional · ${counts.blocking} blocking`);
  for (const finding of report.readiness.findings) {
    const line = `  ${finding.readiness.toUpperCase().padEnd(11)} ${finding.id} (${finding.slug})`;
    if (finding.readiness === "blocking") error(line);
    else log(line);
    for (const reason of finding.reasons) (finding.readiness === "blocking" ? error : log)(`      - ${reason}`);
    if (finding.reasons.length === 0) log("      - launch-ready");
  }

  log(`\nproducts:   canonical ${report.products.localCount} · payload ${report.products.payloadCount} · ${report.products.queriesCompared} queries compared`);
  if (report.products.missing.length) error(`  missing from Payload: ${report.products.missing.join(", ")}`);
  if (report.products.extra.length) error(`  in Payload, not canonical: ${report.products.extra.join(", ")}`);
  log(`categories: canonical ${report.categories.expected} · payload ${report.categories.actual}`);
  log(`materials:  canonical ${report.materials.expected} · payload ${report.materials.actual}`);

  const differences = [
    ...report.products.differences,
    ...report.categories.differences,
    ...report.materials.differences,
    ...report.commercial.differences,
  ];
  if (differences.length) {
    error(`\nDifferences (${differences.length}):`);
    for (const d of differences.slice(0, 40)) {
      error(`  ${d.subject} · ${d.field}\n    canonical: ${JSON.stringify(d.local)}\n    payload:   ${JSON.stringify(d.payload)}`);
    }
    if (differences.length > 40) error(`  … and ${differences.length - 40} more`);
  }

  if (report.adminManaged.length > 0) {
    log(`\nadmin-managed products (assessed, not compared to the seed): ${report.adminManaged.join(", ")}`);
  }
  for (const file of report.missingMediaFiles) error(`  BLOCKING approved image file missing: public${file}`);
  for (const issue of report.roadmapIssues) error(`  BLOCKING invalid roadmap entry: ${issue}`);
  for (const line of report.unmappable) error(`  BLOCKING unmappable CMS product: ${line}`);

  for (const entry of report.inventory) {
    error(
      `\ninventory ${entry.collection}: missing [${entry.missing.join(", ")}] · extra [${entry.extra.join(", ")}] · status [${entry.statusMismatch.join(", ")}]`,
    );
  }

  log(`\n${report.blocking} blocking`);
  log(report.parity ? "PARITY PASS" : "PARITY FAIL");

  log("");
  for (const line of launchSummary(report)) log(line);
}
