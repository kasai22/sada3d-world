import { readR2Config } from "./config";
import { r2StorageAdapter } from "./r2";
import { StorageError, type StorageAdapter } from "./types";

/**
 * Which storage answers.
 *
 * Cloudflare R2 when it is configured, and **nothing** when it is not. There is
 * no local-disk adapter and no in-memory one to fall back to, in production or
 * in development:
 *
 *   · a Vercel function's filesystem does not outlive the invocation, so a file
 *     "stored" there is a file lost on the next request;
 *   · a memory store is the same loss with extra steps;
 *   · and a development fallback is exactly the kind of thing that ends up
 *     running in production by accident, reporting uploads that did not happen.
 *
 * So an unconfigured deployment reports that storage is unavailable — the
 * account says designs cannot be stored, checkout refuses custom parts, and the
 * upload API answers 503 — which is what is true.
 *
 * Tests install an adapter with `setStorageAdapter`; see `memory.testing.ts`.
 * No request, header or environment variable can reach that function.
 */

export type {
  SignedDownload,
  SignedDownloadRequest,
  SignedUpload,
  SignedUploadRequest,
  StorageAdapter,
  StorageErrorKind,
  StorageObject,
  StoragePutRequest,
  StorageReadable,
} from "./types";
export {
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_SIGNED_URL_TTL_SECONDS,
  StorageError,
  UPLOAD_URL_TTL_SECONDS,
} from "./types";

let override: StorageAdapter | null = null;
let cached: { fingerprint: string; adapter: StorageAdapter } | null = null;

/** Installs an adapter for tests. Production never calls this. */
export function setStorageAdapter(adapter: StorageAdapter | null): void {
  override = adapter;
}

export type StorageStatus =
  | { configured: true; provider: string }
  | { configured: false; reason: "absent" | "invalid"; problems: readonly string[] };

/** Whether this process can store files, and if not, which variables are the problem. */
export function storageStatus(): StorageStatus {
  if (override) return { configured: true, provider: override.name };

  const result = readR2Config();

  if (result.status === "configured") return { configured: true, provider: "r2" };

  if (result.status === "absent") {
    return {
      configured: false,
      reason: "absent",
      problems: result.missing.map((name) => `${name} is not set.`),
    };
  }

  return { configured: false, reason: "invalid", problems: result.problems };
}

export function storageConfigured(): boolean {
  return storageStatus().configured;
}

/**
 * The adapter, or a refusal.
 *
 * Throws `StorageError("not_configured")` rather than returning something that
 * would pretend to store. The message lists variable names only.
 */
export function resolveStorageAdapter(): StorageAdapter {
  if (override) return override;

  const result = readR2Config();

  if (result.status !== "configured") {
    throw new StorageError(
      "not_configured",
      result.status === "absent"
        ? `Durable storage is not configured. Set ${result.missing.join(", ")}.`
        : `Durable storage is misconfigured. ${result.problems.join(" ")}`,
    );
  }

  const { config } = result;
  // In memory only, for recognising a changed configuration. Never logged.
  const fingerprint = [
    config.endpoint,
    config.bucket,
    config.accessKeyId,
    config.secretAccessKey,
  ].join("\n");

  if (!cached || cached.fingerprint !== fingerprint) {
    cached = { fingerprint, adapter: r2StorageAdapter(config) };
  }

  return cached.adapter;
}
