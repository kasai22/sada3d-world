import type { S3Client } from "@aws-sdk/client-s3";

import type { R2Config } from "./config";
import { attachmentDisposition } from "./keys";
import {
  MAX_SIGNED_URL_TTL_SECONDS,
  StorageError,
  type SignedDownload,
  type SignedDownloadRequest,
  type SignedUpload,
  type SignedUploadRequest,
  type StorageAdapter,
  type StorageObject,
  type StoragePutRequest,
  type StorageReadable,
} from "./types";

/**
 * Cloudflare R2, through its S3-compatible API.
 *
 * The only file in the application that knows R2 exists. Everything above it
 * holds a `StorageAdapter`; the AWS SDK's client, its commands, its response
 * shapes and its error classes are created, used and discarded in here.
 *
 * ── Client settings that matter ──────────────────────────────────────────
 *
 *   region "auto"            R2 has no regions; the SDK requires a value and
 *                            R2 documents "auto".
 *   forcePathStyle           https://<account>.r2.cloudflarestorage.com/<bucket>/<key>.
 *                            One hostname for every bucket, which keeps the
 *                            CORS origin and the TLS name predictable.
 *   checksums WHEN_REQUIRED  newer SDKs add CRC32 checksums to every request by
 *                            default. On a *presigned* PUT that bakes a
 *                            checksum of an empty body into the URL, and the
 *                            browser's real upload then fails. Integrity is
 *                            established instead by the server re-reading the
 *                            stored object and comparing its SHA-256 with the
 *                            one declared at upload time.
 *
 * ── Loaded on demand ─────────────────────────────────────────────────────
 *
 * The SDK is imported the first time an operation runs, the same pattern the
 * database driver uses. A page that never touches storage never pays for it.
 */

interface Loaded {
  client: S3Client;
  s3: typeof import("@aws-sdk/client-s3");
  getSignedUrl: typeof import("@aws-sdk/s3-request-presigner").getSignedUrl;
}

/* ------------------------------------------------------------------ *
 * Error mapping
 * ------------------------------------------------------------------ */

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata;
  return typeof metadata?.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

/** A missing object is an answer, not a failure. */
function isMissing(error: unknown): boolean {
  const name = nameOf(error);
  return statusOf(error) === 404 || name === "NotFound" || name === "NoSuchKey";
}

const DENIED_CODES = new Set([
  "AccessDenied",
  "InvalidAccessKeyId",
  "SignatureDoesNotMatch",
  "Unauthorized",
  "InvalidToken",
  "ExpiredToken",
]);

/**
 * Translates an SDK failure into the storage vocabulary.
 *
 * The message names the operation, the provider's error code and the status.
 * Never the key, the bucket, the endpoint, a header or a credential — this is
 * what reaches a log.
 */
function toStorageError(operation: string, error: unknown): StorageError {
  const status = statusOf(error);
  const name = nameOf(error);
  const detail = status === undefined ? name : `${name}, HTTP ${status}`;

  if (status === 401 || status === 403 || DENIED_CODES.has(name)) {
    return new StorageError("denied", `R2 ${operation} was refused (${detail}).`, {
      cause: error,
    });
  }

  if (status === 400) {
    return new StorageError(
      "invalid_request",
      `R2 ${operation} was rejected as malformed (${detail}).`,
      { cause: error },
    );
  }

  return new StorageError("unavailable", `R2 ${operation} failed (${detail}).`, {
    cause: error,
  });
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function unquote(etag: string | undefined): string | undefined {
  return etag ? etag.replace(/^"+|"+$/g, "") : undefined;
}

function assertTtl(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SIGNED_URL_TTL_SECONDS) {
    throw new StorageError(
      "invalid_request",
      `A signed URL must be valid for 1–${MAX_SIGNED_URL_TTL_SECONDS} seconds.`,
    );
  }
}

/**
 * The SDK's body, as an async iterable of bytes.
 *
 * In Node it is already one (an `IncomingMessage`). The web-stream branch is
 * here for a runtime that hands back a `ReadableStream` instead.
 */
function asIterable(body: unknown): AsyncIterable<Uint8Array> {
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function"
  ) {
    return body as AsyncIterable<Uint8Array>;
  }

  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as ReadableStream<Uint8Array>).getReader === "function"
  ) {
    const stream = body as ReadableStream<Uint8Array>;
    return {
      async *[Symbol.asyncIterator]() {
        const reader = stream.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            yield value;
          }
        } finally {
          reader.releaseLock();
        }
      },
    };
  }

  throw new StorageError("unavailable", "R2 get returned a body that cannot be read.");
}

/* ------------------------------------------------------------------ *
 * The adapter
 * ------------------------------------------------------------------ */

