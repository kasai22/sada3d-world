import { AccountShell, SkeletonLines } from "@/components/account";

/**
 * Settings, loading.
 *
 * Its own boundary rather than the account-wide one, so the heading that
 * appears while the data loads is this section's heading. A shared fallback
 * would head every section "Overview" and then change it.
 */
export default function AccountSettingsLoading() {
  return (
    <AccountShell
      title="Settings"
      description="Your profile and what the account can do."
      crumbs={[{ label: "Settings" }]}
    >
      <SkeletonLines rows={5} />
    </AccountShell>
  );
}
