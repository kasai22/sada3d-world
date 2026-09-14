import { Button, Icon, Tag } from "@/components/core";
import { formatINR } from "@/lib/money";
import { INDIA_STATES, SUPPORTED_COUNTRIES } from "@/lib/checkout/types";
import { ORDER_STATUS_LABEL, type Order } from "@/lib/orders/types";
import styles from "./OrderConfirmation.module.css";

export interface OrderConfirmationProps {
  order: Order;
}

/**
 * Order confirmation.
 *
 * Says what has happened and nothing more. The order has been received; no part
 * has been queued, scheduled or started, because none of that exists yet —
 * Phase 12 owns manufacturing state, and claiming it here would be a promise
 * the system has no way to keep.
 */
export function OrderConfirmation({ order }: OrderConfirmationProps) {
  const hasCustom = order.items.some((item) => item.type === "custom");

  // Codes are how the address is stored; names are how it is read.
  const state =
    INDIA_STATES.find((entry) => entry.code === order.address.state)?.label ??
    order.address.state;
  const country =
    SUPPORTED_COUNTRIES.find((entry) => entry.code === order.address.country)?.label ??
    order.address.country;

  return (
    <div className={styles.confirmation}>
      <header className={styles.head}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon name="check-circle" size={28} />
        </span>
        <h1 className={styles.title}>Order received</h1>
        <p className={styles.lede}>
          Your order has been placed. A confirmation has been recorded against{" "}
          {order.contact.email}.
        </p>
      </header>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factKey}>Order</dt>
          <dd className={styles.factValue}>{order.reference}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factKey}>Total</dt>
          <dd className={styles.factValue}>{formatINR(order.totals.total)}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factKey}>Status</dt>
          <dd className={styles.factValue}>
            {/*
              A commercial state, not a manufacturing one. StatusDot speaks the
              manufacturing vocabulary — queued, printing, packaging — and using
              it here would put "paid" on the same scale as "printing".
            */}
            <Tag tone="success">{ORDER_STATUS_LABEL[order.status]}</Tag>
          </dd>
        </div>
      </dl>

      <section className={styles.section} aria-labelledby="order-items">
        <h2 className={styles.sectionTitle} id="order-items">
          Items
        </h2>
        <ul className={styles.items}>
          {order.items.map((item) => (
            <li key={item.id} className={styles.item}>
              <span className={styles.itemMeta}>
                <span className={styles.itemName}>{item.name}</span>
                <span className={styles.itemSpec}>{item.spec}</span>
              </span>
              <span className={styles.itemQty}>× {item.quantity}</span>
              <span className={styles.itemPrice}>{formatINR(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="order-delivery">
        <h2 className={styles.sectionTitle} id="order-delivery">
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
        <p className={styles.note}>
          Shipping and GST are confirmed before dispatch and are not included in
          the figure above.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="order-next">
        <h2 className={styles.sectionTitle} id="order-next">
          What happens next
        </h2>
        <p className={styles.note}>
          The order is with Reality 3D for review. Follow its progress on the
          tracking page.
        </p>
        {hasCustom && (
          <p className={styles.note}>
            Custom parts are reviewed against your uploaded model before
            manufacturing begins.
          </p>
        )}
        {order.provisional && (
          <p className={styles.provisional}>
            <Icon name="info" size={14} />
            This order was placed against provisional pricing and a development
            payment adapter. No payment has been taken.
          </p>
        )}
      </section>

      <div className={styles.actions}>
        {/* The receipt cookie already grants this browser access, so the
            tracking page opens without a second lookup. */}
        <Button href={`/orders/${order.reference}`} size="lg">
          Track this order
        </Button>
        <Button href="/shop" variant="secondary" size="lg">
          Continue browsing
        </Button>
      </div>
    </div>
  );
}
