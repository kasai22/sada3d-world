import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

import styles from "./ProductCard.module.css";

export interface ProductMeta {
  label: string;
  value: string;
}

export interface ProductCardProps {
  name: string;
  href: string;
  material?: string;
  color?: string;
  /** Pre-formatted for the locale, e.g. "₹399". Omit when unavailable. */
  price?: string;
  meta?: readonly ProductMeta[];
  /** Small orange corner label, e.g. "IN STOCK". */
  badge?: string;
  /** Render or photograph on a dark studio stage. Falls back to a placeholder. */
  image?: { src: string; alt: string };
  variant?: "default" | "featured" | "compact";
  /**
   * Set on the first screenful of a grid so the largest contentful paint is not
   * lazy-loaded.
   */
  priority?: boolean;
  className?: string;
}

const SIZES =
  "(max-width: 767px) 100vw, (max-width: 1023px) 50vw, (max-width: 1439px) 33vw, 25vw";

/**
 * Minimal premium product card. Sharp corners, generous whitespace, technical
 * metadata.
 *
 * The whole card is a link via the title's covering pseudo-element: one tab
 * stop, one accessible name, and the text stays selectable. Hover and focus are
 * CSS, so the card renders on the server.
 */
export function ProductCard({
  name,
  href,
  material = "PLA",
  color = "Black",
  price,
  meta = [],
  badge,
  image,
  variant = "default",
  priority = false,
  className,
}: ProductCardProps) {
  const compact = variant === "compact";

  return (
    <article
      className={clsx(
        styles.card,
        variant === "featured" && styles.featured,
        compact && styles.compact,
        className,
      )}
    >
      <div className={styles.stage}>
        <span className={styles.grid} aria-hidden="true" />
        {image ? (
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes={SIZES}
            priority={priority}
            className={styles.image}
          />
        ) : (
          <span className={styles.placeholder} aria-hidden="true" />
        )}
        {badge && <span className={styles.badge}>{badge}</span>}
        <span className={styles.line} aria-hidden="true" />
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>
          <Link href={href} className={styles.link}>
            {name}
          </Link>
        </h3>

        <p className={styles.spec}>
          {material} / {color}
        </p>

        {!compact && meta.length > 0 && (
          <dl className={styles.meta}>
            {meta.map((item) => (
              <div key={item.label} style={{ display: "contents" }}>
                <dt className={styles.metaKey}>{item.label}</dt>
                <dd className={styles.metaValue}>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className={styles.footer}>
          {price ? (
            <span className={styles.price}>{price}</span>
          ) : (
            <span className={styles.unavailable}>Unavailable</span>
          )}
          <span className={styles.view} aria-hidden="true">
            View
          </span>
        </div>
      </div>
    </article>
  );
}
