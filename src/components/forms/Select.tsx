"use client";

import { useId, type SelectHTMLAttributes } from "react";
import clsx from "clsx";

import { Icon } from "@/components/core";
import { FieldShell, describedBy, fieldStyles as fieldCss, type FieldSize } from "./Field";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size" | "children"> {
  label?: string;
  hint?: string;
  error?: string;
  size?: FieldSize;
  options: readonly (SelectOption | string)[];
  /** Shown as a disabled first option when the field has no value yet. */
  placeholder?: string;
  className?: string;
}

/** Native select styled to the SADA 3D field spec. Native keeps mobile pickers. */
export function Select({
  label,
  hint,
  error,
  size = "md",
  options,
  placeholder,
  disabled,
  required,
  className,
  id: idProp,
  ...rest
}: SelectProps) {
  const generated = useId();
  const id = idProp ?? generated;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <span className={styles.wrap}>
        <span
          className={clsx(
            fieldCss.shell,
            fieldCss[size],
            error && fieldCss.invalid,
            disabled && fieldCss.disabled,
          )}
          style={{ width: "100%", padding: "0 0 0 12px" }}
        >
          <select
            id={id}
            disabled={disabled}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, hint, error)}
            className={clsx(fieldCss.control, styles.select)}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => {
              const value = typeof option === "string" ? option : option.value;
              const text = typeof option === "string" ? option : option.label;
              const isDisabled =
                typeof option === "string" ? undefined : option.disabled;
              return (
                <option key={value} value={value} disabled={isDisabled}>
                  {text}
                </option>
              );
            })}
          </select>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          <Icon name="chevron-down" size={15} />
        </span>
      </span>
    </FieldShell>
  );
}
