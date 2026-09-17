import type { Payload, TypedUser } from "payload";

import { capabilities, capabilityStatus, processOf } from "@/content/catalog/capabilities";
import { QUALITY_OPTIONS } from "@/lib/custom-print/options";
import { APPROVED_COLOUR_VALUES, SELECTABLE_PROCESS_VALUES } from "@/payload/product-hooks";
import type { Category, Material, Media, Product as PayloadProduct } from "@/payload-types";

import type { OperatorSession } from "./operator";
import { payloadInstance, requestHeaders } from "./payload";
import {
  SECTION_FIELDS,
  fieldForMessage,
  splitList,
  type CapabilityState,
  type FieldErrors,
  type ProductFormOptions,
  type ProductFormValues,
  type ProductSection,
} from "./product-form";

/**
 * Product create and edit for Reality 3D Admin.
 *
 * A user interface over the existing product domain, not a second one:
 *
 *   · Persistence is the Products collection, through Payload's local API, as
 *     the signed-in Payload user with access control on. Every collection hook
 *     runs — the product id, source marking, the workflow (SKU shape, quote-only
 *     price, approval records), capability status, the approval guard and
 *     revalidation — and Payload's field validation runs too (required fields,
 *     approved technology, colour and layer height, relationship filters).
 *
 *   · A new product is created **unpublished and in approval status draft**.
 *     The create is a full (validated) save with `_status: "draft"`, not a
 *     Payload "draft save", because Payload skips field validation on draft
 *     saves. Nothing approves, publishes or approves a price or media here.
 *
 *   · Editing a product that has never been published is a validated save that
 *     keeps it unpublished. Editing a published product saves a new draft
 *     version (Payload's own behaviour, which leaves the live version alone);
 *     Payload skips field validation there, so the form's choices are checked
 *     against the same option lists the collection validates with.
 *
 * The checks done here before Payload is called only make refusals readable
 * (a duplicate SKU is a sentence, not a database error). Payload decides.
 */

export type ProductSaveResult =
  | { ok: true; id: number; message: string; /** The catalog product id, e.g. "p-104", when the save returned it. */ productId?: string }
  | { ok: false; message: string; errors: FieldErrors };

const UNAUTHORIZED: ProductSaveResult = { ok: false, message: "Unauthorized.", errors: {} };

/* ------------------------------------------------------------------ *
 * Options
 * ------------------------------------------------------------------ */

const statusOf = (kind: "technology" | "material", value: string): CapabilityState => capabilityStatus(kind, value);

export async function getProductFormOptions(_operator: OperatorSession): Promise<ProductFormOptions> {
  const payload = await payloadInstance();
  const [categories, materials, media] = await Promise.all([
    payload.find({ collection: "categories", draft: true, depth: 0, pagination: false, overrideAccess: true, sort: "name" }),
    payload.find({ collection: "materials", draft: true, depth: 0, pagination: false, overrideAccess: true, sort: "name" }),
    payload.find({ collection: "media", depth: 0, limit: 200, overrideAccess: true, sort: "-updatedAt" }),
  ]);

  const docs = categories.docs as Category[];
  const byId = new Map(docs.map((doc) => [doc.id, doc]));

  return {
    categories: docs
      .map((doc) => {
        const root = browseRootOf(doc.id, byId);
        return {
          id: doc.id,
          label: `${doc.name}${doc._status === "published" ? "" : " (draft)"}`,
          browseLabel: root ? byId.get(root)?.name ?? null : null,
        };
      })
      .sort((a, b) => `${a.browseLabel ?? ""} ${a.label}`.localeCompare(`${b.browseLabel ?? ""} ${b.label}`)),
    technologies: capabilities("technology")
      .filter((row) => SELECTABLE_PROCESS_VALUES.includes(row.value))
      .map((row) => ({ value: row.value, label: row.label, status: row.status })),
    materials: (materials.docs as Material[])
      .map((doc) => ({ id: doc.id, label: doc.name, value: doc.value, status: statusOf("material", doc.value) }))
      // What the collection's material filter accepts: published and available, or coming soon.
      .filter((row, index) => {
        const doc = (materials.docs as Material[])[index]!;
        return row.status === "COMING_SOON" || (row.status === "AVAILABLE" && doc._status === "published");
      }),
    colours: APPROVED_COLOUR_VALUES.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) })),
    qualities: QUALITY_OPTIONS.map((quality) => ({ value: quality.value, label: quality.label, layerHeight: quality.layerHeight })),
    media: (media.docs as Media[]).map((doc) => ({ id: doc.id, label: doc.alt || doc.filename || `Media #${doc.id}` })),
    comingSoonFinishes: capabilities("finish")
      .filter((row) => row.status === "COMING_SOON")
      .map((row) => row.label),
  };
}

