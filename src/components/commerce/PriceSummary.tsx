import type { ReactNode } from "react";
import clsx from "clsx";

import { Button } from "@/components/core";
import styles from "./PriceSummary.module.css";

/**
 * Quote lifecycle.
 *
 * `calculating` — no prior figure; `updating` — a figure exists and is being
 * refreshed; `invalid` — the model cannot be quoted (geometry, minimum order);
 * `error` — the pricing service failed.
 */
export type QuoteState =
  | "calculating"
  | "updating"
  | "valid"
  | "invalid"
  | "error";

export interface AnalysisRow {
  label: string;
  value: string;
}

export interface PriceSummaryProps {
  analysis?: readonly AnalysisRow[];
  /** Pre-formatted, e.g. "₹387". Ignored unless state is "valid". */
  price?: string;
  state?: QuoteState;
  /** Explains an invalid or errored quote, or carries a note on a valid one. */
  message?: string;
  cta?: ReactNode;
  onCta?: () => void;
  /** Small uppercase footnote, e.g. "EXCLUDES GST AND SHIPPING". */
  note?: string;
  className?: string;
}

/**
 * Live manufacturing quote panel — part analysis plus estimated price.
 *
 * Never renders a figure it does not have: while calculating or when the quote
 * is invalid the price reads as an em dash, so no fabricated number is shown.
 */
export function PriceSummary({
  analysis = [],
  price,
  state = "valid",
  message,
  cta = "Configure print",
  onCta,
  note,
  className,
}: PriceSummaryProps) {
  const invalid = state === "invalid" || state === "error";
  const busy = state === "calculating" || state === "updating";
  const showPrice = !invalid && !busy && price;

  return (
    <div
      className={clsx(
        styles.panel,
        invalid && styles.invalid,
        busy && styles.busy,
        className,
      )}
    >
      <div className={styles.header}>
        <h3 className={styles.headerLabel}>Part analysis</h3>
      </div>

      <dl className={styles.analysis}>
        {analysis.map((row) => (
          <div key={row.label} className={styles.row}>
            <dt className={styles.key}>{row.label}</dt>
            <dd className={styles.value}>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.total}>
        <span className={styles.totalLabel}>Estimated price</span>

        {/* Announced politely so a recalculated figure reaches screen readers
            without interrupting whatever the customer is configuring. */}
        <span className={styles.priceRow} aria-live="polite" aria-atomic="true">
          <span className={styles.price}>{showPrice ? price : "—"}</span>
          {busy && (
            <span className={styles.state}>
              {state === "calculating" ? "Calculating" : "Updating"}
            </span>
          )}
        </span>

        <span className={styles.rule} aria-hidden="true" />

        {message && (
          <p className={styles.message} role={invalid ? "alert" : undefined}>
            {message}
          </p>
        )}

        <Button
          variant={invalid ? "secondary" : "primary"}
          size="lg"
          fullWidth
          disabled={invalid}
          loading={busy}
          onClick={onCta}
          className={styles.action}
        >
          {cta}
        </Button>

        {note && <p className={styles.note}>{note}</p>}
      </div>
    </div>
  );
}
