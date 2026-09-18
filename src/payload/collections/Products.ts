import type { CollectionConfig, Where } from "payload";

import { APIError, type CollectionBeforeChangeHook } from "payload";

import { effectivePriceApproval } from "../../lib/catalog/commerce";
import {
  APPROVED_COLOUR_VALUES,
  APPROVED_FDM_LAYER_HEIGHTS,
  APPROVED_PROCESS_VALUES,
  COMING_SOON_MATERIAL_VALUES,
  SELECTABLE_PROCESS_VALUES,
  TECHNOLOGY_SELECT_OPTIONS,
  assignProductId,
  enforceApprovalPrerequisites,
  markSource,
} from "../product-hooks";
import { adminsOnly, publishedOrAdmin } from "../access";
import { LAUNCH_STATUS_FIELDS } from "../launch-status";
import { revalidateContent } from "../revalidate";
import { capabilityProblems, checkProductWrite, type ProductWrite } from "../workflow";
import { skuProblem } from "../../lib/catalog/sku";
import { SALES_CLAIM } from "../../lib/catalog/merchandising";

/**
 * Enforces the product workflow on every save — in the admin, through the API
 * and during imports alike. See `payload/workflow.ts` for the rules.
 */
const enforceWorkflow: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const merged = { ...(originalDoc ?? {}), ...data } as ProductWrite & { id?: number };

  let effectiveApprovedAmount: number | undefined;
  if (merged.priceStatus === "approved" && originalDoc?.id) {
    const records = await req.payload.find({
      collection: "price-approvals",
      where: { product: { equals: originalDoc.id } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    });
    effectiveApprovedAmount = effectivePriceApproval(
      records.docs.map((doc) => ({
        amount: doc.amount,
        currency: "INR" as const,
        effectiveFrom: String(doc.effectiveFrom).slice(0, 10),
        reference: doc.reference,
        approvedBy: doc.approvedBy,
      })),
    )?.amount;
  }

  /*
   * Stage 19.9: capability status. A Coming Soon process or material may be
   * drafted; it may not be published. Checked on every write, the admin and the
   * API alike, before anything is stored.
   */
  const materialRef = (merged as { material?: unknown }).material;
  const materialId = typeof materialRef === "object" && materialRef !== null ? (materialRef as { id?: number }).id : materialRef;
  let materialValue: string | undefined;
  if (typeof materialId === "number" || typeof materialId === "string") {
    const material = await req.payload
      .findByID({ collection: "materials", id: materialId, depth: 0, overrideAccess: true, draft: true, req })
      .catch(() => null);
    materialValue = material?.value;
  }
  const problems = capabilityProblems(
    { technology: (merged as { technology?: string }).technology, material: materialValue },
    (merged as { _status?: string })._status === "published",
  );
  if (problems.length > 0) throw new APIError(problems.join(" "), 400, null, true);

  const result = checkProductWrite(merged, {
    userName: (req.user as { name?: string } | null | undefined)?.name ?? null,
    today: new Date().toISOString().slice(0, 10),
    effectiveApprovedAmount,
    creating: !originalDoc,
  });

  if (result.errors.length > 0) {
    throw new APIError(result.errors.join(" "), 400, null, true);
  }

  return {
    ...data,
    // Stage 20: an emptied SKU is stored as no SKU, so two products without one never collide on the unique index.
    ...(typeof data.sku === "string" && data.sku.trim() === "" ? { sku: null } : {}),
    ...(result.data.approval ? { approval: result.data.approval } : {}),
    ...(result.data.commercialApproval ? { commercialApproval: result.data.commercialApproval } : {}),
    ...(result.data.visual ? { visual: result.data.visual } : {}),
    ...(result.data.openQuestions ? { openQuestions: result.data.openQuestions } : {}),
  };
};

