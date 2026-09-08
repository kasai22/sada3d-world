"use client";

import Image from "next/image";
import { useState } from "react";

import type { Product, ProductImage } from "@/lib/catalog/types";
import { ProductVisual } from "./ProductVisual";
import styles from "./ProductGallery.module.css";

export interface ProductGalleryProps {
  product: Product;
  /** Two or more. The hero renders ProductVisual directly for a single image. */
  images: readonly ProductImage[];
}

/**
 * Thumbnail strip over the product stage.
 *
 * Mounted only when a product genuinely has more than one image, so a part with
 * a single render never shows a strip of one. The thumbnails are real buttons
 * in a list, so arrow-free keyboard traversal works by default and the selected
 * view is announced through aria-current.
 */
export function ProductGallery({ product, images }: ProductGalleryProps) {
  const [index, setIndex] = useState(0);
  const active = images[index] ?? images[0];

  return (
    <div className={styles.gallery}>
      <ProductVisual product={product} image={active} priority />

      <ul className={styles.thumbs}>
        {images.map((image, position) => (
          <li key={image.src}>
            <button
              type="button"
              className={styles.thumb}
              aria-current={position === index}
              aria-label={`View ${position + 1} of ${images.length}: ${image.alt}`}
              onClick={() => setIndex(position)}
            >
              <Image
                src={image.src}
                alt=""
                fill
                sizes="72px"
                className={styles.thumbImage}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
