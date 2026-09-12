import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/core/Icon";
import { Breadcrumbs, type Crumb } from "@/components/structure/Breadcrumbs";

import styles from "./PageHeader.module.css";

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  crumbs?: readonly Crumb[];
  /** Status badges and tags beside the title. */
  meta?: ReactNode;
  /** Primary actions, right-aligned. */
  actions?: ReactNode;
}

/** The page's one h1, its place in the console, and what can be done here. */
export function PageHeader({ title, description, crumbs, meta, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} />}
      <div className={styles.row}>
        <div className={styles.titles}>
          <h1 className={styles.title}>{title}</h1>
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {description && <p className={styles.description}>{description}</p>}
    </header>
  );
}

/** A quiet header link for a panel, e.g. "View all". */
export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={styles.panelLink}>
      {children}
      <Icon name="arrow-right" size={13} />
    </Link>
  );
}
