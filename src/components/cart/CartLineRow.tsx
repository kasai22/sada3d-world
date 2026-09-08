"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";

import { Button, Icon, Tag } from "@/components/core";
import { QuantityStepper } from "@/components/forms";
import {
  acceptPriceChangeAction,
  removeLineAction,
  setQuantityAction,
} from "@/lib/cart/actions";
import { CART_CHANGED_EVENT } from "@/lib/cart/intent";
import { formatBytes } from "@/lib/custom-print/inspect";
import { formatINR } from "@/lib/money";
import { MAX_LINE_QUANTITY, type PricedCartLine } from "@/lib/cart/types";
import styles from "./CartLineRow.module.css";

export interface CartLineRowProps {
  priced: PricedCartLine;
}

/**
 * One line in the cart.
 *
 * A client island because quantity and removal are interactions; everything it
 * displays was resolved on the server. It calculates no price and looks nothing
 * up — the line total it shows is the one the totals layer produced.
 *
 * Quantity is optimistic: the number moves immediately and the server confirms.
 * That is safe because a rejected change simply snaps back. Removal is not
 * optimistic, because a line that vanishes and returns is worse than one that
 * takes a moment to go.
 */
export function CartLineRow({ priced }: CartLineRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState(priced.line.quantity);
  const [error, setError] = useState<string | null>(null);

  const line = priced.line;
  const custom = line.type === "custom";

  function announce(): void {
    window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    router.refresh();
  }

  function onQuantity(next: number): void {
    const previous = quantity;
    setQuantity(next);
    setError(null);

    startTransition(async () => {
      const result = await setQuantityAction(line.id, next);
      if (!result.ok) {
        setQuantity(previous);
        setError(result.message);
        return;
      }
      announce();
    });
  }

  function onRemove(): void {
    setError(null);
    startTransition(async () => {
      const result = await removeLineAction(line.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      announce();
    });
  }

  function onAcceptPrice(): void {
    startTransition(async () => {
      const result = await acceptPriceChangeAction(line.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      announce();
    });
  }

  const priceChanged = priced.issues.some((issue) => issue.code === "price_changed");

  return (
    <li className={clsx(styles.row, pending && styles.pending)}>
      <div className={styles.identity}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon name={custom ? "box" : "package"} size={20} />
        </span>

        <div className={styles.meta}>
          {custom && (
            <Tag tone="accent" className={styles.kind}>
              Custom part
            </Tag>
          )}

          {priced.href ? (
            <Link href={priced.href} className={clsx("u-plain", styles.name)}>
              {priced.name}
            </Link>
          ) : (
            <span className={styles.name}>{priced.name}</span>
          )}

          <span className={styles.spec}>{priced.spec}</span>

          {custom && line.type === "custom" && (
            <span className={styles.file}>
              {line.model.formatLabel} · {formatBytes(line.model.sizeBytes)}
            </span>
          )}
        </div>
      </div>

      <div className={styles.quantity}>
        <span className={styles.columnLabel}>Quantity</span>
        <QuantityStepper
          value={quantity}
          min={1}
          max={MAX_LINE_QUANTITY}
          onChange={onQuantity}
          label={`Quantity of ${priced.name}`}
        />
      </div>

      <div className={styles.unit}>
        <span className={styles.columnLabel}>{custom ? "Quoted" : "Unit"}</span>
        <span className={styles.unitValue}>
          {priced.unitPrice === null ? "—" : formatINR(priced.unitPrice)}
          {!custom && priced.unitPrice !== null && (
            <span className={styles.each}> each</span>
          )}
        </span>
      </div>

      <div className={styles.total}>
        <span className={styles.columnLabel}>Line total</span>
        {/* Announced so a quantity change is heard, not only seen. */}
        <span className={styles.totalValue} aria-live="polite" aria-atomic="true">
          {priced.lineTotal === null ? "—" : formatINR(priced.lineTotal)}
        </span>
      </div>

      <div className={styles.actions}>
        {custom && (
          <Button variant="ghost" size="sm" href="/custom-print">
            Edit configuration
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={pending}
          aria-label={`Remove ${priced.name} from the cart`}
        >
          Remove
        </Button>
      </div>

      {(priced.issues.length > 0 || error) && (
        <ul className={styles.issues}>
          {priced.issues.map((issue) => (
            <li key={issue.code} className={styles.issue}>
              <Icon name={issue.severity === "blocking" ? "alert" : "info"} size={14} />
              <span>{issue.message}</span>
              {issue.code === "price_changed" && priceChanged && (
                <button
                  type="button"
                  className={styles.issueAction}
                  onClick={onAcceptPrice}
                  disabled={pending}
                >
                  Accept new price
                </button>
              )}
            </li>
          ))}

          {error && (
            <li className={styles.issue} role="alert">
              <Icon name="error" size={14} />
              <span>{error}</span>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
