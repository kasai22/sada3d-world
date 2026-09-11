/**
 * Whether a request path carries a percent-escape that does not decode.
 *
 * `/api/orders/%E0%A4%A` is not a URL that names anything, but the router
 * decodes dynamic segments before any route handler runs, and a malformed
 * escape makes that decoding throw — a bare 500 from the framework, logged as a
 * server fault, for what is a client's malformed request. The proxy refuses
 * such a path with a 400 before routing.
 *
 * Only a failure to decode is refused. Well-formed escapes (`%20`, `%2F`) pass
 * through to the route, which applies its own rules to what they decode to.
 */
export function hasMalformedEncoding(pathname: string): boolean {
  if (!pathname.includes("%")) return false;

  try {
    decodeURIComponent(pathname);
    return false;
  } catch {
    return true;
  }
}
