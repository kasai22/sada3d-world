import type { GlobalConfig } from "payload";

import { adminsOnly, publishedOrAdmin } from "../access";
import { revalidateGlobal } from "../revalidate";

/**
 * Homepage copy.
 *
 * ── A structured global, not a page builder ──────────────────────────────
 *
 * The homepage has nine composed sections, each a designed React component with
 * its own layout, motion and responsive behaviour. Those are code and stay
 * code. What an editor should be able to change is the *words* — a hero line, a
 * capability figure, the description of an industry — and that is all this
 * global exposes.
 *
 * The alternative, a block-based builder, would let an editor reorder sections,
 * drop one, or place a hero halfway down the page. That trades a designed
 * homepage for an arbitrary one, and the design system is the product.
 *
 * ── What is not here ─────────────────────────────────────────────────────
 *
 * Featured products are a relationship, not copy: the homepage should show real
 * catalog products with their real prices, and re-typing a name and a price
 * into this global is how a homepage ends up advertising a figure the product
 * page contradicts.
 *
 * Materials are the Materials collection. Workflow steps carry an icon name
 * from the design system's registry, so the icon is a select over what the
 * registry actually has rather than free text that renders as nothing.
 */
export const Homepage: GlobalConfig = {
  slug: "homepage",
  admin: {
    group: "Content",
    description: "Copy for the homepage sections. Layout is code.",
  },
  access: {
    read: publishedOrAdmin,
    update: adminsOnly,
  },
  versions: { drafts: true },
  hooks: {
    afterChange: [revalidateGlobal("homepage")],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Hero",
          fields: [
            {
              name: "hero",
              type: "group",
              label: false,
              fields: [
                { name: "eyebrow", type: "text" },
                { name: "headline", type: "text" },
                { name: "subheadline", type: "textarea" },
              ],
            },
          ],
        },
        {
          label: "Featured",
          fields: [
            {
              name: "featuredProducts",
              type: "relationship",
              relationTo: "products",
              hasMany: true,
              maxRows: 6,
              admin: {
                description:
                  "Real catalog products. Names and prices come from the product, so they cannot disagree with the product page.",
              },
            },
          ],
        },
        {
          label: "Capabilities",
          fields: [
            {
              name: "capabilityMetrics",
              type: "array",
              labels: { singular: "Metric", plural: "Metrics" },
              maxRows: 6,
              fields: [
                {
                  name: "value",
                  type: "text",
                  required: true,
                  admin: { description: 'e.g. "12" or "0.05 MM".' },
                },
                { name: "label", type: "text", required: true },
              ],
              admin: {
                description:
                  "Figures SADA 3D can stand behind. An invented number here is a claim made to every visitor.",
              },
            },
          ],
        },
        {
          label: "Industries",
          fields: [
            {
              name: "industries",
              type: "array",
              labels: { singular: "Industry", plural: "Industries" },
              fields: [
                { name: "index", type: "text", required: true },
                { name: "name", type: "text", required: true },
                { name: "summary", type: "textarea", required: true },
                {
                  name: "span",
                  type: "select",
                  options: ["wide", "narrow"],
                  defaultValue: "narrow",
                  admin: {
                    description:
                      "How much of the grid row this occupies. The only layout choice exposed here.",
                  },
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
