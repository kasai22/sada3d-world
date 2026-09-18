"use client";

import { useId, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";

import { FieldShell, describedBy, fieldStyles as styles } from "./Field";
import local from "./Textarea.module.css";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
}

/** Multi-line text, in the same shell as `Input`: hairline border, orange focus rule. */
export function Textarea({ label, hint, error, disabled, required, className, id: idProp, rows = 4, ...rest }: TextareaProps) {
  const generated = useId();
  const id = idProp ?? generated;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <span className={clsx(styles.shell, local.shell, error && styles.invalid, disabled && styles.disabled)}>
        <textarea
          id={id}
          rows={rows}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={clsx(styles.control, local.control)}
          {...rest}
        />
      </span>
    </FieldShell>
  );
}
