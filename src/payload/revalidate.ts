import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from "payload";

/*
 * A relative import, not the "@/" alias. This module is reachable from
 * payload.config.ts, which is loaded by the Payload CLI as well as by Next —
 * and the CLI resolves it without reading tsconfig paths. Everything the config
 * can reach has to resolve without the alias.
 */
import { CONTENT_TAGS, type ContentTag } from "../lib/content/tags";

/**
 * Publishing content invalidates the pages built from it.
 *
 * ── Tags, not paths ──────────────────────────────────────────────────────
 *
 * A hook that called `revalidatePath("/shop/mechanical")` would have to know
 * which routes a category appears on, and would be wrong the first time a new
 * route used the same data. Content is tagged instead: a query declares which
 * tag it belongs to, a hook invalidates the tag, and every cached read carrying
 * it is dropped — including ones that did not exist when the hook was written.
 *
 * There are two tags, deliberately coarse. Products, categories and materials
 * all feed the same marketplace queries and facet counts, so a change to any of
 * them can change a page built from the others; invalidating them separately
 * would leave a facet count stale after a product was unpublished. The catalog
 * is small and rebuilding it is cheap.
 *
 * ── Outside a request ────────────────────────────────────────────────────
 *
 * `revalidateTag` needs Next's request context. Payload hooks also run from the
 * import script and from migrations, where there is no such context and no
 * cache to invalidate. That is not a failure — it is a seed, and the cache it
 * would clear does not exist yet — so it is caught and ignored rather than
 * being allowed to fail the write that triggered it.
 */

function invalidate(tag: ContentTag): void {
  void (async () => {
    try {
      const { revalidateTag } = await import("next/cache");
      /*
       * `expire: 0`, not "max". "max" serves the previous catalog to the first
       * request after a publish while the new one builds behind it — so a
       * product published a moment ago is absent from that stale catalog and
       * its page 404s.
       * Expiring immediately makes that request wait for the rebuild instead,
       * which for a catalog this size is one query. The single-argument form is
       * deprecated in Next 16.
       */
      revalidateTag(CONTENT_TAGS[tag], { expire: 0 });
    } catch {
      // No request context: a seed, an import or a migration. Nothing cached.
    }
  })();
}

export function revalidateContent(
  tag: ContentTag,
): CollectionAfterChangeHook & CollectionAfterDeleteHook {
  return (({ doc }: { doc: unknown }) => {
    invalidate(tag);
    return doc;
    // Payload's two hook signatures differ in their return, and both accept
    // the document back unchanged. One function serves both.
  }) as CollectionAfterChangeHook & CollectionAfterDeleteHook;
}

export function revalidateGlobal(tag: ContentTag) {
  return ({ doc }: { doc: unknown }) => {
    invalidate(tag);
    return doc;
  };
}
