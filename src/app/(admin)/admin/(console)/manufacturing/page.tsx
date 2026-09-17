import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";

import { Input } from "@/components/forms/Input";
import { EmptyState } from "@/components/ops/EmptyState";
import { FilterCheckbox, FilterForm } from "@/components/ops/FilterForm";
import { PageHeader } from "@/components/ops/PageHeader";
import { DemoTag, StatusBadge } from "@/components/ops/StatusBadge";
import { Panel } from "@/components/structure/Panel";
import { formatAge, formatCount } from "@/lib/ops/format";
import { HOLD_REASON_LABEL, MANUFACTURING_STATE_LABEL } from "@/lib/ops/labels";
import { requireOperator } from "@/lib/ops/operator";
import { getProductionBoard } from "@/lib/ops/production";
import { RECENT_TERMINAL_DAYS } from "@/lib/ops/pipeline";
import { parseProductionQuery, type SearchParamsRecord } from "@/lib/ops/query";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Production" };

const PATH = "/admin/manufacturing";

const EXCEPTION_TONE = {
  high: "danger",
  medium: "warning",
  low: "neutral",
} as const;

/**
 * The shop floor.
 *
 * Every job still in production, grouped by where it is, oldest first inside a
 * column so the thing that has waited longest is at the top. Exceptions — held,
 * overdue, in rework, failed, or quiet for three days — are pulled above the
 * rest and say why.
 *
 * Cards are read-only; the buttons that move a job live on the order, with the
 * event history they belong to.
 */
export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const operator = await requireOperator(PATH);
  const params = await searchParams;
  const query = parseProductionQuery(params);
  const now = new Date();

  const board = await getProductionBoard(operator, query, now);
  const filtered = Boolean(query.q) || query.exceptions;
  const empty = board.columns.every((column) => column.cards.length === 0);

  return (
    <>
      <PageHeader
        title="Production"
        description="Manufacturing jobs by stage. Custom parts only — catalog parts are fulfilled from stock."
        meta={
          <>
            <StatusBadge tone={board.counts.active > 0 ? "accent" : "neutral"}>
              {formatCount(board.counts.active)} active
            </StatusBadge>
            {board.counts.held > 0 && (
              <StatusBadge tone="warning">{formatCount(board.counts.held)} held</StatusBadge>
            )}
            {board.counts.exceptions > 0 && (
              <StatusBadge tone="danger">{formatCount(board.counts.exceptions)} need attention</StatusBadge>
            )}
          </>
        }
      />

      <FilterForm action={PATH} label="Filter production" clearHref={PATH} active={filtered}>
        <Input
          name="q"
          type="search"
          size="sm"
          label="Search"
          placeholder="Order, part or customer"
          defaultValue={query.q ?? ""}
          icon="search"
        />
        <FilterCheckbox name="exceptions" label="Only jobs needing attention" defaultChecked={query.exceptions} />
      </FilterForm>

      {board.truncated && (
        <p className={styles.truncated} role="status">
          More jobs match than this board shows. Narrow the search to see the rest.
        </p>
      )}

      {empty ? (
        <Panel padded={false}>
          <EmptyState
            icon="factory"
            title={filtered ? "No jobs match" : "Nothing in production"}
            action={
              filtered ? (
                <Link href={PATH} className={styles.clear}>
                  Clear filters
                </Link>
              ) : undefined
            }
          >
            <p>
              {filtered
                ? "No manufacturing job matches this search."
                : "A job appears here when an order containing a custom part is placed."}
            </p>
          </EmptyState>
        </Panel>
      ) : (
        <div className={styles.board} role="region" aria-label="Production board" tabIndex={0}>
          {board.columns.map(({ column, cards, total }) => (
            <section
              key={column.id}
              id={column.id}
              className={clsx(styles.column, column.terminal && styles.terminal)}
              aria-labelledby={`column-${column.id}`}
            >
              <header className={styles.columnHead}>
                <h2 className={styles.columnTitle} id={`column-${column.id}`}>
                  {column.label}
                </h2>
                <span className={styles.columnCount}>{total}</span>
                <p className={styles.columnHint}>{column.hint}</p>
              </header>

              <ol className={styles.cards}>
                {cards.map((card) => (
                  <li key={card.jobId}>
                    <article
                      className={clsx(styles.card, card.exception && styles[`exception-${card.exception.severity}`])}
                    >
                      <div className={styles.cardTop}>
                        <Link href={card.href} className={styles.cardLink}>
                          {card.orderReference}
                        </Link>
                        <span className={styles.age} title={card.updatedAt}>
                          {formatAge(card.updatedAt, now)}
                        </span>
                      </div>

                      <p className={styles.part}>{card.itemName}</p>

                      <p className={styles.spec}>
                        {card.configuration
                          ? [card.configuration.material, card.configuration.quality, card.configuration.finish]
                              .filter(Boolean)
                              .join(" · ")
                          : card.spec}
                      </p>

                      <dl className={styles.facts}>
                        <div>
                          <dt>Qty</dt>
                          <dd>{card.quantity}</dd>
                        </div>
                        <div>
                          <dt>Machine</dt>
                          <dd>{card.machineId ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Due</dt>
                          <dd>{card.estimatedCompletionAt ? card.estimatedCompletionAt.slice(0, 10) : "—"}</dd>
                        </div>
                      </dl>

                      <p className={styles.customer}>{card.customerName}</p>

                      <div className={styles.cardTags}>
                        {card.exception ? (
                          <StatusBadge tone={EXCEPTION_TONE[card.exception.severity]}>
                            {card.exception.title}
                          </StatusBadge>
                        ) : card.hold ? (
                          <StatusBadge tone="warning">{HOLD_REASON_LABEL[card.hold.reason]}</StatusBadge>
                        ) : (
                          <span className={styles.state}>{MANUFACTURING_STATE_LABEL[card.state]}</span>
                        )}
                        {card.demo && <DemoTag />}
                      </div>

                      {card.nextAction && <p className={styles.next}>Next: {card.nextAction}</p>}
                    </article>
                  </li>
                ))}

                {cards.length === 0 && <li className={styles.emptyColumn}>Nothing here</li>}
              </ol>

              {column.terminal && total > cards.length && (
                <p className={styles.more}>
                  {total - cards.length} more in the last {RECENT_TERMINAL_DAYS} days
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
