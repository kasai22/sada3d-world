"use server";

import { currentOperator } from "@/lib/ops/operator";
import { searchOps, type SearchResult } from "@/lib/ops/search";

/**
 * Console-wide search, for the command menu.
 *
 * A public POST endpoint like every server action, so it resolves the operator
 * itself. A signed-out caller gets no results and a sentence, never data.
 */
export async function searchConsoleAction(
  query: string,
): Promise<{ results: SearchResult[]; error?: string }> {
  const operator = await currentOperator();
  if (!operator) {
    return { results: [], error: "Your operator session has ended. Sign in again to search." };
  }

  try {
    return { results: await searchOps(operator, query) };
  } catch {
    return { results: [], error: "Search is unavailable right now." };
  }
}
