import type { Metadata } from "next";
import Link from "next/link";

import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { EmptyState } from "@/components/ops/EmptyState";
import { FilterForm } from "@/components/ops/FilterForm";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader } from "@/components/ops/PageHeader";
import { Pagination } from "@/components/ops/Pagination";
import { DemoTag, OrderStatusBadge, PaymentBadge } from "@/components/ops/StatusBadge";
import { Above, CellLink, RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import { formatCount, formatINR } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import { getPaymentTotals, listOpsPayments, paymentAdapterStatus } from "@/lib/ops/payments";
import { hrefWith, parsePaymentListQuery, paymentQueryParams, type SearchParamsRecord } from "@/lib/ops/query";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Payments" };

const PATH = "/ops/payments";

const STATUS_OPTIONS = [
  { value: "", label: "Any state" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
];

const DEMO_OPTIONS = [
  { value: "", label: "Demo: included" },
  { value: "exclude", label: "Demo: hidden" },
  { value: "only", label: "Demo only" },
];

/**
 * Payments, as the order domain records them.
 *
 * Three states, because the domain has three: pending, paid, failed. There is
 * no refund model and no partial refund, so neither is shown — a state this
 * console cannot produce is a state it should not imply.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const operator = await requireOperator(PATH);
  const params = await searchParams;
  const query = parsePaymentListQuery(params);

  const [page, totals] = await Promise.all([listOpsPayments(operator, query), getPaymentTotals(operator)]);
  const adapter = paymentAdapterStatus();
  const filtered = Boolean(query.q || query.status || query.demo);
  const current = paymentQueryParams(query);

  return (
    <>
      <PageHeader
        title="Payments"
        description="What each order has paid, and what has not settled."
      />

      {!adapter.configured ? (
        <p className={styles.banner} role="status">
          {adapter.problem}
        </p>
      ) : adapter.mode === "mock" ? (
        <p className={styles.banner} role="status">
          Mock payment adapter: no money moves in this deployment. Payment state is recorded at checkout rather than
          settled with a provider.
        </p>
      ) : null}

      <section className={styles.kpis} aria-label="Payment totals, demonstration orders excluded">
        <KpiCard
          label="Paid"
          value={formatINR(totals.paid.amount)}
          detail={`${formatCount(totals.paid.orders)} orders`}
          href={`${PATH}?status=paid`}
        />
        <KpiCard
          label="Pending"
          value={formatINR(totals.pending.amount)}
          detail={`${formatCount(totals.pending.orders)} orders awaiting payment`}
          href={`${PATH}?status=pending`}
          signal={totals.pending.orders > 0 ? "warning" : undefined}
        />
        <KpiCard
          label="Failed"
          value={formatINR(totals.failed.amount)}
          detail={`${formatCount(totals.failed.orders)} orders to recover`}
          href={`${PATH}?status=failed`}
          signal={totals.failed.orders > 0 ? "danger" : undefined}
        />
      </section>

      <FilterForm action={PATH} label="Filter payments" clearHref={PATH} active={filtered}>
        <Input
          name="q"
          type="search"
          size="sm"
          label="Search"
          placeholder="Order, customer or transaction"
          defaultValue={query.q ?? ""}
          icon="search"
        />
        <Select name="status" size="sm" label="State" options={STATUS_OPTIONS} defaultValue={query.status ?? ""} />
        <Select name="demo" size="sm" label="Demo orders" options={DEMO_OPTIONS} defaultValue={query.demo ?? ""} />
      </FilterForm>

      {page.total === 0 ? (
        <Panel padded={false}>
          <EmptyState
            icon="wallet"
            title={filtered ? "No payments match" : "No payments yet"}
            action={
              filtered ? (
                <Link href={PATH} className={styles.clear}>
                  Clear filters
                </Link>
              ) : undefined
            }
          >
            <p>{filtered ? "Try another reference or state." : "Payments appear here as orders are placed."}</p>
          </EmptyState>
        </Panel>
      ) : (
        <TableFrame label="Payments" caption="Payments by order">
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th align="right">Amount</Th>
              <Th>Payment</Th>
              <Th hide="md">Order status</Th>
              <Th hide="lg">Transaction</Th>
              <Th align="right" hide="sm">
                Updated
              </Th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((payment) => (
              <Tr key={payment.reference}>
                <Td nowrap>
                  <Stack
                    primary={
                      <>
                        <RowLink href={`/ops/orders/${payment.reference}#payment`} mono>
                          {payment.reference}
                        </RowLink>
                        {payment.demo && (
                          <Above>
                            {" "}
                            <DemoTag />
                          </Above>
                        )}
                      </>
                    }
                    secondary={payment.provider ?? "No provider recorded"}
                  />
                </Td>
                <Td>
                  <Stack
                    primary={
                      payment.customer.id ? (
                        <Above>
                          <CellLink href={`/ops/customers/${payment.customer.id}`}>{payment.customer.name}</CellLink>
                        </Above>
                      ) : (
                        payment.customer.name
                      )
                    }
                    secondary={payment.customer.id ? payment.customer.email : `Guest · ${payment.customer.email}`}
                  />
                </Td>
                <Td align="right" mono nowrap>
                  {formatINR(payment.amount)}
                </Td>
                <Td>
                  <PaymentBadge status={payment.status} />
                </Td>
                <Td hide="md">
                  <OrderStatusBadge status={payment.orderStatus} />
                </Td>
                <Td hide="lg" mono muted>
                  {payment.transactionReference ?? "—"}
                </Td>
                <Td align="right" mono hide="sm" nowrap>
                  {payment.updatedAt.slice(0, 10)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      <Pagination
        label="Payments"
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        pageSize={page.pageSize}
        hrefFor={(target) => hrefWith(PATH, current, { page: target })}
      />

      <p className={styles.note}>
        Totals exclude demonstration orders and cancelled orders. Payment state changes with the provider; the console
        reports it and does not set it.
      </p>
    </>
  );
}
