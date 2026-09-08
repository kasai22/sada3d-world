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
 * Measured geometry.
 *
 * The seam for later analysis. Nothing populates this today, and the engine
 * treats its absence as the reason a quote is an estimate rather than a
 * verified price. Fields are optional so analysis can arrive incrementally.
 */
export interface GeometryAnalysis {
  /** cm³. */
  volume?: number;
  /** cm². */
  surfaceArea?: number;
  /** mm. */
  dimensions?: { x: number; y: number; z: number };
  /** Seconds. */
  estimatedPrintTime?: number;
  /** Grams. */
  estimatedMaterialWeight?: number;
}

export interface QuoteRequest {
  model: QuoteModelInput;
  material: string;
  quality?: string;
  finish?: string;
  quantity: number;
  /** Absent until geometry analysis exists. */
  geometry?: GeometryAnalysis;
}

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

/**
 * What the figure is derived from.
 *
 * `configuration` prices the selections only — it cannot account for the size
 * or complexity of the part, because nothing measures those yet. `geometry`
 * is reserved for a quote backed by real analysis.
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
  /**
   * True while the rules are demonstration values rather than approved
   * commercial pricing. The UI must say so wherever the total appears.
   */
  provisional: boolean;
}

export type QuoteErrorField =
  | "model"
  | "material"
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
