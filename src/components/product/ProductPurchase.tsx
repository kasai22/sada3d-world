"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Icon } from "@/components/core";
import { QuantityStepper } from "@/components/forms";
import { submitCartIntent } from "@/lib/cart/intent";
import { formatPrice, isQuoteOnly } from "@/lib/catalog/format";
import { MATERIALS } from "@/lib/catalog/taxonomy";
import type { MaterialValue, Product } from "@/lib/catalog/types";

import { ColorGroup } from "./ColorGroup";
import { OptionGroup, type Option } from "./OptionGroup";
import styles from "./ProductPurchase.module.css";

export interface ProductPurchaseProps {
  product: Product;
}

const MAX_QUANTITY = 99;

/**
 * Configuration and add-to-cart.
 *
 * The only interactive island on the page. Selection is local state, not URL
 * state: the product URL identifies the part, and the canonical home for a
 * chosen configuration is the cart line, which Phase 11 defines.
 *
 * Price responds to quantity only. Material and quality are recorded on the
 * intent but do not move the figure, because there is no verified pricing model
 * for them yet — Phase 8 owns the quote engine. Total is derived at render, so
 * introducing a modifier later changes one expression here.
 */
export function ProductPurchase({ product }: ProductPurchaseProps) {
  const router = useRouter();
  const materials = product.materials ?? [product.material];
  const colors = product.colors ?? (product.color ? [product.color] : []);
  const qualities = product.qualityOptions ?? [];

  const [material, setMaterial] = useState<MaterialValue>(
    materials[0] ?? product.material,
  );
  const [color, setColor] = useState(colors[0] ?? product.color);
  const [quality, setQuality] = useState(qualities[0]?.value ?? "");
  const [quantity, setQuantity] = useState(1);

  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quoteOnly = isQuoteOnly(product);
  const total = product.price * quantity;

  const materialOptions: Option[] = materials.map((value) => ({
    value,
    label: MATERIALS.find((entry) => entry.value === value)?.label ?? value,
  }));

  const qualityOptions: Option[] = qualities.map((option) => ({
    value: option.value,
    label: option.label,
    detail: option.layerHeight,
  }));

  async function onAdd() {
    setPending(true);
    setError(null);

    try {
      // Identity and configuration only. What it costs is the server's to
      // decide, and it re-derives it from the catalog.
      const result = await submitCartIntent({
        productId: product.id,
        material,
        color,
        quality: quality || undefined,
        quantity,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setAdded(true);
      // The cart page reads the cart on the server, so the route needs to be
      // re-rendered for the count and lines to be current.
      router.refresh();
      window.setTimeout(() => setAdded(false), 2400);
    } catch {
      setError("This part could not be added. Try again.");
    } finally {
      setPending(false);
    }
  }

  /*
   * A quote-only part has nothing to configure here: material, quality and
   * finish are chosen against the uploaded geometry. Showing selectors that
   * carry nowhere would imply choices this page cannot honour.
   */
  if (quoteOnly) {
    return (
      <div className={styles.purchase}>
        <div className={styles.actions}>
          <Button href="/custom-print" size="lg" fullWidth iconRight="arrow-right">
            Upload a model
          </Button>
          <p className={styles.note}>
            Priced from your geometry. Material, quality and finish are chosen
            during configuration.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.purchase}>
      <div className={styles.config}>
        <OptionGroup
          legend="Material"
          options={materialOptions}
          value={material}
          onChange={(value) => setMaterial(value as MaterialValue)}
        />

        <ColorGroup values={colors} value={color} onChange={setColor} />

        {qualityOptions.length > 0 && (
          <OptionGroup
            legend="Quality"
            options={qualityOptions}
            value={quality}
            onChange={setQuality}
          />
        )}
      </div>

      <div className={styles.quantityRow}>
        <div className={styles.quantityField}>
          <span className={styles.quantityLabel}>Quantity</span>
          <QuantityStepper
            value={quantity}
            min={1}
            max={MAX_QUANTITY}
            onChange={setQuantity}
            label={`Quantity of ${product.name}`}
          />
        </div>

        <div className={styles.total}>
          <span className={styles.totalLabel}>Total</span>
          {/* Announced politely so the figure is heard when quantity moves. */}
          <span className={styles.totalValue} aria-live="polite" aria-atomic="true">
            {formatPrice(total)}
          </span>
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="lg"
          fullWidth
          iconLeft={added ? undefined : "shopping-cart"}
          loading={pending}
          success={added}
          onClick={onAdd}
        >
          {added ? "Added" : "Add to cart"}
        </Button>

        {error ? (
          <p className={styles.error} role="alert">
            <Icon name="error" size={14} />
            {error}
          </p>
        ) : (
          <p className={styles.note}>
            Excludes GST and shipping. Made to order parts ship after production.
          </p>
        )}
      </div>
    </div>
  );
}
