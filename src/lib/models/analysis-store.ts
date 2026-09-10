import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { geometryAnalyses } from "@/lib/db/schema";
import type { GeometryAnalysisResult } from "@/lib/geometry/types";

import { ANALYSIS_VERSION } from "./identity";

/**
 * Durable geometry analyses.
 *
 * Stage 15 cached analyses in a Map in the browser tab: fast, and gone with the
 * page. With files now durable, the measurement of a file can be durable too,
 * so a design verified today does not need its 200 MB re-read tomorrow to show
 * its dimensions — and the same file uploaded by a second customer is not
 * parsed a second time.
 *
 * ── The key ──────────────────────────────────────────────────────────────
 *
 *   (sha256 of the bytes, ANALYSIS_VERSION)
 *
 * Not the filename, not the design id. See `geometry_analyses` in the schema
 * for why, and for why a content-keyed table does not let one customer learn
 * anything about another's files.
 *
 * ── Why PostgreSQL and not Redis ─────────────────────────────────────────
 *
 * The result is small, written once, read rarely, and must survive — an order
 * snapshot names the analysis identity it was verified with. That is a row,
 * not a cache entry with an eviction policy. Nothing here stops a Redis read-
 * through in front of it later; nothing needs one now.
 *
 * Not re-exported from `lib/models`, which stays free of the database so the
 * parsers run anywhere.
 */

function isAnalysisResult(value: unknown): value is GeometryAnalysisResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<GeometryAnalysisResult>;

  return (
    typeof candidate.identity === "string" &&
    typeof candidate.format === "string" &&
    typeof candidate.objectCount === "number" &&
    Array.isArray(candidate.objects) &&
    typeof candidate.boundingBox === "object" &&
    candidate.boundingBox !== null
  );
}

/**
 * The stored analysis for these bytes at the current analyser version.
 *
 * A row that does not look like an analysis is treated as absent rather than
 * trusted, which means the file is re-analysed rather than a malformed result
 * rendered.
 */
export async function findStoredAnalysis(
  sha256: string,
  version: string = ANALYSIS_VERSION,
): Promise<GeometryAnalysisResult | null> {
  const db = await getDatabase();

  const rows = await db
    .select({ result: geometryAnalyses.result })
    .from(geometryAnalyses)
    .where(
      and(eq(geometryAnalyses.sha256, sha256), eq(geometryAnalyses.analysisVersion, version)),
    )
    .limit(1);

  const result = rows[0]?.result;
  return isAnalysisResult(result) ? result : null;
}

/**
 * Records an analysis.
 *
 * First writer wins. Analysis is deterministic, so a concurrent second write
 * of the same key carries the same result, and discarding it is correct.
 */
export async function saveStoredAnalysis(
  sha256: string,
  analysis: GeometryAnalysisResult,
  version: string = ANALYSIS_VERSION,
): Promise<void> {
  const db = await getDatabase();

  await db
    .insert(geometryAnalyses)
    .values({
      sha256,
      analysisVersion: version,
      identity: analysis.identity,
      format: analysis.format,
      result: analysis,
    })
    .onConflictDoNothing();
}
