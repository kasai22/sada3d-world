import clsx from "clsx";

import { Icon } from "@/components/core";
import styles from "./Stepper.module.css";

export interface StepperProps {
  /** Step labels in order, e.g. ["Upload", "Material", "Quality", "Finish", "Review"]. */
  steps: readonly string[];
  /** Zero-based index of the step in progress. */
  current: number;
  /**
   * Supply to make completed steps navigable. Omitted, the stepper is a
   * read-only progress indicator and its buttons are disabled.
   */
  onSelect?: (index: number) => void;
  /** Accessible name, e.g. "Custom print configuration". */
  label?: string;
  className?: string;
}

/** Horizontal process stepper — the configurator flow, 01 UPLOAD to 05 REVIEW. */
export function Stepper({
  steps,
  current,
  onSelect,
  label = "Progress",
  className,
}: StepperProps) {
  return (
    <ol className={clsx(styles.stepper, className)} aria-label={label}>
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;

        return (
          <li
            key={step}
            className={clsx(
              styles.item,
              done && styles.done,
              active && styles.active,
            )}
            aria-current={active ? "step" : undefined}
          >
            <button
              type="button"
              className={styles.step}
              disabled={!onSelect}
              onClick={onSelect ? () => onSelect(index) : undefined}
            >
              <span className={styles.top}>
                <span className={styles.index}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.label}>{step}</span>
                {done && (
                  <span className={styles.check}>
                    <Icon name="check" size={12} />
                  </span>
                )}
                {/* State is carried in text, not colour alone. */}
                <span className="u-visually-hidden">
                  {done ? " — complete" : active ? " — in progress" : " — not started"}
                </span>
              </span>
              <span className={styles.rule} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
