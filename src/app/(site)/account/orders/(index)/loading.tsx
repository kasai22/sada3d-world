import { AccountShell, SkeletonCards } from "@/components/account";

/**
 * The order list, loading.
 *
 * In a route group so this boundary covers the list and not `[ref]` beneath it.
 * A loading file on the orders segment itself would head an order's own page
 * "Orders" before the reference arrived.
 */

export default function AccountOrdersLoading() {
  return (
    <AccountShell
      title="Orders"
      description="Every order you have placed, and where each one has got to."
      crumbs={[{ label: "Orders" }]}
    >
      <SkeletonCards rows={3} />
    </AccountShell>
  );
}
