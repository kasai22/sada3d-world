import { BRAND } from "./brand";

/** Site-wide constants. Nothing here is content — content comes from the CMS. */

export const SITE = {
  name: BRAND.name,
  tagline: BRAND.tagline,
  /** Used for the metadata title template and structured data. */
  legalName: BRAND.name,
  /** The intended customer-facing domain. Canonical URLs follow NEXT_PUBLIC_SITE_URL (see siteUrl). */
  domain: BRAND.domain,
  description:
    "Turn digital designs into physical products through advanced on-demand manufacturing.",
  locale: "en_IN",
  currency: "INR",
} as const;

/**
 * Absolute origin for canonical URLs, Open Graph and sitemap entries.
 * Vercel injects VERCEL_PROJECT_PRODUCTION_URL on every deployment; the explicit
 * env var wins so a custom domain can override it.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL(`https://${vercel}`);

  return new URL("http://localhost:3000");
}
