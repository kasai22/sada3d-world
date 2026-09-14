import clsx from "clsx";

import { Icon, Tag } from "@/components/core";
import { ManufacturingTimeline, type ManufacturingStage } from "@/components/manufacturing";
import { formatINR } from "@/lib/money";
import {
  CUSTOMER_STAGES,
  CUSTOMER_STAGE_LABEL,
  HOLD_MESSAGE,
  furthestStageInHistory,
  stageIndex,
  type CustomerManufacturingStage,
  type CustomerManufacturingTracking,
} from "@/lib/manufacturing";
import {
  ITEM_STATUS_LABEL,
  SHIPMENT_STATUS_LABEL,
  type OrderItem,
  type Shipment,
} from "@/lib/orders/types";

import { LocalTime } from "./LocalTime";
import styles from "./ItemTracking.module.css";

export interface ItemTrackingProps {
  item: OrderItem;
  /** Present only for a custom item. A stocked part has no manufacturing. */
  manufacturing?: CustomerManufacturingTracking;
  /** The parcel carrying this item, once one exists. */
  shipment?: Shipment;
}

/**
 * One item's progress.
 *
 * Three separate facts, shown as three separate things because they are:
 *
 *   fulfilment status  where this item has got to commercially
 *   manufacturing      how a custom part is being made — custom items only
 *   shipment           where the parcel is
 *
 * A stocked catalog part gets no manufacturing section at all. Inventing
 * production stages for something taken off a shelf would be inventing facts.
 */
