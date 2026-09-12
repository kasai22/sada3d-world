import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/core/Button";
import { JobControls, OpenShipmentForm, ShipmentControls } from "@/components/ops/actions/OrderActions";
import { EmptyState } from "@/components/ops/EmptyState";
import { IssueList } from "@/components/ops/IssueList";
import { PageHeader } from "@/components/ops/PageHeader";
import {
  DemoTag,
  ItemStatusBadge,
  JobStateBadge,
  OrderStatusBadge,
  PaymentBadge,
  ProvisionalTag,
  ShipmentBadge,
  StatusBadge,
} from "@/components/ops/StatusBadge";
import { Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Timeline } from "@/components/ops/Timeline";
import { Panel } from "@/components/structure/Panel";
import { SpecTable } from "@/components/structure/SpecTable";
import { LocalTime } from "@/components/tracking/LocalTime";
import { formatAge, formatBytes, formatCount, formatINR } from "@/lib/ops/format";
import { HOLD_REASON_LABEL, QUALITY_RESULT_LABEL } from "@/lib/ops/labels";
import { getOpsOrder } from "@/lib/ops/orders";
import { requireOperator } from "@/lib/ops/operator";
import { paymentAdapterStatus } from "@/lib/ops/payments";

import {
  jobEventAction,
  jobHoldAction,
  openShipmentAction,
  shipmentEventAction,
} from "./actions";
import styles from "./page.module.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ reference: string }>;
}): Promise<Metadata> {
  const { reference } = await params;
  return { title: decodeURIComponent(reference).toUpperCase().slice(0, 32) };
}

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "items", label: "Items" },
  { id: "production", label: "Production" },
  { id: "shipping", label: "Shipping" },
  { id: "payment", label: "Payment" },
  { id: "timeline", label: "Timeline" },
];

