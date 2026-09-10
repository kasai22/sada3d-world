import { AccountShell, SkeletonCards } from "@/components/account";

/**
 * Designs, loading.
 *
 * Its own boundary rather than the account-wide one, so the heading that
 * appears while the data loads is this section's heading. A shared fallback
 * would head every section "Overview" and then change it.
 */
export default function AccountDesignsLoading() {
  return (
    <AccountShell
      title="Designs"
      description="Manufacturing files you have saved, and the orders they were made for."
      crumbs={[{ label: "Designs" }]}
    >
      <SkeletonCards rows={2} />
    </AccountShell>
  );
}
