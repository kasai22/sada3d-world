"use client";

import { useActionState, type ReactNode } from "react";
import clsx from "clsx";

import { Button } from "@/components/core/Button";
import type { OpsActionResult } from "@/lib/ops/types";

import styles from "./inventory.module.css";

export type InventoryFormAction = (previous: OpsActionResult | null, form: FormData) => Promise<OpsActionResult>;

/**
 * An inventory form: native fields, one submit, and the server's answer in a
 * status region. Nothing here decides anything — the action re-checks the
 * operator and the service validates, locks and writes.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  hidden = {},
  variant = "secondary",
  compact = false,
}: {
  action: InventoryFormAction;
  submitLabel: string;
  children?: ReactNode;
  hidden?: Record<string, string>;
  variant?: "primary" | "secondary" | "destructive";
  compact?: boolean;
}) {
  const [result, submit, pending] = useActionState(action, null);

  return (
    <form action={submit} className={clsx(styles.form, compact && styles.compact)}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children && <div className={styles.fields}>{children}</div>}
      <div className={styles.submitRow}>
        <Button type="submit" size="sm" variant={variant} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <p className={clsx(styles.message, result && (result.ok ? styles.success : styles.failure))} role="status" aria-live="polite">
          {result?.message}
        </p>
      </div>
    </form>
  );
}

/** A labelled native field. */
export function Field({
  label,
  hint,
  wide = false,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={clsx(styles.field, wide && styles.wide)}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}