export function r2StorageAdapter(config: R2Config): StorageAdapter {
  let loading: Promise<Loaded> | null = null;

  function load(): Promise<Loaded> {
    if (loading) return loading;

    loading = (async () => {
      const [s3, presigner] = await Promise.all([
        import("@aws-sdk/client-s3"),
        import("@aws-sdk/s3-request-presigner"),
      ]);

      const client = new s3.S3Client({
        region: "auto",
        endpoint: config.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
        maxAttempts: 3,
        requestHandler: {
          connectionTimeout: 5_000,
          // Socket inactivity, not total duration: a 200 MB read that keeps
          // flowing is not cut off, one that stalls is.
          requestTimeout: 30_000,
        },
      });

      return { client, s3, getSignedUrl: presigner.getSignedUrl };
    })();

    // A failed import must not be cached as the permanent answer.
    loading.catch(() => {
      loading = null;
    });

    return loading;
  }

  const bucket = config.bucket;

  return {
    name: "r2",

    async put(request: StoragePutRequest): Promise<StorageObject> {
      const { client, s3 } = await load();

      try {
        const response = await client.send(
          new s3.PutObjectCommand({
            Bucket: bucket,
            Key: request.key,
            Body: request.body,
            ContentType: request.contentType,
            ContentLength: request.body.byteLength,
          }),
        );

        return {
          key: request.key,
          size: request.body.byteLength,
          contentType: request.contentType,
          ...(response.ETag ? { etag: unquote(response.ETag) } : {}),
        };
      } catch (error) {
        throw toStorageError("put", error);
      }
    },

    async head(key: string): Promise<StorageObject | null> {
      const { client, s3 } = await load();

      try {
        const response = await client.send(
          new s3.HeadObjectCommand({ Bucket: bucket, Key: key }),
        );

        if (typeof response.ContentLength !== "number") {
          throw new StorageError("unavailable", "R2 head returned no content length.");
        }

        return {
          key,
          size: response.ContentLength,
          ...(response.ContentType ? { contentType: response.ContentType } : {}),
          ...(response.ETag ? { etag: unquote(response.ETag) } : {}),
          ...(response.LastModified
            ? { lastModified: response.LastModified.toISOString() }
            : {}),
        };
      } catch (error) {
        if (error instanceof StorageError) throw error;
        if (isMissing(error)) return null;
        throw toStorageError("head", error);
      }
    },

    async get(key: string): Promise<StorageReadable | null> {
      const { client, s3 } = await load();

      try {
        const response = await client.send(
          new s3.GetObjectCommand({ Bucket: bucket, Key: key }),
        );

        if (typeof response.ContentLength !== "number" || !response.Body) {
          throw new StorageError("unavailable", "R2 get returned an incomplete response.");
        }

        return {
          object: {
            key,
            size: response.ContentLength,
            ...(response.ContentType ? { contentType: response.ContentType } : {}),
            ...(response.ETag ? { etag: unquote(response.ETag) } : {}),
          },
          body: asIterable(response.Body),
        };
      } catch (error) {
        if (error instanceof StorageError) throw error;
        if (isMissing(error)) return null;
        throw toStorageError("get", error);
      }
    },

    async delete(key: string): Promise<void> {
      const { client, s3 } = await load();

      try {
        await client.send(new s3.DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        // Already gone is the outcome that was asked for.
        if (isMissing(error)) return;
        throw toStorageError("delete", error);
      }
    },

    async signUpload(request: SignedUploadRequest): Promise<SignedUpload> {
      assertTtl(request.expiresInSeconds);

      if (!Number.isSafeInteger(request.size) || request.size <= 0) {
        throw new StorageError("invalid_request", "An upload must declare a positive size.");
      }

      const { client, s3, getSignedUrl } = await load();
      const signedAt = new Date();

      try {
        const url = await getSignedUrl(
          client,
          new s3.PutObjectCommand({
            Bucket: bucket,
            Key: request.key,
            ContentType: request.contentType,
            ContentLength: request.size,
          }),
          {
            expiresIn: request.expiresInSeconds,
            signingDate: signedAt,
            /*
             * Both are signed, which is what turns them from a request into a
             * constraint. The presigner leaves Content-Type unsigned by default;
             * naming it here overrides that. A browser cannot set Content-Length
             * itself — it sends the real length of the body — so a file of any
             * other size than the one declared produces a signature mismatch
             * and the provider refuses it.
             */
            signableHeaders: new Set(["content-type", "content-length"]),
          },
        );

        return {
          method: "PUT",
          url,
          headers: { "Content-Type": request.contentType },
          expiresAt: new Date(
            signedAt.getTime() + request.expiresInSeconds * 1000,
          ).toISOString(),
        };
      } catch (error) {
        throw toStorageError("sign upload", error);
      }
    },

    async signDownload(request: SignedDownloadRequest): Promise<SignedDownload> {
      assertTtl(request.expiresInSeconds);

      const { client, s3, getSignedUrl } = await load();
      const signedAt = new Date();

      try {
        const url = await getSignedUrl(
          client,
          new s3.GetObjectCommand({
            Bucket: bucket,
            Key: request.key,
            ResponseContentDisposition: attachmentDisposition(request.fileName),
            ...(request.contentType ? { ResponseContentType: request.contentType } : {}),
          }),
          { expiresIn: request.expiresInSeconds, signingDate: signedAt },
        );

        return {
          url,
          expiresAt: new Date(
            signedAt.getTime() + request.expiresInSeconds * 1000,
          ).toISOString(),
        };
      } catch (error) {
        throw toStorageError("sign download", error);
      }
    },
  };
}
