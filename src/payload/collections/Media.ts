import type { CollectionConfig } from "payload";

import { adminsOnly, publishedOrAdmin } from "../access";

/**
 * Public product media.
 *
 * ── The line this collection draws ───────────────────────────────────────
 *
 * This is for imagery the storefront shows to everybody: product renders,
 * photographs, material swatches. It is public by definition.
 *
 * Customer design files are **not** here and must never be. They are private,
 * they belong to one person, and they are addressed by a key in
 * `customer_designs` that is never sent to a browser. Putting a customer's CAD
 * file into a CMS media library would make it an asset an operator can browse
 * and a URL anyone can guess. The two are separate stores with separate access
 * models, and this comment is here because the mistake is an easy one.
 *
 * ── Storage ──────────────────────────────────────────────────────────────
 *
 * Metadata only for now. Phase 16 attaches Cloudflare R2 through Payload's
 * storage adapter; until then `disableLocalStorage` keeps Payload from writing
 * files onto a serverless filesystem that does not persist, and the catalog
 * falls back to the design system's placeholder stage exactly as it does today.
 *
 * No product currently carries an image, so nothing regresses by this being
 * empty. What it provides is the relationship Phase 16 fills.
 */
export const Media: CollectionConfig = {
  slug: "media",
  admin: {
    useAsTitle: "alt",
    group: "Content",
    description: "Public product imagery. Never customer files.",
  },
  access: {
    read: publishedOrAdmin,
    create: adminsOnly,
    update: adminsOnly,
    delete: adminsOnly,
  },
  upload: {
    /*
     * Phase 16 replaces this with the R2 adapter. Local disk is not a store: a
     * serverless instance's filesystem is gone at the end of the request, so
     * writing there would lose the file and claim it had been kept.
     */
    disableLocalStorage: true,
    mimeTypes: ["image/*"],
  },
  versions: { drafts: true },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
      admin: {
        description:
          "What the image shows, for screen readers. Describe the part, not the photo.",
      },
    },
    {
      name: "credit",
      type: "text",
      admin: { description: "Attribution, where one is required." },
    },
  ],
};
