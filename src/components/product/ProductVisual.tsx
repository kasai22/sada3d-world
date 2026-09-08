import Image from "next/image";
import type { CSSProperties } from "react";
import clsx from "clsx";

import { partId } from "@/lib/catalog/query";
import type { Product, ProductImage } from "@/lib/catalog/types";
import styles from "./ProductVisual.module.css";

export interface ProductVisualProps {
  product: Product;
  /** Overrides the primary image — supplied by the gallery when one exists. */
  image?: ProductImage;
  priority?: boolean;
  className?: string;
}

/**
 * The product stage.
 *
 * This is the seam for Phase 9: swapping the body of this component for the
 * real Viewer3D changes nothing about the product page's layout, because the
 * page only ever passes a product and gets back a square stage.
 *
 * It renders no fake interaction. There is no drag handle, no rotate button and
 * no simulated camera — the stage says the model view is not available yet
 * rather than pretending to be one.
 */
export function ProductVisual({
  product,
  image,
  priority = false,
  className,
}: ProductVisualProps) {
  const shown = image ?? product.image;

  return (
    <div className={clsx(styles.stage, className)}>
      <span className={styles.grid} aria-hidden="true" />

      {shown ? (
        <Image
          src={shown.src}
          alt={shown.alt}
          fill
          sizes="(max-width: 1023px) 100vw, 55vw"
          priority={priority}
          className={styles.image}
        />
      ) : (
        /* Decorative: the product name and specifications carry the meaning. */
        <span className={styles.placeholder} aria-hidden="true">
          {[0, 6, 12, 18, 24, 30].map((z, index, all) => (
            <span
              key={z}
              className={clsx(styles.face, index === all.length - 1 && styles.faceTop)}
              style={{ "--z": `${z}px` } as CSSProperties}
            />
          ))}
        </span>
      )}

      <span className={clsx(styles.tick, styles.tickTL)} aria-hidden="true" />
      <span className={clsx(styles.tick, styles.tickTR)} aria-hidden="true" />
      <span className={clsx(styles.tick, styles.tickBR)} aria-hidden="true" />
      <span className={clsx(styles.tick, styles.tickBL)} aria-hidden="true" />

      <div className={styles.meta}>
        <span className={styles.partId}>{partId(product)}</span>
        {!shown && <span className={styles.pending}>Model view in preparation</span>}
      </div>
    </div>
  );
}
