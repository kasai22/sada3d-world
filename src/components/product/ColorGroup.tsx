import { useId, type CSSProperties } from "react";

import { Icon } from "@/components/core";
import { COLORS } from "@/lib/catalog/taxonomy";
import optionStyles from "./OptionGroup.module.css";
import styles from "./ColorGroup.module.css";

export interface ColorGroupProps {
  /** Colour facet values this product is offered in. */
  values: readonly string[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * Colour selection.
 *
 * Swatches are radios, so the group is one tab stop with arrow-key traversal.
 * Selection is carried by a tick, a border and the named value beside the
 * legend — never by the swatch colour alone, which would be invisible to anyone
 * who cannot distinguish it.
 */
export function ColorGroup({ values, value, onChange }: ColorGroupProps) {
  const name = useId();

  if (values.length === 0) return null;

  const options = values
    .map((entry) => COLORS.find((color) => color.value === entry))
    .filter((color): color is (typeof COLORS)[number] => Boolean(color));

  if (options.length === 0) return null;

  // One colour is a fact about the part, not a choice.
  if (options.length === 1) {
    return (
      <div className={optionStyles.fixed}>
        <span className={optionStyles.fixedLabel}>Colour</span>
        <span className={optionStyles.fixedValue}>{options[0]?.label}</span>
      </div>
    );
  }

  const selected = options.find((color) => color.value === value);

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>
        <span>Colour</span>
        {selected && <span className={styles.selected}>{selected.label}</span>}
      </legend>

      <div className={styles.swatches}>
        {options.map((color) => (
          <label key={color.value} className={styles.option}>
            <input
              type="radio"
              name={name}
              className={styles.input}
              value={color.value}
              checked={color.value === value}
              onChange={() => onChange(color.value)}
            />
            <span
              className={styles.swatch}
              style={
                {
                  "--swatch": color.hex,
                  "--swatch-mark":
                    color.value === "white" || color.value === "grey"
                      ? "var(--void)"
                      : "var(--white)",
                } as CSSProperties
              }
            >
              {color.value === value && <Icon name="check" size={16} />}
            </span>
            <span className="u-visually-hidden">{color.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
