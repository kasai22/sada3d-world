import { quoteDto } from "@/lib/api/dto";
import { RATE_LIMITS, enforceRateLimit, sourceSubject } from "@/lib/api/rate-limit";
import {
  failure,
  isRecord,
  ok,
  readInteger,
  readJson,
  readString,
  rejectUnknownFields,
  requireRecord,
} from "@/lib/api/respond";
import { ManufacturabilityError, ValidationError } from "@/lib/errors";
import { calculateQuote } from "@/lib/pricing/calculateQuote";
import type { QuoteGeometryInput } from "@/lib/pricing/types";

/**
 * POST /api/quotes — price a configuration.
 *
 * The engine is unchanged and still deterministic: the same request always
 * produces the same figure. This route maps a JSON body onto a `QuoteRequest`
 * and returns what the engine said.
 *
 * ── Geometry is accepted and is not priced ───────────────────────────────
 *
 * A caller may supply measurements. No pricing rule reads them, so the quote
 * comes back with `basis: "configuration"` and a `geometry` field saying the
 * measurements were received and not used. Phase 15 deliberately did not add a
 * per-mm³ or per-hour rule to make that field look better — inventing a rate is
 * how a demonstration figure becomes a commercial claim.
 *
 * ── What a request may contain ───────────────────────────────────────────
 *
 * The fields below and nothing else. There is no price, discount, total or
 * rules version in the vocabulary, and a request that sends one is refused by
 * name rather than having it silently ignored. Every number is a finite value
 * in a stated range before the engine sees it; the engine's own rules — the
 * quantity ceiling, the size limit — then apply as they always did.
 */
export const dynamic = "force-dynamic";

const BODY_FIELDS = ["model", "material", "quality", "finish", "quantity", "geometry"];
const MODEL_FIELDS = ["name", "extension", "sizeBytes", "triangles"];
const GEOMETRY_FIELDS = ["dimensionsMm", "volumeMm3", "surfaceAreaMm2", "triangleCount", "partCount"];
const DIMENSION_FIELDS = ["x", "y", "z"];

/*
 * Structural bounds, set far beyond anything real so they never decide a
 * legitimate quote — they exist so that 1e308 and 2^53 are refused as input
 * rather than carried into arithmetic.
 */
const MAX_MEASUREMENT = 1e12;
const MAX_SIZE_BYTES = 1024 ** 4;
const MAX_COUNT = 1_000_000_000;
const MAX_QUANTITY = 1_000_000;
const MAX_PARTS = 100_000;

/**
 * Reads supplied geometry.
 *
 * Every value must be a finite number in range if present. A caller that sends
 * a string where a volume belongs is refused rather than coerced — a quote
 * request is not a place to be forgiving about what a measurement is.
 */
function readGeometry(source: Record<string, unknown>): QuoteGeometryInput | undefined {
  const raw = source.geometry;
  if (raw === undefined || raw === null) return undefined;

  if (!isRecord(raw)) {
    throw new ValidationError("Geometry must be an object.", [
      { field: "geometry", message: "This value must be an object." },
    ]);
  }

  const geometry = raw;
  rejectUnknownFields(geometry, GEOMETRY_FIELDS, "geometry.");

  const dimensions = isRecord(geometry.dimensionsMm) ? geometry.dimensionsMm : undefined;
  if (dimensions) rejectUnknownFields(dimensions, DIMENSION_FIELDS, "geometry.dimensionsMm.");

  const inRange = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_MEASUREMENT;

  const axis = (name: "x" | "y" | "z"): number => {
    const value = dimensions?.[name];
    if (!inRange(value)) {
      throw new ValidationError("Geometry dimensions must be finite millimetres.", [
        {
          field: `geometry.dimensionsMm.${name}`,
          message: "This value must be a number of millimetres.",
        },
      ]);
    }
    return value;
  };

  const optional = (name: string): number | undefined => {
    const value = geometry[name];
    if (value === undefined || value === null) return undefined;
    if (!inRange(value)) {
      throw new ValidationError("Geometry values must be finite numbers.", [
        { field: `geometry.${name}`, message: "This value must be a positive number." },
      ]);
    }
    return value;
  };

  const partCount = geometry.partCount;
  if (
    typeof partCount !== "number" ||
    !Number.isInteger(partCount) ||
    partCount < 1 ||
    partCount > MAX_PARTS
  ) {
    throw new ValidationError("Geometry must state how many parts it describes.", [
      { field: "geometry.partCount", message: "This value must be a whole number of at least 1." },
    ]);
  }

  const volumeMm3 = optional("volumeMm3");
  const surfaceAreaMm2 = optional("surfaceAreaMm2");
  const triangleCount = optional("triangleCount");

  return {
    dimensionsMm: { x: axis("x"), y: axis("y"), z: axis("z") },
    ...(volumeMm3 !== undefined ? { volumeMm3 } : {}),
    ...(surfaceAreaMm2 !== undefined ? { surfaceAreaMm2 } : {}),
    ...(triangleCount !== undefined ? { triangleCount } : {}),
    partCount,
  };
}

export async function POST(request: Request) {
  try {
    enforceRateLimit(RATE_LIMITS.quoteSource, sourceSubject(request.headers));

    const body = requireRecord(await readJson(request));
    rejectUnknownFields(body, BODY_FIELDS);

    const model = requireRecord(body.model ?? {}, "model");
    rejectUnknownFields(model, MODEL_FIELDS, "model.");

    const geometry = readGeometry(body);

    const response = calculateQuote({
      model: {
        name: readString(model, "name") ?? "",
        extension: (readString(model, "extension", { max: 16 }) ?? "").toLowerCase(),
        sizeBytes: readInteger(model, "sizeBytes", { min: 1, max: MAX_SIZE_BYTES }),
        ...(model.triangles !== undefined
          ? { triangles: readInteger(model, "triangles", { min: 0, max: MAX_COUNT }) }
          : {}),
      },
      material: readString(body, "material", { max: 64 }) ?? "",
      ...(body.quality !== undefined
        ? { quality: readString(body, "quality", { required: false, max: 64 }) }
        : {}),
      ...(body.finish !== undefined
        ? { finish: readString(body, "finish", { required: false, max: 64 }) }
        : {}),
      quantity: readInteger(body, "quantity", { min: 1, max: MAX_QUANTITY }),
      ...(geometry ? { geometry } : {}),
    });

    /*
     * The engine's own verdict, mapped to HTTP. An invalid configuration is a
     * 400 with the field errors it produced; an unquotable one is a 422,
     * because the request was understood and the answer is that it cannot be
     * priced.
     */
    switch (response.status) {
      case "available":
        return ok({ quote: quoteDto(response.quote) });
      case "invalid":
        throw new ValidationError(
          "This configuration cannot be quoted.",
          response.errors.map((error) => ({
            field: error.field,
            message: error.message,
          })),
        );
      case "unavailable":
        return failure(new ManufacturabilityError(response.reason), "POST /api/quotes");
      default:
        return failure(new Error(response.message), "POST /api/quotes");
    }
  } catch (error) {
    return failure(error, "POST /api/quotes");
  }
}
