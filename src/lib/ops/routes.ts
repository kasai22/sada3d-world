/**
 * Console URLs that cross into Payload, and the rule for returning to the
 * console after signing in.
 *
 * Pure and client-safe, so the shell can link to sign-out and the tests can
 * exercise the redirect rule without a request.
 */

/** Payload's login page, which honours a safe `redirect` back to the console. */
export const OPERATOR_LOGIN_PATH = "/admin/login";
export const OPERATOR_LOGOUT_PATH = "/admin/logout";
export const OPERATOR_ACCOUNT_PATH = "/admin/account";
export const CMS_HOME = "/admin";
export const OPS_HOME = "/ops";

/** Remembers the collapsed sidebar per browser, so the first paint is already right. */
export const SIDEBAR_COOKIE = "sada3d_ops_sidebar";

/**
 * A console path to return to after signing in, or the console home.
 *
 * Only `/ops` and below, with no traversal, doubled slash, backslash or encoded
 * separator. Payload validates the redirect again on its side; this keeps the
 * console from ever asking it to send someone anywhere else.
 */
export function safeOpsPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 512) return OPS_HOME;
  if (!/^\/ops(?:[/?#]|$)/.test(value)) return OPS_HOME;
  if (/[\\\s]|\/\/|%2f|%5c|%2e/i.test(value)) return OPS_HOME;
  if (/(?:^|\/)\.\.?(?:[/?#]|$)/.test(value)) return OPS_HOME;
  return value;
}

export function operatorLoginHref(returnTo: string): string {
  return `${OPERATOR_LOGIN_PATH}?redirect=${encodeURIComponent(safeOpsPath(returnTo))}`;
}

/**
 * The header the proxy uses to tell the console which page was asked for.
 *
 * A hint, never a credential: it decides only where an operator is sent *back*
 * to after signing in. `safeOpsPath` validates it before it becomes a URL, and
 * Payload validates the redirect again on its side. Nothing reads it to decide
 * whether someone may see anything.
 */
export const OPS_PATH_HEADER = "x-ops-path";

/** The console path of a request, or null when it is not a console request. */
export function opsPathOf(pathname: string, search = ""): string | null {
  if (pathname !== OPS_HOME && !pathname.startsWith(`${OPS_HOME}/`)) return null;
  return safeOpsPath(`${pathname}${search}`);
}
