import type { DesignDetailDto, UploadIntentDto, UploadTargetDto } from "@/lib/api/dto";

import { extensionOf, inspectModelFile } from "./inspect";
import type { UploadedModel } from "./types";

/**
 * The browser's side of model storage.
 *
 * ── Two steps, deliberately separate ─────────────────────────────────────
 *
 *   prepare   reads the first 512 bytes to identify the file, so a wrong file
 *             is refused before anything is sent and the viewer can show the
 *             part immediately from memory.
 *   store     sends it to private storage and waits for the server to verify
 *             it. Only a stored file can be manufactured.
 *
 * ── What the browser is and is not trusted with ──────────────────────────
 *
 * It computes the file's SHA-256 and declares it with the size and name. It
 * receives one signed URL, good for one PUT of one object for ten minutes. The
 * object's path is visible inside that URL, as it must be, but no response
 * field names it and no request accepts it back; the browser never holds a
 * credential. The server then re-reads what arrived and compares it with what
 * was declared — the browser's checks here are for the customer's benefit, not
 * for security.
 *
 * Server-side availability (`availability.ts`) is a separate module so this
 * one, which ships to the browser, never imports the database or the SDK.
 */

export interface ModelStorageAdapter {
  /** Identifier for the adapter, surfaced in diagnostics. */
  readonly name: string;
  /**
   * Identifies a selected file for the workflow.
   *
   * Rejects with a ModelFileError carrying a message intended for display.
   */
  prepare(file: File): Promise<UploadedModel>;
}

function localModelId(): string {
  // Not security-sensitive: this only distinguishes models within one tab
  // until the file is stored and the design id replaces it.
  return `mdl_${Math.random().toString(36).slice(2, 10)}`;
}

export const modelStorage: ModelStorageAdapter = {
  name: "r2-direct",

  async prepare(file: File): Promise<UploadedModel> {
    const inspection = await inspectModelFile(file);

    return {
      id: localModelId(),
      name: file.name,
      extension: extensionOf(file.name),
      sizeBytes: file.size,
      inspection,
    };
  },
};

/* ------------------------------------------------------------------ *
 * Storing
 * ------------------------------------------------------------------ */

/**
 *   hashing      computing the SHA-256 in the browser
 *   authorising  asking the server for an upload target
 *   uploading    bytes moving to storage; progress is the real transfer
 *   verifying    the server re-reading, checking and measuring the stored file
 */
export type UploadPhase = "hashing" | "authorising" | "uploading" | "verifying";

export interface UploadProgress {
  loaded: number;
  total: number;
}

export type StoreResult =
  | { status: "stored"; detail: DesignDetailDto }
  /**
   * Storing is not possible here, and the file stays in the browser. The
   * workflow continues as a quote; checkout will refuse the part.
   */
  | {
      status: "not_stored";
      reason: "signed_out" | "unavailable" | "unsupported_browser";
      message: string;
    }
  /** Something went wrong. `designId` is set when finalising can be retried. */
  | { status: "failed"; phase: UploadPhase; message: string; designId?: string }
  | { status: "aborted" };

export interface StoreOptions {
  signal?: AbortSignal;
  onPhase?: (phase: UploadPhase) => void;
  onProgress?: (progress: UploadProgress) => void;
}

/** The URL the viewer and downloads use for a stored design. Authorised server-side. */
export function designFileUrl(designId: string): string {
  return `/api/designs/${encodeURIComponent(designId)}/file`;
}

/** Lowercase hex SHA-256 of the file, or null where the browser cannot compute one. */
export async function fileSha256(file: File): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;

  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return null;
  }
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: unknown } }
    | null;
  const message = body?.error?.message;
  return typeof message === "string" && message ? message : fallback;
}

const aborted = (signal?: AbortSignal) => signal?.aborted === true;

/**
 * PUTs the file to the signed target, reporting real transfer progress.
 *
 * XMLHttpRequest rather than fetch because fetch has no upload progress, and a
 * progress bar that is not measuring the upload is a progress bar that lies.
 */
