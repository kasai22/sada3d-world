"use server";

import { redirect } from "next/navigation";

import { currentOperator } from "@/lib/ops/operator";
import { OPERATOR_LOGIN_PATH } from "@/lib/ops/routes";
import { searchOps, type SearchResult } from "@/lib/ops/search";

/**
 * Admin-wide search, for the command menu.
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

/**
 * Signs the operator out with Payload's own logout operation, which ends the
 * session and clears the cookie. Resolving the operator first keeps the rule
 * that every action checks; signing out with no session is simply a no-op.
 */
export async function signOutAction(): Promise<void> {
  const operator = await currentOperator();
  if (operator) {
    const [{ logout }, { default: config }] = await Promise.all([
      import("@payloadcms/next/auth"),
      import("@payload-config"),
    ]);
    await logout({ config });
  }
  redirect(`${OPERATOR_LOGIN_PATH}?signedOut=1`);
}
