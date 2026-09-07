"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

import { Icon } from "@/components/core";
import styles from "./Field.module.css";

export type FieldSize = "sm" | "md" | "lg";

export interface FieldShellProps {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Label + message scaffolding shared by every field.
 *
 * The design system requires a visible persistent label (never placeholder-only)
 * and errors announced as text plus border plus icon. `describedBy` wires the
 * message to the control so screen readers reach it.
 */
export function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldShellProps) {
  const messageId = `${id}-message`;

  return (
    <div className={clsx(styles.field, className)}>
      {label && (
        <label className={styles.label} htmlFor={id}>
          {label}
          {required && (
            <>
              <span className={styles.required} aria-hidden="true">
                *
              </span>
              <span className="u-visually-hidden"> required</span>
            </>
          )}
        </label>
      )}

      {children}

      {error ? (
        <span className={styles.error} id={messageId} role="alert">
          <Icon name="error" size={14} />
          {error}
        </span>
      ) : (
        hint && (
          <span className={styles.message} id={messageId}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}

/** Id of the hint/error node, or undefined when the field has no message. */
export function describedBy(id: string, hint?: string, error?: string) {
  return hint || error ? `${id}-message` : undefined;
}

export { styles as fieldStyles };
