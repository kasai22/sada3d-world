import { cookies, headers } from "next/headers";

import { ShellFrame } from "@/components/ops/ShellFrame";
import { listOpsIssues } from "@/lib/ops/issues";
import { requireOperator } from "@/lib/ops/operator";
import { OPS_HOME, OPS_PATH_HEADER, SIDEBAR_COOKIE, safeOpsPath } from "@/lib/ops/routes";

import { searchConsoleAction, signOutAction } from "./actions";

/**
 * Reality 3D Admin's signed-in shell (the Stage 21 console, re-homed at
 * /admin in Stage 22.5).
 *
 * Operators authenticate with Payload (see `lib/ops/operator.ts`); the admin
 * reads the application's transactional tables through `lib/ops` and changes
 * them only by reporting events to the order service. Catalog writes go
 * through Payload's local API as the signed-in user.
 *
 * ── Where signing in returns to ──────────────────────────────────────────
 *
 * A layout cannot see the URL, so the proxy passes the console path it was
 * asked for as a header and this sends a signed-out visitor to the sign-in page
 * with that path to come back to. Both ends validate it, and it decides nothing
 * else.
 *
 * ── Not the only check ───────────────────────────────────────────────────
 *
 * Every page checks again with its own path, because a layout is not
 * re-rendered on client navigation, and every server action checks because an
 * action is a public endpoint. `console-guard.test.ts` enforces all three.
 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const asked = (await headers()).get(OPS_PATH_HEADER);
  const operator = await requireOperator(safeOpsPath(asked ?? OPS_HOME));

  const [issues, store] = await Promise.all([listOpsIssues(operator), cookies()]);

  return (
    <ShellFrame
      operator={{ name: operator.name, email: operator.email }}
      issues={{
        total: issues.length,
        high: issues.filter((issue) => issue.severity === "high").length,
        top: issues.slice(0, 6).map((issue) => ({
          id: issue.id,
          title: issue.title,
          subject: issue.subject,
          href: issue.href,
          severity: issue.severity,
        })),
      }}
      initialCollapsed={store.get(SIDEBAR_COOKIE)?.value === "collapsed"}
      search={searchConsoleAction}
      signOut={signOutAction}
    >
      {children}
    </ShellFrame>
  );
}
