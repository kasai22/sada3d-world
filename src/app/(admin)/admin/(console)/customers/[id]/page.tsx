import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/core/Button";
import { ActivityFeed } from "@/components/ops/ActivityFeed";
import { EmptyState } from "@/components/ops/EmptyState";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader } from "@/components/ops/PageHeader";
import { DemoTag, DesignStateBadge, OrderStatusBadge, PaymentBadge } from "@/components/ops/StatusBadge";
import { RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import { SpecTable } from "@/components/structure/SpecTable";
import { LocalTime } from "@/components/tracking/LocalTime";
import { CUSTOMER_DETAIL_LIMIT, getOpsCustomer } from "@/lib/ops/customers";
import { formatBytes, formatCount, formatINR } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";

import styles from "./page.module.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Customer ${decodeURIComponent(id).slice(0, 32)}` };
}

/**
 * One customer: who they are as far as this system knows, what they have
 * ordered, what they have uploaded, and where their parts are.
 *
 * Their authentication subject is never shown — the account id is the only
 * identifier the console needs, and the one every ownership column holds.
 */
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const operator = await requireOperator(`/admin/customers/${id}`);
  const customer = await getOpsCustomer(operator, id);
  const now = new Date();

  if (!customer) {
    return (
      <>
        <PageHeader
          title="Customer not found"
          crumbs={[{ label: "Customers", href: "/admin/customers" }, { label: "Not found" }]}
        />
        <Panel padded={false}>
          <EmptyState
            icon="search"
            title="No account with that id"
            action={
              <Button href="/admin/customers" size="sm" variant="secondary">
                All customers
              </Button>
            }
          >
            <p>The id does not match an account, an order or a design.</p>
          </EmptyState>
        </Panel>
      </>
    );
  }

  const name = customer.contact?.name ?? customer.id;

  return (
    <>
      <PageHeader
        title={name}
        crumbs={[{ label: "Customers", href: "/admin/customers" }, { label: name }]}
        description={
          customer.contact ? (
            <>
              {customer.contact.email} · {customer.contact.phone} · from order {customer.contact.from}
            </>
          ) : (
            <>This account has not placed an order, so no contact details are held here.</>
          )
        }
        actions={
          <>
            <Button href={`/admin/orders?customer=${customer.id}`} size="sm" variant="secondary" iconLeft="clipboard">
              Orders
            </Button>
            <Button href={`/admin/designs?customer=${customer.id}`} size="sm" variant="secondary" iconLeft="file-box">
              Designs
            </Button>
          </>
        }
      />

      <section className={styles.kpis} aria-label="Customer figures">
        <KpiCard label="Orders" value={formatCount(customer.stats.orders)} detail="Placed with this account" />
        <KpiCard
          label="Paid value"
          value={formatINR(customer.stats.paidValue)}
          detail="Paid orders, demo excluded"
        />
        <KpiCard
          label="In production"
          value={formatCount(customer.stats.activeJobs)}
          detail="Jobs not yet finished"
          signal={customer.stats.activeJobs > 0 ? "warning" : undefined}
        />
        <KpiCard label="Designs" value={formatCount(customer.stats.designs)} detail="Files kept in storage" />
      </section>

      <div className={styles.columns}>
        <div className={styles.main}>
          <Panel
            title="Orders"
            titleAs="h2"
            meta={`${formatCount(customer.stats.orders)} total`}
            padded={false}
          >
            {customer.orders.length === 0 ? (
              <EmptyState compact icon="clipboard" title="No orders yet">
                <p>Nothing has been ordered from this account.</p>
              </EmptyState>
            ) : (
              <TableFrame flush label="Customer orders" caption="Orders placed by this customer">
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Status</Th>
                    <Th hide="sm">Payment</Th>
                    <Th align="right">Total</Th>
                    <Th align="right" hide="md">
                      Placed
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {customer.orders.map((order) => (
                    <Tr key={order.reference}>
                      <Td nowrap>
                        <Stack
                          primary={
                            <>
                              <RowLink href={`/admin/orders/${order.reference}`} mono>
                                {order.reference}
                              </RowLink>
                              {order.demo && <DemoTag />}
                            </>
                          }
                          secondary={`${order.lines} ${order.lines === 1 ? "line" : "lines"}`}
                        />
                      </Td>
                      <Td>
                        <OrderStatusBadge status={order.status} />
                      </Td>
                      <Td hide="sm">
                        <PaymentBadge status={order.paymentStatus} />
                      </Td>
                      <Td align="right" mono nowrap>
                        {formatINR(order.total)}
                      </Td>
                      <Td align="right" mono hide="md" nowrap>
                        {order.placedAt.slice(0, 10)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableFrame>
            )}
            {customer.stats.orders > CUSTOMER_DETAIL_LIMIT && (
              <p className={styles.more}>
                Showing the {CUSTOMER_DETAIL_LIMIT} most recent.{" "}
                <Link href={`/admin/orders?customer=${customer.id}`}>See all orders</Link>.
              </p>
            )}
          </Panel>

          <Panel title="Designs" titleAs="h2" meta={`${formatCount(customer.stats.designs)} kept`} padded={false} className={styles.block}>
            {customer.designs.length === 0 ? (
              <EmptyState compact icon="file-box" title="No designs">
                <p>This customer has not uploaded a model.</p>
              </EmptyState>
            ) : (
              <TableFrame flush label="Customer designs" caption="Designs uploaded by this customer">
                <thead>
                  <tr>
                    <Th>File</Th>
                    <Th hide="sm">State</Th>
                    <Th align="right" hide="md">
                      Size
                    </Th>
                    <Th align="right">Uploaded</Th>
                  </tr>
                </thead>
                <tbody>
                  {customer.designs.map((design) => (
                    <Tr key={design.id}>
                      <Td>
                        <Stack
                          primary={<RowLink href={`/admin/designs/${design.id}`}>{design.name}</RowLink>}
                          secondary={design.format}
                        />
                      </Td>
                      <Td hide="sm">
                        <DesignStateBadge state={design.state} />
                      </Td>
                      <Td align="right" mono hide="md" nowrap>
                        {formatBytes(design.sizeBytes)}
                      </Td>
                      <Td align="right" mono nowrap>
                        {design.createdAt.slice(0, 10)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableFrame>
            )}
          </Panel>

          <Panel title="Activity" titleAs="h2" padded={false} className={styles.block}>
            {customer.activity.length === 0 ? (
              <EmptyState compact icon="activity" title="No activity">
                <p>Orders, production milestones and uploads appear here.</p>
              </EmptyState>
            ) : (
              <ActivityFeed entries={customer.activity} now={now} />
            )}
          </Panel>
        </div>

        <aside className={styles.side} aria-label="Account and addresses">
          <Panel title="Account" titleAs="h2">
            <SpecTable
              dense
              caption="Account"
              rows={[
                { label: "Customer id", value: customer.id },
                {
                  label: "Account",
                  value: customer.account ? "Signed up" : "Seen on orders only",
                },
                { label: "Provider", value: customer.provider ?? "—" },
                {
                  label: "First seen",
                  value: customer.since ? <LocalTime value={customer.since} dateOnly /> : "—",
                },
                {
                  label: "Last order",
                  value: customer.stats.lastOrderAt ? (
                    <LocalTime value={customer.stats.lastOrderAt} dateOnly />
                  ) : (
                    "None"
                  ),
                },
              ]}
            />
            <p className={styles.note}>
              Name, email and password live with the identity provider. This console never reads them and never shows
              the provider&rsquo;s user id.
            </p>
          </Panel>

          <Panel title="Saved addresses" titleAs="h2" meta={`${customer.addresses.length}`} className={styles.block}>
            {customer.addresses.length === 0 ? (
              <p className={styles.note}>No saved addresses.</p>
            ) : (
              <ul className={styles.addresses}>
                {customer.addresses.map((address) => (
                  <li key={address.id} className={styles.address}>
                    <p className={styles.addressName}>
                      {address.label ?? address.fullName}
                      {address.isDefault && <span className={styles.default}>Default</span>}
                    </p>
                    <p className={styles.addressText}>
                      {[address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    <p className={styles.addressText}>{address.phone}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
