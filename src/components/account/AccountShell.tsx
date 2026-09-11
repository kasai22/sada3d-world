import type { ReactNode } from "react";

import { Breadcrumbs, type Crumb } from "@/components/structure";
import { resolveCredentialsAdapter } from "@/lib/account/identity";

import { AccountNav } from "./AccountNav";
import { SignOutButton } from "./SignOutButton";
import styles from "./AccountShell.module.css";

export interface AccountShellProps {
  /** The section's own name, or the thing being viewed. Becomes the h1. */
  title: string;
  description?: string;
  /** Crumbs after "Account". The current page's crumb comes last, unlinked. */
  crumbs?: readonly Crumb[];
  /** Right-hand slot beside the heading — a status, a count, an action. */
  meta?: ReactNode;
  children: ReactNode;
}

/**
 * The account page frame.
 *
 * Every account page composes this, rather than the route layout rendering it,
 * for two reasons that matter:
 *
 *   · the heading is the page's own subject — "Orders", or an order reference —
 *     and a layout cannot know it. Heading the layout "Account" and repeating
 *     the section name inside would give the document two competing titles.
 *
 *   · authorization is a page's job. A layout does not re-run on every
 *     navigation, so a check that lived only there would be a check that can be
 *     skipped. Each page calls `requireCustomerContext` itself, and this shell
 *     renders only what the page decided to show.
 *
 * A Server Component. The navigation is the one client island, because the
 * active section depends on the pathname.
 */
export function AccountShell({
  title,
  description,
  crumbs = [],
  meta,
  children,
}: AccountShellProps) {
  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <Breadcrumbs
          className={styles.crumbs}
          items={[
            crumbs.length > 0
              ? { label: "Account", href: "/account" }
              : { label: "Account" },
            ...crumbs,
          ]}
        />

        <div className={styles.head}>
          <div className={styles.identity}>
            <p className={styles.eyebrow}>Account</p>
            <h1 className={styles.title}>{title}</h1>
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>

        <div className={styles.layout}>
          <div className={styles.navColumn}>
            <AccountNav className={styles.nav} />
            {/* Only where there is a real session to end. The development
                identity cannot sign out, so it is not offered the button. */}
            {resolveCredentialsAdapter() && <SignOutButton className={styles.signOut} />}
          </div>
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    </div>
  );
}
