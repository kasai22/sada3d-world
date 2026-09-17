import type { Metadata } from "next";

/**
 * Reality 3D Admin (Stage 22.5).
 *
 * The business application operators use: Business, Operations, Analytics,
 * Catalog, System. Its own route group, outside the storefront's chrome and
 * outside Payload's admin bundle — Payload's panel is at /cms, as Advanced CMS.
 *
 * This layout gates nothing, on purpose: it wraps the sign-in page as well.
 * The operator check lives one level down, in `(console)/layout.tsx`, and in
 * every page and action beneath it (`console-guard.test.ts`).
 */
export const metadata: Metadata = {
  title: { template: "%s · Reality 3D Admin", default: "Reality 3D Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
