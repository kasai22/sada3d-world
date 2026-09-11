import { MAX_INLINE_ANALYSIS_BYTES } from "@/lib/custom-print/types";
import { ModelTooComplexError } from "@/lib/errors";

/**
 * Model analysis limits.
 *
 * Every number here bounds work done on a file a stranger supplied, and each is
 * set from something measured or stated rather than chosen for roundness. They
 * are enforced by the parsers *before* the memory they protect is allocated, and
 * exceeding one is a typed refusal (`ModelTooComplexError`, HTTP 422) — never a
 * partial result that looks complete.
 *
 * ── How they were set ────────────────────────────────────────────────────
 *
 * Measured on Node 24 with the Stage 18 analyser: a closed, tessellated binary
 * STL analysed end to end, peak resident memory from `process.resourceUsage()`.
 * The figures are recorded in SECURITY.md. The serverless function this runs in
 * has a fixed memory ceiling (Vercel's default is 2 GB), and analysis must fit
 * inside it with room left for the request, the runtime and the downloaded file.
 *
 * `maxTriangles` is the one that matters most; the others exist so that a
 * package cannot reach an unbounded amount of work by a route that does not
 * pass through the triangle count first — a million empty objects, a build
 * list that places one object a hundred thousand times, a component tree that
 * fans out.
 */

export const MODEL_LIMITS = {
  /**
   * Triangles analysed across the whole model, after every placement and
   * component has been expanded. Two million is well past a detailed printed
   * part — a high-resolution scan of a figurine is typically a few hundred
   * thousand — and it is where analysis stays inside the memory budget.
   */
  maxTriangles: 2_000_000,

  /** Vertices a mesh file may declare. A shared-vertex mesh has about half its triangle count. */
  maxVertices: 4_000_000,

  /** `<object>` elements in a 3MF model. */
  maxObjects: 10_000,

  /** `<item>` elements in a 3MF build. */
  maxBuildItems: 10_000,

  /**
   * Meshes produced by expanding the build and its components. Bounds instancing:
   * placing a small object many times is legitimate, placing one a million
   * times is an attempt to multiply work.
   */
  maxPlacements: 100_000,

  /** How deep 3MF components may nest. Also stops a reference cycle. */
  maxComponentDepth: 16,

  /**
   * Bytes accepted by the inline analysis route, which receives the file in the
   * request body. Vercel refuses a function request body above 4.5 MB; a limit
   * below that, with room for multipart framing, is honest about what the route
   * can take. Larger files are analysed from durable storage after upload.
   * Shared with the browser, which does not send a larger file at all.
   */
  maxInlineAnalysisBytes: MAX_INLINE_ANALYSIS_BYTES,
} as const;

export type ModelLimits = { readonly [K in keyof typeof MODEL_LIMITS]: number };

/** "2,000,000", for messages. */
export function formatLimit(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * The refusal for a model past a limit. Typed, so verification can record it as
 * `model_too_complex` rather than as an unreadable file.
 */
export function tooComplex(what: string, limit: number): ModelTooComplexError {
  return new ModelTooComplexError(
    `This model has more than ${formatLimit(limit)} ${what}, which is more than can be analysed. Reduce its detail and upload it again.`,
  );
}
