import type { CollectionConfig } from "payload";

import { CAPABILITY_STATUS_LABEL, capabilityStatus } from "../../content/catalog/capabilities";
import { adminFieldOnly, adminsOnly, publishedOrAdmin } from "../access";
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
    defaultColumns: ["name", "value", "capabilityStatus", "_status"],
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
      /*
       * Stage 19.9. Virtual: derived from the business decision ledger (AVAILABLE)
       * and the roadmap (COMING SOON) on every read — never stored, never edited,
       * and never an approval. Publishing a material record does not make it
       * available; an APPROVED ledger decision does.
       */
      name: "capabilityStatus",
      label: "Capability status",
      type: "text",
      virtual: true,
      access: { read: adminFieldOnly, create: () => false, update: () => false },
      admin: {
        position: "sidebar",
        readOnly: true,
        description:
          "Available now = an approved business decision. Coming soon = on the roadmap, not approved: shown to customers, never quotable or orderable. Not available = neither.",
      },
      hooks: {
        afterRead: [
          ({ siblingData }) => {
            const status = capabilityStatus("material", (siblingData as { value?: string } | undefined)?.value);
            return status === "AVAILABLE" ? "AVAILABLE NOW" : CAPABILITY_STATUS_LABEL[status].toUpperCase();
          },
        ],
      },
    },
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
              name: "technologies",
              type: "select",
              hasMany: true,
              required: true,
              options: [
                { label: "FDM", value: "fdm" },
                { label: "SLA", value: "sla" },
              ],
              admin: {
                description:
                  "Processes this material is printed with. Products may only pair a material with one of these — the import rejects anything else.",
              },
            },
            {
              name: "applications",
              type: "array",
              labels: { singular: "Application", plural: "Applications" },
              fields: [{ name: "value", type: "text", required: true }],
              admin: { description: "What this material is typically used for." },
            },
            {
              name: "bestFor",
              type: "array",
              labels: { singular: "Use case", plural: "Best for" },
              fields: [{ name: "value", type: "text", required: true }],
              admin: { description: "One line each: the reason somebody picks this material." },
            },
            {
              name: "avoidFor",
              type: "array",
              labels: { singular: "Limitation", plural: "Avoid for" },
              fields: [{ name: "value", type: "text", required: true }],
              admin: {
                description: "Qualitative limitations. Never a number without a datasheet behind it.",
              },
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
        {
          label: "SEO",
          fields: [
            {
              name: "seo",
              type: "group",
              label: false,
              fields: [
                { name: "title", type: "text" },
                { name: "description", type: "textarea" },
              ],
            },
          ],
        },
      ],
    },
  ],
};