function put(
  target: UploadTargetDto,
  file: File,
  options: StoreOptions,
): Promise<"ok" | "aborted" | { message: string }> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open(target.method, target.url);

    for (const [name, value] of Object.entries(target.headers)) {
      request.setRequestHeader(name, value);
    }

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.({ loaded: event.loaded, total: event.total });
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve("ok");
      } else {
        resolve({
          message:
            request.status === 403
              ? "Storage refused the upload. The upload link may have expired — try again."
              : "The upload did not complete. Try again.",
        });
      }
    };

    request.onerror = () =>
      resolve({
        message: "The upload was interrupted. Check your connection and try again.",
      });
    request.onabort = () => resolve("aborted");

    options.signal?.addEventListener("abort", () => request.abort(), { once: true });

    request.send(file);
  });
}

/**
 * Asks the server to verify an upload, and returns the stored design.
 *
 * Separate so a failed verification — a 503 while storage was unreachable —
 * can be retried without uploading the file again.
 */
export async function finishUpload(
  designId: string,
  options: StoreOptions = {},
): Promise<StoreResult> {
  options.onPhase?.("verifying");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`/api/designs/${encodeURIComponent(designId)}/upload-complete`, {
        method: "POST",
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch {
      if (aborted(options.signal)) return { status: "aborted" };
      return {
        status: "failed",
        phase: "verifying",
        designId,
        message: "The file could not be verified. Check your connection and try again.",
      };
    }

    if (response.ok) {
      return { status: "stored", detail: (await response.json()) as DesignDetailDto };
    }

    // The object has not settled yet. One short, honest wait, then one retry.
    if (response.status === 409 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (aborted(options.signal)) return { status: "aborted" };
      continue;
    }

    const message = await errorMessage(
      response,
      "The file could not be verified. Try again.",
    );

    return {
      status: "failed",
      phase: "verifying",
      message,
      // A refusal (422) is final; anything else can be retried.
      ...(response.status === 422 ? {} : { designId }),
    };
  }

  return {
    status: "failed",
    phase: "verifying",
    designId,
    message: "The upload has not finished arriving. Try again in a moment.",
  };
}

/**
 * Stores a selected file: hash, authorise, upload, verify.
 *
 * Never reports "stored" unless the server has verified the object.
 */
export async function storeModelFile(
  file: File,
  options: StoreOptions = {},
): Promise<StoreResult> {
  options.onPhase?.("hashing");

  const sha256 = await fileSha256(file);
  if (aborted(options.signal)) return { status: "aborted" };

  if (!sha256) {
    return {
      status: "not_stored",
      reason: "unsupported_browser",
      message:
        "This browser cannot prepare the file for secure upload, so it stays in this browser. It can be quoted but not ordered.",
    };
  }

  options.onPhase?.("authorising");

  let response: Response;
  try {
    response = await fetch("/api/designs/upload-intents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, sizeBytes: file.size, sha256 }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    if (aborted(options.signal)) return { status: "aborted" };
    return {
      status: "failed",
      phase: "authorising",
      message: "The upload could not be started. Check your connection and try again.",
    };
  }

  if (response.status === 401) {
    return {
      status: "not_stored",
      reason: "signed_out",
      message:
        "Sign in to store this file for manufacturing. Until then it stays in this browser: it can be quoted, but not ordered.",
    };
  }

  if (response.status === 503) {
    return {
      status: "not_stored",
      reason: "unavailable",
      message:
        "File storage is not available right now, so this file stays in this browser. It can be quoted, but not ordered.",
    };
  }

  if (!response.ok) {
    return {
      status: "failed",
      phase: "authorising",
      message: await errorMessage(response, "The upload could not be started. Try again."),
    };
  }

  const intent = (await response.json()) as UploadIntentDto;

  if (intent.upload) {
    options.onPhase?.("uploading");
    const outcome = await put(intent.upload, file, options);

    if (outcome === "aborted") return { status: "aborted" };
    if (outcome !== "ok") {
      return { status: "failed", phase: "uploading", message: outcome.message };
    }
  }

  return finishUpload(intent.design.id, options);
}

/** A stored design and its analysis, for restoring the workflow after a reload. */
export async function fetchStoredDesign(
  designId: string,
  signal?: AbortSignal,
): Promise<DesignDetailDto | null> {
  try {
    const response = await fetch(`/api/designs/${encodeURIComponent(designId)}`, {
      ...(signal ? { signal } : {}),
    });
    return response.ok ? ((await response.json()) as DesignDetailDto) : null;
  } catch {
    return null;
  }
}