/** The browse category a category files under: itself if it is one, else its nearest browse ancestor. */
function browseRootOf(id: number, byId: ReadonlyMap<number, Category>): number | null {
  const seen = new Set<number>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    if (current.isBrowse) return current.id;
    seen.add(current.id);
    const parent = typeof current.parent === "object" && current.parent !== null ? current.parent.id : current.parent;
    current = typeof parent === "number" ? byId.get(parent) : undefined;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Form values ↔ product fields
 * ------------------------------------------------------------------ */

const orNull = (value: string) => (value === "" ? null : value);

export function valuesFromProduct(doc: PayloadProduct): ProductFormValues {
  const id = (value: unknown) =>
    typeof value === "number" ? String(value) : typeof value === "object" && value !== null && "id" in value ? String((value as { id: number }).id) : "";
  return {
    name: doc.name ?? "",
    sku: doc.sku ?? "",
    slug: doc.slug ?? "",
    summary: doc.summary ?? "",
    description: doc.description ?? "",
    categoryId: id(doc.category),
    customers: (doc.customers ?? []).map((entry) => entry.value).join("\n"),
    useCase: doc.useCase ?? "",
    applications: (doc.applications ?? []).map((entry) => entry.value).join("\n"),
    technology: doc.technology ?? "",
    materialId: id(doc.material),
    color: doc.color ?? "",
    qualities: (doc.qualityOptions ?? []).map((option) => option.value),
    productClass: doc.productClass ?? "",
    pricingModel: doc.pricingModel ?? "",
    price: String(doc.price ?? 0),
    availability: doc.availability ?? "made-to-order",
    visualSrc: doc.visual?.src ?? "",
    visualAlt: doc.visual?.alt ?? "",
    visualKind: doc.visual?.kind ?? "",
    visualRequirement: doc.visualRequirement ?? "",
    renderSpecification: doc.renderSpecification ?? "",
    imageId: id(doc.image),
    modelUrl: doc.model?.url ?? "",
    modelFormat: doc.model?.format ?? "",
    seoTitle: doc.seo?.title ?? "",
    seoDescription: doc.seo?.description ?? "",
  };
}

interface Context {
  options: ProductFormOptions;
  browseCategoryId: number | null;
  existing: PayloadProduct | null;
}

/**
 * The Products collection data for the given sections. Approval fields are
 * never written, except that a media approval is cleared when the image it
 * approved is replaced — an approval confirms one image, not whatever is put
 * there next.
 */
export function productData(values: ProductFormValues, sections: readonly ProductSection[], context: Context): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const has = (section: ProductSection) => sections.includes(section);
  const { existing } = context;

  if (has("overview")) {
    Object.assign(data, {
      name: values.name,
      sku: orNull(values.sku),
      slug: values.slug,
      summary: values.summary,
      description: orNull(values.description),
      category: Number(values.categoryId),
      browseCategory: context.browseCategoryId,
      customers: splitList(values.customers).map((value) => ({ value })),
      useCase: orNull(values.useCase),
      applications: splitList(values.applications).map((value) => ({ value })),
    });
  }

  if (has("manufacturing")) {
    const qualities = context.options.qualities.filter((quality) => values.qualities.includes(quality.value));
    const previousMaterial = existing ? String(typeof existing.material === "object" ? existing.material?.id : existing.material) : null;
    const otherMaterials = (existing?.materials ?? [])
      .map((entry) => (typeof entry === "object" ? entry.id : entry))
      .filter((entry) => String(entry) !== values.materialId && String(entry) !== previousMaterial);
    const otherColours = (existing?.colors ?? []).map((entry) => entry.value).filter((value) => value !== values.color && value !== existing?.color);
    Object.assign(data, {
      technology: values.technology,
      material: Number(values.materialId),
      // The default is always offered; other offered materials and colours are kept.
      materials: [Number(values.materialId), ...otherMaterials],
      color: values.color,
      colors: [{ value: values.color }, ...otherColours.map((value) => ({ value }))],
      qualityOptions: qualities.map(({ value, label, layerHeight }) => ({ value, label, layerHeight })),
    });
  }

  if (has("pricing")) {
    const price = Number(values.price);
    const keepApproved = existing?.priceStatus === "approved" && existing.price === price;
    Object.assign(data, {
      productClass: orNull(values.productClass),
      pricingModel: orNull(values.pricingModel),
      price,
      // Derived, never chosen: 0 is quote-only; any figure is provisional until a price approval matches it.
      priceStatus: price === 0 ? "quote-only" : keepApproved ? "approved" : "provisional",
      currency: "INR",
      availability: values.availability || "made-to-order",
    });
  }

  if (has("media")) {
    const before = existing?.visual;
    const imageChanged = !before || (before.src ?? "") !== values.visualSrc || (before.kind ?? "") !== values.visualKind;
    const approval = imageChanged
      ? { reference: null, approvedBy: null, approvedOn: null }
      : { reference: before?.approval?.reference ?? null, approvedBy: before?.approval?.approvedBy ?? null, approvedOn: before?.approval?.approvedOn ?? null };
    Object.assign(data, {
      visual: { src: orNull(values.visualSrc), alt: orNull(values.visualAlt), kind: orNull(values.visualKind), approval },
      visualRequirement: orNull(values.visualRequirement),
      renderSpecification: orNull(values.renderSpecification),
      image: values.imageId ? Number(values.imageId) : null,
    });
  }

  if (has("model")) {
    data.model = { url: orNull(values.modelUrl), format: orNull(values.modelFormat) };
  }

  if (has("seo")) {
    const ogImage = existing?.seo?.ogImage;
    data.seo = {
      title: orNull(values.seoTitle),
      description: orNull(values.seoDescription),
      ogImage: typeof ogImage === "object" && ogImage !== null ? ogImage.id : (ogImage ?? null),
    };
  }

  return data;
}

