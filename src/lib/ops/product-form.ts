import { skuProblem } from "@/lib/catalog/sku";

/**
 * The Reality 3D product form (create and edit) — its fields, sections and
 * shape checks. Pure and client-safe: the form and the server share it.
 *
 * This module decides nothing about the catalog. It checks that input is
 * well-formed (lengths, a number is a number, a SKU has the SKU shape) and
 * maps it onto the Products collection's own fields. Every business rule —
 * capability status, approved colours and layer heights, the workflow, the
 * approval guard, uniqueness — is Payload's, and runs on save.
 */

export const PRODUCT_SECTIONS = ["overview", "manufacturing", "pricing", "media", "model", "seo"] as const;
export type ProductSection = (typeof PRODUCT_SECTIONS)[number];

export const SECTION_LABEL: Record<ProductSection, string> = {
  overview: "Overview",
  manufacturing: "Manufacturing",
  pricing: "Pricing",
  media: "Media",
  model: "3D model",
  seo: "SEO",
};

export interface ProductFormValues {
  name: string;
  sku: string;
  slug: string;
  summary: string;
  description: string;
  categoryId: string;
  customers: string;
  useCase: string;
  applications: string;
  technology: string;
  materialId: string;
  color: string;
  /** Quality option values, e.g. "standard". */
  qualities: string[];
  productClass: string;
  pricingModel: string;
  price: string;
  availability: string;
  visualSrc: string;
  visualAlt: string;
  visualKind: string;
  visualRequirement: string;
  renderSpecification: string;
  imageId: string;
  modelUrl: string;
  modelFormat: string;
  seoTitle: string;
  seoDescription: string;
}

export type ProductField = keyof ProductFormValues;
export type FieldErrors = Partial<Record<ProductField, string>>;

export const SECTION_FIELDS: Record<ProductSection, readonly ProductField[]> = {
  overview: ["name", "sku", "slug", "summary", "description", "categoryId", "customers", "useCase", "applications"],
  manufacturing: ["technology", "materialId", "color", "qualities"],
  pricing: ["productClass", "pricingModel", "price", "availability"],
  media: ["visualSrc", "visualAlt", "visualKind", "visualRequirement", "renderSpecification", "imageId"],
  model: ["modelUrl", "modelFormat"],
  seo: ["seoTitle", "seoDescription"],
};

export const sectionOfField = (field: ProductField): ProductSection =>
  PRODUCT_SECTIONS.find((section) => SECTION_FIELDS[section].includes(field)) ?? "overview";

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  sku: "",
  slug: "",
  summary: "",
  description: "",
  categoryId: "",
  customers: "",
  useCase: "",
  applications: "",
  technology: "",
  materialId: "",
  color: "",
  qualities: [],
  productClass: "",
  pricingModel: "",
  price: "",
  availability: "made-to-order",
  visualSrc: "",
  visualAlt: "",
  visualKind: "",
  visualRequirement: "",
  renderSpecification: "",
  imageId: "",
  modelUrl: "",
  modelFormat: "",
  seoTitle: "",
  seoDescription: "",
};

export const LIMITS: Partial<Record<ProductField, number>> = {
  name: 120,
  sku: 32,
  slug: 96,
  summary: 200,
  description: 1200,
  customers: 600,
  useCase: 400,
  applications: 600,
  visualSrc: 200,
  visualAlt: 200,
  renderSpecification: 1000,
  modelUrl: 200,
  seoTitle: 120,
  seoDescription: 320,
};

const CHOICES: Partial<Record<ProductField, readonly string[]>> = {
  productClass: ["STANDARD_CATALOG_PRODUCT", "CONFIGURABLE_PRODUCT", "QUOTE_ONLY_PRODUCT"],
  pricingModel: ["FIXED", "CONFIGURABLE", "QUOTE_ONLY"],
  availability: ["made-to-order", "in-stock"],
  visualKind: ["photo", "render"],
  visualRequirement: ["REAL_PHOTO", "APPROVED_RENDER"],
  modelFormat: ["stl", "obj", "glb", "gltf"],
};

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MODEL_PATH_PATTERN = /^\/models\/[a-z0-9]+(?:-[a-z0-9]+)*\.(stl|obj|glb|gltf)$/;

/** A URL segment from a product name: "Spur Gear, 24T" → "spur-gear-24t". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug);
}

/** One entry per line or comma, trimmed, empties dropped. */
export const splitList = (text: string): string[] =>
  text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export interface ParsedProductForm {
  values: ProductFormValues;
  errors: FieldErrors;
}

/**
 * Reads the submitted form for the given sections. Missing fields read as
 * empty. Errors are for malformed input only; required-ness is checked here
 * for the fields every product must have, so an incomplete form never reaches
 * the CMS.
 */
