import type { Metadata } from "next";
import Link from "next/link";

import { Input } from "@/components/forms/Input";
import { EmptyState } from "@/components/ops/EmptyState";
import { FilterForm } from "@/components/ops/FilterForm";
import { PageHeader } from "@/components/ops/PageHeader";
import { Pagination } from "@/components/ops/Pagination";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import { listOpsCustomers } from "@/lib/ops/customers";
import { formatCount, formatINR } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import { hrefWith, parseCustomerListQuery, type SearchParamsRecord } from "@/lib/ops/query";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Customers" };

const PATH = "/ops/customers";

/**
 * Customer accounts.
 *
 * An account is an identity mapping: an id, a provider and a first-seen date.
 * Everything else shown here is counted from their own orders and designs, and
 * the name and email come from their most recent order — the identity provider
 * owns those, and this deployment holds no credentials to read them.
 *
 * Orders placed without an account are not here; they are in Orders, filtered
 * to guests.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const operator = await requireOperator(PATH);
  const params = await searchParams;
  const query = parseCustomerListQuery(params);

  const page = await listOpsCustomers(operator, query);
  const filtered = Boolean(query.q);
  const current = { q: query.q, page: query.page };

  return (
    <>
      <PageHeader
        title="Customers"
        description="Accounts, what they have ordered, and what is being made for them."
        meta={
          <span className={styles.count}>
            {formatCount(page.total)} {page.total === 1 ? "account" : "accounts"}
          </span>
        }
        actions={
          <Link href="/ops/orders?customer=guest" className={styles.guestLink}>
            Guest orders
          </Link>
        }
      />

      <FilterForm action={PATH} label="Search customers" clearHref={PATH} active={filtered}>
        <Input
          name="q"
          type="search"
          size="sm"
          label="Search"
          placeholder="Name, email or customer id"
          defaultValue={query.q ?? ""}
          icon="search"
        />
      </FilterForm>

      {page.total === 0 ? (
        <Panel padded={false}>
          <EmptyState
            icon="users"
            title={filtered ? "No accounts match" : "No accounts yet"}
            action={
              filtered ? (
                <Link href={PATH} className={styles.clear}>
                  Clear search
                </Link>
              ) : undefined
            }
          >
            <p>
              {filtered
                ? "No account matches that name, email or id."
                : "An account is created the first time someone signs in. Guest orders appear under Orders."}
            </p>
          </EmptyState>
        </Panel>
      ) : (
        <TableFrame label="Customers" caption="Customer accounts with order and production counts">
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th align="right">Orders</Th>
              <Th align="right" hide="sm">
                Paid value
              </Th>
              <Th hide="md">In production</Th>
              <Th align="right" hide="lg">
                Designs
              </Th>
              <Th align="right" hide="md">
                Last order
              </Th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((customer) => (
              <Tr key={customer.id}>
                <Td>
                  <Stack
                    primary={
                      <RowLink href={`/ops/customers/${customer.id}`}>
                        {customer.name ?? customer.id}
                      </RowLink>
                    }
                    secondary={customer.email ?? customer.id}
                  />
                </Td>
                <Td align="right" mono>
                  {formatCount(customer.orders)}
                </Td>
                <Td align="right" mono hide="sm" nowrap>
                  {formatINR(customer.paidValue)}
                </Td>
                <Td hide="md">
                  {customer.activeJobs > 0 ? (
                    <StatusBadge tone="accent">{customer.activeJobs} active</StatusBadge>
                  ) : (
                    <span className={styles.quiet}>None</span>
                  )}
                </Td>
                <Td align="right" mono hide="lg">
                  {formatCount(customer.designs)}
                </Td>
                <Td align="right" mono hide="md" nowrap>
                  {customer.lastOrderAt ? customer.lastOrderAt.slice(0, 10) : "—"}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      <Pagination
        label="Customers"
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        pageSize={page.pageSize}
        hrefFor={(target) => hrefWith(PATH, current, { page: target })}
      />
    </>
  );
}
