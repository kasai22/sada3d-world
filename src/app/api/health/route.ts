import { NextResponse } from "next/server";

/**
 * GET /api/health — liveness.
 *
 * "This process is running and can answer a request." Nothing more: it reads no
 * configuration and touches no dependency, so a database outage does not make
 * a platform restart healthy instances in a loop. Whether the application can
 * *serve* is `/api/ready`.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
