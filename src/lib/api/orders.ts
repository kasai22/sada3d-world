import { requireCustomerContext } from "@/lib/account/identity";
import { getCustomerOrder, listCustomerOrders } from "@/lib/account/orders";
import {
  InvalidStateTransitionError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";
import { hasGrant } from "@/lib/orders/grants";
import { parseOrderReference } from "@/lib/orders/reference";
import { applyManufacturingEvent, getOrderTracking } from "@/lib/orders/service";
import type { OrderTracking } from "@/lib/orders/service";

/**
 * Order access, for the API.
 *
 * ── Authorization ────────────────────────────────────────────────────────
 *
 * Two ways to be allowed to read an order, both established server-side and
 * neither derived from anything the request body says:
 *
 *   ACCOUNT   the order's `customerId` matches the signed-in identity, which
 *             comes from the auth adapter. Phase 17 makes this the main path.
 *   GRANT     the Phase 12 receipt cookie or a lookup that proved the reference
 *             and the email together. HttpOnly, server-issued, unforgeable.
 *
 * **A customer id is never read from a request.** There is no query parameter,
 * header or body field that names whose order to fetch, which is why there is
 * no way to ask for someone else's.
 *
 * ── Not found and not yours are the same answer ──────────────────────────
 *
 * Both produce `NotFoundError` and a 404. Distinguishing them would turn the
 * URL into an oracle for which references exist — and references are
 * sequential, so that is a list anyone could then walk. This is the Phase 12
 * rule, unchanged, carried into HTTP.
 */

/**
 * Whether this caller holds a Phase 12 grant for the reference.
 *
 * Reading cookies needs a request scope. Outside one — a scheduled job, a
 * test — there are no cookies, which means no grant, which is the correct
 * answer rather than an error. Failing open here would be the bug; this fails
 * closed.
 */
async function holdsGrant(reference: string): Promise<boolean> {
  try {
    return await hasGrant(reference);
  } catch {
    return false;
  }
}

/** Whoever is asking, and what that entitles them to. */
export async function authorizeOrderRead(reference: string): Promise<OrderTracking> {
  // Text that is not a reference names no order; it is not looked up at all.
  const normalised = parseOrderReference(reference);

  if (!normalised) throw new NotFoundError("That order could not be found.");

  const gate = await requireCustomerContext();

  if (gate.authenticated) {
    const owned = await getCustomerOrder(gate.context.identity, normalised);
    if (owned) return owned;
  }

  /*
   * No account, or an account that does not own it. The guest grant is checked
   * next and is the path a customer who ordered without an account uses.
   */
  if (await holdsGrant(normalised)) {
    const tracking = await getOrderTracking(normalised);
    if (tracking) return tracking;
  }

  throw new NotFoundError("That order could not be found.");
}

/**
 * The signed-in customer's orders.
 *
 * Requires an account: there is no guest equivalent of "list my orders",
 * because a grant is per order and listing would mean enumerating.
 */
export async function listOrdersForApi() {
  const gate = await requireCustomerContext();

  if (!gate.authenticated) {
    throw new UnauthorizedError("Sign in to see your orders.");
  }

  return listCustomerOrders(gate.context.identity);
}

/* ------------------------------------------------------------------ *
 * Customer-initiated commands
 * ------------------------------------------------------------------ */

/**
 * What a customer may ask an order to do.
 *
 * Deliberately tiny, and deliberately not the event vocabulary. The internal
 * machine has twenty event types — `PRINT_STARTED`, `QUALITY_APPROVED` — and
 * none of them is something a customer causes. Exposing them over HTTP would
 * mean a request could claim a part had been printed.
 *
 * So this is a *command* vocabulary: what the customer wants, expressed in
 * their terms. The service decides whether the machine allows it.
 */
export type CustomerOrderCommand = "cancel";

const COMMANDS: readonly CustomerOrderCommand[] = ["cancel"];

export function parseCommand(value: unknown): CustomerOrderCommand {
  if (typeof value !== "string" || !COMMANDS.includes(value as CustomerOrderCommand)) {
    throw new ValidationError(
      "That is not something you can ask this order to do.",
      [{ field: "command", message: `Expected one of: ${COMMANDS.join(", ")}.` }],
    );
  }

  return value as CustomerOrderCommand;
}

export interface CommandResult {
  reference: string;
  command: CustomerOrderCommand;
  /** What actually changed. False where the request was already satisfied. */
  applied: boolean;
  message: string;
}

/**
 * Applies a customer command.
 *
 * The pipeline the brief requires, and the HTTP layer owns none of it:
 *
 *   validate → authorize → domain service → state machine → persist → project
 *
 * Cancellation is attempted through `applyManufacturingEvent`, so the Phase 12
 * machine decides. A part already on a machine refuses, and the refusal comes
 * back as the machine's own reason rather than a message invented here.
 */
export async function applyCustomerCommand(
  reference: string,
  command: CustomerOrderCommand,
): Promise<CommandResult> {
  // Authorization first, and it throws the same 404 for "not yours".
  const tracking = await authorizeOrderRead(reference);
  const order = tracking.order;

  if (command === "cancel") {
    if (order.status === "cancelled") {
      return {
        reference: order.reference,
        command,
        applied: false,
        message: "This order is already cancelled.",
      };
    }

    /*
     * Custom items are the ones with a manufacturing job, and the job's own
     * state decides whether cancelling is still possible. A catalog item has no
     * job — withdrawing one is a fulfilment decision this phase does not model,
     * and pretending otherwise would be inventing a policy.
     */
    const jobs = Object.entries(tracking.jobs);

    if (jobs.length === 0) {
      throw new InvalidStateTransitionError(
        "This order cannot be cancelled here. Contact Reality 3D and quote the order reference.",
      );
    }

    const failures: string[] = [];
    let applied = false;

    for (const item of order.items) {
      if (!item.manufacturingJobId) continue;

      const result = await applyManufacturingEvent(item.manufacturingJobId, {
        // Deterministic, so a retried request is the same event and not a second.
        id: `${item.manufacturingJobId}_customer_cancel`,
        type: "JOB_CANCELLED",
        actor: "customer",
      });

      if (!result.ok) failures.push(result.reason);
      else if (result.changed) applied = true;
    }

    if (!applied && failures.length > 0) {
      // The machine's reason, which is written for a person.
      throw new InvalidStateTransitionError(
        failures[0] ?? "This order can no longer be cancelled.",
      );
    }

    return {
      reference: order.reference,
      command,
      applied,
      message: applied
        ? "Cancellation has been recorded for the parts that had not started."
        : "Nothing on this order could be cancelled.",
    };
  }

  throw new ValidationError("That command is not supported.");
}
