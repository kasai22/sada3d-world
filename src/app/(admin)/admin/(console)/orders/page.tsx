import type { Metadata } from "next";
import Link from "next/link";

import { StageChips } from "@/components/ops/command/StageChips";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { EmptyState } from "@/components/ops/EmptyState";
import { FilterForm } from "@/components/ops/FilterForm";
import { PageHeader } from "@/components/ops/PageHeader";
import { Pagination } from "@/components/ops/Pagination";
import {
  Above,
  CellLink,
  RowLink,
  Stack,
  TableFrame,
  Td,
  Th,
  Tr,
  type SortState,
} from "@/components/ops/Table";
import { DemoTag, OrderStatusBadge, PaymentBadge, StatusBadge } from "@/components/ops/StatusBadge";
import { Panel } from "@/components/structure/Panel";
import { getOrderStageCounts } from "@/lib/ops/analytics/orders";
import { formatAge, formatCount, formatINR } from "@/lib/ops/format";
import { MANUFACTURING_STATE_LABEL, MANUFACTURING_STATE_TONE } from "@/lib/ops/labels";
import { listOpsOrders } from "@/lib/ops/orders";
import { requireOperator } from "@/lib/ops/operator";
import {
  ORDER_STATUSES,
  hasOrderFilters,
  hrefWith,
  orderQueryParams,
  parseOrderListQuery,
  type OrderSort,
  type SearchParamsRecord,
} from "@/lib/ops/query";
import { ORDER_STATUS_LABEL } from "@/lib/orders/types";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Orders" };

const PATH = "/admin/orders";

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  ...ORDER_STATUSES.map((status) => ({ value: status, label: ORDER_STATUS_LABEL[status] })),
];

