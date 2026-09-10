import { NextResponse } from "next/server";

import { authorizeDesignDownload } from "@/lib/account/design-files";
import { requireIdentity } from "@/lib/api/designs";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/api/rate-limit";
import { failure } from "@/lib/api/respond";

/**
 * GET /api/designs/[id]/file — the stored file, for its owner.
 *
 * A 302 to a signed storage URL valid for two minutes, not a proxy. The bytes
 * go from R2 to the browser directly rather than through a function that would
 * pay for every one of them twice. What this route controls is *whether* that
 * URL is issued, and it is issued only after the design is resolved from the
 * id, checked against the signed-in owner, found verified, its key confirmed
 * to be in that owner's namespace and its object confirmed to exist.
 *
 * The same URL serves the 3D viewer: the browser's loader requests this path,
 * follows the redirect and reads the model. The storage bucket's CORS policy
 * must allow GET from the site's origin — see `lib/storage/README.md`.
 *
 * There is no `?key=` and no other way to name an object.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await requireIdentity();
    enforceRateLimit(RATE_LIMITS.designDownload, identity.id);

    const { id } = await params;
    const signed = await authorizeDesignDownload(identity, id);

    const response = NextResponse.redirect(signed.url, 302);
    // The Location header is a credential for two minutes. Nothing may keep it.
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    return failure(error, "GET /api/designs/[id]/file");
  }
}
