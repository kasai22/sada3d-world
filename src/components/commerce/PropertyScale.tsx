import clsx from "clsx";

import styles from "./PropertyScale.module.css";

/** 1–5. */
export type PropertyRating = 1 | 2 | 3 | 4 | 5;

export interface PropertyScaleProps {
  /** Property name, e.g. "strength". Rendered uppercase. */
  label: string;
  rating: number;
  className?: string;
}

/**
 * A material property drawn as a five-pip scale.
 *
 * Renders a <dt>/<dd> pair, so it must sit inside a <dl>. The pip colour comes
 * from the `--pip-color` custom property, which lets a selected MaterialCard
 * shift the whole scale to orange without this component knowing about
 * selection.
 *
 * The pips are decorative — the rating is also stated in text, so the value
 * never depends on counting marks.
 */
export function PropertyScale({ label, rating, className }: PropertyScaleProps) {
  return (
    <div className={clsx(styles.row, className)}>
      <dt className={styles.key}>{label}</dt>
      <dd className={styles.scale}>
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={clsx(styles.pip, index < rating && styles.on)}
          />
        ))}
        <span className="u-visually-hidden">{rating} out of 5</span>
      </dd>
    </div>
  );
}
