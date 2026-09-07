"use client";

import clsx from "clsx";

import { Icon } from "@/components/core";
import styles from "./QuantityStepper.module.css";

export interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Accessible name, e.g. "Quantity of Precision Gear". */
  label?: string;
  className?: string;
}

/** Quantity control for the product page and the configurator. */
export function QuantityStepper({
  value,
  min = 1,
  max = 999,
  onChange,
  disabled,
  label = "Quantity",
  className,
}: QuantityStepperProps) {
  const clamp = (next: number) => onChange(Math.min(max, Math.max(min, next)));

  return (
    <div
      className={clsx(styles.stepper, className)}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => clamp(value - 1)}
        disabled={disabled || value <= min}
        className={styles.button}
      >
        <Icon name="minus" size={14} />
      </button>

      {/* Announced as a live value so the count is heard when it changes. */}
      <span className={styles.value} aria-live="polite" aria-atomic="true">
        {String(value).padStart(2, "0")}
      </span>

      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => clamp(value + 1)}
        disabled={disabled || value >= max}
        className={styles.button}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
