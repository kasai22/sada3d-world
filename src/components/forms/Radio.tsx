"use client";

import type { InputHTMLAttributes } from "react";
import clsx from "clsx";

import styles from "./Choice.module.css";

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  count?: number;
  className?: string;
}

/**
 * Single-choice control. Radio marks are one of only two round shapes the
 * design system permits.
 */
export function Radio({ label, count, checked, className, ...rest }: RadioProps) {
  return (
    <label className={clsx(styles.choice, checked && styles.checked, className)}>
      <input type="radio" checked={checked} className={styles.input} {...rest} />
      <span
        className={clsx(styles.mark, styles.disc, checked && styles.checked)}
        aria-hidden="true"
      >
        {checked && <span className={styles.discInner} />}
      </span>
      <span className={styles.text}>{label}</span>
      {count != null && <span className={styles.count}>{count}</span>}
    </label>
  );
}
