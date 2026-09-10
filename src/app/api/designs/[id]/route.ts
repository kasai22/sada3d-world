import { deleteCustomerDesign, readCustomerDesign } from "@/lib/account/design-files";
import { designDetailDto, requireIdentity } from "@/lib/api/designs";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/api/rate-limit";
import { failure, ok } from "@/lib/api/respond";

/**
 * /api/designs/[id] — one of the signed-in customer's designs.
 *
 * GET     the design and, once verified, its analysis from the stored bytes.
 *         How the custom-print workflow restores a model after a reload.
 * DELETE  retires the design. Unlisted, undownloadable and unorderable at
 *         once; the object is removed after a grace period, and never while an
 *         order references it. Deleting twice succeeds.
 *
 * Someone else's design and a design that does not exist are the same 404.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const identity = await requireIdentity();
    enforceRateLimit(RATE_LIMITS.designRead, identity.id);

    const { id } = await params;
    const { design, analysis } = await readCustomerDesign(identity, id);

    return ok(designDetailDto(design, analysis), { private: true });
  } catch (error) {
    return failure(error, "GET /api/designs/[id]");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const identity = await requireIdentity();
    enforceRateLimit(RATE_LIMITS.designDelete, identity.id);

    const { id } = await params;
    await deleteCustomerDesign(identity, id);

    return ok({ deleted: true }, { private: true });
  } catch (error) {
    return failure(error, "DELETE /api/designs/[id]");
  }
}
