import type { AnalysisDto, DesignDetailDto } from "@/lib/api/dto";

import { ACCEPTED_EXTENSIONS, MAX_INLINE_ANALYSIS_BYTES } from "./types";
import { extensionOf } from "./inspect";

/**
 * Model analysis, from the browser.
 *
 * ── The states, and why there are this many ──────────────────────────────
 *
 * A measurement is either taken or it is not, and "not" has several distinct
 * shapes that a customer needs told apart:
 *
 *   not_analyzed  nothing has been asked for yet
 *   analyzing     in flight
 *   available     measured, and the numbers are real
 *   unsupported   this format cannot be mesh-analysed at all (STEP)
 *   error         it was attempted and failed
 *
 * None of them is a number. That is the point: there is no state in which the
 * interface has a zero to display, so there is no path by which `0 mm` or `₹0`
 * appears as a placeholder while something loads.
 *
 * ── Caching ──────────────────────────────────────────────────────────────
 *
 * Keyed by a SHA-256 of the file's bytes. Not the filename — two different
 * parts are both called `part.stl`, and one part renamed is not a different
 * part. Not the timestamp — that changes on every save and would never hit.
 *
 * The cache is a Map in this tab, which is the right size for the problem: it
 * stops a re-analysis when a customer steps back and forward through the
 * workflow, and it disappears with the page, exactly like the File object it
 * describes. Sharing it between sessions needs Redis and durable bytes, which
 * are Phase 16's, and `analysisCacheKey` is the seam that would move there.
 */

export type ModelAnalysisState =
  | { status: "not_analyzed" }
  | { status: "analyzing" }
  | { status: "available"; analysis: AnalysisDto }
  /** The format is accepted for manufacturing and cannot be measured here. */
  | { status: "unsupported"; reason: string }
  | { status: "error"; message: string };

export const NOT_ANALYZED: ModelAnalysisState = { status: "not_analyzed" };

export const STEP_UNSUPPORTED_REASON =
  "STEP files describe surfaces rather than a mesh, so dimensions and volume cannot be measured here. The file can still be quoted and manufactured.";

/**
 * The analysis state for a stored design.
 *
 * Since Stage 16 this is the authoritative measurement: taken by the server
 * from the bytes in storage, not from anything this tab sent.
 */
export function analysisFromDetail(detail: DesignDetailDto): ModelAnalysisState {
  if (detail.analysisState === "available" && detail.analysis) {
    return { status: "available", analysis: detail.analysis };
  }

  if (detail.analysisState === "unsupported") {
    return { status: "unsupported", reason: STEP_UNSUPPORTED_REASON };
  }

  return NOT_ANALYZED;
}

/** Formats accepted for upload that the mesh analyser cannot measure. */
const UNANALYZABLE = [".step", ".stp"];

export function isAnalyzableExtension(extension: string): boolean {
  const lower = extension.toLowerCase();
  return (
    ACCEPTED_EXTENSIONS.includes(lower as (typeof ACCEPTED_EXTENSIONS)[number]) &&
    !UNANALYZABLE.includes(lower)
  );
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/**
 * A content-derived key for a selected file.
 *
 * Uses the platform's SubtleCrypto over the file's own bytes, so the key a
 * browser computes and the identity the server returns describe the same thing.
 * Where SubtleCrypto is unavailable — an insecure origin — analysis still works
 * and simply is not cached, which is slower and never wrong.
 */
export async function analysisCacheKey(file: File): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;

  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const bytes = Array.from(new Uint8Array(digest.slice(0, 16)));
    return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

const cache = new Map<string, AnalysisDto>();

/** Beyond this the tab is holding more analyses than a session can need. */
const MAX_CACHED = 16;

function remember(key: string, analysis: AnalysisDto): void {
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, analysis);
}

/* ------------------------------------------------------------------ *
 * Analysis
 * ------------------------------------------------------------------ */

export interface AnalyzeOptions {
  /** Aborts a request whose file has since been replaced. */
  signal?: AbortSignal;
}

/**
 * Measures a selected file that is not being stored.
 *
 * The bytes go to the server, which parses and measures them and returns the
 * result. Nothing is stored: the response is a measurement, not a receipt. This
 * is the path for a file that stays in the browser — a signed-out visitor, or a
 * deployment without storage. A stored file is measured by the server from
 * storage during verification instead, and that measurement is authoritative.
 *
 * A cached result short-circuits the request entirely, so stepping back and
 * forward through the workflow re-reads a measurement rather than re-taking it.
 */
export async function analyzeUpload(
  file: File,
  options: AnalyzeOptions = {},
): Promise<ModelAnalysisState> {
  const extension = extensionOf(file.name);

  if (!isAnalyzableExtension(extension)) {
    return {
      status: "unsupported",
      reason:
        extension === ".step" || extension === ".stp"
          ? STEP_UNSUPPORTED_REASON
          : "This file type cannot be measured.",
    };
  }

  /*
   * A file too large to send in one request is not sent at all. The server
   * would refuse it with a 413, and the upload would already have cost the
   * customer the bytes; stored files are measured from storage instead.
   */
  if (file.size > MAX_INLINE_ANALYSIS_BYTES) {
    return {
      status: "error",
      message: `Files larger than ${MAX_INLINE_ANALYSIS_BYTES / (1024 * 1024)} MB are measured after they are stored. Sign in to upload this file and see its measurements.`,
    };
  }

  const key = await analysisCacheKey(file);
  const cached = key ? cache.get(key) : undefined;
  if (cached) return { status: "available", analysis: cached };

  const body = new FormData();
  body.append("file", file);

  let response: Response;
  try {
    response = await fetch("/api/custom-print/analyze", {
      method: "POST",
      body,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    // An aborted request is not a failure to report — the file changed.
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "not_analyzed" };
    }
    return {
      status: "error",
      message: "The model could not be sent for analysis. Check your connection and try again.",
    };
  }

  if (!response.ok) {
    /*
     * The API's message is written for a customer — "this mesh is not closed",
     * "this package contains an unsafe file path" — so it is shown rather than
     * replaced with something generic. An unexpected failure already comes back
     * as one safe sentence.
     */
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    return {
      status: "error",
      message:
        body?.error?.message ??
        "This model could not be analysed. It may be damaged or in an unexpected format.",
    };
  }

  const payload = (await response.json()) as { analysis: AnalysisDto };
  if (key) remember(key, payload.analysis);

  return { status: "available", analysis: payload.analysis };
}
