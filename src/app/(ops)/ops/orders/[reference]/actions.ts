"use server";

import { revalidatePath } from "next/cache";

import { EVENTS, log } from "@/lib/observability";
import {
  changeJobHold,
  openShipment,
  reportJobEvent,
  reportShipmentEvent,
} from "@/lib/ops/mutations";
import { currentOperator, type OperatorSession } from "@/lib/ops/operator";
import type { OpsActionResult } from "@/lib/ops/types";

/**
 * The console's write endpoints.
 *
 * Each is a public POST, so each resolves the operator itself — the page that
 * rendered the form is not a check. Nothing here decides whether a change is
 * allowed: the shape is read from the form, the operator is proved, and
 * `lib/ops/mutations` re-reads the record and asks the order service.
 *
 * A success revalidates the console, so the page, the pipeline and the issue
 * count all reflect the change on the next render.
 */

const SIGNED_OUT: OpsActionResult = {
  ok: false,
  message: "Your operator session has ended. Sign in again, then try once more.",
};

const FAILED: OpsActionResult = {
  ok: false,
  message: "That change could not be completed. Reload the page to see the current state.",
};

function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value !== "" ? value : undefined;
}

function list(form: FormData, name: string): string[] {
  return form.getAll(name).filter((value): value is string => typeof value === "string");
}

async function run(
  action: string,
  work: (operator: OperatorSession) => Promise<OpsActionResult>,
): Promise<OpsActionResult> {
  const operator = await currentOperator();
  if (!operator) return SIGNED_OUT;

  try {
    const result = await work(operator);
    if (result.ok) revalidatePath("/ops", "layout");
    return result;
  } catch (error) {
    log.error(EVENTS.opsActionRefused, {
      operatorId: operator.id,
      action,
      error: error instanceof Error ? error.name : "unknown",
    });
    return FAILED;
  }
}

export async function jobEventAction(
  _previous: OpsActionResult | null,
  form: FormData,
): Promise<OpsActionResult> {
  return run("job_event", (operator) =>
    reportJobEvent(operator, {
      reference: text(form, "reference"),
      jobId: text(form, "jobId"),
      event: text(form, "event"),
      expectedState: text(form, "expectedState"),
      note: text(form, "note"),
    }),
  );
}

export async function jobHoldAction(
  _previous: OpsActionResult | null,
  form: FormData,
): Promise<OpsActionResult> {
  return run("job_hold", (operator) =>
    changeJobHold(operator, {
      reference: text(form, "reference"),
      jobId: text(form, "jobId"),
      intent: text(form, "intent"),
      reason: text(form, "reason"),
      note: text(form, "note"),
    }),
  );
}

export async function openShipmentAction(
  _previous: OpsActionResult | null,
  form: FormData,
): Promise<OpsActionResult> {
  return run("shipment_open", (operator) =>
    openShipment(operator, {
      reference: text(form, "reference"),
      itemIds: list(form, "itemIds"),
      carrier: text(form, "carrier"),
      trackingNumber: text(form, "trackingNumber"),
      trackingUrl: text(form, "trackingUrl"),
    }),
  );
}

export async function shipmentEventAction(
  _previous: OpsActionResult | null,
  form: FormData,
): Promise<OpsActionResult> {
  return run("shipment_event", (operator) =>
    reportShipmentEvent(operator, {
      reference: text(form, "reference"),
      shipmentId: text(form, "shipmentId"),
      event: text(form, "event"),
      expectedStatus: text(form, "expectedStatus"),
    }),
  );
}
