import { analysisDto } from "@/lib/api/dto";
import { failure, ok } from "@/lib/api/respond";
import { ValidationError } from "@/lib/errors";
import {
  checkManufacturability,
  configuredConstraints,
} from "@/lib/manufacturing/manufacturability";
import { analyzeModel } from "@/lib/models";
import { EVENTS, log } from "@/lib/observability";
import { MAX_MODEL_BYTES } from "@/lib/custom-print/types";

/**
 * POST /api/models/analyze — measure an uploaded model.
 *
 * Multipart, because the payload is a file. The bytes are read into memory,
 * measured, and dropped: **nothing is written to disk and nothing is stored.**
 * Durable model storage is Phase 16, and a route that quietly kept a copy would
 * be creating exactly the persistence this phase says does not exist yet.
 *
 * ── The order of checks ──────────────────────────────────────────────────
 *
 *   size      before anything is read into memory
 *   extension before any parser is chosen
 *   container before any XML is scanned
 *   XML       before any geometry is trusted
 *
 * Each layer refuses on its own terms, so a hostile file meets the cheapest
 * possible rejection rather than being carried to the expensive one.
 */
export const dynamic = "force-dynamic";

/** Bytes accepted by this route, matching the workflow's upload limit. */
const MAX_BYTES = MAX_MODEL_BYTES;

export async function POST(request: Request) {
  try {
    const type = request.headers.get("content-type") ?? "";
    if (!type.includes("multipart/form-data")) {
      throw new ValidationError("Send the model as multipart/form-data.");
    }

    /*
     * Checked before the body is read where the transport declares it. A
     * declared length is not trusted on its own — the byte length is checked
     * again below — but refusing early avoids buffering a gigabyte to find out.
     */
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      throw new ValidationError("This file is larger than the upload limit.");
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new ValidationError("Attach a model file as the `file` field.", [
        { field: "file", message: "A model file is required." },
      ]);
    }

    if (file.size === 0) throw new ValidationError("This file is empty.");
    if (file.size > MAX_BYTES) {
      throw new ValidationError("This file is larger than the upload limit.");
    }

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
