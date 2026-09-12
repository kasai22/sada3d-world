"use client";

import { useActionState, useId, useRef } from "react";
import clsx from "clsx";

import { Button } from "@/components/core/Button";
import type { ManufacturingEventType, ManufacturingHoldReason, ManufacturingState } from "@/lib/manufacturing/types";
import { HOLD_REASONS, HOLD_REASON_LABEL } from "@/lib/ops/labels";
import type { ShipmentEventType } from "@/lib/orders/shipment";
import type { ShipmentStatus } from "@/lib/orders/types";
import type { OpsActionResult } from "@/lib/ops/types";

import styles from "./OrderActions.module.css";

/**
 * The operator's controls on an order.
 *
 * Each form posts to a server action that re-checks the operator, re-reads the
 * record and asks the state machine; nothing here decides whether a step is
 * allowed. The buttons shown are the ones the machine said were available when
 * the page rendered, and the state they were rendered against travels with the
 * form so a change made meanwhile by someone else is refused rather than
 * repeated.
 *
 * Results are announced in a status region beside the controls. Steps that end
 * something ask for confirmation in a native modal dialog first.
 */

export type OpsFormAction = (previous: OpsActionResult | null, form: FormData) => Promise<OpsActionResult>;

export interface EventOption<T extends string> {
  type: T;
  label: string;
  destructive: boolean;
}

function ActionMessage({ result }: { result: OpsActionResult | null }) {
  return (
    <p
      className={clsx(styles.message, result && (result.ok ? styles.success : styles.failure))}
      role="status"
      aria-live="polite"
    >
      {result?.message}
    </p>
  );
}

