"use client";

import type { InputHTMLAttributes } from "react";
import clsx from "clsx";

import styles from "./Switch.module.css";

export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  /** Hide the visible label but keep it as the accessible name. */
  hideLabel?: boolean;
  className?: string;
}

/** Binary setting. Uses a native checkbox so it is keyboard- and form-native. */
export function Switch({
  label,
  hideLabel = false,
  className,
  ...rest
}: SwitchProps) {
  return (
    <label className={clsx(styles.switch, className)}>
      <input type="checkbox" role="switch" className={styles.input} {...rest} />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className={hideLabel ? "u-visually-hidden" : undefined}>{label}</span>
    </label>
  );
}
