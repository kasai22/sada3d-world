import { analysisDto } from "@/lib/api/dto";
import { RATE_LIMITS, enforceRateLimit, sourceSubject } from "@/lib/api/rate-limit";
import { failure, ok, readBoundedBytes } from "@/lib/api/respond";
import { PayloadTooLargeError, ValidationError } from "@/lib/errors";
import {
  checkManufacturability,
  configuredConstraints,
} from "@/lib/manufacturing/manufacturability";
import { MODEL_LIMITS, analyzeModel } from "@/lib/models";
import { EVENTS, log } from "@/lib/observability";

/**
 * POST /api/models/analyze — measure a small model without storing it.
 *
 * Multipart, because the payload is a file. The bytes are read into memory,
 * measured, and dropped: **nothing is written to disk and nothing is stored.**
 *
 * ── Small files only ─────────────────────────────────────────────────────
 *
 * This route receives the file in its request body, so it is bounded by what a
 * serverless function can receive — Vercel refuses bodies above 4.5 MB — and
 * by what it is sensible to push through one. It accepts
 * `MODEL_LIMITS.maxInlineAnalysisBytes` and refuses anything larger with a 413
 * before the body is buffered. A larger file is uploaded directly to storage
 * with a signed URL and measured from there (`lib/account/design-uploads`);
 * it never passes through a function.
 *
 * ── The order of checks ──────────────────────────────────────────────────
 *
 *   rate      before any byte is read
 *   size      while reading, stopping at the limit
 *   extension before any parser is chosen
 *   container before any XML is scanned
 *   XML       before any geometry is trusted
 *   geometry  triangle and object counts before memory is allocated
 *
 * Each layer refuses on its own terms, so a hostile file meets the cheapest
 * possible rejection rather than being carried to the expensive one.
 */
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = MODEL_LIMITS.maxInlineAnalysisBytes;

/** Multipart framing around the file: the boundary, part headers, a filename. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const TOO_LARGE_MESSAGE = `Files larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB are measured after they are stored. Sign in to upload this file and it will be measured from storage.`;

export async function POST(request: Request) {
  try {
    // Analysis is seconds of CPU per file, and this route is public.
    enforceRateLimit(RATE_LIMITS.modelAnalysisSource, sourceSubject(request.headers));

    const type = request.headers.get("content-type") ?? "";
    if (!type.includes("multipart/form-data")) {
      throw new ValidationError("Send the model as multipart/form-data.");
    }

    let body: Uint8Array;
    try {
      body = await readBoundedBytes(request, MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) throw new PayloadTooLargeError(TOO_LARGE_MESSAGE);
      throw error;
    }

    let form: FormData;
    try {
      form = await new Response(body as BodyInit, { headers: { "content-type": type } }).formData();
    } catch {
      throw new ValidationError("The upload could not be read as multipart/form-data.");
    }

    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new ValidationError("Attach a model file as the `file` field.", [
        { field: "file", message: "A model file is required." },
      ]);
    }

    if (file.size === 0) throw new ValidationError("This file is empty.");
    if (file.size > MAX_FILE_BYTES) throw new PayloadTooLargeError(TOO_LARGE_MESSAGE);

    const bytes = new Uint8Array(await file.arrayBuffer());

    const analysis = await analyzeModel({
      fileName: file.name,
      bytes,
      ...(file.type ? { contentType: file.type } : {}),
    });

    /*
     * The assessment is a separate call on purpose. Measuring and judging are
     * different questions with different owners, and the response carries both
     * so the interface can show file facts and manufacturing rules as the
     * different things they are.
     */
    const assessment = checkManufacturability(analysis, configuredConstraints());

    /*
     * The model's content identity, its format and its shape. Never the
     * filename — a customer's filename can be anything — and never the bytes.
     */
    log.info(EVENTS.modelAnalyzed, {
      identity: analysis.identity,
      format: analysis.format,
      sizeBytes: bytes.length,
      objects: analysis.objectCount,
      topology: analysis.topology.topology,
      manufacturable: assessment.manufacturable,
    });

    return ok({ analysis: analysisDto(analysis, assessment) }, { private: true });
  } catch (error) {
    log.warn(EVENTS.modelAnalysisFailed, {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return failure(error, "POST /api/models/analyze");
  }
}
