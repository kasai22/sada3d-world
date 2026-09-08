import { useId } from "react";

import styles from "./OptionGroup.module.css";

export interface Option {
  value: string;
  label: string;
  /** Secondary technical line, e.g. a layer height. */
  detail?: string;
  disabled?: boolean;
}

export interface OptionGroupProps {
  legend: string;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * Single-choice control for material and quality.
 *
 * When a product offers exactly one value there is nothing to choose, so it
 * renders as a labelled fact instead of a control with one option — the page
 * never implies a choice the customer does not have.
 */
export function OptionGroup({ legend, options, value, onChange }: OptionGroupProps) {
  const name = useId();

  if (options.length === 0) return null;

  const only = options.length === 1 ? options[0] : undefined;

  if (only) {
    return (
      <div className={styles.fixed}>
        <span className={styles.fixedLabel}>{legend}</span>
        <span className={styles.fixedValue}>
          {only.label}
          {only.detail ? ` · ${only.detail}` : ""}
        </span>
      </div>
    );
  }

  const selected = options.find((option) => option.value === value);

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>
        <span>{legend}</span>
        {selected && <span className={styles.selected}>{selected.label}</span>}
      </legend>

      <div className={styles.options}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name={name}
              className={styles.input}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.face}>
              <span className={styles.label}>{option.label}</span>
              {option.detail && <span className={styles.detail}>{option.detail}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
