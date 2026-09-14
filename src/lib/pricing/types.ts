/**
 * Quote domain types.
 *
 * Pure data. Nothing here imports React, the database or the viewer, and the
 * engine returns numbers rather than formatted strings so that display
 * decisions stay in the UI.
 */

/* ------------------------------------------------------------------ *
 * Request
 * ------------------------------------------------------------------ */

export interface QuoteModelInput {
  name: string;
  /** Lowercase extension including the dot. */
  extension: string;
  sizeBytes: number;
  /** Triangle count, only where the file format states one. */
  triangles?: number;
}

/**
 * Measured geometry, as the quote engine may receive it.
 *
 * Millimetres throughout, matching the analyser — one unit system through the
 * pipeline, so nothing has to remember to convert.
 *
 * Optional fields are optional because they are genuinely sometimes
 * unmeasurable, not because they are unimplemented: an open mesh has no volume,
 * and the analyser refuses to invent one. A quote that received `undefined`
 * there is being told the truth.
 *
 * Note what is absent: print time and material weight. Both were on the Phase 8
 * placeholder and both are removed, because neither is measured. Print time
 * needs a slicer and material weight needs a density this repository does not
 * hold. A field that nothing can populate is an invitation to populate it with
 * a guess.
 */
export interface QuoteGeometryInput {
  /** Bounding dimensions in millimetres. */
  dimensionsMm: { x: number; y: number; z: number };
  /** Solid volume, only where the mesh is closed. */
  volumeMm3?: number;
  surfaceAreaMm2?: number;
  triangleCount?: number;
  /** Separately manufacturable objects the file declares. At least one. */
  partCount: number;
}

/**
 * What the engine did with geometry it was given.
 *
 * Recorded on the quote because "we measured your part" and "we priced your
 * part on its measurements" are different claims, and only the first is true
 * today.
 */
export type GeometryPricing =
  /** None was supplied. */
  | { state: "absent" }
  /**
   * Supplied, and no pricing rule consumes it.
   *
   * The measurements are real and are shown as file facts; the price is still
   * derived from the configuration alone. Phase 15 deliberately did not invent
   * a per-mm³ or per-hour rule to close this gap.
   */
  | { state: "supplied_not_priced"; reason: string };

export interface QuoteRequest {
  model: QuoteModelInput;
  material: string;
  /**
   * Optional. The process is implied by the material; when a client names one
   * it must be available and must be the material's own (Stage 19.9).
   */
  technology?: string;
  quality?: string;
  finish?: string;
  quantity: number;
  /**
   * Measured geometry, where analysis produced any.
   *
   * Accepted by the engine and not yet priced against — see `GeometryPricing`.
   */
  geometry?: QuoteGeometryInput;
}

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

/**
 * What the figure is derived from.
 *
 * **The price, not the inputs available.** A quote stays `configuration` even
 * when geometry was supplied, because no pricing rule reads geometry — calling
 * it `geometry` because measurements happened to be present would tell a
 * customer the figure accounts for the size of their part when it does not.
 *
 * It becomes `geometry` when, and only when, a rule in `rules.ts` prices
 * against a measured value.
 */
export type QuoteBasis = "configuration" | "geometry";

export interface QuoteLine {
  id: string;
  label: string;
  /** Whole rupees. Lines always sum exactly to the total. */
  amount: number;
  /** Technical note, e.g. "× 3 units". */
  detail?: string;
}

export interface ManufacturingQuote {
  currency: "INR";
  basis: QuoteBasis;
  quantity: number;
  lines: readonly QuoteLine[];
  /** Sum of the lines, in whole rupees. */
  total: number;
  /** Costs deliberately not included, stated to the customer. */
  excluded: readonly string[];
  /** Identifies the rule set a figure came from. */
  rulesVersion: string;
  /** Whether measured geometry reached the engine, and what it did with it. */
  geometry: GeometryPricing;
  /**
   * True while the rules are demonstration values rather than approved
   * commercial pricing. The UI must say so wherever the total appears.
   */
  provisional: boolean;
}

export type QuoteErrorField =
  | "model"
  | "material"
  | "technology"
  | "quality"
  | "finish"
  | "quantity";

export interface QuoteValidationError {
  field: QuoteErrorField;
  message: string;
}

export type QuoteResponse =
  | { status: "available"; quote: ManufacturingQuote }
  | { status: "unavailable"; reason: string }
  | { status: "invalid"; errors: readonly QuoteValidationError[] }
  | { status: "error"; message: string };
