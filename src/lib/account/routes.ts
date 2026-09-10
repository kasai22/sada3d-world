/**
 * Where sign-in will live.
 *
 * Phase 17 owns authentication. This module owns the one thing that has to be
 * decided before it arrives: the address the portal sends someone to, and what
 * it is allowed to bring back with them.
 */

export const SIGN_IN_PATH = "/login";

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
 * A return path this application will actually navigate to, or nothing.
 *
 * Allowed: a path inside the account portal. Refused, without exception:
 *
 *   https://elsewhere.example   an absolute URL to anywhere
 *   //elsewhere.example         protocol-relative, which browsers treat as
 *                               absolute and a naive `startsWith("/")` accepts
 *   /shop?x=1                   inside the site, but not what sign-in returns to
 *   \\elsewhere.example         backslashes, normalised to slashes by browsers
 *   anything with a control character
 *
 * An allowlist rather than a blocklist: the rule is "one of the account paths",
 * which cannot be widened by a form of URL nobody thought of.
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

  return trimmed === "/account" || trimmed.startsWith("/account/")
    ? trimmed
    : undefined;
}

/** The sign-in link, carrying a return path only when one is safe. */
export function signInHref(returnTo?: string | null): string {
  const safe = safeReturnPath(returnTo);
  return safe
    ? `${SIGN_IN_PATH}?${RETURN_PARAM}=${encodeURIComponent(safe)}`
    : SIGN_IN_PATH;
}
