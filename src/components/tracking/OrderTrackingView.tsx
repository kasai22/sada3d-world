import { Button, Icon, Tag } from "@/components/core";
import { formatINR } from "@/lib/money";
import type { CustomerManufacturingTracking } from "@/lib/manufacturing";
import {
  ORDER_STATUS_LABEL,
  type Order,
  type OrderStatus,
} from "@/lib/orders/types";
import { INDIA_STATES, SUPPORTED_COUNTRIES } from "@/lib/checkout/types";

import { ItemTracking } from "./ItemTracking";
import { LocalTime } from "./LocalTime";
import styles from "./OrderTrackingView.module.css";

export interface OrderTrackingViewProps {
  order: Order;
  /** Customer projections, keyed by manufacturing job id. */
  jobs: Record<string, CustomerManufacturingTracking>;
}

/** Which tone the order-level status carries. Never colour alone: it is text. */
const STATUS_TONE: Record<OrderStatus, "neutral" | "accent" | "success" | "warning" | "danger"> = {
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
 * Order tracking.
 *
 * The order's status and each item's status are shown as separate things,
 * because they are separate facts. An order holding a stocked gear that has
 * shipped and a custom part that is still printing is partially fulfilled — and
 * that sentence is only sayable because neither item was forced to adopt the
 * other's status.
 *
 * A Server Component. Everything here was resolved on the server; the browser
 * cannot change any of it, and the only client code on the page formats
 * timestamps into the reader's timezone.
 */
export function OrderTrackingView({ order, jobs }: OrderTrackingViewProps) {
  const state =
    INDIA_STATES.find((entry) => entry.code === order.address.state)?.label ??
    order.address.state;
  const country =
    SUPPORTED_COUNTRIES.find((entry) => entry.code === order.address.country)?.label ??
    order.address.country;

  return (
    <div className={styles.tracking}>
      {order.demo && (
        /*
         * Said before anything else. These fixtures exist so the tracking
         * experience can be built against states that actually occur; none of
         * them is a real SADA 3D production record.
         */
        <p className={styles.demo} role="note">
          <Icon name="info" size={15} />
          <span>
            Demonstration order. The production events below are development
            fixtures, not real manufacturing records.
          </span>
        </p>
      )}

      <header className={styles.head}>
        <p className={styles.eyebrow}>Order</p>
        <h1 className={styles.reference}>{order.reference}</h1>
        <p className={styles.placed}>
          Placed <LocalTime value={order.placedAt} />
        </p>
      </header>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factKey}>Order status</dt>
          <dd className={styles.factValue}>
            <Tag tone={STATUS_TONE[order.status]}>
              {ORDER_STATUS_LABEL[order.status]}
            </Tag>
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factKey}>Payment</dt>
          <dd className={styles.factValue}>
            {order.payment.status === "paid" ? "Paid" : "Not settled"}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factKey}>Total</dt>
          <dd className={styles.factValue}>{formatINR(order.totals.total)}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factKey}>Items</dt>
          <dd className={styles.factValue}>{order.items.length}</dd>
        </div>
      </dl>

      <section className={styles.section} aria-labelledby="tracking-items">
        <h2 className={styles.sectionTitle} id="tracking-items">
          Items
        </h2>
        <ul className={styles.items}>
          {order.items.map((item) => (
            <ItemTracking
              key={item.id}
              item={item}
              manufacturing={
                item.manufacturingJobId ? jobs[item.manufacturingJobId] : undefined
              }
              shipment={order.shipments.find(
                (shipment) => shipment.id === item.shipmentId,
              )}
            />
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="tracking-delivery">
        <h2 className={styles.sectionTitle} id="tracking-delivery">
          Delivery
        </h2>
        <address className={styles.address}>
          {order.contact.name}
          <br />
          {order.address.line1}
          {order.address.line2 && (
            <>
              <br />
              {order.address.line2}
            </>
          )}
          <br />
          {order.address.city}, {state} {order.address.postalCode}
          <br />
          {country}
        </address>
        {order.shipments.length === 0 && (
          <p className={styles.note}>
            Nothing has been dispatched yet. Shipping and GST are confirmed
            before dispatch.
          </p>
        )}
      </section>

      <div className={styles.actions}>
        {/* Large, like the checkout actions: the default 40px control is under
            the 44px touch target this project holds itself to. */}
        <Button href="/shop" variant="secondary" size="lg">
          Continue browsing
        </Button>
      </div>
    </div>
  );
}