const PAYMENT_OPTIONS = [
  { value: "", label: "Any payment" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
];

const PRODUCTION_OPTIONS = [
  { value: "", label: "Any production" },
  { value: "active", label: "In production" },
  { value: "held", label: "On hold" },
  { value: "failed", label: "Has a failed job" },
  { value: "none", label: "No manufacturing" },
];

const DEMO_OPTIONS = [
  { value: "", label: "Demo: included" },
  { value: "exclude", label: "Demo: hidden" },
  { value: "only", label: "Demo only" },
];

/**
 * Every order, one page at a time.
 *
 * Filters live in the URL, so a filtered view is a link a colleague can open.
 * The query runs in the database and returns one page; the items and jobs behind
 * the Items and Production columns are read for that page of references only.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const operator = await requireOperator(PATH);
  const params = await searchParams;
  const query = parseOrderListQuery(params);
  const now = new Date();

  const [page, stageCounts] = await Promise.all([listOpsOrders(operator, query), getOrderStageCounts(operator)]);
  const filtered = hasOrderFilters(query);
  const current = orderQueryParams(query);

  const sortLink = (field: "placed" | "total", next: OrderSort): SortState => ({
    href: hrefWith(PATH, current, { sort: next, page: null }),
    active: query.sort.startsWith(field),
    direction: query.sort.endsWith("asc") ? "asc" : "desc",
  });

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order placed, and what each one is waiting on."
        meta={
          <span className={styles.count}>
            {formatCount(page.total)} {page.total === 1 ? "order" : "orders"}
            {filtered ? " matching" : ""}
          </span>
        }
      />

      <StageChips counts={stageCounts} active={query.stage} />

      <FilterForm action={PATH} label="Filter orders" clearHref={PATH} active={filtered}>
        <Input
          name="q"
          type="search"
          size="sm"
          label="Search"
          placeholder="Reference, name or email"
          defaultValue={query.q ?? ""}
          icon="search"
        />
        <Select name="status" size="sm" label="Status" options={STATUS_OPTIONS} defaultValue={query.status ?? ""} />
        <Select name="payment" size="sm" label="Payment" options={PAYMENT_OPTIONS} defaultValue={query.payment ?? ""} />
        <Select
          name="production"
          size="sm"
          label="Production"
          options={PRODUCTION_OPTIONS}
          defaultValue={query.production ?? ""}
        />
        <Input name="from" type="date" size="sm" label="Placed from" defaultValue={query.from ?? ""} />
        <Input name="to" type="date" size="sm" label="Placed to" defaultValue={query.to ?? ""} />
        <Select name="demo" size="sm" label="Demo orders" options={DEMO_OPTIONS} defaultValue={query.demo ?? ""} />
        {query.customer && <input type="hidden" name="customer" value={query.customer} />}
        {query.stage && <input type="hidden" name="stage" value={query.stage} />}
      </FilterForm>

      {page.total === 0 ? (
        <Panel padded={false}>
          <EmptyState
            icon="clipboard"
            title={filtered ? "No orders match these filters" : "No orders yet"}
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
                ? "Try a wider date range, or clear the filters to see every order."
                : "Orders appear here as customers place them."}
            </p>
          </EmptyState>
        </Panel>
      ) : (
        <TableFrame label="Orders" caption="Orders, with payment, production and fulfilment status">
          <thead>
            <tr>
              <Th sort={sortLink("placed", query.sort === "placed_desc" ? "placed_asc" : "placed_desc")}>Order</Th>
              <Th>Customer</Th>
              <Th hide="md">Items</Th>
              <Th align="right" sort={sortLink("total", query.sort === "total_desc" ? "total_asc" : "total_desc")}>
                Amount
              </Th>
              <Th>Payment</Th>
              <Th hide="sm">Production</Th>
              <Th>Status</Th>
              <Th align="right" hide="lg">
                Created
              </Th>
              <Th align="right" hide="sm">
                <span className="u-visually-hidden">Action</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((order) => (
              <Tr key={order.reference}>
                <Td nowrap>
                  <Stack
                    primary={
                      <>
                        <RowLink href={`/admin/orders/${order.reference}`} mono>
                          {order.reference}
                        </RowLink>
                        {order.demo && (
                          <Above>
                            {" "}
                            <DemoTag />
                          </Above>
                        )}
                      </>
                    }
                    secondary={`${formatAge(order.placedAt, now)} ago`}
                  />
                </Td>
                <Td>
                  <Stack
                    primary={
                      order.customer.id ? (
                        <Above>
                          <CellLink href={`/admin/customers/${order.customer.id}`}>{order.customer.name}</CellLink>
                        </Above>
                      ) : (
                        order.customer.name
                      )
                    }
                    secondary={order.customer.id ? order.customer.email : `Guest · ${order.customer.email}`}
                  />
                </Td>
                <Td hide="md">
                  <Stack
                    primary={order.items.summary}
                    secondary={`${order.items.lines} ${order.items.lines === 1 ? "line" : "lines"} · ${order.items.units} ${
                      order.items.units === 1 ? "unit" : "units"
                    }`}
                  />
                </Td>
                <Td align="right" mono nowrap>
                  {formatINR(order.total)}
                </Td>
                <Td>
                  <PaymentBadge status={order.paymentStatus} />
                </Td>
                <Td hide="sm">
                  {order.production.state ? (
                    <Stack
                      primary={
                        <StatusBadge
                          tone={
                            order.production.held > 0
                              ? "warning"
                              : MANUFACTURING_STATE_TONE[order.production.state]
                          }
                        >
                          {MANUFACTURING_STATE_LABEL[order.production.state]}
                        </StatusBadge>
                      }
                      secondary={
                        order.production.held > 0
                          ? `${order.production.held} held`
                          : order.production.active > 1
                            ? `${order.production.active} parts`
                            : undefined
                      }
                    />
                  ) : order.production.failed > 0 ? (
                    <StatusBadge tone="danger">Job failed</StatusBadge>
                  ) : order.production.jobs > 0 ? (
                    <span className={styles.quiet}>Finished</span>
                  ) : (
                    <span className={styles.quiet}>None</span>
                  )}
                </Td>
                <Td>
                  <OrderStatusBadge status={order.status} />
                </Td>
                <Td align="right" hide="lg" mono nowrap>
                  {order.placedAt.slice(0, 10)}
                </Td>
                <Td align="right" hide="sm" nowrap>
                  <span className={styles.open} aria-hidden="true">
                    Open →
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      <Pagination
        label="Orders"
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        pageSize={page.pageSize}
        hrefFor={(target) => hrefWith(PATH, current, { page: target })}
      />
    </>
  );
}