/**
 * The catalog.
 *
 * Field-for-field the `Product` the storefront already consumes, so the mapping
 * out of Payload is a rename and not an interpretation. Nothing is added that
 * the domain has no use for, and nothing the domain needs is missing — a
 * product that could not round-trip would be a product the marketplace could
 * not render.
 *
 * ── Identity is `productId`, not the Payload id ──────────────────────────
 *
 * Every cart line and every saved item refers to a product by an id such as
 * "p-101" (order items snapshot name and price instead). A cart holds the id and nothing else
 * about the product, so if the identifier changed when the catalog moved into
 * the CMS, every cart in every browser would resolve to nothing and every saved
 * item would report the part as gone.
 *
 * `productId` is therefore unique, indexed and required, and it is what the
 * domain reads. The same rule protects `slug`, which is half of every
 * /shop/[category]/[slug] URL in existence.
 *
 * ── Three states, not two ────────────────────────────────────────────────
 *
 * A product can exist internally, be published publicly, and be available to
 * order — and those are three different facts:
 *
 *   draft / published   editorial. Drafts are invisible to the public, enforced
 *                       by the access rule, in the database, on every query.
 *   availability        commercial. `made-to-order` is published and buyable
 *                       and simply not on a shelf.
 *   price 0             quote-only. Bought through custom print, never added to
 *                       a cart at a catalog price.
 *
 * Unpublishing is how a part leaves the storefront. Deleting is not: a deleted
 * product breaks every cart and saved item that referenced it, and the honest
 * behaviour for those — the entry survives and says the part is unavailable —
 * is one the customer should reach by the part being withdrawn, not by a row
 * disappearing.
 */
