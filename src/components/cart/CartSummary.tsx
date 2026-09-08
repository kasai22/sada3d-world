import clsx from "clsx";

import { Button, Icon } from "@/components/core";
import { formatINR } from "@/lib/money";
import type { CartTotals, Money } from "@/lib/cart/types";
import styles from "./CartSummary.module.css";

export interface CartSummaryProps {
  totals: CartTotals;
  /** Blocks the action and says why. */
  blockedReason?: string;
  /** Where the primary action goes, e.g. "/checkout". */
  href?: string;
  cta?: string;
  /** Rendered instead of the link — used by checkout for its submit button. */
  action?: React.ReactNode;
  className?: string;
}

/** A component that says what an amount is, or that it is not known yet. */
function moneyValue(money: Money): string {
  return money.known ? formatINR(money.amount) : money.reason;
}

/**
 * Cart and checkout totals.
 *
 * Displays. Never calculates. Every figure here came from the totals layer, and
 * the same layer produced the figures on the other page, which is the only
 * reason the two can be guaranteed to agree.
 *
 * Where an amount is not known it says so in words rather than showing ₹0 —
 * a zero would claim that delivery is free and that no tax applies, and neither
 * is something this system knows.
 */
export function CartSummary({
  totals,
  blockedReason,
  href = "/checkout",
  cta = "Continue to checkout",
  action,
  className,
}: CartSummaryProps) {
  return (
    <aside className={clsx(styles.summary, className)} aria-label="Order summary">
      <h2 className={styles.title}>Summary</h2>

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt className={styles.key}>Subtotal</dt>
          <dd className={styles.value}>{formatINR(totals.subtotal)}</dd>
        </div>

        <div className={styles.row}>
          <dt className={styles.key}>Shipping</dt>
          <dd className={clsx(styles.value, !totals.shipping.known && styles.pendingValue)}>
            {moneyValue(totals.shipping)}
          </dd>
        </div>

        <div className={styles.row}>
          <dt className={styles.key}>GST</dt>
          <dd className={clsx(styles.value, !totals.tax.known && styles.pendingValue)}>
            {moneyValue(totals.tax)}
          </dd>
        </div>
      </dl>

      <div className={styles.grand}>
        <span className={styles.grandKey}>Payable now</span>
        <span className={styles.grandValue}>{formatINR(totals.total)}</span>
      </div>

      {totals.excluded.length > 0 && (
        <p className={styles.note}>
          Excludes {totals.excluded.join(" and ")}.{" "}
          {totals.excluded.length > 1 ? "Neither rule is" : "That rule is not"}{" "}
          configured yet, so {totals.excluded.length > 1 ? "neither is" : "it is not"}{" "}
          charged.
        </p>
      )}

      {totals.provisional && (
        <p className={styles.provisional}>
          <Icon name="info" size={14} />
          Custom manufacturing is priced by provisional rules and is not a
          confirmed commercial quotation.
        </p>
      )}

      <div className={styles.action}>
        {action ??
          (blockedReason ? (
            <Button variant="secondary" size="lg" fullWidth disabled>
              {cta}
            </Button>
          ) : (
            <Button href={href} variant="primary" size="lg" fullWidth>
              {cta}
            </Button>
          ))}

        {blockedReason && (
          <p className={styles.blocked} role="status">
            <Icon name="alert" size={14} />
            {blockedReason}
          </p>
        )}
      </div>
    </aside>
  );
}
