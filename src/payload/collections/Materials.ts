import type { CollectionConfig } from "payload";

import { adminsOnly, publishedOrAdmin } from "../access";
import { revalidateContent } from "../revalidate";

/**
 * Manufacturing materials.
 *
 * ── Why this collection is worth having ──────────────────────────────────
 *
 * The same five materials are currently described in three places: the catalog
 * taxonomy has their labels, `content/home.ts` has their descriptions and
 * properties, and `custom-print/options.ts` has their manufacturing options.
 * Three copies of "PETG" drift, and one of them is already the one an editor
 * would want to change.
 *
 * This collection owns the **editorial** half — the name, the chemistry, the
 * description, what it is good for, how it looks. One place, one edit.
 *
 * ── What it deliberately does not own ────────────────────────────────────
 *
 * The **price multiplier** stays in `lib/pricing`. It is not content: it is the
 * number a customer is charged by, and a CMS field that changed what a part
 * costs would put pricing behind an editorial UI with no review, no audit and
 * no test. `content/home.ts` currently shows a display multiplier alongside the
 * real one, which is exactly the duplication this rule exists to prevent — the
 * displayed figure is derived from the pricing rules instead.
 *
 * The **set of materials** also stays in code. `MaterialValue` is a TypeScript
 * union that the cart, the quote engine and the order domain all narrow
 * against; it cannot be a database row without becoming `string`, and every
 * exhaustiveness check that protects those domains would stop protecting them.
 * So `value` here must match one of the known values, and the import validates
 * that it does.
 *
 * Content in the CMS, contracts in the code.
 */
export const Materials: CollectionConfig = {
  slug: "materials",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "value", "code", "_status"],
    group: "Catalog",
    description: "How each manufacturing material is described to customers.",
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
            {
              name: "value",
              type: "text",
              required: true,
              unique: true,
              index: true,
              admin: {
                description:
                  "Must match a material the manufacturing domain knows: pla, petg, abs, tpu or resin. Not free text — the quote engine narrows against these.",
              },
            },
            {
              name: "name",
              type: "text",
              required: true,
              admin: { description: 'Display name, e.g. "PETG".' },
            },
            {
              name: "code",
              type: "text",
              admin: { description: 'Chemistry or process, e.g. "Glycol-modified PET".' },
            },
            {
              name: "description",
              type: "textarea",
              admin: {
                description:
                  "One or two sentences. Engineering-plain: what it is and what it is for.",
              },
            },
          ],
        },
        {
          label: "Technical information",
          fields: [
            {
              name: "properties",
              type: "group",
              admin: {
                description:
                  "Relative, 1 to 5. These drive the property scales on the homepage, not any engineering claim.",
              },
              fields: [
                { name: "strength", type: "number", min: 1, max: 5, required: true },
                { name: "flexibility", type: "number", min: 1, max: 5, required: true },
                { name: "heat", type: "number", min: 1, max: 5, required: true },
              ],
            },
            {
              name: "applications",
              type: "array",
              labels: { singular: "Application", plural: "Applications" },
              fields: [{ name: "value", type: "text", required: true }],
              admin: { description: "What this material is typically used for." },
            },
            {
              name: "surface",
              type: "select",
              options: ["matte", "gloss", "machined", "soft", "translucent"],
              admin: { description: "How a finished part looks." },
            },
          ],
        },
        {
          label: "Media",
          fields: [
            {
              name: "swatches",
              type: "array",
              labels: { singular: "Swatch", plural: "Swatches" },
              fields: [
                {
                  name: "hex",
                  type: "text",
                  required: true,
                  admin: { description: "e.g. #FF6B00" },
                },
              ],
              admin: {
                description: "Colours this material is stocked in, as swatches.",
              },
            },
            {
              name: "image",
              type: "upload",
              relationTo: "media",
              admin: { description: "Optional sample render." },
            },
          ],
        },
      ],
    },
  ],
};
