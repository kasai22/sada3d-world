import { catalogMode, type CatalogMode } from "./commerce";

/**
 * The catalog mode as the server decides it.
 *
 * `catalogMode()`'s default reads only `NEXT_PUBLIC_` variables, because it is
 * reachable from client components and a server-only variable must never be
 * read there. The server additionally honours `VERCEL_ENV`, which Vercel sets on
 * every deployment whether or not system variables are exposed to the browser.
 *
 * Everything that decides what is served or charged — the catalog sources, the
 * cart and checkout — uses this. If a misconfigured deployment ever made the
 * two disagree, the server side is the one that says "launch", so it fails
 * towards hiding unapproved products, never towards selling them.
 */
export function serverCatalogMode(): CatalogMode {
  return catalogMode({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SADA_CATALOG_MODE: process.env.NEXT_PUBLIC_SADA_CATALOG_MODE,
    VERCEL_ENV: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV,
  });
}
