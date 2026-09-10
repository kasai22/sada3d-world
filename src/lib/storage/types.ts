/**
 * Durable object storage — the provider-neutral contract.
 *
 * Everything outside `lib/storage` talks to a `StorageAdapter` and to the types
 * in this file, and to nothing else. No `S3Client`, no AWS command, no SDK
 * response shape and no Cloudflare binding crosses this line, so the domain
 * code that decides *what* to store never learns *where* it is stored.
 *
 * ── The capabilities, and why there are exactly these ────────────────────
 *
 *   put            server-side write. The verification CLI and the tests use it;
 *                  customer uploads do not pass through the server at all.
 *   head           does the object exist, and how big is it
 *   get            the bytes, as a stream, for verification and analysis
 *   delete         idempotent removal
 *   signUpload     a short-lived, single-object, single-method upload target —
 *                  the browser sends a customer's file straight to storage
 *   signDownload   a short-lived read of one object
 *
 * The two signing methods exist because the application needs them, not for
 * completeness: a Vercel function accepts a request body of at most 4.5 MB and
 * a manufacturing file may be 200 MB, so a server-mediated upload is not an
 * option; and a download proxied through a function would pay for every byte
 * twice. See `lib/storage/README.md`.
 */

/** What storage knows about one object. */
export interface StorageObject {
  key: string;
  /** Bytes, as the provider reports them for the stored object. */
  size: number;
  /** As recorded at write time. Never trusted as a statement about the bytes. */
  contentType?: string;
  /** Provider entity tag, quotes removed. Opaque; compared, never parsed. */
  etag?: string;
  lastModified?: string;
}

export interface StoragePutRequest {
  key: string;
  body: Uint8Array;
  contentType: string;
}

/** An object's metadata and its bytes. `body` may be iterated once. */
export interface StorageReadable {
  object: StorageObject;
  body: AsyncIterable<Uint8Array>;
}

export interface SignedUploadRequest {
  key: string;
  /** Becomes part of the signature: the upload must send exactly this type. */
  contentType: string;
  /** Becomes part of the signature: the upload must be exactly this long. */
  size: number;
  expiresInSeconds: number;
}

export interface SignedUpload {
  method: "PUT";
  url: string;
  /**
   * Headers the upload must send, exactly as given. They are covered by the
   * signature, so a different value is a rejected upload rather than a
   * different object.
   */
  headers: Readonly<Record<string, string>>;
  expiresAt: string;
}

export interface SignedDownloadRequest {
  key: string;
  /** Offered to the browser as the download's name. Already sanitised. */
  fileName: string;
  contentType?: string;
  expiresInSeconds: number;
}

export interface SignedDownload {
  url: string;
  expiresAt: string;
}

export interface StorageAdapter {
  /** Surfaced in diagnostics. Never a credential or an endpoint. */
  readonly name: string;
  put(request: StoragePutRequest): Promise<StorageObject>;
  /** The object's metadata, or null when there is no such object. */
  head(key: string): Promise<StorageObject | null>;
  /** The object, or null when there is no such object. */
  get(key: string): Promise<StorageReadable | null>;
  /** Removes the object. Removing one that does not exist succeeds. */
  delete(key: string): Promise<void>;
  signUpload(request: SignedUploadRequest): Promise<SignedUpload>;
  signDownload(request: SignedDownloadRequest): Promise<SignedDownload>;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * Why a storage operation did not complete.
 *
 *   not_configured   this deployment has no storage provider. An operator
 *                    problem, surfaced loudly, never substituted.
 *   denied           the provider refused the credentials or the operation.
 *   unavailable      the provider could not be reached or failed.
 *   invalid_request  the request itself was malformed, e.g. a signing window
 *                    outside the allowed range.
 *
 * "The object does not exist" is not an error: `head` and `get` return null
 * for it, because a missing object is an ordinary answer the caller must
 * handle, not an exception it may forget to catch.
 *
 * `message` is for the server log. It names the operation and the provider's
 * error code; it never contains a credential, a signed URL or an object key.
 */
export type StorageErrorKind =
  | "not_configured"
  | "denied"
  | "unavailable"
  | "invalid_request";

export class StorageError extends Error {
  readonly kind: StorageErrorKind;

  constructor(kind: StorageErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
    this.kind = kind;
  }
}

/* ------------------------------------------------------------------ *
 * Signing windows
 * ------------------------------------------------------------------ */

/**
 * How long an upload target stays valid.
 *
 * Ten minutes. A signed URL's expiry is checked when the request starts, not
 * when it ends, so a large file on a slow connection that begins inside the
 * window completes; and a URL that leaks is useless ten minutes later.
 */
export const UPLOAD_URL_TTL_SECONDS = 10 * 60;

/** Two minutes: long enough to start a download, short enough to be worthless if copied. */
export const DOWNLOAD_URL_TTL_SECONDS = 2 * 60;

/** The provider-side ceiling this application will ever ask for. */
export const MAX_SIGNED_URL_TTL_SECONDS = 60 * 60;
