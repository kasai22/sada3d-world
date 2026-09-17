import {
  CATALOG_CATEGORIES,
  CATALOG_ENTRIES,
  type CatalogEntry,
  type CategoryDefinition,
  factValue,
  type Fact,
} from "@/content/catalog";
import { MATERIALS as MATERIAL_CONTENT, type Material } from "@/content/materials";
import { COLORS } from "@/lib/catalog/taxonomy";
import { validateCatalog } from "@/lib/catalog/validation";

/**
 * What the import will write, worked out before anything is written.
 *
 * Pure: the canonical catalog in, a list of rows out. Nothing here touches
 * Payload or a database, which is what makes the plan — the flattening of the
 * tree, the publication decision for every row, the ordering that lets parents
 * exist before children — testable without either.
 *
 * `import.ts` takes these rows and writes them. It contains no decisions of its
 * own about *what* is published; those are all made here, from validation.
 */

export type RowStatus = "published" | "draft";

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export interface CategoryRow {
  value: string;
  name: string;
  description: string;
  /** The parent's `value`, or null for a top-level category. */
  parent: string | null;
  /** 0 for a root. Derived, not stored in the CMS. */
  depth: number;
  isBrowse: boolean;
  browseOrder: number;
  /**
   * Published only when a publishable product sits beneath it. A category
   * holding only drafts is written as a draft, so the public API never lists a
   * category with nothing in it.
   */
  status: RowStatus;
}

/** Parents first (breadth-first), so a child's parent already exists. */
export function planCategories(
  tree: readonly CategoryDefinition[] = CATALOG_CATEGORIES,
  entries: readonly CatalogEntry[] = CATALOG_ENTRIES,
): CategoryRow[] {
  const rows: CategoryRow[] = [];
  const publishable = validateCatalog(entries, tree).publishable.map((entry) => entry.product);

  const contains = (node: CategoryDefinition, category: string): boolean =>
    node.value === category || (node.children ?? []).some((child) => contains(child, category));

  /*
   * Browse roots in tree order: roots with a publishable product beneath them.
   * Deliberately not `BROWSE_CATEGORIES`, which depends on the catalog mode of
   * the running process — the CMS rows must be the same whichever mode plans
   * them. The launch storefront hides unapproved products at serve time.
   */
  const browseRoots = tree
    .filter((node) => publishable.some((product) => contains(node, product.category)))
    .map((node) => node.value);

  const walk = (nodes: readonly CategoryDefinition[], parent: string | null, depth: number) => {
    for (const node of nodes) {
      const browseIndex = browseRoots.indexOf(node.value);

      rows.push({
        value: node.value,
        name: node.label,
        description: node.description,
        parent,
        depth,
        isBrowse: depth === 0 && browseIndex !== -1,
        browseOrder: browseIndex === -1 ? 0 : browseIndex,
        status: publishable.some((product) => contains(node, product.category))
          ? "published"
          : "draft",
      });
    }

    for (const node of nodes) {
      if (node.children) walk(node.children, node.value, depth + 1);
    }
  };

  walk(tree, null, 0);
  return rows;
}

/* ------------------------------------------------------------------ *
 * Materials
 * ------------------------------------------------------------------ */

export interface MaterialRow {
  value: string;
  name: string;
  code: string;
  description: string;
  properties: { strength: number; flexibility: number; heat: number };
  technologies: string[];
  applications: string[];
  bestFor: string[];
  avoidFor: string[];
  surface: string;
  /** Hex, looked up from the colour vocabulary — the collection stores swatches. */
  swatches: string[];
  seo: { title: string; description: string };
  status: RowStatus;
}

/**
 * The canonical materials, one row each.
 *
 * The **price multiplier deliberately does not come across**: it is the number
 * a customer is charged by, and it stays in `lib/pricing` behind review and
 * tests rather than behind an editorial field.
 */
