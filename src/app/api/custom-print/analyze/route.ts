import { POST as analyze } from "../../models/analyze/route";

/**
 * POST /api/custom-print/analyze
 *
 * The same analysis, under the path the custom-print workflow reads naturally.
 * It delegates rather than reimplements: two routes that both "analyse a model"
 * but drifted apart would be two answers to one question, and the one a
 * customer saw would depend on which page they came from.
 *
 * `dynamic` is declared here rather than re-exported — Next reads a route's
 * segment config from the module itself, and a re-exported one is not seen.
 */
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return analyze(request);
}
