import Link from "next/link";

import { StatusDot, type ManufacturingStatus } from "@/components/core";
import {
  formatPrice,
  isQuoteOnly,
  priceQualifier,
  PROVISIONAL_PRICE_EXPLANATION,
} from "@/lib/catalog/format";
import { categoryLabel } from "@/lib/catalog/taxonomy";
import { categoryHref } from "@/lib/routes";
import type { Product } from "@/lib/catalog/types";

import { ProductGallery } from "./ProductGallery";
import { ProductPurchase } from "./ProductPurchase";
import { ProductVisual } from "./ProductVisual";
import styles from "./ProductHero.module.css";

export interface ProductHeroProps {
  product: Product;
}

/**
 * Availability rendered through the existing StatusDot.
 *
 * Every entry pairs a dot with a written label, so the state is never carried
 * by colour alone.
 */
const AVAILABILITY: Record<string, { status: ManufacturingStatus; label: string }> = {
  "in-stock": { status: "complete", label: "In stock" },
  "made-to-order": { status: "processing", label: "Made to order" },
};

export function ProductHero({ product }: ProductHeroProps) {
  const images = product.gallery ?? (product.image ? [product.image] : []);
  const availability = AVAILABILITY[product.availability];
  const quoteOnly = isQuoteOnly(product);

  return (
    <div className={styles.hero}>
      <div className={styles.visual}>
        {/* The gallery is a client island, so it mounts only when there is
            genuinely more than one view to switch between. */}
        {images.length > 1 ? (
          <ProductGallery product={product} images={images} />
        ) : (
          <ProductVisual product={product} priority />
        )}
      </div>

      <div className={styles.info}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowRule} aria-hidden="true" />
          <Link
            href={categoryHref(product.browseCategory)}
            className={styles.categoryLink}
          >
            {product.browseCategoryLabel ?? categoryLabel(product.browseCategory)}
          </Link>
          <span aria-hidden="true">/</span>
          {product.categoryLabel ?? categoryLabel(product.category)}
        </p>

        <h1 className={styles.name}>{product.name}</h1>

        {/* The one-line summary, not the description: the Description section
            below carries the longer copy, and showing both here repeated it. */}
        <p className={styles.summary}>{product.summary}</p>

        <div className={styles.priceRow}>
          <span className={styles.price}>{formatPrice(product.price)}</span>
          {availability && (
            <StatusDot status={availability.status} label={availability.label} />
          )}
        </div>

        {!quoteOnly && (
          <p className={styles.priceNote}>Per unit, excluding GST</p>
        )}

        {/* Stage 19.6: a price that is not approved says so, next to the figure,
            and the notice disappears on its own once the price is approved. */}
        {priceQualifier(product) && (
          <div className={styles.provisional} role="note">
            <span className={styles.provisionalLabel}>{priceQualifier(product)}</span>
            <p className={styles.provisionalText}>{PROVISIONAL_PRICE_EXPLANATION}</p>
          </div>
        )}

        <ProductPurchase product={product} />
      </div>
    </div>
  );
}