function Hidden({ values }: { values: Record<string, string> }) {
  return (
    <>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

/** A destructive step behind a confirmation dialog. */
function ConfirmStep({
  label,
  description,
  hidden,
  eventName,
  eventValue,
  submit,
  pending,
  withNote,
}: {
  label: string;
  description: string;
  hidden: Record<string, string>;
  eventName: string;
  eventValue: string;
  submit: (form: FormData) => void;
  pending: boolean;
  withNote: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const noteId = useId();

  return (
    <>
      <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => dialog.current?.showModal()}>
        {label}
      </Button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}>
        <form
          action={(form) => {
            dialog.current?.close();
            submit(form);
          }}
          className={styles.dialogForm}
        >
          <Hidden values={{ ...hidden, [eventName]: eventValue }} />
          <h2 id={titleId} className={styles.dialogTitle}>
            {label}?
          </h2>
          <p className={styles.dialogText}>{description}</p>
          {withNote && (
            <div className={styles.field}>
              <label htmlFor={noteId} className={styles.label}>
                Reason (internal)
              </label>
              <textarea id={noteId} name="note" maxLength={500} rows={3} className={styles.textarea} />
            </div>
          )}
          <div className={styles.dialogButtons}>
            <Button type="button" size="sm" variant="secondary" onClick={() => dialog.current?.close()} autoFocus>
              Keep it
            </Button>
            <Button type="submit" size="sm" variant="destructive">
              {label}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

const DESTRUCTIVE_COPY: Partial<Record<ManufacturingEventType | ShipmentEventType, string>> = {
  JOB_FAILED:
    "The part will be recorded as unrecoverable and the item as failed. This cannot be undone, and no refund is issued by this step.",
  JOB_CANCELLED:
    "Production of this part stops and the item is cancelled. This cannot be undone, and no refund is issued by this step.",
  SHIPMENT_FAILED: "The carrier could not deliver this parcel. Its items will be recorded as failed.",
  SHIPMENT_CANCELLED: "This parcel will not be sent. Its items return to ready and can go in a new shipment.",
};

/* ------------------------------------------------------------------ *
 * Manufacturing
 * ------------------------------------------------------------------ */

export function JobControls({
  reference,
  jobId,
  state,
  options,
  hold,
  eventAction,
  holdAction,
}: {
  reference: string;
  jobId: string;
  state: ManufacturingState;
  options: readonly EventOption<ManufacturingEventType>[];
  hold?: { reason: ManufacturingHoldReason };
  eventAction: OpsFormAction;
  holdAction: OpsFormAction;
}) {
  const [eventResult, submitEvent, eventPending] = useActionState(eventAction, null);
  const [holdResult, submitHold, holdPending] = useActionState(holdAction, null);
  const noteId = useId();
  const reasonId = useId();
  const holdNoteId = useId();

  const steps = options.filter((option) => !option.destructive);
  const endings = options.filter((option) => option.destructive);
  const hidden = { reference, jobId, expectedState: state };

  if (options.length === 0) return null;

  return (
    <div className={styles.controls}>
      {steps.length > 0 && (
        <form action={submitEvent} className={styles.stepForm}>
          <Hidden values={hidden} />
          <div className={clsx(styles.field, styles.noteField)}>
            <label htmlFor={noteId} className={styles.label}>
              Note <span className={styles.optional}>optional · internal</span>
            </label>
            <input id={noteId} name="note" maxLength={500} className={styles.input} autoComplete="off" />
          </div>
          <div className={styles.buttons}>
            {steps.map((option, index) => (
              <Button
                key={option.type}
                type="submit"
                name="event"
                value={option.type}
                size="sm"
                variant={index === 0 ? "primary" : "secondary"}
                loading={eventPending}
                disabled={eventPending || holdPending}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </form>
      )}

      <div className={styles.secondaryRow}>
        {hold ? (
          <form action={submitHold} className={styles.inline}>
            <Hidden values={{ reference, jobId, intent: "lift" }} />
            <Button type="submit" size="sm" variant="secondary" loading={holdPending} disabled={holdPending}>
              Lift hold
            </Button>
          </form>
        ) : (
          <details className={styles.disclosure}>
            <summary className={styles.summary}>Place on hold</summary>
            <form action={submitHold} className={styles.holdForm}>
              <Hidden values={{ reference, jobId, intent: "place" }} />
              <div className={styles.field}>
                <label htmlFor={reasonId} className={styles.label}>
                  Reason
                </label>
                <select id={reasonId} name="reason" required defaultValue="" className={styles.select}>
                  <option value="" disabled>
                    Choose a reason
                  </option>
                  {HOLD_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {HOLD_REASON_LABEL[reason]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={clsx(styles.field, styles.noteField)}>
                <label htmlFor={holdNoteId} className={styles.label}>
                  Note <span className={styles.optional}>optional · internal</span>
                </label>
                <input id={holdNoteId} name="note" maxLength={500} className={styles.input} autoComplete="off" />
              </div>
              <Button type="submit" size="sm" variant="secondary" loading={holdPending} disabled={holdPending}>
                Place hold
              </Button>
            </form>
          </details>
        )}

        {endings.map((option) => (
          <ConfirmStep
            key={option.type}
            label={option.label}
            description={DESTRUCTIVE_COPY[option.type] ?? "This cannot be undone."}
            hidden={hidden}
            eventName="event"
            eventValue={option.type}
            submit={submitEvent}
            pending={eventPending}
            withNote
          />
        ))}
      </div>

      <ActionMessage result={holdResult ?? eventResult} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Shipping
 * ------------------------------------------------------------------ */

export function OpenShipmentForm({
  reference,
  items,
  action,
}: {
  reference: string;
  items: readonly { id: string; name: string; quantity: number }[];
  action: OpsFormAction;
}) {
  const [result, submit, pending] = useActionState(action, null);
  const legendId = useId();
  const carrierId = useId();
  const trackingId = useId();
  const urlId = useId();

  return (
    <form action={submit} className={styles.shipmentForm}>
      <input type="hidden" name="reference" value={reference} />
      <fieldset className={styles.fieldset} aria-labelledby={legendId}>
        <legend id={legendId} className={styles.label}>
          Items ready to ship
        </legend>
        {items.map((item) => (
          <label key={item.id} className={styles.checkRow}>
            <input type="checkbox" name="itemIds" value={item.id} defaultChecked />
            <span>{item.name}</span>
            <span className={styles.quantity}>× {item.quantity}</span>
          </label>
        ))}
      </fieldset>
      <div className={styles.shipmentFields}>
        <div className={styles.field}>
          <label htmlFor={carrierId} className={styles.label}>
            Carrier <span className={styles.optional}>optional</span>
          </label>
          <input id={carrierId} name="carrier" maxLength={80} className={styles.input} autoComplete="off" />
        </div>
        <div className={styles.field}>
          <label htmlFor={trackingId} className={styles.label}>
            Tracking number <span className={styles.optional}>optional</span>
          </label>
          <input id={trackingId} name="trackingNumber" maxLength={80} className={styles.input} autoComplete="off" />
        </div>
        <div className={clsx(styles.field, styles.wide)}>
          <label htmlFor={urlId} className={styles.label}>
            Tracking link <span className={styles.optional}>optional</span>
          </label>
          <input
            id={urlId}
            name="trackingUrl"
            type="url"
            maxLength={500}
            placeholder="https://"
            className={styles.input}
            autoComplete="off"
          />
        </div>
      </div>
      <div className={styles.buttons}>
        <Button type="submit" size="sm" variant="primary" iconLeft="package" loading={pending} disabled={pending}>
          Open shipment
        </Button>
      </div>
      <ActionMessage result={result} />
    </form>
  );
}

export function ShipmentControls({
  reference,
  shipmentId,
  status,
  options,
  action,
}: {
  reference: string;
  shipmentId: string;
  status: ShipmentStatus;
  options: readonly EventOption<ShipmentEventType>[];
  action: OpsFormAction;
}) {
  const [result, submit, pending] = useActionState(action, null);
  if (options.length === 0) return null;

  const hidden = { reference, shipmentId, expectedStatus: status };
  const steps = options.filter((option) => !option.destructive);
  const endings = options.filter((option) => option.destructive);

  return (
    <div className={styles.controls}>
      <div className={styles.secondaryRow}>
        {steps.length > 0 && (
          <form action={submit} className={styles.buttons}>
            <Hidden values={hidden} />
            {steps.map((option, index) => (
              <Button
                key={option.type}
                type="submit"
                name="event"
                value={option.type}
                size="sm"
                variant={index === 0 ? "primary" : "secondary"}
                loading={pending}
                disabled={pending}
              >
                {option.label}
              </Button>
            ))}
          </form>
        )}
        {endings.map((option) => (
          <ConfirmStep
            key={option.type}
            label={option.label}
            description={DESTRUCTIVE_COPY[option.type] ?? "This cannot be undone."}
            hidden={hidden}
            eventName="event"
            eventValue={option.type}
            submit={submit}
            pending={pending}
            withNote={false}
          />
        ))}
      </div>
      <ActionMessage result={result} />
    </div>
  );
}
