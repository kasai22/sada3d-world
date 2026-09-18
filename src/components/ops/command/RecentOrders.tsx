import { Above, CellLink, RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { DemoTag, JobStateBadge, OrderStatusBadge, PaymentBadge, StatusBadge } from "@/components/ops/StatusBadge";
import { LocalTime } from "@/components/tracking/LocalTime";
import { formatAge, formatINR } from "@/lib/ops/format";
import type { OpsOrderRow } from "@/lib/ops/orders";
import { orderHref } from "@/lib/ops/pipeline";

import styles from "./command.module.css";

/**
 * The command centre's order table: Order, Customer, Amount, Status, Payment,
 * Production, Created, Action. Rows come from the same read model as the
 * order list, one page of them.
 */
export function RecentOrders({ rows, now }: { rows: readonly OpsOrderRow[]; now: Date }) {
  return (
    <TableFrame label="Recent orders" caption="Most recent orders with status, payment and production">
      <thead>
        <tr>
          <Th>Order</Th>
          <Th>Customer</Th>
          <Th align="right">Amount</Th>
          <Th>Status</Th>
          <Th hide="sm">Payment</Th>
          <Th hide="md">Production</Th>
          <Th align="right" hide="lg">
            Created
          </Th>
          <Th align="right">Action</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((order) => (
          <Tr key={order.reference}>
            <Td nowrap>
              <Stack
                primary={
                  <>
                    <RowLink href={orderHref(order.reference)} mono>
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
                secondary={order.items.summary}
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
                secondary={order.customer.id ? "Account" : "Guest"}
              />
            </Td>
            <Td align="right" mono nowrap>
              {formatINR(order.total)}
            </Td>
            <Td>
              <OrderStatusBadge status={order.status} />
            </Td>
            <Td hide="sm">
              <PaymentBadge status={order.paymentStatus} />
            </Td>
            <Td hide="md">
              {order.production.state ? (
                <JobStateBadge state={order.production.state} held={order.production.held > 0} />
              ) : order.production.failed > 0 ? (
                <StatusBadge tone="danger">Job failed</StatusBadge>
              ) : (
                <span className={styles.quiet}>{order.production.jobs > 0 ? "Finished" : "None"}</span>
              )}
            </Td>
            <Td align="right" hide="lg" nowrap>
              <Stack primary={<LocalTime value={order.placedAt} />} secondary={`${formatAge(order.placedAt, now)} ago`} />
            </Td>
            <Td align="right" nowrap>
              <Above>
                <CellLink href={orderHref(order.reference)}>Open</CellLink>
              </Above>
            </Td>
          </Tr>
        ))}
      </tbody>
    </TableFrame>
  );
}
