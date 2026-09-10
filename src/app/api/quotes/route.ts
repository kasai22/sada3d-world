import { quoteDto } from "@/lib/api/dto";
import { failure, ok, readInteger, readJson, readString, requireRecord } from "@/lib/api/respond";
import { ValidationError } from "@/lib/errors";
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
 */
export const dynamic = "force-dynamic";

/**
 * Reads supplied geometry.
 *
 * Every value must be a finite number if present. A caller that sends a string
 * where a volume belongs is refused rather than coerced — a quote request is
 * not a place to be forgiving about what a measurement is.
 */
function readGeometry(source: Record<string, unknown>): QuoteGeometryInput | undefined {
  const raw = source.geometry;
  if (raw === undefined || raw === null) return undefined;

  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Geometry must be an object.", [
      { field: "geometry", message: "This value must be an object." },
    ]);
  }

  const geometry = raw as Record<string, unknown>;
  const dimensions = geometry.dimensionsMm as Record<string, unknown> | undefined;

  const axis = (name: "x" | "y" | "z"): number => {
    const value = dimensions?.[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
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
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new ValidationError("Geometry values must be finite numbers.", [
        { field: `geometry.${name}`, message: "This value must be a positive number." },
      ]);
    }
    return value;
  };

  const partCount = geometry.partCount;
  if (typeof partCount !== "number" || !Number.isInteger(partCount) || partCount < 1) {
    throw new ValidationError("Geometry must state how many parts it describes.", [
      { field: "geometry.partCount", message: "This value must be a whole number of at least 1." },
    ]);
  }

  return {
    dimensionsMm: { x: axis("x"), y: axis("y"), z: axis("z") },
    ...(optional("volumeMm3") !== undefined ? { volumeMm3: optional("volumeMm3") } : {}),
    ...(optional("surfaceAreaMm2") !== undefined
      ? { surfaceAreaMm2: optional("surfaceAreaMm2") }
      : {}),
    ...(optional("triangleCount") !== undefined
      ? { triangleCount: optional("triangleCount") }
      : {}),
    partCount,
  };
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const model = requireRecord(body.model ?? {});

    const response = calculateQuote({
      model: {
        name: readString(model, "name") ?? "",
        extension: (readString(model, "extension") ?? "").toLowerCase(),
        sizeBytes: readInteger(model, "sizeBytes", { min: 1 }),
        ...(model.triangles !== undefined
          ? { triangles: readInteger(model, "triangles", { min: 0 }) }
          : {}),
      },
      material: readString(body, "material") ?? "",
      ...(body.quality !== undefined
        ? { quality: readString(body, "quality", { required: false }) }
        : {}),
      ...(body.finish !== undefined
        ? { finish: readString(body, "finish", { required: false }) }
        : {}),
      quantity: readInteger(body, "quantity", { min: 1 }),
      ...(readGeometry(body) ? { geometry: readGeometry(body) } : {}),
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
        return failure(
          new (await import("@/lib/errors")).ManufacturabilityError(response.reason),
          "POST /api/quotes",
        );
      default:
        return failure(new Error(response.message), "POST /api/quotes");
    }
  } catch (error) {
    return failure(error, "POST /api/quotes");
  }
}
