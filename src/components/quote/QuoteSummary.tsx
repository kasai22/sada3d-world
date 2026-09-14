import clsx from "clsx";

import { Button, Icon, Tag } from "@/components/core";
import { formatINR } from "@/lib/money";
import type { QuoteResponse } from "@/lib/pricing/types";
import styles from "./QuoteSummary.module.css";

export interface QuoteSummaryProps {
  /** Null before a quote has been requested. */
  response: QuoteResponse | null;
  loading?: boolean;
  /**
   * True when the configuration changed after this quote was produced. The
   * figure is dimmed and captioned rather than removed, so the customer can
   * still see what it was.
   */
  stale?: boolean;
  onRetry?: () => void;
  className?: string;
}

/**
 * Displays a quote. Calculates nothing.
 *
 * All arithmetic lives in the pricing engine; this component formats what it is
 * given. It also never presents a provisional figure as settled pricing, and
 * never shows a stale total as current.
 */
export function QuoteSummary({
  response,
  loading = false,
  stale = false,
  onRetry,
  className,
}: QuoteSummaryProps) {
  const quote = response?.status === "available" ? response.quote : null;

  return (
    <section
      className={clsx(styles.summary, stale && styles.stale, className)}
      aria-labelledby="quote-summary-title"
    >
      <div className={styles.head}>
        <h3 className={styles.title} id="quote-summary-title">
          {quote?.basis === "geometry"
            ? "Manufacturing quote"
            : "Estimated manufacturing cost"}
        </h3>
        {stale && quote && <Tag tone="warning">Outdated</Tag>}
      </div>

      {/*
        Polite, so a recalculated figure is announced without interrupting the
        control that caused it. Only the resolved result is announced, not each
        intermediate state.
      */}
      <div className={styles.body} aria-live="polite" aria-atomic="true">
        {loading && (
          <p className={styles.placeholder} role="status">
            Calculating estimate.
          </p>
        )}

        {!loading && !response && (
          <p className={styles.placeholder}>
            Complete the configuration to see an estimate.
          </p>
        )}

        {!loading && quote && (
          <>
            <div className={styles.totalBlock}>
              <span className={styles.totalLabel}>
                {stale ? "Previous estimate" : "Estimate"}
              </span>
              <span className={styles.total}>{formatINR(quote.total)}</span>
              <span className={styles.rule} aria-hidden="true" />
            </div>

            <dl className={styles.breakdown}>
              {quote.lines.map((line) => (
                <div key={line.id} className={styles.line}>
                  <dt className={styles.lineLabel}>
                    {line.label}
                    {line.detail && (
                      <span className={styles.lineDetail}>{line.detail}</span>
                    )}
                  </dt>
                  <dd className={styles.lineAmount}>{formatINR(line.amount)}</dd>
                </div>
              ))}

              <div className={styles.totalRow}>
                <dt className={styles.totalRowLabel}>Estimate</dt>
                <dd className={styles.totalRowValue}>{formatINR(quote.total)}</dd>
              </div>
            </dl>

            {quote.excluded.length > 0 && (
              <ul className={styles.excluded}>
                {quote.excluded.map((item) => (
                  <li key={item} className={styles.excludedItem}>
                    <span className={styles.excludedMark} aria-hidden="true">
                      —
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            )}

            {quote.provisional && (
              <p className={styles.notice}>
                <span className={styles.noticeGlyph} aria-hidden="true">
                  <Icon name="info" size={16} />
                </span>
                <span>
                  <Tag tone="info">Provisional</Tag> This figure uses
                  demonstration rates, not confirmed Reality 3D pricing. It prices
                  your selections only — the part itself has not been measured.
                </span>
              </p>
            )}
          </>
        )}

        {!loading && response?.status === "unavailable" && (
          <p className={styles.problem} role="status">
            <span className={styles.problemGlyph} aria-hidden="true">
              <Icon name="info" size={16} />
            </span>
            {response.reason}
          </p>
        )}

        {!loading && response?.status === "invalid" && (
          <>
            <p className={styles.problem}>
              <span className={styles.problemGlyph} aria-hidden="true">
                <Icon name="error" size={16} />
              </span>
              This configuration could not be quoted.
            </p>
            <ul className={styles.errors}>
              {response.errors.map((error) => (
                <li key={`${error.field}:${error.message}`}>{error.message}</li>
              ))}
            </ul>
          </>
        )}

        {!loading && response?.status === "error" && (
          <>
            <p className={styles.problem} role="alert">
              <span className={styles.problemGlyph} aria-hidden="true">
                <Icon name="error" size={16} />
              </span>
              {response.message}
            </p>
            {onRetry && (
              <div className={styles.actions}>
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  Try again
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
