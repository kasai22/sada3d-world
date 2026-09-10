import type { CollectionConfig } from "payload";

import { adminsOnly, publishedOrAdmin } from "../access";
import { revalidateContent } from "../revalidate";

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
 * Every cart line, every saved item and every order item that has ever been
 * written refers to a product as "p-001". A cart holds the id and nothing else
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
    defaultColumns: ["name", "productId", "category", "price", "availability", "_status"],
    group: "Catalog",
    description: "Parts SADA 3D sells. Unpublish to withdraw; do not delete.",
  },
  access: {
    read: publishedOrAdmin,
    create: adminsOnly,
    update: adminsOnly,
    delete: adminsOnly,
  },
  versions: { drafts: true },
  hooks: {
    afterChange: [revalidateContent("catalog")],
    afterDelete: [revalidateContent("catalog")],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Identity",
          fields: [
            { name: "name", type: "text", required: true },
            {
              name: "productId",
              type: "text",
              required: true,
              unique: true,
              index: true,
              admin: {
                description:
                  'Stable identifier, e.g. "p-001". Carts, saved items and past orders refer to this. Never change it on a live product.',
              },
            },
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              index: true,
              admin: {
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
              name: "applications",
              type: "array",
              labels: { singular: "Application", plural: "Applications" },
              fields: [{ name: "value", type: "text", required: true }],
            },
          ],
        },
        {
          label: "Commerce",
          fields: [
            {
              name: "price",
              type: "number",
              required: true,
              min: 0,
              admin: {
                description:
                  "Whole rupees. Zero means the part is quoted from the customer's own geometry and cannot be added to a cart.",
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
              name: "availability",
              type: "select",
              options: [
                { label: "In stock", value: "in-stock" },
                { label: "Made to order", value: "made-to-order" },
              ],
              required: true,
              defaultValue: "made-to-order",
            },
            {
              name: "badge",
              type: "text",
              admin: { description: 'Small corner label, e.g. "New". Ration these.' },
            },
          ],
        },
        {
          label: "Taxonomy",
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
          label: "Manufacturing",
          fields: [
            {
              name: "material",
              type: "relationship",
              relationTo: "materials",
              required: true,
              admin: { description: "The default material this part is made in." },
            },
            {
              name: "materials",
              type: "relationship",
              relationTo: "materials",
              hasMany: true,
              admin: {
                description:
                  "Every material offered, including the default. One entry means the material is fixed and is shown as metadata rather than as a choice.",
              },
            },
            {
              name: "technology",
              type: "select",
              options: [
                { label: "FDM", value: "fdm" },
                { label: "SLA", value: "sla" },
                { label: "SLS", value: "sls" },
              ],
              required: true,
            },
            {
              name: "color",
              type: "text",
              required: true,
              admin: {
                description:
                  "Default colour facet value, e.g. black. Must be one of the colours the marketplace filters on.",
              },
            },
            {
              name: "colors",
              type: "array",
              labels: { singular: "Colour", plural: "Colours" },
              fields: [{ name: "value", type: "text", required: true }],
              admin: { description: "Every colour offered, including the default." },
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
                  admin: { description: 'e.g. "0.16 MM".' },
                },
              ],
            },
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
              name: "materialNotes",
              type: "array",
              labels: { singular: "Note", plural: "Material notes" },
              fields: [{ name: "value", type: "text", required: true }],
            },
          ],
        },
        {
          label: "Media",
          fields: [
            { name: "image", type: "upload", relationTo: "media" },
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
            {
              name: "model",
              type: "group",
              admin: {
                description:
                  "A mesh the 3D viewer can render. Leave empty and the card falls back to the placeholder stage.",
              },
              fields: [
                { name: "url", type: "text" },
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
                  "Optional. The product page falls back to the name and the description when these are empty, which is what it does today.",
              },
              fields: [
                { name: "title", type: "text" },
                { name: "description", type: "textarea" },
                { name: "ogImage", type: "upload", relationTo: "media" },
              ],
            },
          ],
        },
      ],
    },
  ],
};
