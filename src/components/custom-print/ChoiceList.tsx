import { useId } from "react";

import styles from "./ChoiceList.module.css";

export interface Choice {
  value: string;
  label: string;
  /** Technical value, e.g. a layer height. */
  detail?: string;
  description?: string;
}

export interface ChoiceListProps {
  legend: string;
  choices: readonly Choice[];
  value: string | undefined;
  onChange: (value: string) => void;
  /** Associates a validation message with the group. */
  describedBy?: string;
  invalid?: boolean;
}

/** Single-choice list where each option carries an explanation. */
export function ChoiceList({
  legend,
  choices,
  value,
  onChange,
  describedBy,
  invalid,
}: ChoiceListProps) {
  const name = useId();

  return (
    <fieldset
      className={styles.group}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
    >
      <legend className={styles.legend}>{legend}</legend>

      {choices.map((choice) => (
        <label key={choice.value} className={styles.option}>
          <input
            type="radio"
            name={name}
            className={styles.input}
            value={choice.value}
            checked={choice.value === value}
            onChange={() => onChange(choice.value)}
          />
          <span className={styles.face}>
            <span className={styles.mark} aria-hidden="true">
              {choice.value === value && <span className={styles.markDot} />}
            </span>
            <span className={styles.label}>{choice.label}</span>
            {choice.detail && <span className={styles.detail}>{choice.detail}</span>}
            {choice.description && (
              <span className={styles.description}>{choice.description}</span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
