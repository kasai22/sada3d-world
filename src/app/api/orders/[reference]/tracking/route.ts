import { trackingItemDto } from "@/lib/api/dto";
import { authorizeOrderRead } from "@/lib/api/orders";
import { failure, ok } from "@/lib/api/respond";
import { referenceFromSegment } from "@/lib/orders/reference";

/**
 * GET /api/orders/[reference]/tracking — manufacturing progress.
 *
 * Built from the Phase 12 customer projection and narrowed again by the DTO.
 * Operator notes, actor names, machine identifiers and internal event types do
 * not exist on this side of `toCustomerTracking`, and the internal state it
 * does carry is dropped by `trackingItemDto`.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await params;
    const tracking = await authorizeOrderRead(referenceFromSegment(reference) ?? "");

    return ok(
      {
        reference: tracking.order.reference,
        status: tracking.order.status,
        items: tracking.order.items.map((item) =>
          trackingItemDto(
            item.id,
            item.name,
            item.fulfillmentStatus,
            item.manufacturingJobId
              ? tracking.jobs[item.manufacturingJobId]
              : undefined,
          ),
        ),
      },
      { private: true },
    );
  } catch (error) {
    return failure(error, "GET /api/orders/[reference]/tracking");
  }
}
