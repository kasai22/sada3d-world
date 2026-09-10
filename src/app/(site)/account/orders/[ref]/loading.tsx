import { AccountShell, SkeletonCards, SkeletonGroup, SkeletonLines } from "@/components/account";

/**
 * One order, loading.
 *
 * The heading is "Order" rather than the reference: the reference is not known
 * until the order is read, and printing the one from the URL would be showing a
 * value the server has not yet agreed exists or belongs to this account.
 */
export default function AccountOrderLoading() {
  return (
    <AccountShell
      title="Order"
      crumbs={[{ label: "Orders", href: "/account/orders" }, { label: "Loading" }]}
    >
      <SkeletonGroup>
        <SkeletonLines rows={4} />
        <SkeletonCards rows={2} />
      </SkeletonGroup>
    </AccountShell>
  );
}