/**
 * One order, end to end.
 *
 * Answers the five questions an operator opens it with: what was ordered, who
 * placed it, what has to be manufactured, where that has got to, and what
 * happens next. The four state machines stay four things — order status,
 * payment, each job, each parcel — because collapsing them would misreport one
 * of them.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const path = `/ops/orders/${reference}`;
  const operator = await requireOperator(path);
  const now = new Date();

  const order = await getOpsOrder(operator, reference, now);

  if (!order) {
    return (
      <>
        <PageHeader title="Order not found" crumbs={[{ label: "Orders", href: "/ops/orders" }, { label: "Not found" }]} />
        <Panel padded={false}>
          <EmptyState
            icon="search"
            title="No order with that reference"
            action={
              <Button href="/ops/orders" size="sm" variant="secondary">
                All orders
              </Button>
            }
          >
            <p>The reference does not exist. Check it, or search for the customer instead.</p>
          </EmptyState>
        </Panel>
      </>
    );
  }

  const adapter = paymentAdapterStatus();

  return (
    <>
      <PageHeader
        title={order.reference}
        crumbs={[{ label: "Orders", href: "/ops/orders" }, { label: order.reference }]}
        meta={
          <>
            <OrderStatusBadge status={order.status} />
            <PaymentBadge status={order.payment.status} />
            {order.demo && <DemoTag />}
            {order.provisional && <ProvisionalTag />}
          </>
        }
        description={
          <>
            Placed <LocalTime value={order.placedAt} /> · {formatCount(order.items.length)}{" "}
            {order.items.length === 1 ? "line" : "lines"} · {formatINR(order.totals.total)}
          </>
        }
        actions={
          order.customer.id ? (
            <Button href={`/ops/customers/${order.customer.id}`} size="sm" variant="secondary" iconLeft="user">
              Customer
            </Button>
          ) : undefined
        }
      />

      <nav className={styles.sections} aria-label="Sections of this order">
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} className={styles.sectionLink}>
            {section.label}
          </a>
        ))}
      </nav>

      <section className={styles.next} aria-labelledby="next-step">
        <p className={styles.nextLabel} id="next-step">
          What happens next
        </p>
        <p className={styles.nextTitle}>{order.nextStep.title}</p>
        <p className={styles.nextDetail}>{order.nextStep.detail}</p>
      </section>

      {order.issues.length > 0 && (
        <Panel
          title="Needs attention"
          titleAs="h2"
          meta={`${order.issues.length} open`}
          padded={false}
          className={styles.block}
        >
          <IssueList issues={order.issues} now={now} />
        </Panel>
      )}

      <div className={styles.columns}>
        <div className={styles.main}>
          <Panel id="items" title="Items" titleAs="h2" meta={`${order.totals.units} units`} padded={false}>
            <TableFrame flush label="Order items" caption="What was ordered">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th hide="sm">Type</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right" hide="md">
                    Unit
                  </Th>
                  <Th align="right">Line total</Th>
                  <Th>Fulfilment</Th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <Tr key={item.id}>
                    <Td>
                      <Stack
                        primary={item.name}
                        secondary={
                          item.design
                            ? `${item.spec} · ${item.design.format} · ${formatBytes(item.design.sizeBytes)}`
                            : item.spec
                        }
                      />
                      {item.design && (
                        <Link href={`/ops/designs/${item.design.id}`} className={styles.inlineLink}>
                          Design {item.design.id}
                        </Link>
                      )}
                    </Td>
                    <Td hide="sm" muted>
                      {item.type === "custom" ? "Custom" : "Catalog"}
                    </Td>
                    <Td align="right" mono>
                      {item.quantity}
                    </Td>
                    <Td align="right" mono hide="md">
                      {formatINR(item.unitPrice)}
                    </Td>
                    <Td align="right" mono nowrap>
                      {formatINR(item.lineTotal)}
                    </Td>
                    <Td>
                      <ItemStatusBadge status={item.fulfillmentStatus} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableFrame>
          </Panel>

          <section id="production" className={styles.block} aria-labelledby="production-heading">
            <h2 className={styles.sectionHeading} id="production-heading">
              Production
            </h2>

            {order.jobs.length === 0 ? (
              <Panel padded={false}>
                <EmptyState compact icon="factory" title="Nothing to manufacture">
                  <p>
                    Every item on this order is a catalog part, which is fulfilled from stock rather than
                    manufactured, so no production job exists.
                  </p>
                </EmptyState>
              </Panel>
            ) : (
              order.jobs.map((job) => (
                <Panel
                  key={job.id}
                  id={job.anchor}
                  title={job.itemName}
                  titleAs="h3"
                  meta={job.id}
                  className={styles.job}
                >
                  <div className={styles.jobHead}>
                    <JobStateBadge state={job.state} held={Boolean(job.hold)} />
                    {job.reworkCount > 0 && <StatusBadge tone="warning">Rework × {job.reworkCount}</StatusBadge>}
                    {job.qualityResult !== "pending" && (
                      <StatusBadge tone={job.qualityResult === "approved" ? "success" : "danger"}>
                        Inspection: {QUALITY_RESULT_LABEL[job.qualityResult]}
                      </StatusBadge>
                    )}
                  </div>

                  {job.hold && (
                    <p className={styles.hold}>
                      On hold for {HOLD_REASON_LABEL[job.hold.reason].toLowerCase()} since{" "}
                      <LocalTime value={job.hold.startedAt} />
                      {job.hold.note ? ` — ${job.hold.note}` : ""}
                    </p>
                  )}

                  <SpecTable
                    dense
                    caption={`Job detail for ${job.itemName}`}
                    rows={[
                      { label: "Machine", value: job.machineId ?? "Not assigned" },
                      {
                        label: "Estimated completion",
                        value: job.estimatedCompletionAt ? (
                          <LocalTime value={job.estimatedCompletionAt} />
                        ) : (
                          "No estimate recorded"
                        ),
                      },
                      { label: "Quality", value: QUALITY_RESULT_LABEL[job.qualityResult] },
                      { label: "Rework passes", value: String(job.reworkCount) },
                      { label: "Created", value: <LocalTime value={job.createdAt} /> },
                      {
                        label: "Last update",
                        value: (
                          <>
                            <LocalTime value={job.updatedAt} /> · {formatAge(job.updatedAt, now)} ago
                          </>
                        ),
                      },
                    ]}
                  />

                  <JobControls
                    reference={order.reference}
                    jobId={job.id}
                    state={job.state}
                    options={job.actions}
                    hold={job.hold ? { reason: job.hold.reason } : undefined}
                    eventAction={jobEventAction}
                    holdAction={jobHoldAction}
                  />

                  <details className={styles.history}>
                    <summary className={styles.summary}>Event history ({job.events.length})</summary>
                    <div className={styles.historyBody}>
                      <Timeline
                        label={`Event history for ${job.itemName}`}
                        entries={[...job.events].reverse().map((event) => ({
                          id: event.id,
                          at: event.occurredAt,
                          title: event.label,
                          detail: event.from === event.to ? undefined : `${event.from} → ${event.to}`,
                          actor: event.actor,
                          note: event.note,
                          tone: "info" as const,
                        }))}
                      />
                    </div>
                  </details>
                </Panel>
              ))
            )}
          </section>

          <section id="shipping" className={styles.block} aria-labelledby="shipping-heading">
            <h2 className={styles.sectionHeading} id="shipping-heading">
              Shipping
            </h2>

            <Panel title="Delivery address" titleAs="h3">
              <SpecTable
                dense
                caption="Delivery address"
                rows={[
                  { label: "Name", value: order.customer.name },
                  { label: "Phone", value: order.customer.phone },
                  {
                    label: "Address",
                    value: [order.address.line1, order.address.line2].filter(Boolean).join(", "),
                  },
                  {
                    label: "City",
                    value: `${order.address.city}, ${order.address.state} ${order.address.postalCode}`,
                  },
                  { label: "Country", value: order.address.country },
                ]}
              />
            </Panel>

            {order.shipments.map((shipment) => (
              <Panel key={shipment.id} title={shipment.id} titleAs="h3" meta="Shipment" className={styles.block}>
                <div className={styles.jobHead}>
                  <ShipmentBadge status={shipment.status} />
                </div>
                <SpecTable
                  dense
                  caption={`Shipment ${shipment.id}`}
                  rows={[
                    { label: "Items", value: shipment.items.map((item) => item.name).join(", ") },
                    { label: "Carrier", value: shipment.carrier ?? "Not recorded" },
                    { label: "Tracking", value: shipment.trackingNumber ?? "Not recorded" },
                    {
                      label: "Tracking link",
                      value: shipment.trackingUrl ? (
                        <a href={shipment.trackingUrl} rel="noreferrer noopener" target="_blank">
                          Open carrier page
                        </a>
                      ) : (
                        "None"
                      ),
                    },
                    {
                      label: "Dispatched",
                      value: shipment.shippedAt ? <LocalTime value={shipment.shippedAt} /> : "Not yet",
                    },
                    {
                      label: "Delivered",
                      value: shipment.deliveredAt ? <LocalTime value={shipment.deliveredAt} /> : "Not yet",
                    },
                  ]}
                />
                <ShipmentControls
                  reference={order.reference}
                  shipmentId={shipment.id}
                  status={shipment.status}
                  options={shipment.actions}
                  action={shipmentEventAction}
                />
              </Panel>
            ))}

            {order.shippableItems.length > 0 && (
              <Panel title="Open a shipment" titleAs="h3" className={styles.block}>
                <OpenShipmentForm
                  reference={order.reference}
                  items={order.shippableItems}
                  action={openShipmentAction}
                />
              </Panel>
            )}

            {order.shipments.length === 0 && order.shippableItems.length === 0 && (
              <Panel padded={false} className={styles.block}>
                <EmptyState compact icon="truck" title="Nothing ready to ship">
                  <p>An item joins a parcel once its production finishes and it is marked ready.</p>
                </EmptyState>
              </Panel>
            )}
          </section>

          <Panel id="timeline" title="Timeline" titleAs="h2" className={styles.block}>
            <Timeline label={`History of ${order.reference}`} entries={order.timeline} />
          </Panel>
        </div>

        <aside className={styles.side} aria-label="Order summary">
          <Panel id="overview" title="Overview" titleAs="h2">
            <SpecTable
              dense
              caption="Order overview"
              highlight={["Total"]}
              rows={[
                { label: "Placed", value: <LocalTime value={order.placedAt} /> },
                { label: "Updated", value: <LocalTime value={order.updatedAt} /> },
                { label: "Lines", value: formatCount(order.items.length) },
                { label: "Units", value: formatCount(order.totals.units) },
                { label: "Subtotal", value: formatINR(order.totals.subtotal) },
                { label: "Shipping", value: order.totals.shipping },
                { label: "Tax", value: order.totals.tax },
                { label: "Total", value: formatINR(order.totals.total) },
              ]}
            />
            {order.totals.excluded.length > 0 && (
              <p className={styles.note}>Not included in the total: {order.totals.excluded.join(", ")}.</p>
            )}
          </Panel>

          <Panel id="customer" title="Customer" titleAs="h2" className={styles.block}>
            <SpecTable
              dense
              caption="Customer"
              rows={[
                { label: "Name", value: order.customer.name },
                { label: "Email", value: order.customer.email },
                { label: "Phone", value: order.customer.phone },
                {
                  label: "Account",
                  value: order.customer.id ? (
                    <Link href={`/ops/customers/${order.customer.id}`}>{order.customer.id}</Link>
                  ) : (
                    "Guest checkout"
                  ),
                },
                {
                  label: "Other orders",
                  value: order.customer.id ? formatCount(order.customer.otherOrders) : "—",
                },
              ]}
            />
          </Panel>

          <Panel id="payment" title="Payment" titleAs="h2" className={styles.block}>
            <div className={styles.jobHead}>
              <PaymentBadge status={order.payment.status} />
            </div>
            <SpecTable
              dense
              caption="Payment"
              rows={[
                { label: "Amount", value: formatINR(order.totals.total) },
                { label: "Provider", value: order.payment.provider ?? "Not recorded" },
                { label: "Reference", value: order.payment.reference ?? "None" },
                { label: "Pricing", value: order.provisional ? "Provisional rules" : "Confirmed" },
              ]}
            />
            <p className={styles.note}>
              {adapter.configured && adapter.mode === "mock"
                ? "This deployment uses the mock payment adapter: no money moves, and payment state is recorded rather than settled."
                : adapter.configured
                  ? `Payments are handled by ${adapter.name} in ${adapter.mode} mode.`
                  : adapter.problem}
            </p>
            <p className={styles.note}>
              Payment state changes with the provider, not from the console — there is no refund model in the order
              domain yet.
            </p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
