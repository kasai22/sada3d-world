import { orderDetailDto } from "@/lib/api/dto";
import { authorizeOrderRead } from "@/lib/api/orders";
import { failure, ok } from "@/lib/api/respond";

/**
 * GET /api/orders/[reference] — one order, for someone entitled to it.
 *
 * "Entitled" is decided by `authorizeOrderRead`: an account that owns it, or a
 * Phase 12 grant. An unknown reference and someone else's order produce the
 * same 404, so this URL cannot be used to discover which references exist.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await params;
    const tracking = await authorizeOrderRead(decodeURIComponent(reference));
    return ok({ order: orderDetailDto(tracking.order) }, { private: true });
  } catch (error) {
    return failure(error, "GET /api/orders/[reference]");
  }
}
