import { createHmac, timingSafeEqual } from "node:crypto";

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
 * A storage double, for tests.
 *
 * **Test support only.** Like `pglite.testing.ts`, nothing under `src/app`,
 * `src/components` or any runtime module imports this file, and
 * `resolveStorageAdapter` has no branch that could select it. It exists so the
 * upload lifecycle — including every failure ordering — can be exercised
 * without a network, and so the tests are not a claim that R2 was reached.
 * `npm run storage:verify` is what reaches R2.
 *
 * It is a double with teeth rather than a map that agrees with everything:
 *
 *   · a signed upload is an HMAC over key, type, length and expiry, and
 *     `upload()` refuses one that is expired, altered, or sent with a
 *     different content type or a different number of bytes — the same
 *     constraints the R2 signature carries;
 *   · any operation can be made to fail next, so "the object stored but the
 *     database write failed" is a test rather than a hope;
 *   · an object can be removed behind the application's back.
 */

type Operation = "put" | "head" | "get" | "delete" | "signUpload" | "signDownload";

interface Stored {
  bytes: Uint8Array;
  contentType: string;
}

export interface MemoryStorage extends StorageAdapter {
  readonly objects: Map<string, Stored>;
  /** Every operation performed, in order, for asserting what happened. */
  readonly calls: Operation[];
  /** Makes the next call to `operation` throw. */
  failNext(operation: Operation, error?: StorageError): void;
  /**
   * Performs a signed upload, as the browser would. Throws, as the provider
   * would refuse, when the signature does not permit it.
   */
  upload(
    target: SignedUpload,
    bytes: Uint8Array,
    options?: { contentType?: string; now?: number },
  ): void;
  /** Removes an object without the application knowing. */
  vanish(key: string): void;
  /** Splits reads into chunks of this size, to exercise streaming paths. */
  chunkSize: number;
  /** The clock signed URLs are checked against. Tests may move it. */
  now: () => number;
}

const SECRET = "memory-storage-test-secret";
const ORIGIN = "https://storage.test";

function sign(parts: readonly string[]): string {
  return createHmac("sha256", SECRET).update(parts.join("\n")).digest("hex");
}

export function createMemoryStorage(): MemoryStorage {
  const objects = new Map<string, Stored>();
  const calls: Operation[] = [];
  const failures = new Map<Operation, StorageError>();

  function enter(operation: Operation): void {
    calls.push(operation);
    const failure = failures.get(operation);
    if (failure) {
      failures.delete(operation);
      throw failure;
    }
  }

  function assertTtl(seconds: number): void {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SIGNED_URL_TTL_SECONDS) {
      throw new StorageError("invalid_request", "Signed URL lifetime out of range.");
    }
  }

  const storage: MemoryStorage = {
    name: "memory-test",
    objects,
    calls,
    chunkSize: 64 * 1024,
    now: () => Date.now(),

    failNext(operation, error) {
      failures.set(
        operation,
        error ?? new StorageError("unavailable", `Injected ${operation} failure.`),
      );
    },

    async put(request: StoragePutRequest): Promise<StorageObject> {
      enter("put");
      objects.set(request.key, {
        bytes: new Uint8Array(request.body),
        contentType: request.contentType,
      });
      return { key: request.key, size: request.body.byteLength, contentType: request.contentType };
    },

    async head(key: string): Promise<StorageObject | null> {
      enter("head");
      const found = objects.get(key);
      return found
        ? { key, size: found.bytes.byteLength, contentType: found.contentType }
        : null;
    },

    async get(key: string): Promise<StorageReadable | null> {
      enter("get");
      const found = objects.get(key);
      if (!found) return null;

      const { bytes } = found;
      const size = storage.chunkSize;

      return {
        object: { key, size: bytes.byteLength, contentType: found.contentType },
        body: {
          async *[Symbol.asyncIterator]() {
            for (let offset = 0; offset < bytes.byteLength; offset += size) {
              yield bytes.subarray(offset, Math.min(offset + size, bytes.byteLength));
            }
          },
        },
      };
    },

    async delete(key: string): Promise<void> {
      enter("delete");
      objects.delete(key);
    },

    async signUpload(request: SignedUploadRequest): Promise<SignedUpload> {
      enter("signUpload");
      assertTtl(request.expiresInSeconds);

      const expires = storage.now() + request.expiresInSeconds * 1000;
      const signature = sign([
        "PUT",
        request.key,
        request.contentType,
        String(request.size),
        String(expires),
      ]);

      const url = new URL(`${ORIGIN}/${request.key}`);
      url.searchParams.set("expires", String(expires));
      url.searchParams.set("size", String(request.size));
      url.searchParams.set("signature", signature);

      return {
        method: "PUT",
        url: url.toString(),
        headers: { "Content-Type": request.contentType },
        expiresAt: new Date(expires).toISOString(),
      };
    },

    async signDownload(request: SignedDownloadRequest): Promise<SignedDownload> {
      enter("signDownload");
      assertTtl(request.expiresInSeconds);

      const expires = storage.now() + request.expiresInSeconds * 1000;
      const url = new URL(`${ORIGIN}/${request.key}`);
      url.searchParams.set("expires", String(expires));
      url.searchParams.set("signature", sign(["GET", request.key, String(expires)]));

      return { url: url.toString(), expiresAt: new Date(expires).toISOString() };
    },

    upload(target, bytes, options = {}) {
      const url = new URL(target.url);
      const key = decodeURIComponent(url.pathname.slice(1));
      const expires = url.searchParams.get("expires") ?? "";
      const declaredSize = url.searchParams.get("size") ?? "";
      const signature = url.searchParams.get("signature") ?? "";
      const contentType = options.contentType ?? target.headers["Content-Type"] ?? "";
      const now = options.now ?? storage.now();

      const expected = sign(["PUT", key, contentType, String(bytes.byteLength), expires]);

      const valid =
        signature.length === expected.length &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

      if (Number(expires) < now) {
        throw new StorageError("denied", "Request has expired.");
      }
      if (!valid || declaredSize !== String(bytes.byteLength)) {
        throw new StorageError("denied", "SignatureDoesNotMatch");
      }

      objects.set(key, { bytes: new Uint8Array(bytes), contentType });
    },

    vanish(key) {
      objects.delete(key);
    },
  };

  return storage;
}
