import type { Metadata } from "next";

/**
 * The account region.
 *
 * This layout owns one thing: the robots directive, inherited by every nested
 * account page. Account content is one customer's private record, and a crawler
 * has no business anywhere under this path.
 *
 * It deliberately does **not** own the navigation, the heading or the
 * authorization check.
 *
 *   · the heading is each page's own subject — "Orders", or an order reference
 *     — and a layout cannot know it.
 *
 *   · a layout does not re-run on every navigation, so an authorization check
 *     that lived only here would be one that can be skipped. Every page calls
 *     `requireCustomerContext` itself, and every account service demands an
 *     identity, so there is no path to customer data that avoids the check.
 *
 * The shell and the navigation are `AccountShell`, composed by each page.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