export function ItemTracking({ item, manufacturing, shipment }: ItemTrackingProps) {
  const custom = item.type === "custom";
  const failed = manufacturing?.state === "failed";
  const cancelled = manufacturing?.state === "cancelled";

  /*
   * The timeline marks what the part has actually been through. The current
   * stage is derived from the state, and two states — finishing and rework —
   * map back to an earlier stage, so the marks come from the furthest stage
   * reached rather than from the current one. Nothing the customer was told
   * un-happens.
   */
  const current = manufacturing?.stage ?? null;
  const reached = manufacturing
    ? furthestStageInHistory(manufacturing.history)
    : null;

  const stages: ManufacturingStage[] = CUSTOMER_STAGES.map((stage) => {
    const index = stageIndex(stage);
    const currentIndex = stageIndex(current);
    const reachedIndex = stageIndex(reached);

    if (failed && index === Math.max(currentIndex, reachedIndex, 0)) {
      return { label: CUSTOMER_STAGE_LABEL[stage], state: "failed" as const };
    }

    return {
      label: CUSTOMER_STAGE_LABEL[stage],
      state:
        index === currentIndex && !cancelled && !failed
          ? ("active" as const)
          : index <= reachedIndex
            ? ("complete" as const)
            : ("pending" as const),
      // The time this stage was last reached. No estimate, no percentage.
      meta: lastEventAt(manufacturing, stage),
    };
  });

  return (
    <li className={styles.item}>
      <div className={styles.head}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon name={custom ? "box" : "package"} size={20} />
        </span>

        <div className={styles.identity}>
          {custom && (
            <Tag tone="accent" className={styles.kind}>
              Custom part
            </Tag>
          )}
          <h3 className={styles.name}>{item.name}</h3>
          <p className={styles.spec}>{item.spec}</p>
        </div>

        <div className={styles.figures}>
          <span className={styles.quantity}>× {item.quantity}</span>
          <span className={styles.price}>{formatINR(item.lineTotal)}</span>
        </div>
      </div>

      <dl className={styles.status}>
        <div className={styles.statusRow}>
          <dt className={styles.statusKey}>Item status</dt>
          <dd className={styles.statusValue}>
            {ITEM_STATUS_LABEL[item.fulfillmentStatus]}
          </dd>
        </div>

        {manufacturing && (
          <div className={styles.statusRow}>
            <dt className={styles.statusKey}>Manufacturing</dt>
            <dd className={clsx(styles.statusValue, failed && styles.statusFailed)}>
              {failed
                ? "Issue"
                : cancelled
                  ? "Cancelled"
                  : current
                    ? CUSTOMER_STAGE_LABEL[current]
                    : "—"}
            </dd>
          </div>
        )}
      </dl>

      {/* ---- manufacturing ---- */}
      {manufacturing && !cancelled && (
        <section className={styles.section} aria-label={`Manufacturing progress for ${item.name}`}>
          {failed ? (
            <div className={styles.exception} role="status">
              <Icon name="alert" size={16} />
              <div>
                <p className={styles.exceptionTitle}>Manufacturing issue</p>
                <p className={styles.exceptionBody}>
                  Production could not be completed for this part. Reality 3D will
                  be in touch about what happens next.
                </p>
              </div>
            </div>
          ) : (
            <>
              {manufacturing.hold && (
                /*
                 * The stage stays visible above; the hold explains why it is
                 * not moving. A dozen "paused_" stage names would say less.
                 */
                <div className={styles.exception} role="status">
                  <Icon name="info" size={16} />
                  <div>
                    <p className={styles.exceptionTitle}>Production paused</p>
                    <p className={styles.exceptionBody}>
                      {HOLD_MESSAGE[manufacturing.hold.reason]}
                    </p>
                    <p className={styles.exceptionMeta}>
                      Since <LocalTime value={manufacturing.hold.since} />
                    </p>
                  </div>
                </div>
              )}

              {manufacturing.state === "rework" && (
                <div className={styles.exception} role="status">
                  <Icon name="info" size={16} />
                  <div>
                    <p className={styles.exceptionTitle}>Additional work</p>
                    <p className={styles.exceptionBody}>
                      Additional production work is required before final
                      inspection.
                    </p>
                  </div>
                </div>
              )}

              <ManufacturingTimeline
                stages={stages}
                label={`Manufacturing stages for ${item.name}`}
                className={styles.timeline}
              />

              {manufacturing.estimatedCompletionAt && (
                <p className={styles.estimate}>
                  Estimated completion{" "}
                  <LocalTime value={manufacturing.estimatedCompletionAt} dateOnly />
                </p>
              )}
            </>
          )}

          {manufacturing.history.length > 0 && (
            <details className={styles.history}>
              <summary className={styles.historySummary}>
                Production history
              </summary>
              <ol className={styles.historyList}>
                {[...manufacturing.history].reverse().map((event) => (
                  <li key={event.id} className={styles.historyEntry}>
                    <LocalTime value={event.occurredAt} className={styles.historyTime} />
                    <span className={styles.historyMessage}>{event.message}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}

      {/* ---- shipment ---- */}
      {shipment && (
        <section className={styles.section} aria-label={`Shipment for ${item.name}`}>
          <dl className={styles.shipment}>
            <div className={styles.statusRow}>
              <dt className={styles.statusKey}>Shipment</dt>
              <dd className={styles.statusValue}>
                {SHIPMENT_STATUS_LABEL[shipment.status]}
              </dd>
            </div>

            {/* Only shown when the value genuinely exists. */}
            {shipment.carrier && (
              <div className={styles.statusRow}>
                <dt className={styles.statusKey}>Carrier</dt>
                <dd className={styles.statusValue}>{shipment.carrier}</dd>
              </div>
            )}

            {shipment.trackingNumber && (
              <div className={styles.statusRow}>
                <dt className={styles.statusKey}>Tracking number</dt>
                <dd className={clsx(styles.statusValue, styles.technical)}>
                  {shipment.trackingNumber}
                </dd>
              </div>
            )}

            {shipment.shippedAt && (
              <div className={styles.statusRow}>
                <dt className={styles.statusKey}>Dispatched</dt>
                <dd className={styles.statusValue}>
                  <LocalTime value={shipment.shippedAt} />
                </dd>
              </div>
            )}

            {shipment.deliveredAt && (
              <div className={styles.statusRow}>
                <dt className={styles.statusKey}>Delivered</dt>
                <dd className={styles.statusValue}>
                  <LocalTime value={shipment.deliveredAt} />
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </li>
  );
}

/** When a stage was last reached, from the customer-visible history. */
function lastEventAt(
  tracking: CustomerManufacturingTracking | undefined,
  stage: CustomerManufacturingStage,
): string | undefined {
  if (!tracking) return undefined;

  const entries = tracking.history.filter((event) => event.stage === stage);
  const last = entries[entries.length - 1];
  return last ? last.occurredAt.slice(0, 10) : undefined;
}
