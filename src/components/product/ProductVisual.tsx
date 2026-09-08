import Image from "next/image";
import type { CSSProperties } from "react";
import clsx from "clsx";

import { Viewer3DLazy } from "@/components/viewer";
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
 * Renders the real 3D viewer for any part that has a mesh, and falls back to
 * the placeholder for parts that do not. The interface is unchanged from Phase
 * 6 — the page still passes a product and gets back a square stage — so the
 * rendering layer swapped without touching ProductHero or ProductGallery.
 */
export function ProductVisual({
  product,
  image,
  priority = false,
  className,
}: ProductVisualProps) {
  const shown = image ?? product.image;

  // A mesh takes precedence: it is the real object, not a picture of it.
  if (product.model && !image) {
    return (
      <Viewer3DLazy
        className={clsx(styles.stage, className)}
        source={{
          url: product.model.url,
          format: product.model.format,
          label: product.name,
        }}
        description={`Interactive 3D view of ${product.name}. Drag to rotate, scroll to zoom.`}
        appearance={{ surface: "graphite" }}
        footer={
          <>
            <span className={styles.partId}>{partId(product)}</span>
            <span className={styles.pending}>
              {product.model.format.toUpperCase()}
            </span>
          </>
        }
      />
    );
  }

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
