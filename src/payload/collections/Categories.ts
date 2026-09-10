import type { CollectionConfig } from "payload";

import { adminsOnly, publishedOrAdmin } from "../access";
import { revalidateContent } from "../revalidate";

/**
 * The catalog taxonomy.
 *
 * ── Hierarchy ────────────────────────────────────────────────────────────
 *
 * Self-referential parentage, which is what preserves the three levels the
 * marketplace already filters on:
 *
 *   functional → mechanical → gears
 *
 * A flat list with a `depth` number would be easier to store and would lose the
 * thing that matters: selecting "Functional" has to match a product filed under
 * "Gears", and that is an ancestor walk. `categoryPath()` does the walk today
 * from the local tree and does it from these rows once this is canonical.
 *
 * ── `value` is the identifier, not the Payload id ────────────────────────
 *
 * Every product, every URL, every saved filter and every existing bookmark
 * refers to a category by its taxonomy value — "gears", "mechanical". Payload
 * mints its own numeric ids, and if those became the identifier then every
 * /shop URL in the world would break the day the CMS was seeded.
 *
 * So `value` is unique, required and immutable in practice, and it is what the
 * domain reads. The Payload id stays inside Payload.
 */
export const Categories: CollectionConfig = {
  slug: "categories",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "value", "parent", "isBrowse", "_status"],
    group: "Catalog",
    description: "The category tree the marketplace filters on.",
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
              name: "name",
              type: "text",
              required: true,
              admin: { description: 'Shown in filters and breadcrumbs, e.g. "Gears".' },
            },
            {
              name: "value",
              type: "text",
              required: true,
              unique: true,
              index: true,
              admin: {
                description:
                  "Stable identifier used in URLs and by products. Lowercase, hyphenated. Changing it breaks existing links.",
              },
            },
          ],
        },
        {
          label: "Hierarchy",
          fields: [
            {
              name: "parent",
              type: "relationship",
              relationTo: "categories",
              admin: {
                description: "Leave empty for a top-level category.",
              },
              /*
               * Payload cannot express "not itself or a descendant" in a filter,
               * so the cycle check lives in the validate below. A category that
               * is its own ancestor makes the ancestor walk infinite.
               */
              filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true),
            },
            {
              name: "isBrowse",
              type: "checkbox",
              defaultValue: false,
              label: "Top-level browse destination",
              admin: {
                description:
                  "Appears in the shop category rail and gets its own /shop/[category] page.",
              },
            },
            {
              name: "browseOrder",
              type: "number",
              defaultValue: 0,
              admin: {
                description: "Rail order. Lower first.",
                condition: (data) => Boolean(data?.isBrowse),
              },
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
              admin: {
                description:
                  "Optional. The category page falls back to its name and the site defaults when these are empty.",
              },
            },
          ],
        },
      ],
    },
  ],
};
