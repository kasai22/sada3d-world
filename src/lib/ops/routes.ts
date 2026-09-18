/**
 * Reality 3D Admin URLs, the URLs that cross into the Payload CMS, and the rule
 * for returning to the admin after signing in.
 *
 * Pure and client-safe, so the shell can link to the CMS and the tests can
 * exercise the redirect rule without a request.
 *
 * ── Two applications, one sign-in (Stage 22.5) ───────────────────────────
 *
 *   /admin   Reality 3D Admin — the business application operators use.
 *   /cms     Payload's own admin, mounted with `routes.admin` in
 *            `payload.config.ts`. Advanced CMS: raw collections, versions,
 *            operator accounts. Same users, same session cookie.
 *
 * `/ops` was the Stage 21 console. It and Payload's old `/admin/collections/…`
 * deep links redirect (see `LEGACY_REDIRECTS`), so nothing that was
 * bookmarked breaks.
 */

/** Reality 3D Admin. */
export const ADMIN_HOME = "/admin";
/** Kept as an alias: the console code predates the rename. */
export const OPS_HOME = ADMIN_HOME;

/** The Reality 3D sign-in page. Payload's `login` operation does the work. */
export const OPERATOR_LOGIN_PATH = "/admin/login";

/** Payload's admin — Advanced CMS. Must equal `routes.admin` in `payload.config.ts`. */
export const CMS_HOME = "/cms";
export const OPERATOR_ACCOUNT_PATH = `${CMS_HOME}/account`;
export const OPERATOR_FORGOT_PATH = `${CMS_HOME}/forgot`;
export const CMS_CREATE_FIRST_USER_PATH = `${CMS_HOME}/create-first-user`;

/** The Stage 21 console prefix, now a redirect. */
export const LEGACY_OPS_HOME = "/ops";

export const cmsCollectionHref = (slug: string, id?: number | string) =>
  id === undefined ? `${CMS_HOME}/collections/${slug}` : `${CMS_HOME}/collections/${slug}/${id}`;
export const cmsGlobalHref = (slug: string) => `${CMS_HOME}/globals/${slug}`;

/** Remembers the collapsed sidebar per browser, so the first paint is already right. */
export const SIDEBAR_COOKIE = "sada3d_ops_sidebar";

/**
 * An admin path to return to after signing in, or the admin home.
 *
 * Only `/admin` and below, with no traversal, doubled slash, backslash or
 * encoded separator — and never the sign-in page itself, which would send a
 * signed-in operator round in a circle. The sign-in page validates it again
 * before it redirects.
 */
export function safeOpsPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 512) return ADMIN_HOME;
  if (!/^\/admin(?:[/?#]|$)/.test(value)) return ADMIN_HOME;
  if (/[\\\s]|\/\/|%2f|%5c|%2e/i.test(value)) return ADMIN_HOME;
  if (/(?:^|\/)\.\.?(?:[/?#]|$)/.test(value)) return ADMIN_HOME;
  if (/^\/admin\/login(?:[/?#]|$)/.test(value)) return ADMIN_HOME;
  return value;
}

export function operatorLoginHref(returnTo: string): string {
  return `${OPERATOR_LOGIN_PATH}?redirect=${encodeURIComponent(safeOpsPath(returnTo))}`;
}

/**
 * The header the proxy uses to tell the admin which page was asked for.
 *
 * A hint, never a credential: it decides only where an operator is sent *back*
 * to after signing in. `safeOpsPath` validates it before it becomes a URL.
 * Nothing reads it to decide whether someone may see anything.
 */
export const OPS_PATH_HEADER = "x-ops-path";

/** The admin path of a request, or null when it is not an admin request. */
export function opsPathOf(pathname: string, search = ""): string | null {
  if (pathname !== ADMIN_HOME && !pathname.startsWith(`${ADMIN_HOME}/`)) return null;
  return safeOpsPath(`${pathname}${search}`);
}

/**
 * Old addresses and where they live now. Temporary redirects: they carry no
 * data, and every destination checks the operator itself.
 *
 * Order matters — Next.js applies the first match — so the specific Stage 21
 * paths come before the `/ops/:path*` catch-all, and Payload's own view paths
 * are listed exactly: `/admin/login` is ours now, so Payload's routes are
 * enumerated rather than caught with a wildcard.
 */
export const LEGACY_REDIRECTS: readonly { source: string; destination: string }[] = [
  { source: "/admin/dashboard", destination: ADMIN_HOME },
  { source: "/ops", destination: ADMIN_HOME },
  { source: "/ops/production", destination: "/admin/manufacturing" },
  { source: "/ops/:path*", destination: "/admin/:path*" },
  { source: "/admin/collections/:path*", destination: `${CMS_HOME}/collections/:path*` },
  { source: "/admin/globals/:path*", destination: `${CMS_HOME}/globals/:path*` },
  { source: "/admin/account", destination: OPERATOR_ACCOUNT_PATH },
  { source: "/admin/logout", destination: `${CMS_HOME}/logout` },
  { source: "/admin/logout-inactivity", destination: `${CMS_HOME}/logout-inactivity` },
  { source: "/admin/create-first-user", destination: CMS_CREATE_FIRST_USER_PATH },
  { source: "/admin/forgot", destination: OPERATOR_FORGOT_PATH },
  { source: "/admin/reset/:token", destination: `${CMS_HOME}/reset/:token` },
  { source: "/admin/verify/:path*", destination: `${CMS_HOME}/verify/:path*` },
  { source: "/admin/unauthorized", destination: `${CMS_HOME}/unauthorized` },
];