export const Products: CollectionConfig = {
  slug: "products",
  admin: {
    useAsTitle: "name",
    defaultColumns: [
      "name",
      "sku",
      "category",
      "material",
      "productClass",
      "price",
      "mediaStatus",
      "approvalStatus",
      "launchStage",
      "readiness",
      "featured",
      "updatedAt",
    ],
    // Category, material, class and approval status are available as list filters.
    listSearchableFields: ["name", "sku", "slug", "productId"],
    group: "Catalog",
    description:
      "The Reality 3D catalog. Create a product here — it starts as a draft — then add its category, manufacturing, material, commercial definition, SKU, price and media; submit it (Proposed) and approve it when its Launch status reads READY FOR REVIEW; publish it. No deployment is needed. Unpublish to withdraw; do not delete.",
  },
  access: {
    read: publishedOrAdmin,
    create: adminsOnly,
    update: adminsOnly,
    delete: adminsOnly,
  },
  versions: { drafts: true },
  hooks: {
    beforeValidate: [assignProductId, markSource],
    beforeChange: [enforceWorkflow],
    afterChange: [enforceApprovalPrerequisites, revalidateContent("catalog")],
    afterDelete: [revalidateContent("catalog")],
  },
  fields: [
    {
      name: "source",
      type: "select",
      defaultValue: "admin",
      options: [
        { label: "Administrator-managed", value: "admin" },
        { label: "Repository seed", value: "seed" },
      ],
      admin: {
        position: "sidebar",
        readOnly: true,
        description:
          "Seed products are kept in sync with src/content/catalog by content:import. Saving a product in the admin makes it administrator-managed, and the import never overwrites it again.",
      },
    },
    {
      type: "tabs",
      tabs: [
        {
          // First, so opening a product answers "why can't this launch?" at once.
          label: "Launch status",
          fields: LAUNCH_STATUS_FIELDS,
        },
        {
          label: "Basic information",
          fields: [
            { name: "name", type: "text", required: true },
            {
              name: "productId",
              type: "text",
              required: true,
              unique: true,
              index: true,
              admin: {
                disableBulkEdit: true,
                description:
                  'Stable identifier, assigned automatically for a new product (e.g. "p-104"). Carts and saved items refer to this. Never change it on a live product, and never reuse a retired one.',
              },
            },
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              index: true,
              admin: {
                disableBulkEdit: true,
                description:
                  "URL segment. Changing it breaks every existing link to this part.",
              },
            },
            {
              name: "summary",
              type: "text",
              required: true,
              admin: {
                description:
                  "One short technical line. Used by search; not shown on the card.",
              },
            },
            {
              name: "description",
              type: "textarea",
              admin: { description: "Two sentences at most. Engineering-plain." },
            },
            {
              name: "sku",
              type: "text",
              unique: true,
              index: true,
              admin: {
                disableBulkEdit: true,
                description:
                  'Assigned by the business, never generated. Uppercase letters and digits in hyphen-joined groups, 3–32 characters (e.g. "RG-GEAR-024"). Unique. Required for standard and configurable products, not for quote-only. Counts as approved only with the commercial approval record.',
              },
              validate: (value: string | null | undefined) => skuProblem(value) ?? true,
            },
          ],
        },
        {
          label: "Category",
          fields: [
            {
              name: "category",
              type: "relationship",
              relationTo: "categories",
              required: true,
              admin: {
                description:
                  "The leaf category this part is filed under. Ancestors are derived from the tree, not stored.",
              },
            },
            {
              name: "browseCategory",
              type: "relationship",
              relationTo: "categories",
              required: true,
              admin: {
                description:
                  "The top-level destination whose URL this part lives under. Must be a browse category.",
              },
              filterOptions: () => ({ isBrowse: { equals: true } }),
            },
          ],
        },
        {
          label: "Application",
          description: "Who the product is for and what it is used for.",
          fields: [
            {
              name: "customers",
              type: "array",
              labels: { singular: "Customer", plural: "Target customers" },
              fields: [{ name: "value", type: "text", required: true }],
              admin: { description: "Who buys it. Entered values stay PROPOSED until the commercial approval below is recorded." },
            },
            {
              name: "useCase",
              type: "textarea",
              admin: { description: "What it is intended for, in one sentence." },
            },
            {
              name: "applications",
              type: "array",
              labels: { singular: "Application", plural: "Applications" },
              fields: [{ name: "value", type: "text", required: true }],
            },
          ],
        },
        {
          label: "Manufacturing",
          description:
            "Available now: FDM on the Bambu Lab A1. A coming-soon process may be chosen for a draft future product, which cannot be published until the process is approved (see MANUFACTURING_CAPABILITY.md).",
          fields: [
            {
              name: "technology",
              type: "select",
              options: TECHNOLOGY_SELECT_OPTIONS,
              required: true,
              // Stage 19.8/19.9: an available process, or a coming-soon one for a draft. Publication is checked in enforceWorkflow.
              validate: (value: string | null | undefined) =>
                value && SELECTABLE_PROCESS_VALUES.includes(value)
                  ? true
                  : `"${value}" is not an available or planned manufacturing process. Available now: ${APPROVED_PROCESS_VALUES.join(", ").toUpperCase()}.`,
            },
            {
              name: "qualityOptions",
              type: "array",
              labels: { singular: "Quality", plural: "Quality options" },
              fields: [
                { name: "value", type: "text", required: true },
                { name: "label", type: "text", required: true },
                {
                  name: "layerHeight",
                  type: "text",
                  required: true,
                  admin: { description: `Approved FDM layer heights: ${APPROVED_FDM_LAYER_HEIGHTS.join(", ")}.` },
                  // Stage 19.8: only approved FDM layer heights; none exists for resin/SLA.
                  validate: (value: string | null | undefined) =>
                    value && APPROVED_FDM_LAYER_HEIGHTS.includes(value)
                      ? true
                      : `"${value}" is not an approved layer height. Approved: ${APPROVED_FDM_LAYER_HEIGHTS.join(", ")}.`,
                },
              ],
            },
          ],
        },
        {
          label: "Material",
          description:
            "Available now: PLA, PETG, TPU. Coming soon: ABS, Resin — selectable only for a draft future product, which cannot be published until the material is approved.",
          fields: [
            {
              name: "material",
              type: "relationship",
              relationTo: "materials",
              // Stage 19.9: available (published) materials, or coming-soon ones for a draft future product.
              filterOptions: (): Where => ({
                or: [{ _status: { equals: "published" } }, { value: { in: [...COMING_SOON_MATERIAL_VALUES] } }],
              }),
              required: true,
              admin: { description: "The default material this part is made in." },
            },
            {
              name: "materials",
              type: "relationship",
              relationTo: "materials",
              // Stage 19.9: available (published) materials, or coming-soon ones for a draft future product.
              filterOptions: (): Where => ({
                or: [{ _status: { equals: "published" } }, { value: { in: [...COMING_SOON_MATERIAL_VALUES] } }],
              }),
              hasMany: true,
              admin: {
                description:
                  "Every material offered, including the default. One entry means the material is fixed and is shown as metadata rather than as a choice.",
              },
            },
            {
              name: "materialNotes",
              type: "array",
              labels: { singular: "Note", plural: "Material notes" },
              fields: [{ name: "value", type: "text", required: true }],
            },
          ],
        },
        {
          label: "Colours",
          fields: [
            {
              name: "color",
              type: "text",
              required: true,
              admin: {
                description:
                  "Default colour. Only approved production colours may be saved.",
              },
              validate: (value: string | null | undefined) =>
                value && APPROVED_COLOUR_VALUES.includes(value)
                  ? true
                  : `"${value}" is not an approved production colour. Approved: ${APPROVED_COLOUR_VALUES.join(", ")}.`,
            },
            {
              name: "colors",
              type: "array",
              labels: { singular: "Colour", plural: "Colours" },
              fields: [
                {
                  name: "value",
                  type: "text",
                  required: true,
                  validate: (value: string | null | undefined) =>
                    value && APPROVED_COLOUR_VALUES.includes(value)
                      ? true
                      : `"${value}" is not an approved production colour.`,
                },
              ],
              admin: { description: "Every colour offered, including the default. Approved production colours only." },
            },
          ],
        },
        {
          label: "Dimensions",
          description: "Only measured or approved values. Never estimates.",
          fields: [
            {
              name: "specifications",
              type: "array",
              labels: { singular: "Specification", plural: "Specifications" },
              fields: [
                { name: "label", type: "text", required: true },
                { name: "value", type: "text", required: true },
              ],
              admin: {
                description:
                  "Only rows that are actually known for this part. An empty table is better than an invented one.",
              },
            },
            {
              name: "weightGrams",
              type: "number",
              min: 0,
              admin: { description: "Grams, measured on a produced part. Leave empty until measured." },
            },
          ],
        },
        {
          label: "Pricing",
          fields: [
            {
              name: "price",
              type: "number",
              required: true,
              min: 0,
              admin: {
                disableBulkEdit: true,
                description:
                  "Whole rupees. Zero means the part is quoted from the customer's own geometry and cannot be added to a cart. Entering a figure does not approve it: it stays provisional until a price approval is recorded.",
              },
            },
            {
              name: "priceStatus",
              type: "select",
              options: [
                { label: "Provisional — not approved", value: "provisional" },
                { label: "Approved — matches a price approval in effect", value: "approved" },
                { label: "Quote only — priced from geometry", value: "quote-only" },
              ],
              required: true,
              defaultValue: "provisional",
              admin: {
                disableBulkEdit: true,
                description:
                  "Approved requires a record under Price approvals in effect today whose amount equals the price; the save is refused otherwise. Provisional prices are labelled as such on the storefront and cannot be charged in launch mode. Quote only requires a price of 0.",
              },
            },
            {
              name: "currency",
              type: "select",
              options: ["INR"],
              defaultValue: "INR",
              required: true,
            },
            {
              name: "pricingModel",
              type: "select",
              options: [
                { label: "Fixed", value: "FIXED" },
                { label: "Configurable", value: "CONFIGURABLE" },
                { label: "Quote only", value: "QUOTE_ONLY" },
              ],
              admin: { description: "Fixed (a catalog price), Configurable (priced from the customer's choices) or Quote only (no catalog price). Counts as approved only with the commercial approval record (Approval tab)." },
            },
            {
              name: "productClass",
              type: "select",
              options: [
                { label: "Standard catalog product", value: "STANDARD_CATALOG_PRODUCT" },
                { label: "Configurable product", value: "CONFIGURABLE_PRODUCT" },
                { label: "Quote-only product", value: "QUOTE_ONLY_PRODUCT" },
              ],
              admin: {
                description:
                  "Standard: a defined part at a catalog price (needs SKU and approved price). Configurable: needs SKU, at least two material, colour or quality choices, and an approved pricing mechanism. Quote only: no SKU or fixed price required. Custom manufacturing is a service, not a catalog product. Counts as approved only with the commercial approval record.",
              },
            },
            {
              name: "availability",
              type: "select",
              options: [
                { label: "In stock", value: "in-stock" },
                { label: "Made to order", value: "made-to-order" },
              ],
              required: true,
              defaultValue: "made-to-order",
            },
          ],
        },
        {
          label: "Media",
          fields: [
            {
              name: "image",
              type: "upload",
              relationTo: "media",
              admin: {
                description:
                  "Not the canonical media association. Payload Media has no storage adapter, so uploads cannot be stored; use Visual below, which carries the media approval.",
              },
            },
            {
              name: "visual",
              type: "group",
              admin: {
                description:
                  "The product's canonical image: a real photograph or an approved render of this product, committed under public/catalog/<slug>/. Media status: MISSING (no image) → PROPOSED (image set) → APPROVED (media approval recorded).",
              },
              fields: [
                { name: "src", type: "text", admin: { description: "e.g. /catalog/spur-gear-24t/front.jpg" } },
                { name: "alt", type: "text", admin: { description: "Describe the part, not the photo." } },
                {
                  name: "kind",
                  type: "select",
                  options: [
                    { label: "Photograph — a real photo of the product", value: "photo" },
                    { label: "Approved render — generated from the product's own model", value: "render" },
                  ],
                },
                {
                  name: "approval",
                  type: "group",
                  admin: {
                    disableBulkEdit: true,
                    description:
                      "Required for the image to count as approved media. Records who confirmed that it truly shows this product. A file existing is not an approval.",
                  },
                  fields: [
                    { name: "reference", type: "text" },
                    { name: "approvedBy", type: "text" },
                    { name: "approvedOn", type: "date", admin: { date: { pickerAppearance: "dayOnly" } } },
                  ],
                },
              ],
            },
            {
              name: "visualRequirement",
              type: "select",
              options: [
                { label: "Real product photo", value: "REAL_PHOTO" },
                { label: "Approved render", value: "APPROVED_RENDER" },
              ],
              admin: { description: "Which kind of visual this product requires to launch." },
            },
            {
              name: "renderSpecification",
              type: "textarea",
              admin: { description: "For a render: what it must show. Not a claim that one exists." },
            },
            {
              name: "gallery",
              type: "upload",
              relationTo: "media",
              hasMany: true,
              admin: {
                description:
                  "Additional views. The gallery only appears when there is more than one image.",
              },
            },
          ],
        },
        {
          label: "3D model",
          fields: [
            {
              name: "model",
              type: "group",
              admin: {
                description:
                  "A verified model file under public/models/ (STL, OBJ or GLB). It is checked on the server: it must parse as a closed mesh (or valid glTF) and fit the approved 256 × 256 × 256 mm build volume — otherwise the Launch status says why. Leave empty for a product without a model.",
              },
              fields: [
                {
                  name: "url",
                  type: "text",
                  validate: (value: string | null | undefined) =>
                    !value || /^\/models\/[a-z0-9]+(?:-[a-z0-9]+)*\.(stl|obj|glb|gltf)$/.test(value)
                      ? true
                      : 'A model path looks like "/models/part-name.stl": lowercase, hyphenated, under /models/.',
                },
                {
                  name: "format",
                  type: "select",
                  options: ["stl", "obj", "glb", "gltf"],
                },
              ],
            },
          ],
        },
        {
          label: "SEO",
          fields: [
            {
              name: "seo",
              type: "group",
              label: false,
              admin: {
                description:
                  "Optional. Used for the product page title and meta description; the page falls back to the name and description. Product facts only — the same unsupported-claim rules as the copy apply, and launch is blocked by a claim.",
              },
              fields: [
                {
                  name: "title",
                  type: "text",
                  admin: { description: "Search results usually show about 60 characters; the brand is appended." },
                },
                {
                  name: "description",
                  type: "textarea",
                  admin: { description: "Search results usually show about 160 characters. Guidance, not a rule." },
                },
                { name: "ogImage", type: "upload", relationTo: "media" },
              ],
            },
          ],
        },
        {
          label: "Approval",
          description:
            "Draft → Proposed (submitted for approval) → READY FOR REVIEW (shown on Launch status when every prerequisite passes) → Approved → Published. Approval is refused until every prerequisite passes, and cannot be bulk-edited.",
          fields: [
            {
              name: "approvalStatus",
              type: "select",
              required: true,
              defaultValue: "draft",
              options: [
                { label: "Draft — being written", value: "draft" },
                { label: "Proposed — submitted for review", value: "proposed" },
                { label: "Provisional — reviewed, not final", value: "provisional" },
                { label: "Approved — signed off for sale", value: "approved" },
                { label: "Archived — withdrawn", value: "archived" },
              ],
              admin: {
                disableBulkEdit: true,
                description:
                  "Business approval, separate from publishing. Draft and archived products cannot be published. Only approved products appear on the launch storefront and can be purchased.",
              },
            },
            {
              name: "approval",
              type: "group",
              admin: {
                disableBulkEdit: true,
                description: "Required to approve. Approver and date are filled from the signed-in operator and today when left empty.",
              },
              fields: [
                { name: "reference", type: "text", admin: { description: "Where the decision is recorded." } },
                { name: "approvedBy", type: "text" },
                { name: "approvedOn", type: "date", admin: { date: { pickerAppearance: "dayOnly" } } },
              ],
            },
            {
              name: "commercialApproval",
              type: "group",
              admin: {
                disableBulkEdit: true,
                description: "Approves the commercial definition: SKU, product class, pricing model, target customers, use case, copy and visual requirement. Without it those values stay PROPOSED.",
              },
              fields: [
                { name: "reference", type: "text", admin: { description: "Where the decision is recorded." } },
                { name: "approvedBy", type: "text" },
                { name: "approvedOn", type: "date", admin: { date: { pickerAppearance: "dayOnly" } } },
              ],
            },
            {
              name: "openQuestions",
              type: "array",
              labels: { singular: "Open business question", plural: "Open business questions" },
              admin: { disableBulkEdit: true, description: "Questions that must be answered YES, with a reference, before launch." },
              fields: [
                { name: "questionId", type: "text", required: true },
                { name: "question", type: "textarea", required: true },
                {
                  name: "answer",
                  type: "select",
                  defaultValue: "unanswered",
                  options: [
                    { label: "Unanswered", value: "unanswered" },
                    { label: "Yes", value: "yes" },
                    { label: "No", value: "no" },
                  ],
                },
                { name: "reference", type: "text" },
                { name: "approvedBy", type: "text" },
                { name: "approvedOn", type: "date", admin: { date: { pickerAppearance: "dayOnly" } } },
              ],
            },
            {
              name: "commercialDefinition",
              type: "json",
              admin: {
                hidden: true,
                description:
                  "Deprecated in Stage 19.8: replaced by the structured fields. Kept, hidden and unwritten, so no destructive migration was needed.",
              },
            },
          ],
        },
        {
          label: "Featured",
          description:
            "Editorial merchandising. Featured and Recommended are administrator choices, not sales rankings: no Best Seller label exists, and none can be typed.",
          fields: [
            {
              name: "featured",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description:
                  "Feature on the homepage. Honoured only while the product is launch-ready: approved, published, approved price, approved media, approved manufacturing and approved commercial definition.",
              },
            },
            {
              name: "recommended",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description:
                  'Show a "Recommended" label. An editorial choice — not a sales ranking. Shown only where the product itself is shown (launch mode: launch-ready products only).',
              },
            },
            {
              name: "badge",
              type: "text",
              admin: { description: 'Small label, e.g. "New". Sales-ranking claims ("Best seller", "Most popular", "#1") are refused.' },
              validate: (value: string | null | undefined) =>
                value && SALES_CLAIM.test(value) ? "A badge cannot claim a sales ranking: no sales data supports one. Use Featured or Recommended." : true,
            },
          ],
        },
      ],
    },
  ],
};
