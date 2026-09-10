import { createHash } from "node:crypto";

/**
 * Content-derived model identity.
 *
 * The same bytes always produce the same id, and different bytes effectively
 * never do. That is the whole requirement, and it is what makes analysis
 * cacheable: a customer who re-selects the same file gets the previous result
 * rather than a second parse.
 *
 * ── Why not the obvious alternatives ─────────────────────────────────────
 *
 *   filename    two different parts are both called `part.stl`, and one part
 *               renamed is not a different part
 *   timestamp   changes every upload, so nothing ever hits the cache
 *   random id   the same, and worse, it makes results non-reproducible
 *
 * ── Not a security boundary ──────────────────────────────────────────────
 *
 * SHA-256 is used because it is available and collision-free in practice, not
 * because this authenticates anything. An identity says "these are the same
 * bytes"; it grants nothing, and no access decision reads it.
 *
 * The value is prefixed so it is recognisable in a log and can never be
 * mistaken for a storage key or a customer identifier.
 */
export function modelIdentity(bytes: Uint8Array): string {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `mdl_${digest.slice(0, 32)}`;
}

/**
 * The identity of an analysis, which is the model plus how it was analysed.
 *
 * A cached result must be invalidated when the analyser changes, or a fix to
 * the volume calculation would never reach a model that had already been
 * measured. Bumping `ANALYSIS_VERSION` is what does that.
 */
export const ANALYSIS_VERSION = "1";

export function analysisIdentity(modelId: string): string {
  return `${modelId}.v${ANALYSIS_VERSION}`;
}
