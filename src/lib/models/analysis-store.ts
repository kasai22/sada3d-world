import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { geometryAnalyses } from "@/lib/db/schema";
import type { GeometryAnalysisResult } from "@/lib/geometry/types";
import { EVENTS, log } from "@/lib/observability";

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
 * ── A cached row is not trusted ──────────────────────────────────────────
 *
 * A row is written by this code, but it is read back from a database that a
 * migration, a manual fix or a bug in an older analyser can have touched. So a
 * row must prove it describes these bytes and is well-formed before it is used:
 *
 *   identity   derived from the same sha256 the row is keyed by
 *   numbers    every one finite — a NaN in JSON arrives as null
 *   shape      the fields the interface and the manufacturability rules read
 *   objects    as many as `objectCount` says
 *
 * A row that fails is deleted and reported, and the file is analysed again.
 * Serving it would render a wrong measurement as though it were right; ignoring
 * it without deleting would re-analyse the file on every request forever,
 * because `saveStoredAnalysis` never overwrites.
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

const SHA256_HEX = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDimensions(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z);
}

function isBoundingBox(value: unknown): boolean {
  return isRecord(value) && isDimensions(value.min) && isDimensions(value.max) && isDimensions(value.size);
}

function isMeasurement(value: unknown): boolean {
  if (!isRecord(value) || typeof value.unit !== "string") return false;

  switch (value.state) {
    case "available":
      return isFiniteNumber(value.value) && typeof value.source === "string";
    case "unavailable":
    case "invalid":
      return typeof value.reason === "string";
    default:
      return false;
  }
}

function isTopology(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.topology === "string" &&
    isFiniteNumber(value.boundaryEdges) &&
    isFiniteNumber(value.nonManifoldEdges) &&
    isFiniteNumber(value.degenerateTriangles)
  );
}

function isObjectAnalysis(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isFiniteNumber(value.meshCount) &&
    isMeasurement(value.triangleCount) &&
    isBoundingBox(value.boundingBox) &&
    isMeasurement(value.volume) &&
    isMeasurement(value.surfaceArea) &&
    isTopology(value.topology)
  );
}

/**
 * Whether a stored value is a well-formed analysis of the file with this hash.
 * Exported for the tests.
 */
export function isValidStoredAnalysis(
  value: unknown,
  sha256: string,
): value is GeometryAnalysisResult {
  if (!isRecord(value) || !SHA256_HEX.test(sha256)) return false;

  // The model identity is `mdl_` and the first 32 hex digits of the sha256.
  if (typeof value.identity !== "string" || !value.identity.startsWith(`mdl_${sha256.slice(0, 32)}`)) {
    return false;
  }

  if (
    typeof value.format !== "string" ||
    !isRecord(value.unit) ||
    !isFiniteNumber(value.unit.scaleToMm) ||
    !isFiniteNumber(value.objectCount) ||
    !isFiniteNumber(value.meshCount) ||
    !isMeasurement(value.triangleCount) ||
    !isBoundingBox(value.boundingBox) ||
    !isMeasurement(value.volume) ||
    !isMeasurement(value.surfaceArea) ||
    !isTopology(value.topology) ||
    !Array.isArray(value.warnings) ||
    !Array.isArray(value.objects)
  ) {
    return false;
  }

  return value.objects.length === value.objectCount && value.objects.every(isObjectAnalysis);
}

/**
 * The stored analysis for these bytes at the current analyser version.
 *
 * A row that fails validation is removed and treated as absent, so the file is
 * re-analysed rather than a malformed result rendered.
 */
export async function findStoredAnalysis(
  sha256: string,
  version: string = ANALYSIS_VERSION,
): Promise<GeometryAnalysisResult | null> {
  const db = await getDatabase();
  const key = and(eq(geometryAnalyses.sha256, sha256), eq(geometryAnalyses.analysisVersion, version));

  const rows = await db
    .select({ result: geometryAnalyses.result })
    .from(geometryAnalyses)
    .where(key)
    .limit(1);

  if (rows.length === 0) return null;

  const result = rows[0]?.result;
  if (isValidStoredAnalysis(result, sha256)) return result;

  // The hash is a content digest, not a customer identifier; it is loggable.
  log.warn(EVENTS.analysisCacheRejected, { sha256: sha256.slice(0, 16), version });
  await db.delete(geometryAnalyses).where(key);
  return null;
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
