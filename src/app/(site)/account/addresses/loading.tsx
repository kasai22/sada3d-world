import { AccountShell, SkeletonCards } from "@/components/account";

/**
 * Addresses, loading.
 *
 * Its own boundary rather than the account-wide one, so the heading that
 * appears while the data loads is this section's heading. A shared fallback
 * would head every section "Overview" and then change it.
 */
export default function AccountAddressesLoading() {
  return (
    <AccountShell
      title="Addresses"
      description="Where your orders are delivered. Reality 3D ships within India."
      crumbs={[{ label: "Addresses" }]}
    >
      <SkeletonCards rows={2} />
    </AccountShell>
  );
}
