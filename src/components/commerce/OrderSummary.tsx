import type { ReactNode } from "react";
import clsx from "clsx";

import { Button } from "@/components/core";
import styles from "./OrderSummary.module.css";

export interface OrderItem {
  id: string;
  name: string;
  /** Configuration line, e.g. "PLA / BLACK / 0.16 MM". */
  spec: string;
  quantity: number;
  /** Pre-formatted line total, e.g. "₹798". */
  price: string;
}

export interface TotalRow {
  label: string;
  value: string;
}

export interface OrderSummaryProps {
  items: readonly OrderItem[];
  /** Subtotal, shipping, GST — everything above the grand total. */
  totals?: readonly TotalRow[];
  /** Pre-formatted grand total, e.g. "₹1,036". */
  total?: string;
  cta?: ReactNode;
  onCta?: () => void;
  /** Disables the action, e.g. while a payment intent is being created. */
  ctaDisabled?: boolean;
  loading?: boolean;
  className?: string;
}

/** Cart and checkout totals block. */
export function OrderSummary({
  items,
  totals = [],
  total,
  cta = "Complete order",
  onCta,
  ctaDisabled,
  loading,
  className,
}: OrderSummaryProps) {
  if (items.length === 0) {
    return (
      <div className={clsx(styles.empty, className)}>
        <p className={styles.emptyText}>Your order is empty</p>
        <Button variant="secondary" size="sm" href="/shop">
          Explore designs
        </Button>
      </div>
    );
  }

  return (
    <div className={clsx(styles.summary, className)}>
      <ul className={styles.items}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <span className={styles.itemMeta}>
              <span className={styles.itemName}>{item.name}</span>
              <span className={styles.itemSpec}>{item.spec}</span>
              <span className={styles.itemQty}>× {item.quantity}</span>
            </span>
            <span className={styles.itemPrice}>{item.price}</span>
          </li>
        ))}
      </ul>

      {totals.length > 0 && (
        <dl className={styles.totals}>
          {totals.map((row) => (
            <div key={row.label} className={styles.totalRow}>
              <dt className={styles.totalKey}>{row.label}</dt>
              <dd className={styles.totalValue}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {total && (
        <div className={styles.grand}>
          <span className={styles.grandKey}>Total</span>
          <span className={styles.grandValue}>{total}</span>
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={onCta}
        disabled={ctaDisabled}
        loading={loading}
      >
        {cta}
      </Button>
    </div>
  );
}
