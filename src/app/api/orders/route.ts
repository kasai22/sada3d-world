import { orderSummaryDto } from "@/lib/api/dto";
import { listOrdersForApi } from "@/lib/api/orders";
import { failure, ok } from "@/lib/api/respond";

/**
 * GET /api/orders — the signed-in customer's orders.
 *
 * The handler does four things and none of them is business logic: call the
 * service, project the result, set the cache policy, map any error. Ownership,
 * ordering and what an order summary contains are all decided beneath it.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orders = await listOrdersForApi();
    return ok({ orders: orders.map(orderSummaryDto) }, { private: true });
  } catch (error) {
    return failure(error, "GET /api/orders");
  }
}
