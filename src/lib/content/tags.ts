/**
 * Cache tags for CMS-backed content.
 *
 * Its own module, importing nothing, because both sides need it: the query
 * layer tags its cached reads with these, and the Payload hooks invalidate
 * them. A shared constant is what keeps a hook from invalidating a tag no query
 * uses — a bug with no symptom except content that never updates.
 */

export const CONTENT_TAGS = {
  /**
   * Products, categories and materials together.
   *
   * Deliberately one tag for the three. They feed the same marketplace queries:
   * unpublishing a product changes the facet counts a category page shows, so
   * invalidating products without categories would leave a stale number on
   * screen. The catalog is small and rebuilding it is cheap; being right is
   * worth more than being granular here.
   */
  catalog: "sada3d:catalog",
  homepage: "sada3d:homepage",
} as const;

export type ContentTag = keyof typeof CONTENT_TAGS;
