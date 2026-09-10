import { completeUpload } from "@/lib/account/design-uploads";
import { designDetailDto, requireIdentity } from "@/lib/api/designs";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/api/rate-limit";
import { failure, ok } from "@/lib/api/respond";

/**
 * POST /api/designs/[id]/upload-complete — verify what was uploaded.
 *
 * No body is read. The design id in the path is the whole request: the key,
 * the declared size and the declared checksum are already on the server, and
 * the stored object is compared against them.
 *
 *   200  verified, with the authoritative analysis from the stored bytes
 *   404  no such design for this customer
 *   409  the object has not arrived yet and the upload window is still open
 *   422  verification refused the file; the same answer on every retry
 *   503  storage unavailable; the design stays pending and a retry resumes
 *
 * Idempotent. Calling it again after success returns the same design.
 */
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await requireIdentity();
    enforceRateLimit(RATE_LIMITS.uploadComplete, identity.id);

    const { id } = await params;
    const result = await completeUpload(identity, id);

    return ok(designDetailDto(result.design, result.analysis), { private: true });
  } catch (error) {
    return failure(error, "POST /api/designs/[id]/upload-complete");
  }
}
