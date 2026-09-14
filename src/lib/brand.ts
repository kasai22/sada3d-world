/**
 * The customer-facing brand (Stage 19.9: formerly SADA 3D, now Reality 3D).
 *
 * Pure constants and no environment access, so client components, the Payload
 * config and the content modules can all import it. `lib/site.ts` builds the
 * site constants from this.
 *
 * Internal identifiers keep their historical `sada3d` names — cookies, storage
 * keys, cache tags, bucket names, the package name — because renaming them
 * would sign people out, empty carts and orphan stored data for no customer
 * benefit. Nothing a customer reads uses them.
 */
export const BRAND = {
  name: "Reality 3D",
  tagline: "Imagine. Design. Create.",
  /** The intended customer-facing domain. Canonical URLs follow NEXT_PUBLIC_SITE_URL (see lib/site.ts). */
  domain: "reality3d.in",
} as const;
