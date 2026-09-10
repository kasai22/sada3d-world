import { after } from "next/server";

import { sweepDesignStorage } from "@/lib/account/design-files";
import { createUploadIntent } from "@/lib/account/design-uploads";
import { parseUploadIntent, requireIdentity, uploadIntentDto } from "@/lib/api/designs";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/api/rate-limit";
import { created, failure, ok, readJson } from "@/lib/api/respond";
import { EVENTS, log } from "@/lib/observability";

/**
 * POST /api/designs/upload-intents — authorise one upload.
 *
 * Body: `{ fileName, sizeBytes, sha256 }`. Nothing else is accepted.
 *
 *   201  a pending design and a signed PUT target, valid for ten minutes
 *   200  these exact bytes are already stored and verified; `upload` is null
 *   400  a name, size, type or checksum that cannot be accepted
 *   401  no signed-in customer
 *   429  too many requests, or too many uploads already in progress
 *   503  storage or its database is not available
 *
 * The bytes do not come here. A Vercel function accepts at most 4.5 MB of
 * request body and a model may be 200 MB, so the browser sends the file
 * straight to storage with the signed URL, and the server then verifies what
 * arrived. See `lib/storage/README.md`.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity();
    enforceRateLimit(RATE_LIMITS.uploadIntent, identity.id);

    const input = parseUploadIntent(await readJson(request));
    const intent = await createUploadIntent(identity, input);

    /*
     * Opportunistic maintenance, after the response: close abandoned uploads
     * and remove objects that are due. Bounded, and unable to affect this
     * request — whatever it finds is picked up again next time.
     */
    after(async () => {
      try {
        await sweepDesignStorage({ limit: 10 });
      } catch (error) {
        log.warn(EVENTS.storageCleanupRequired, {
          reason: `sweep_failed:${error instanceof Error ? error.name : "unknown"}`,
        });
      }
    });

    const body = uploadIntentDto(intent);
    return intent.status === "already_stored"
      ? ok(body, { private: true })
      : created(body, { private: true });
  } catch (error) {
    return failure(error, "POST /api/designs/upload-intents");
  }
}
