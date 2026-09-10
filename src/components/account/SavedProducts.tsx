"use client";

import { useState, useTransition } from "react";

import { Button, Icon } from "@/components/core";
import { ProductCard } from "@/components/commerce";
import type { SavedProductView } from "@/lib/account/types";
import { removeSavedItemAction } from "@/app/(site)/account/saved/actions";

import styles from "./SavedProducts.module.css";

export interface SavedProductsProps {
  items: readonly SavedProductView[];
}

/**
 * Saved marketplace parts.
 *
 * Reuses `ProductCard` unchanged. The marketplace's visual language is the
 * marketplace's, and an account-specific card would drift from it the first
 * time either changed.
 *
 * An entry whose product has left the catalog is shown as exactly that, with
 * the option to remove it. Silently dropping it would make a saved part
 * disappear with no explanation; showing a card for something that cannot be
 * bought would be worse.
 *
 * A client component only because removing is an interaction. The list itself
 * was resolved on the server, and the action re-resolves the customer there —
 * nothing in this component says whose list it is.
 */
export function SavedProducts({ items }: SavedProductsProps) {
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function remove(productId: string, name: string): void {
    if (pending) return;

    setError(null);
    setRemoving(productId);

    startTransition(async () => {
      const result = await removeSavedItemAction(productId);
      setRemoving(null);

      if (!result.ok) {
        setError(`${name} could not be removed. ${result.message}`);
      }
    });
  }

  return (
    <div className={styles.wrap}>
      {/* Announced, not only shown: a removal that failed must reach someone
          who is not looking at this part of the page. */}
      <p role="status" aria-live="polite" className={styles.status}>
        {error}
      </p>

      <ul className={styles.grid}>
        {items.map((item) => {
          const name = item.product?.name ?? item.productId;
          const busy = removing === item.productId;

          return (
            <li key={item.id} className={styles.item}>
              {item.product ? (
                <ProductCard
                  name={item.product.name}
                  href={item.product.href}
                  material={item.product.material}
                  color={item.product.color}
                  price={item.product.price}
                  image={item.product.image}
                  variant="compact"
                />
              ) : (
                <div className={styles.gone}>
                  <span className={styles.goneGlyph} aria-hidden="true">
                    <Icon name="alert" size={20} />
                  </span>
                  <p className={styles.goneTitle}>No longer available</p>
                  <p className={styles.goneBody}>
                    This part has left the catalog. It is kept here until you
                    remove it.
                  </p>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                iconLeft="trash"
                className={styles.remove}
                disabled={busy}
                loading={busy}
                onClick={() => remove(item.productId, name)}
              >
                {busy ? "Removing" : "Remove"}
                <span className="u-visually-hidden"> {name}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