/**
 * Readable refusals before Payload is asked: the choice is one the form
 * offered, and the identifiers are not taken. Payload re-checks all of it.
 */
async function precheck(
  payload: Payload,
  values: ProductFormValues,
  sections: readonly ProductSection[],
  options: ProductFormOptions,
  selfId: number | null,
): Promise<{ errors: FieldErrors; browseCategoryId: number | null }> {
  const errors: FieldErrors = {};
  const fields = new Set(sections.flatMap((section) => SECTION_FIELDS[section]));
  let browseCategoryId: number | null = null;

  if (fields.has("categoryId") && values.categoryId) {
    const categories = await payload.find({ collection: "categories", draft: true, depth: 0, pagination: false, overrideAccess: true });
    const byId = new Map((categories.docs as Category[]).map((doc) => [doc.id, doc]));
    if (!byId.has(Number(values.categoryId))) errors.categoryId = "That category no longer exists. Choose another.";
    else {
      browseCategoryId = browseRootOf(Number(values.categoryId), byId);
      if (browseCategoryId === null) errors.categoryId = "This category is not under a browse category, so the product would have no storefront address.";
    }
  }

  if (fields.has("technology") && values.technology) {
    const option = options.technologies.find((row) => row.value === values.technology);
    if (!option) errors.technology = `"${values.technology}" is not an available or planned manufacturing process.`;
  }
  if (fields.has("materialId") && values.materialId) {
    const option = options.materials.find((row) => String(row.id) === values.materialId);
    if (!option) errors.materialId = "Material unavailable: it is neither approved and published nor on the Coming Soon roadmap.";
  }
  if (fields.has("color") && values.color && !options.colours.some((row) => row.value === values.color)) {
    errors.color = `"${values.color}" is not an approved production colour.`;
  }
  if (fields.has("qualities")) {
    const unknown = values.qualities.filter((value) => !options.qualities.some((row) => row.value === value));
    if (unknown.length > 0) errors.qualities = "Only approved layer heights can be offered.";
    const technology = values.technology;
    if (values.qualities.length > 0 && technology && technology !== "fdm") {
      errors.qualities = "Approved layer heights are FDM heights; none is recorded for this process. Invalid manufacturing combination.";
    }
  }
  if (fields.has("materialId") && fields.has("technology") && values.materialId && values.technology) {
    const material = options.materials.find((row) => String(row.id) === values.materialId);
    const process = material ? processOf(material.value) : undefined;
    if (material && process && process !== values.technology) {
      errors.materialId = `Invalid manufacturing combination: ${material.label} is a ${process.toUpperCase()} material, not ${values.technology.toUpperCase()}.`;
    }
  }
  if (fields.has("price") && values.productClass === "QUOTE_ONLY_PRODUCT" && values.price !== "0") {
    errors.price = "A quote-only product has no catalog price: enter 0.";
  }

  const taken = async (field: "sku" | "slug", value: string) => {
    if (!value) return false;
    const found = await payload.find({
      collection: "products",
      where: { [field]: { equals: value } },
      draft: true,
      depth: 0,
      limit: 2,
      overrideAccess: true,
      context: { launchStatusNested: true },
    });
    return found.docs.some((doc) => doc.id !== selfId);
  };
  if (fields.has("sku") && values.sku && !errors.sku && (await taken("sku", values.sku))) errors.sku = "SKU already exists on another product.";
  if (fields.has("slug") && values.slug && !errors.slug && (await taken("slug", values.slug))) {
    errors.slug = "Another product already uses this URL segment. Change the slug.";
  }

  return { errors, browseCategoryId };
}

