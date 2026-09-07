"use client";

import { useId, type CSSProperties, type InputHTMLAttributes } from "react";
import clsx from "clsx";

import styles from "./RangeSlider.module.css";

export interface RangeSliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Renders the current value, e.g. (v) => `${v}%` or (v) => `₹${v}`. */
  format?: (value: number) => string;
  className?: string;
}

/** Single-value range control — price filters, infill percentage, layer height. */
export function RangeSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  format,
  disabled,
  className,
  id: idProp,
  ...rest
}: RangeSliderProps) {
  const generated = useId();
  const id = idProp ?? generated;

  const span = max - min;
  const fill = span > 0 ? ((value - min) / span) * 100 : 0;
  const display = format ? format(value) : String(value);

  return (
    <div className={clsx(styles.wrap, className)}>
      {label && (
        <div className={styles.head}>
          <label className={styles.label} htmlFor={id}>
            {label}
          </label>
          <span className={styles.value} aria-hidden="true">
            {display}
          </span>
        </div>
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={display}
        className={styles.range}
        style={{ "--fill": `${fill}%` } as CSSProperties}
        {...rest}
      />
    </div>
  );
}