export function planMaterials(materials: readonly Material[] = MATERIAL_CONTENT): MaterialRow[] {
  return materials.map((material) => ({
    value: material.value,
    name: material.name,
    code: material.code,
    description: material.description,
    properties: { ...material.properties },
    technologies: [...material.technologies],
    applications: [...material.applications],
    bestFor: [...material.bestFor],
    avoidFor: [...material.avoidFor],
    surface: material.surface,
    swatches: material.colors
      .map((value) => COLORS.find((color) => color.value === value)?.hex)
      .filter((hex): hex is string => Boolean(hex)),
    seo: { ...material.seo },
    status: material.status,
  }));
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

export interface ProductRow {
  productId: string;
  slug: string;
  name: string;
  summary: string;
  description?: string;
  applications: string[];
  price: number;
  priceStatus: string;
  currency: "INR";
  availability: string;
  badge?: string;
  /** Category `value`, resolved to a Payload id by the importer. */
  category: string;
  browseCategory: string;
  /** Material `value`, resolved to a Payload id by the importer. */
  material: string;
  materials: string[];
  technology: string;
  color: string;
  colors: string[];
  qualityOptions: { value: string; label: string; layerHeight: string }[];
  specifications: { label: string; value: string }[];
  materialNotes: string[];
  model?: { url: string; format: string };
  seo: { title: string; description: string };
  approvalStatus: string;
  approval: { reference: string; approvedBy: string; approvedOn: string } | null;
  featured: boolean;
  /** A repository-hosted approved photo or render, when the product has one. */
  visual: { src: string; alt: string; kind: string } | null;
  priceApprovals: { amount: number; currency: "INR"; effectiveFrom: string; reference: string; approvedBy: string }[];
  /**
   * Stage 19.7. The queryable columns carry a value only when it is APPROVED, so
   * the admin list never shows a proposal as a decision; the full stated facts
   * travel in `commercialDefinition`.
   */
  sku: string | null;
  productClass: string | null;
  pricingModel: string | null;
  /** Stage 19.8 structured commercial fields, as the admin edits them. */
  customers: string[];
  useCase: string | null;
  visualRequirement: string | null;
  renderSpecification: string | null;
  weightGrams: number | null;
  /** Set only when every required commercial fact is APPROVED under one record. */
  commercialApproval: { reference: string; approvedBy: string; approvedOn: string } | null;
  openQuestions: {
    questionId: string;
    question: string;
    answer: "unanswered" | "yes" | "no";
    reference: string | null;
    approvedBy: string | null;
    approvedOn: string | null;
  }[];
  visualApproval: { reference: string; approvedBy: string; approvedOn: string } | null;
  /** Published only when intended for publication and valid. */
  status: RowStatus;
}

/**
 * The admin records one commercial approval per product. The canonical catalog
 * records one per fact; they map to the admin's record only when every required
 * fact is APPROVED under the same reference. Anything less maps to no approval —
 * never to a partial one.
 */
function sharedApproval(entry: CatalogEntry): ProductRow["commercialApproval"] {
  const c = entry.commercial;
  const facts: Fact<unknown>[] = [c.sku, c.productClass, c.pricingModel, c.customer, c.useCase, c.copy, c.visual.required];
  const approvals = facts.map((fact) => (fact.state === "APPROVED" ? fact.approval : undefined));
  const first = approvals[0];
  if (!first || approvals.some((a) => !a || a.reference !== first.reference)) return null;
  return { reference: first.reference, approvedBy: first.approvedBy, approvedOn: first.approvedOn };
}

function toProductRow(entry: CatalogEntry, status: RowStatus): ProductRow {
  const { product } = entry;

  return {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    summary: product.summary,
    ...(product.description ? { description: product.description } : {}),
    applications: [...(product.applications ?? [])],
    price: product.price,
    priceStatus: product.priceStatus ?? "provisional",
    currency: product.currency,
    availability: product.availability,
    ...(product.badge ? { badge: product.badge } : {}),
    category: product.category,
    browseCategory: product.browseCategory,
    material: product.material,
    // The default is always among the offered materials.
    materials: [...new Set([product.material, ...(product.materials ?? [])])],
    technology: product.technology,
    color: product.color,
    colors: [...(product.colors ?? [])],
    qualityOptions: (product.qualityOptions ?? []).map((option) => ({ ...option })),
    specifications: (product.specifications ?? []).map((spec) => ({ ...spec })),
    materialNotes: [...(product.materialNotes ?? [])],
    ...(product.model ? { model: { ...product.model } } : {}),
    seo: { title: product.name, description: product.description ?? product.summary },
    approvalStatus: product.approvalStatus ?? "draft",
    approval: entry.approval ? { ...entry.approval } : null,
    featured: product.featured === true,
    visual:
      product.image && product.image.kind
        ? { src: product.image.src, alt: product.image.alt, kind: product.image.kind }
        : null,
    priceApprovals: (entry.priceApprovals ?? []).map((record) => ({ ...record })),
    sku: factValue(entry.commercial.sku) ?? null,
    productClass: factValue(entry.commercial.productClass) ?? null,
    pricingModel: factValue(entry.commercial.pricingModel) ?? null,
    customers: [...(factValue(entry.commercial.customer) ?? [])],
    useCase: factValue(entry.commercial.useCase) ?? null,
    visualRequirement: factValue(entry.commercial.visual.required) ?? null,
    renderSpecification: factValue(entry.commercial.visual.renderSpecification) ?? null,
    weightGrams: factValue(entry.commercial.weightGrams) ?? null,
    commercialApproval: sharedApproval(entry),
    openQuestions: (entry.commercial.openQuestions ?? []).map((question) => ({
      questionId: question.id,
      question: question.question,
      answer: question.answer.state === "APPROVED" ? (question.answer.value === "YES" ? "yes" : "no") : "unanswered",
      reference: question.answer.state === "APPROVED" ? question.answer.approval.reference : null,
      approvedBy: question.answer.state === "APPROVED" ? question.answer.approval.approvedBy : null,
      approvedOn: question.answer.state === "APPROVED" ? question.answer.approval.approvedOn : null,
    })),
    visualApproval: product.image?.approval ? { ...product.image.approval } : null,
    status,
  };
}

export function planProducts(entries: readonly CatalogEntry[] = CATALOG_ENTRIES): ProductRow[] {
  const publishable = new Set(
    validateCatalog(entries).publishable.map((entry) => entry.product.id),
  );

  return entries.map((entry) =>
    toProductRow(entry, publishable.has(entry.product.id) ? "published" : "draft"),
  );
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export interface PlanProblem {
  subject: string;
  reason: string;
}

/**
 * Everything that stops the import before a single row is written.
 *
 * `validateCatalog` is the rule set. An entry intended for publication that
 * fails it stops the import rather than being quietly demoted to a draft:
 * somebody decided to publish it, so somebody should hear that it cannot be.
 */
export function validatePlan(entries: readonly CatalogEntry[] = CATALOG_ENTRIES): PlanProblem[] {
  const problems: PlanProblem[] = validateCatalog(entries).issues.map((issue) => ({
    subject: issue.subject,
    reason: `[${issue.code}] ${issue.message}`,
  }));

  const categories = new Set(planCategories(CATALOG_CATEGORIES, entries).map((row) => row.value));
  for (const row of planCategories(CATALOG_CATEGORIES, entries)) {
    if (row.parent && !categories.has(row.parent)) {
      problems.push({ subject: row.value, reason: `Parent "${row.parent}" is not in the taxonomy.` });
    }
  }

  // Stage 20: a SKU identifies one product. Two seeds sharing one stop the import.
  const skus = new Map<string, string>();
  for (const row of planProducts(entries)) {
    if (!row.sku) continue;
    const other = skus.get(row.sku);
    if (other) problems.push({ subject: row.productId, reason: `SKU "${row.sku}" is also used by ${other}.` });
    else skus.set(row.sku, row.productId);
  }

  const materials = new Set(planMaterials().map((row) => row.value));
  for (const row of planProducts(entries)) {
    for (const material of row.materials) {
      if (!materials.has(material)) {
        problems.push({ subject: row.productId, reason: `Material "${material}" is not a canonical material.` });
      }
    }
  }

  return problems;
}
