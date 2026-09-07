"use client";

import { useEffect, useRef, type InputHTMLAttributes } from "react";
import clsx from "clsx";

import { Icon } from "@/components/core";
import styles from "./Choice.module.css";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  /** Trailing result count — the filter tree uses this. */
  count?: number;
  /** Parent state when only some descendants are selected. */
  indeterminate?: boolean;
  className?: string;
}

/** Square 16px checkbox — the filter-tree primitive. */
export function Checkbox({
  label,
  count,
  indeterminate = false,
  checked,
  className,
  ...rest
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  // `indeterminate` exists only as a DOM property, never as an attribute.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={clsx(styles.choice, checked && styles.checked, className)}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        aria-checked={indeterminate && !checked ? "mixed" : undefined}
        className={styles.input}
        {...rest}
      />
      <span className={clsx(styles.mark, styles.box)} aria-hidden="true">
        {checked && <Icon name="check" size={12} />}
        {!checked && indeterminate && <span className={styles.dash} />}
      </span>
      <span className={styles.text}>{label}</span>
      {count != null && <span className={styles.count}>{count}</span>}
    </label>
  );
}
