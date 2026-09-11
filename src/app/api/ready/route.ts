import { NextResponse } from "next/server";

import { RATE_LIMITS, enforceRateLimit, sourceSubject } from "@/lib/api/rate-limit";
import { failure } from "@/lib/api/respond";
import { checkReadiness } from "@/lib/api/readiness";

/**
 * GET /api/ready — readiness.
 *
 * 200 when this instance can serve, 503 when it cannot, with one boolean per
 * dependency. See `lib/api/readiness` for what each check means and why the
 * report carries nothing else. Never cached: a stale "ready" is worse than
 * none.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Each call pings the database; a public endpoint must not be a way to do that in a loop.
    enforceRateLimit(RATE_LIMITS.readinessSource, sourceSubject(request.headers));

    const report = await checkReadiness();

    return NextResponse.json(report, {
      status: report.ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error, "GET /api/ready");
  }
}
