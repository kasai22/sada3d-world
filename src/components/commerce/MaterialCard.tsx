import clsx from "clsx";

import { PropertyScale, type PropertyRating } from "./PropertyScale";
import styles from "./MaterialCard.module.css";

export type { PropertyRating };

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
          return <PropertyScale key={key} label={key} rating={rating} />;
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