export function parseProductForm(form: FormData, sections: readonly ProductSection[]): ParsedProductForm {
  const text = (key: ProductField) => {
    const raw = form.get(key);
    return typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  };

  const values: ProductFormValues = {
    ...EMPTY_PRODUCT_FORM,
    ...Object.fromEntries(
      (Object.keys(EMPTY_PRODUCT_FORM) as ProductField[])
        .filter((key) => key !== "qualities")
        .map((key) => [key, text(key)]),
    ),
    qualities: form
      .getAll("qualities")
      .filter((value): value is string => typeof value === "string" && value.trim() !== "")
      .map((value) => value.trim()),
  };
  values.sku = values.sku.toUpperCase();
  values.slug = values.slug.toLowerCase();

  const errors: FieldErrors = {};
  const fields = new Set(sections.flatMap((section) => SECTION_FIELDS[section]));
  const need = (key: ProductField, message: string) => {
    if (fields.has(key) && !values[key]) errors[key] = message;
  };

  if (fields.has("name") && !values.slug) values.slug = slugify(values.name);

  need("name", "Product name is required.");
  need("summary", "A one-line summary is required.");
  need("categoryId", "Category is required.");
  need("technology", "Choose a manufacturing process.");
  need("materialId", "Choose a material.");
  need("color", "Choose a colour.");

  for (const [key, max] of Object.entries(LIMITS) as [ProductField, number][]) {
    if (fields.has(key) && typeof values[key] === "string" && (values[key] as string).length > max) {
      errors[key] ??= `Limited to ${max} characters.`;
    }
  }

  for (const [key, allowed] of Object.entries(CHOICES) as [ProductField, readonly string[]][]) {
    const value = values[key];
    if (fields.has(key) && typeof value === "string" && value && !allowed.includes(value)) errors[key] = "Choose one of the listed options.";
  }

  if (fields.has("sku")) {
    const problem = skuProblem(values.sku);
    if (problem) errors.sku = `Invalid SKU format. ${problem}`;
  }
  if (fields.has("slug") && values.slug && !SLUG_PATTERN.test(values.slug)) {
    errors.slug = "Lowercase letters and digits joined by single hyphens, e.g. spur-gear-24t.";
  }
  for (const key of ["categoryId", "materialId", "imageId"] as const) {
    if (fields.has(key) && values[key] && !/^\d{1,12}$/.test(values[key])) errors[key] = "Choose one of the listed options.";
  }
  if (fields.has("price")) {
    if (values.price === "") values.price = "0";
    if (!/^\d{1,9}$/.test(values.price)) errors.price = "Whole rupees, e.g. 450. Use 0 for a quote-only product.";
  }
  if (fields.has("modelUrl") && values.modelUrl && !MODEL_PATH_PATTERN.test(values.modelUrl)) {
    errors.modelUrl = 'A model path looks like "/models/part-name.stl": lowercase, hyphenated, under /models/.';
  }
  if (fields.has("visualSrc") && values.visualSrc && !/^\/[a-z0-9/_.-]+$/i.test(values.visualSrc)) {
    errors.visualSrc = 'An image path on this site, e.g. "/catalog/spur-gear-24t/front.jpg".';
  }
  if (fields.has("qualities") && values.qualities.some((value) => !/^[a-z0-9-]{1,32}$/.test(value))) {
    errors.qualities = "Choose from the listed layer heights.";
  }

  return { values, errors };
}

/** The first section holding an error, so the form can open it. */
export function firstErrorSection(errors: FieldErrors): ProductSection | null {
  const field = (Object.keys(errors) as ProductField[])[0];
  return field ? sectionOfField(field) : null;
}

/* ------------------------------------------------------------------ *
 * Options the form offers (built on the server from the domain)
 * ------------------------------------------------------------------ */

export type CapabilityState = "AVAILABLE" | "COMING_SOON" | "UNAVAILABLE";

export interface ProductFormOptions {
  categories: { id: number; label: string; browseLabel: string | null }[];
  technologies: { value: string; label: string; status: CapabilityState }[];
  materials: { id: number; label: string; value: string; status: CapabilityState }[];
  colours: { value: string; label: string }[];
  qualities: { value: string; label: string; layerHeight: string }[];
  media: { id: number; label: string }[];
  /** Finishes are not a product field; shown for context only. */
  comingSoonFinishes: string[];
}

export const CAPABILITY_SUFFIX: Record<CapabilityState, string> = {
  AVAILABLE: "",
  COMING_SOON: " — Coming Soon",
  UNAVAILABLE: " — Not available",
};

/**
 * Maps a Payload error onto form fields. Payload's field validation reports a
 * path per field; the product hooks raise one message, matched by subject.
 * Anything unmatched is shown as the form's message, verbatim.
 */
export function fieldForMessage(message: string, path?: string): ProductField | null {
  const byPath: Record<string, ProductField> = {
    name: "name",
    sku: "sku",
    slug: "slug",
    summary: "summary",
    category: "categoryId",
    browseCategory: "categoryId",
    technology: "technology",
    material: "materialId",
    materials: "materialId",
    color: "color",
    colors: "color",
    qualityOptions: "qualities",
    price: "price",
    priceStatus: "price",
    productClass: "productClass",
    pricingModel: "pricingModel",
    availability: "availability",
    "visual.src": "visualSrc",
    "model.url": "modelUrl",
    image: "imageId",
  };
  if (path) {
    const root = path.replace(/\.\d+(\..*)?$/, "").replace(/\.(value|layerHeight)$/, "");
    if (byPath[path]) return byPath[path];
    if (byPath[root]) return byPath[root];
    const head = root.split(".")[0] ?? "";
    if (byPath[head]) return byPath[head];
  }
  if (/\bSKU\b/i.test(message)) return "sku";
  if (/\bslug\b/i.test(message)) return "slug";
  if (/model path/i.test(message)) return "modelUrl";
  if (/manufacturing process/i.test(message)) return "technology";
  if (/\bmaterial\b/i.test(message)) return "materialId";
  if (/colour/i.test(message)) return "color";
  if (/layer height/i.test(message)) return "qualities";
  if (/quote-only|price/i.test(message)) return "price";
  if (/media|image source/i.test(message)) return "visualSrc";
  return null;
}
