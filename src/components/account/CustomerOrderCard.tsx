import Link from "next/link";

import { Icon, Tag, type TagTone } from "@/components/core";
import { LocalTime } from "@/components/tracking";
import { CUSTOMER_STAGE_LABEL } from "@/lib/manufacturing";
import { formatINR } from "@/lib/money";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders/types";
import type { CustomerOrderSummary } from "@/lib/account/types";

import styles from "./CustomerOrderCard.module.css";

export interface CustomerOrderCardProps {
  order: CustomerOrderSummary;
}

/** Tone supports the label; the label is always present and always read. */
const STATUS_TONE: Record<OrderStatus, TagTone> = {
  pending: "neutral",
  awaiting_payment: "warning",
  confirmed: "accent",
  fulfillment_in_progress: "accent",
  partially_fulfilled: "accent",
  fulfilled: "success",
  cancelled: "neutral",
  failed: "danger",
};

/**
 * One order in the account list.
 *
 * Four facts, kept apart because they are four facts: the reference, when it
 * was placed, what it holds, and where it has got to. The order's status and
 * the production stage sit in separate rows — an order is not "printing", a
 * part is, and an order may hold a stocked gear that shipped yesterday beside a
 * part that has not started.
 *
 * The whole card is one link, via the reference's covering pseudo-element: one
 * tab stop, one accessible name, and the text stays selectable.
 */
export function CustomerOrderCard({ order }: CustomerOrderCardProps) {
  const manufacturing = order.manufacturing;

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <div className={styles.identity}>
          <p className={styles.eyebrow}>Order</p>
          <h3 className={styles.reference}>
            <Link href={`/account/orders/${order.reference}`} className={styles.link}>
              {order.reference}
            </Link>
          </h3>
          <p className={styles.placed}>
            Placed <LocalTime value={order.placedAt} dateOnly />
          </p>
        </div>

        <div className={styles.figures}>
          <span className={styles.total}>{formatINR(order.total)}</span>
          <span className={styles.units}>
            {order.unitCount} {order.unitCount === 1 ? "unit" : "units"}
          </span>
        </div>
      </div>

      {order.demo && (
        <p className={styles.demo}>
          <Icon name="info" size={13} />
          <span>Demonstration order</span>
        </p>
      )}

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factKey}>Items</dt>
          <dd className={styles.factValue}>{order.summary}</dd>
        </div>

        <div className={styles.fact}>
          <dt className={styles.factKey}>Status</dt>
          <dd className={styles.factValue}>
            <Tag tone={STATUS_TONE[order.status]}>
              {ORDER_STATUS_LABEL[order.status]}
            </Tag>
          </dd>
        </div>

        {/* Only when something is actually being made. An order with nothing in
            production says nothing about production. */}
        {manufacturing && (
          <div className={styles.fact}>
            <dt className={styles.factKey}>Manufacturing</dt>
            <dd className={styles.factValue}>
              <span className={styles.stage}>
                {manufacturing.stage
                  ? CUSTOMER_STAGE_LABEL[manufacturing.stage]
                  : "Not in production"}
              </span>
              {manufacturing.itemsInProduction > 1 && (
                <span className={styles.stageMeta}>
                  {manufacturing.itemsInProduction} parts
                </span>
              )}
              {manufacturing.held && <span className={styles.held}>Paused</span>}
              {/* Shown alongside a stage, not instead of one: an order can have
                  one part in trouble while another is still being made. */}
              {manufacturing.issue && (
                <span className={styles.issue}>Issue</span>
              )}
            </dd>
          </div>
        )}
      </dl>

      <p className={styles.view} aria-hidden="true">
        View order
        <Icon name="arrow-right" size={14} />
      </p>
    </article>
  );
}
