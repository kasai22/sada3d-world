/**
 * Informational page content: the shape, and the rules every page shares.
 *
 * ── Where this content lives, and why it is not in Payload yet ────────────
 *
 * Payload owns products, categories, materials, media and the homepage copy.
 * Materials, Solutions and How-it-works belong there too on the same reasoning
 * — they are editorial, and whoever writes them should not need a deploy.
 *
 * They are not there yet, and the obstacle is concrete rather than a
 * preference. Payload's schema is applied by committed SQL migrations, and
 * `payload migrate:create` produces one by diffing the config against a running
 * database. There is no database in this environment, so a new collection could
 * only be committed without the migration that creates its tables — which is a
 * config that says a collection exists over a schema where it does not, and it
 * fails at runtime rather than at build. That is a worse state than this one.
 *
 * So this follows the seam `content/home.ts` already established and that
 * `lib/catalog/source.ts` describes at length: author the content locally, in
 * the shape the CMS will hold, behind a resolver. Moving it is then writing the
 * collections, generating the migration against a real database, and pointing
 * these functions at Payload — no page and no component changes, exactly as the
 * catalog's own move was staged.
 *
 * What is real here and not deferred: the publication state. `draft` content is
 * filtered out by `published()` before a page ever sees it, so the switch that
 * hides unfinished content is the same switch the CMS will set, and the tests
 * that assert drafts stay invisible are testing the real rule.
 */

/** Mirrors Payload's `versions: { drafts: true }` states. */
export type PublicationStatus = "published" | "draft";

export interface Publishable {
  status: PublicationStatus;
}

/**
 * Page metadata, in the shape `generateMetadata` needs.
 *
 * `path` is the canonical, and is the *only* canonical: a page states its own
 * address once, here, and both the metadata and any link to it read that.
 */
export interface PageSeo {
  /** Without the brand — the root layout's template appends it. */
  title: string;
  description: string;
  path: string;
  /** Set false for a page that should exist but not be indexed. */
  index: boolean;
}

/** The masthead every informational page opens with. */
export interface PageIntro {
  eyebrow: string;
  /** The page's single h1. */
  title: string;
  lead: string;
}

export interface InformationalPage {
  slug: string;
  status: PublicationStatus;
  seo: PageSeo;
  intro: PageIntro;
}

/**
 * Drops draft entries.
 *
 * Every list a page renders passes through here. Filtering at the point of
 * render rather than at the point of authoring means a draft is invisible to
 * the page, the metadata and the link matrix at once, and there is no second
 * place that could forget.
 */
export function published<T extends Publishable>(items: readonly T[]): T[] {
  return items.filter((item) => item.status === "published");
}