/** Payload's refusal, as field errors and a message. Never "something went wrong" for a rule it stated. */
export function refusalFrom(error: unknown): { message: string; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const record = typeof error === "object" && error !== null ? (error as { message?: unknown; data?: unknown }) : {};
  const listed = (record.data as { errors?: { message?: string; path?: string }[] } | undefined)?.errors ?? [];
  for (const entry of listed) {
    const field = fieldForMessage(entry.message ?? "", entry.path);
    if (field && entry.message) errors[field] ??= entry.message;
  }
  const message = typeof record.message === "string" && record.message ? record.message : "The CMS refused the change.";

  if (listed.length === 0) {
    if (/duplicate key|unique/i.test(message)) {
      const field = /slug/i.test(message) ? "slug" : "sku";
      errors[field] = field === "sku" ? "SKU already exists on another product." : "Another product already uses this URL segment.";
      return { message: "A product with the same identifier already exists.", errors };
    }
    // A workflow or capability refusal names its subject; put it by that field too.
    const field = fieldForMessage(message);
    if (field) errors[field] = message;
  }
  return { message: listed.length > 0 ? "Some fields need attention." : message, errors };
}

async function signedInUser(payload: Payload, operator: OperatorSession): Promise<TypedUser | null> {
  const { user } = await payload.auth({ headers: await requestHeaders() });
  if (!user || user.collection !== "users" || String(user.id) !== operator.id) return null;
  return user;
}

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */

export async function createProduct(operator: OperatorSession, values: ProductFormValues): Promise<ProductSaveResult> {
  const payload = await payloadInstance();
  const user = await signedInUser(payload, operator);
  if (!user) return UNAUTHORIZED;

  const sections = ["overview", "manufacturing", "pricing", "media", "model", "seo"] as const;
  const options = await getProductFormOptions(operator);
  const checked = await precheck(payload, values, sections, options, null);
  if (Object.keys(checked.errors).length > 0) return { ok: false, message: "Some fields need attention.", errors: checked.errors };

  try {
    const created = await payload.create({
      collection: "products",
      // A validated save of an unpublished draft product: see the module note.
      draft: false,
      depth: 0,
      user,
      overrideAccess: false,
      data: {
        ...productData(values, sections, { options, browseCategoryId: checked.browseCategoryId, existing: null }),
        _status: "draft",
        approvalStatus: "draft",
      } as never,
    });
    return { ok: true, id: created.id, productId: typeof created.productId === "string" ? created.productId : undefined, message: "Product created as an unpublished draft." };
  } catch (error) {
    return { ok: false, ...refusalFrom(error) };
  }
}

/* ------------------------------------------------------------------ *
 * Edit
 * ------------------------------------------------------------------ */

export async function updateProductSection(
  operator: OperatorSession,
  id: number,
  section: ProductSection,
  values: ProductFormValues,
): Promise<ProductSaveResult> {
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: "That product does not exist.", errors: {} };
  const payload = await payloadInstance();
  const user = await signedInUser(payload, operator);
  if (!user) return UNAUTHORIZED;

  let existing: PayloadProduct;
  let live: PayloadProduct | undefined;
  try {
    [existing, live] = await Promise.all([
      payload.findByID({ collection: "products", id, draft: true, depth: 0, overrideAccess: true, context: { launchStatusNested: true } }) as Promise<PayloadProduct>,
      payload
        .find({ collection: "products", where: { id: { equals: id } }, depth: 0, limit: 1, overrideAccess: true, draft: false })
        .then((result) => result.docs[0] as PayloadProduct | undefined),
    ]);
  } catch {
    return { ok: false, message: "That product does not exist.", errors: {} };
  }

  // A section is saved on its own, but the checks that span sections see the whole product.
  const merged: ProductFormValues = { ...valuesFromProduct(existing), ...pick(values, SECTION_FIELDS[section]) };
  const sections = [section];
  const options = await getProductFormOptions(operator);
  const checked = await precheck(payload, merged, sections, options, id);
  if (Object.keys(checked.errors).length > 0) return { ok: false, message: "Some fields need attention.", errors: checked.errors };

  const data = productData(merged, sections, { options, browseCategoryId: checked.browseCategoryId, existing });
  const published = live?._status === "published";

  try {
    await payload.update({
      collection: "products",
      id,
      depth: 0,
      user,
      overrideAccess: false,
      // Never published: a validated save that stays unpublished. Published: a new draft version; the live one is untouched.
      ...(published ? { draft: true, data: data as never } : { draft: false, data: { ...data, _status: "draft" } as never }),
    });
  } catch (error) {
    return { ok: false, ...refusalFrom(error) };
  }

  return {
    ok: true,
    id,
    message: published
      ? "Saved as a draft version. The published product is unchanged until it is published again."
      : "Saved. The product stays an unpublished draft.",
  };
}

function pick(values: ProductFormValues, fields: readonly (keyof ProductFormValues)[]): Partial<ProductFormValues> {
  return Object.fromEntries(fields.map((field) => [field, values[field]]));
}

/* ------------------------------------------------------------------ *
 * Identity (Stage 22.7)
 * ------------------------------------------------------------------ */

/** The catalog product id (`p-101`) of a CMS product, or null when there is no such product. */
export async function catalogIdOf(_operator: OperatorSession, id: number): Promise<string | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const payload = await payloadInstance();
  try {
    const doc = (await payload.findByID({
      collection: "products",
      id,
      draft: true,
      depth: 0,
      overrideAccess: true,
      select: { productId: true },
      context: { launchStatusNested: true },
    })) as { productId?: unknown };
    return typeof doc.productId === "string" && doc.productId ? doc.productId : null;
  } catch {
    return null;
  }
}
