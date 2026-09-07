import clsx from "clsx";

import styles from "./MaterialCard.module.css";

/** 1–5. Rendered as a five-pip scale and stated in text for screen readers. */
export type PropertyRating = 1 | 2 | 3 | 4 | 5;

export interface MaterialProperties {
  strength?: PropertyRating;
  flexibility?: PropertyRating;
  heat?: PropertyRating;
}

export interface MaterialCardProps {
  name: string;
  /** Chemical or process name, e.g. "Glycol-modified PET". */
  code?: string;
  description?: string;
  properties?: MaterialProperties;
  /** Hex values shown as available colour swatches. */
  colors?: readonly string[];
  /** Price multiplier, e.g. "1.2" renders as ×1.2. */
  multiplier?: string;
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  className?: string;
}

const PROPERTY_ORDER = ["strength", "flexibility", "heat"] as const;

/** Interactive material selector — PLA / PETG / ABS / TPU / RESIN. */
export function MaterialCard({
  name,
  code,
  description,
  properties = {},
  colors = [],
  multiplier,
  selected = false,
  onSelect,
  disabled,
  className,
}: MaterialCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      disabled={disabled}
      className={clsx(styles.card, className)}
    >
      <span className={styles.top}>
        <span className={styles.name}>{name}</span>
        {multiplier && (
          <span className={styles.multiplier}>
            ×{multiplier}
            <span className="u-visually-hidden"> price multiplier</span>
          </span>
        )}
      </span>

      <span className={styles.rule} aria-hidden="true" />

      {code && <span className={styles.code}>{code}</span>}
      {description && <span className={styles.description}>{description}</span>}

      <dl className={styles.properties}>
        {PROPERTY_ORDER.map((key) => {
          const rating = properties[key];
          if (rating == null) return null;

          return (
            <div key={key} className={styles.property}>
              <dt className={styles.propertyKey}>{key}</dt>
              <dd className={styles.scale}>
                {Array.from({ length: 5 }, (_, index) => (
                  <span
                    key={index}
                    aria-hidden="true"
                    className={clsx(styles.pip, index < rating && styles.pipOn)}
                  />
                ))}
                {/* The pip scale is decorative; the value is stated. */}
                <span className="u-visually-hidden">{rating} out of 5</span>
              </dd>
            </div>
          );
        })}
      </dl>

      {colors.length > 0 && (
        <span className={styles.colors}>
          {colors.map((color) => (
            <span
              key={color}
              className={styles.swatch}
              style={{ background: color }}
              aria-hidden="true"
            />
          ))}
          <span className="u-visually-hidden">
            {colors.length} colours available
          </span>
        </span>
      )}
    </button>
  );
}
