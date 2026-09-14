import { useId } from "react";

import styles from "./ChoiceList.module.css";

export interface Choice {
  value: string;
  label: string;
  /** Technical value, e.g. a layer height. */
  detail?: string;
  description?: string;
  /** Stage 19.9: shown with a "Coming soon" badge; choosing it calls onUnavailable, never onChange. */
  comingSoon?: boolean;
}

export interface ChoiceListProps {
  legend: string;
  choices: readonly Choice[];
  value: string | undefined;
  onChange: (value: string) => void;
  /** Associates a validation message with the group. */
  describedBy?: string;
  invalid?: boolean;
  /** Called when a Coming Soon choice is picked, so the caller can explain. */
  onUnavailable?: (choice: Choice) => void;
}

/** Single-choice list where each option carries an explanation. */
export function ChoiceList({
  legend,
  choices,
  value,
  onChange,
  describedBy,
  invalid,
  onUnavailable,
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
        <label key={choice.value} className={choice.comingSoon ? `${styles.option} ${styles.soon}` : styles.option}>
          <input
            type="radio"
            name={name}
            className={styles.input}
            value={choice.value}
            checked={!choice.comingSoon && choice.value === value}
            aria-disabled={choice.comingSoon || undefined}
            onChange={() => (choice.comingSoon ? onUnavailable?.(choice) : onChange(choice.value))}
          />
          <span className={styles.face}>
            <span className={styles.mark} aria-hidden="true">
              {choice.value === value && <span className={styles.markDot} />}
            </span>
            <span className={styles.label}>{choice.label}</span>
            {choice.comingSoon ? (
              <span className={styles.soonBadge}>
                Coming soon<span className="u-visually-hidden"> — not available to order yet</span>
              </span>
            ) : (
              choice.detail && <span className={styles.detail}>{choice.detail}</span>
            )}
            {choice.description && (
              <span className={styles.description}>{choice.description}</span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
