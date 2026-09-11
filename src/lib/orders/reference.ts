/**
 * Order references, as input.
 *
 * A reference arrives from a URL segment, a lookup form or a cookie, and every
 * one of those is text a stranger can write. It is checked against the one
 * shape this system issues before it is used for anything — a lookup, a log
 * line, a throttle key — so a 10 KB "reference" never reaches the database and
 * never occupies a slot in the lookup throttle.
 *
 *   S3D-000184   issued by `nextReference`; six digits, growing past them
 *   DEMO-0001    development fixtures
 *
 * A malformed reference is answered exactly as a reference that does not exist
 * is. The shape of a reference is not a secret; whether one exists is.
 */

const ORDER_REFERENCE = /^(?:S3D-\d{6,10}|DEMO-\d{4})$/;

/** Longer than any reference, shorter than anything worth normalising. */
const MAX_INPUT_LENGTH = 64;

/** The canonical reference, or nothing. Case and surrounding space do not matter. */
export function parseOrderReference(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_INPUT_LENGTH) return undefined;

  const normalised = value.trim().toUpperCase();
  return ORDER_REFERENCE.test(normalised) ? normalised : undefined;
}

/**
 * A reference from a route segment.
 *
 * `decodeURIComponent` throws on a malformed escape such as `%E0%A4%A`, which
 * would otherwise surface as a 500 for what is simply a URL that names nothing.
 */
export function referenceFromSegment(segment: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return undefined;
  }
  return parseOrderReference(decoded);
}
