import { createHash, randomBytes } from "node:crypto";

/**
 * Object keys and file names.
 *
 * ── The key is the server's, entirely ────────────────────────────────────
 *
 *   customer-designs/{owner}/{designId}/{objectId}/source
 *
 *   owner      a one-way hash of the customer id. The key does not reveal who
 *              the customer is, and a customer id containing `/` or `..`
 *              cannot become a path segment, because what lands in the key is
 *              always 32 hex characters.
 *   designId   `dsn_` + 96 random bits. Never sequential, never guessable.
 *   objectId   `obj_` + 96 random bits, fresh for every upload intent. Two
 *              uploads can never share a key, so one can never overwrite
 *              another — not another customer's, and not an earlier version
 *              of the same design.
 *   source     a constant. The customer's filename is *not* in the key.
 *
 * No part of the key is taken from a request, and no request can name one: the
 * API accepts design ids, never keys, so there is no request that can address
 * another customer's object. The one place a browser encounters a key is the
 * path of its own signed upload URL — any URL for an object must contain the
 * object's path — where it is inert: that URL permits one PUT of one object for
 * ten minutes, no response carries the key as a field, and nothing accepts it
 * back.
 *
 * ── Unguessable is not the access control ────────────────────────────────
 *
 * The bucket is private, every read is authorised against the design's owner
 * in the database, and access is granted by a short-lived signature. The
 * randomness means a leaked log line or a support screenshot does not become a
 * map of the bucket; it is defence in depth, not the defence.
 */

export const DESIGN_KEY_PREFIX = "customer-designs";

export const DESIGN_ID_PATTERN = /^dsn_[0-9a-f]{24}$/;
const OBJECT_ID_PATTERN = /^obj_[0-9a-f]{24}$/;
const OWNER_PATTERN = /^[0-9a-f]{32}$/;

/** Domain-separated, so this hash can never collide with another use of SHA-256. */
const OWNER_HASH_CONTEXT = "sada3d:customer-design-owner:v1:";

export function ownerSegment(customerId: string): string {
  if (!customerId) throw new Error("A design key needs an owner.");
  return createHash("sha256")
    .update(OWNER_HASH_CONTEXT + customerId)
    .digest("hex")
    .slice(0, 32);
}

export function newDesignId(): string {
  return `dsn_${randomBytes(12).toString("hex")}`;
}

export function newObjectId(): string {
  return `obj_${randomBytes(12).toString("hex")}`;
}

/** Whether a value has the shape of a design id. Cheap, and done before any lookup. */
export function isDesignId(value: unknown): value is string {
  return typeof value === "string" && DESIGN_ID_PATTERN.test(value);
}

export function designObjectKey(input: {
  customerId: string;
  designId: string;
  objectId: string;
}): string {
  if (!DESIGN_ID_PATTERN.test(input.designId)) throw new Error("Malformed design id.");
  if (!OBJECT_ID_PATTERN.test(input.objectId)) throw new Error("Malformed object id.");

  return [
    DESIGN_KEY_PREFIX,
    ownerSegment(input.customerId),
    input.designId,
    input.objectId,
    "source",
  ].join("/");
}

/**
 * Whether a key is exactly the key shape this application generates for this
 * customer and this design.
 *
 * Checked before any stored key is used. A row whose key had been altered to
 * point into another customer's namespace — by a bug, a bad migration or a
 * hand-edited database — is refused here rather than served.
 */
export function keyBelongsTo(key: string, customerId: string, designId: string): boolean {
  const parts = key.split("/");
  if (parts.length !== 5) return false;

  const [prefix, owner, design, object, leaf] = parts;
  return (
    prefix === DESIGN_KEY_PREFIX &&
    owner !== undefined &&
    OWNER_PATTERN.test(owner) &&
    owner === ownerSegment(customerId) &&
    design === designId &&
    object !== undefined &&
    OBJECT_ID_PATTERN.test(object) &&
    leaf === "source"
  );
}

/* ------------------------------------------------------------------ *
 * File names
 * ------------------------------------------------------------------ */

const MAX_FILE_NAME_LENGTH = 128;

/**
 * A customer's filename, made safe to store and to offer back as a download.
 *
 * The name is display metadata and nothing more — it is never part of an
 * object key and never a path. It is still cleaned, because it is shown in the
 * account, written into order records and sent back in a Content-Disposition
 * header:
 *
 *   · directory components are dropped, whichever separator they use, so
 *     `../../etc/passwd.stl` is stored as `passwd.stl`
 *   · control characters, NUL and the characters Windows forbids in a name are
 *     removed, so the name survives being saved to any disk
 *   · leading dots are removed, so there is no `..` and no hidden file
 *   · the result is bounded, keeping its extension
 *
 * Returns null when nothing usable is left — including when what is left no
 * longer has an extension, because the extension is what the format check reads.
 */
export function sanitizeFileName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const base = raw.split(/[/\\]/).pop() ?? "";

  const cleaned = base
    .normalize("NFC")
    // Control characters, including NUL, and DEL.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .trim();

  const dot = cleaned.lastIndexOf(".");
  if (dot <= 0 || dot === cleaned.length - 1) return null;

  const extension = cleaned.slice(dot).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(extension)) return null;

  const stem = cleaned.slice(0, dot).trim();
  if (!stem) return null;

  const room = MAX_FILE_NAME_LENGTH - extension.length;
  return `${stem.slice(0, room).trim()}${extension}`;
}

/**
 * A Content-Disposition value for a download.
 *
 * Both forms: a plain ASCII `filename` every client understands, and an RFC
 * 5987 `filename*` that carries the real name for the clients that read it.
 */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
