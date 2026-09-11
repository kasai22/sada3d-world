/**
 * Where sign-in lives, and where it may send someone afterwards.
 */

export const SIGN_IN_PATH = "/login";

/** Where a recovery link lands once it has established a session. */
export const RESET_PASSWORD_PATH = "/login/reset-password";

/** The route handler every confirmation and recovery email links to. */
export const AUTH_CONFIRM_PATH = "/auth/confirm";

/**
 * The parameter naming where to return after signing in.
 *
 * A return path is the classic open-redirect: a link that signs someone in and
 * then sends them wherever the query string said. `safeReturnPath` is what
 * stops that, and it runs on the way *in* as well as the way out, so a hostile
 * value never even reaches the sign-in link.
 */
export const RETURN_PARAM = "next";

/**
 * Pages outside the account a customer is sent to sign in *from*, and so may
 * be returned to. Exact paths: `/cart` is allowed, `/cart?x` and `/cartel` are
 * not.
 */
const RETURNABLE_PAGES: readonly string[] = ["/custom-print", "/cart", "/checkout"];

/**
 * A return path this application will actually navigate to, or nothing.
 *
 * Allowed: a path inside the account portal, or one of `RETURNABLE_PAGES`.
 * Refused, without exception:
 *
 *   https://elsewhere.example   an absolute URL to anywhere
 *   //elsewhere.example         protocol-relative, which browsers treat as
 *                               absolute and a naive `startsWith("/")` accepts
 *   /shop?x=1                   inside the site, but not a place sign-in returns to
 *   \\elsewhere.example         backslashes, normalised to slashes by browsers
 *   anything with a control character
 *
 * An allowlist rather than a blocklist: the rule is "one of these paths", which
 * cannot be widened by a form of URL nobody thought of.
 */
export function safeReturnPath(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();

  /*
   * Control characters and embedded whitespace can smuggle a second URL past a
   * check that only inspects the first characters. Tested by code point rather
   * than by a character class, so tab, newline, form feed, NUL and DEL are all
   * covered by one rule that cannot be misread.
   */
  for (const character of trimmed) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return undefined;
  }

  // Backslashes are normalised to slashes by browsers, so "\\host" is absolute.
  if (trimmed.includes("\\")) return undefined;

  if (!trimmed.startsWith("/")) return undefined;
  if (trimmed.startsWith("//")) return undefined;

  /*
   * Encoded structure. `%2e%2e` is a dot-dot segment to a URL parser and `%2f`
   * or `%5c` can become a separator, so "/account/%2e%2e/%2e%2e//host" passes
   * every check above and resolves somewhere else entirely. Nothing this
   * application links to needs them in a return path, so they are refused.
   */
  if (/%(2e|2f|5c)/i.test(trimmed)) return undefined;

  const path = trimmed.split(/[?#]/)[0] ?? "";
  if (path.split("/").some((segment) => segment === "." || segment === "..")) {
    return undefined;
  }

  if (trimmed === "/account" || trimmed.startsWith("/account/")) return trimmed;
  if (RETURNABLE_PAGES.includes(trimmed)) return trimmed;

  return undefined;
}

/* ------------------------------------------------------------------ *
 * The sign-in page's own parameters
 * ------------------------------------------------------------------ */

export type LoginMode = "signin" | "signup" | "forgot";

const LOGIN_MODES: readonly LoginMode[] = ["signin", "signup", "forgot"];

/**
 * Notices the sign-in page can show, by name.
 *
 * Only names cross the URL. The page holds the sentences, so a link can choose
 * which true thing to say and cannot put words of its own on the page.
 */
export type LoginStatus = "expired" | "link_invalid" | "signed_out" | "password_updated";

const LOGIN_STATUSES: readonly LoginStatus[] = [
  "expired",
  "link_invalid",
  "signed_out",
  "password_updated",
];

export function parseLoginMode(value: unknown): LoginMode {
  return LOGIN_MODES.includes(value as LoginMode) ? (value as LoginMode) : "signin";
}

export function parseLoginStatus(value: unknown): LoginStatus | undefined {
  return LOGIN_STATUSES.includes(value as LoginStatus) ? (value as LoginStatus) : undefined;
}

/** The sign-in link, carrying a return path only when one is safe. */
export function signInHref(
  returnTo?: string | null,
  options: { status?: LoginStatus; mode?: LoginMode } = {},
): string {
  const params = new URLSearchParams();

  if (options.mode && options.mode !== "signin") params.set("mode", options.mode);

  const safe = safeReturnPath(returnTo);
  if (safe) params.set(RETURN_PARAM, safe);

  if (options.status) params.set("status", options.status);

  const query = params.toString();
  return query ? `${SIGN_IN_PATH}?${query}` : SIGN_IN_PATH;
}
