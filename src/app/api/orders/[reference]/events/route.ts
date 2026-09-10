import { applyCustomerCommand, parseCommand } from "@/lib/api/orders";
import { failure, ok, readJson, requireRecord } from "@/lib/api/respond";

/**
 * POST /api/orders/[reference]/events — a customer-initiated command.
 *
 * The route validates the shape and hands over. It cannot set a state: the body
 * carries a *command* ("cancel"), never an event type and never a target state,
 * so there is no request that says `status = "printing"`.
 *
 * What happens to it is the Phase 12 machine's decision. A refusal comes back
 * as 409 with the machine's own reason.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await params;
    const body = requireRecord(await readJson(request));
    const command = parseCommand(body.command);

    const result = await applyCustomerCommand(
      decodeURIComponent(reference),
      command,
    );

    return ok(result, { private: true });
  } catch (error) {
    return failure(error, "POST /api/orders/[reference]/events");
  }
}
