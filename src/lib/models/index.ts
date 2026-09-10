import { ModelParseError } from "@/lib/errors";
import { analyzeGeometry } from "@/lib/geometry/analyze";
import type { GeometryAnalysisResult } from "@/lib/geometry/types";

import { objParser, stlParser } from "./mesh";
import { threeMfParser } from "./threemf";
import { extensionOf, type ModelInput, type ModelParser, type ParsedModel } from "./types";

export type { ModelInput, ModelParser, ParsedMesh, ParsedModel, ParsedObject } from "./types";
export { extensionOf } from "./types";
export { modelIdentity, analysisIdentity, ANALYSIS_VERSION } from "./identity";

/**
 * The parser registry.
 *
 * Ordered by preference: 3MF first, because it is the only one of the three
 * that records its own unit and its own object structure, and a measurement is
 * better when the file states what it means rather than leaving it to a
 * convention.
 */
export const MODEL_PARSERS: readonly ModelParser[] = [
  threeMfParser,
  stlParser,
  objParser,
];

export { threeMfParser, stlParser, objParser };

/** Extensions the mesh analyser accepts, in preference order. */
export const ANALYZABLE_EXTENSIONS: readonly string[] = MODEL_PARSERS.flatMap(
  (parser) => parser.extensions,
);

/**
 * Formats that are accepted for manufacturing but cannot be mesh-analysed.
 *
 * STEP is a boundary representation: there are no triangles in it. Converting
 * it would need a CAD kernel, which this application does not have and will not
 * pretend to have. It remains uploadable and quotable by configuration, and the
 * interface says analysis is unavailable for it rather than failing obscurely.
 */
export const UNANALYZABLE_EXTENSIONS: readonly string[] = [".step", ".stp"];

export function parserFor(fileName: string): ModelParser | undefined {
  const extension = extensionOf(fileName);
  return MODEL_PARSERS.find((parser) => parser.extensions.includes(extension));
}

/** Whether the mesh analyser can measure this file at all. */
export function isAnalyzable(fileName: string): boolean {
  return parserFor(fileName) !== undefined;
}

export async function parseModel(input: ModelInput): Promise<ParsedModel> {
  const parser = parserFor(input.fileName);

  if (!parser) {
    const extension = extensionOf(input.fileName);

    if (UNANALYZABLE_EXTENSIONS.includes(extension)) {
      throw new ModelParseError(
        "STEP files describe surfaces rather than a mesh, so they cannot be measured here. Upload a 3MF, STL or OBJ for analysis.",
      );
    }

    throw new ModelParseError(
      "This file type cannot be analysed. Upload a 3MF, STL or OBJ.",
    );
  }

  return parser.parse(input);
}

/**
 * Parse and measure, in one call.
 *
 * The two are separate underneath — a parser produces triangles, the analyser
 * measures them — and joined here because every caller wants both and no caller
 * should have to know the order.
 */
export async function analyzeModel(
  input: ModelInput,
): Promise<GeometryAnalysisResult> {
  return analyzeGeometry(await parseModel(input));
}
