import { AccountShell, SkeletonCards } from "@/components/account";

/**
 * Saved, loading.
 *
 * Its own boundary rather than the account-wide one, so the heading that
 * appears while the data loads is this section's heading. A shared fallback
 * would head every section "Overview" and then change it.
 */
export default function AccountSavedLoading() {
  return (
    <AccountShell
      title="Saved"
      description="Parts you have kept to come back to."
      crumbs={[{ label: "Saved" }]}
    >
      <SkeletonCards rows={2} />
    </AccountShell>
  );
}
