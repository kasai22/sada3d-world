import { applyCustomerCommand, parseCommand } from "@/lib/api/orders";
import {
  assertSameOrigin,
  failure,
  ok,
  readJson,
  rejectUnknownFields,
  requireRecord,
} from "@/lib/api/respond";
import { referenceFromSegment } from "@/lib/orders/reference";

/**
 * POST /api/orders/[reference]/events — a customer-initiated command.
 *
 * The route validates the shape and hands over. It cannot set a state: the body
 * carries a *command* ("cancel"), never an event type and never a target state,
 * so there is no request that says `status = "printing"` — and a body that
 * tries to add `type`, `to` or `actor` beside the command is refused.
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
    assertSameOrigin(request);
    const { reference } = await params;
    const body = requireRecord(await readJson(request));
    rejectUnknownFields(body, ["command"]);
    const command = parseCommand(body.command);

    // A segment that is not a reference is authorised as nothing: a 404.
    const result = await applyCustomerCommand(referenceFromSegment(reference) ?? "", command);

    return ok(result, { private: true });
  } catch (error) {
    return failure(error, "POST /api/orders/[reference]/events");
  }
}
