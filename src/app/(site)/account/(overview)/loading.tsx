import { AccountShell, SkeletonCards, SkeletonGroup, SkeletonLines } from "@/components/account";

/**
 * The overview, loading.
 *
 * In its own route group so this boundary covers the overview page and not its
 * sibling sections — a loading file at the account segment would wrap all six
 * and head every one of them "Overview" until the real page arrived. The shop
 * index uses the same arrangement for the same reason.
 *
 * The shell renders for real — breadcrumbs, heading, navigation — so only the
 * data region is a placeholder and nothing moves when the content lands. The
 * placeholders carry no figures: a skeleton that showed a count would be
 * inventing one.
 */
export default function AccountLoading() {
  return (
    <AccountShell
      title="Overview"
      description="Your orders and anything currently being made."
    >
      <SkeletonGroup>
        <SkeletonLines rows={3} />
        <SkeletonCards rows={2} />
      </SkeletonGroup>
    </AccountShell>
  );
}
