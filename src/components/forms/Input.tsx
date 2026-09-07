"use client";

import { useId, type InputHTMLAttributes } from "react";
import clsx from "clsx";

import { Icon, type IconName } from "@/components/core";
import { FieldShell, describedBy, fieldStyles as styles, type FieldSize } from "./Field";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: IconName;
  /** Trailing unit, e.g. "MM", "G", "%". */
  suffix?: string;
  size?: FieldSize;
  /** Render the value in JetBrains Mono — use for dimensions, counts, IDs. */
  technical?: boolean;
  className?: string;
}

/**
 * Text or numeric field. 3px corners, hairline titanium border, orange focus rule.
 *
 * Client component: fields carry change handlers and need a generated id to link
 * their error message. Focus styling itself is CSS (`:focus-within`), not state.
 */
export function Input({
  label,
  hint,
  error,
  icon,
  suffix,
  size = "md",
  technical,
  disabled,
  required,
  className,
  id: idProp,
  ...rest
}: InputProps) {
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
      <span
        className={clsx(
          styles.shell,
          styles[size],
          error && styles.invalid,
          disabled && styles.disabled,
        )}
      >
        {icon && (
          <span className={styles.adornment}>
            <Icon name={icon} size={15} />
          </span>
        )}
        <input
          id={id}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={clsx(styles.control, technical && styles.technical)}
          {...rest}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </span>
    </FieldShell>
  );
}
