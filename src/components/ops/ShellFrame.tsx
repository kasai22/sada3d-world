"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import clsx from "clsx";

import { Icon } from "@/components/core/Icon";
import type { IssueSeverity } from "@/lib/ops/pipeline";
import { SIDEBAR_COOKIE } from "@/lib/ops/routes";
import type { SearchResult } from "@/lib/ops/search";

import { CommandMenu } from "./CommandMenu";
import { NAV_GROUPS, isActive } from "./navigation";
import { AccountMenu, NotificationsMenu } from "./ShellMenus";
import styles from "./ShellFrame.module.css";

export interface ShellIssueSummary {
  total: number;
  high: number;
  top: readonly {
    id: string;
    title: string;
    subject: string;
    href: string;
    severity: IssueSeverity;
  }[];
}

export type OpsSearchAction = (
  query: string,
) => Promise<{ results: SearchResult[]; error?: string }>;

export interface ShellFrameProps {
  operator: { name: string; email: string };
  issues: ShellIssueSummary;
  initialCollapsed: boolean;
  search: OpsSearchAction;
  children: ReactNode;
}

const noSubscription = () => () => {};
const onMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * The console shell: sidebar, top bar, command menu.
 *
 * A client component because it holds interface state — the collapsed sidebar,
 * the mobile drawer, the command menu — and nothing else. The page it wraps
 * arrives as `children` and stays a Server Component; no data is fetched here.
 *
 * Keyboard: Ctrl+K or ⌘K opens search from anywhere; Escape closes whatever is
 * open and returns focus to what opened it; the skip link jumps past the
 * navigation.
 */
export function ShellFrame({ operator, issues, initialCollapsed, search, children }: ShellFrameProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [navOpen, setNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shownPath, setShownPath] = useState(pathname);
  const mac = useSyncExternalStore(noSubscription, onMac, () => false);

  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Navigating closes the drawer. Adjusted during render, not in an effect.
  if (pathname !== shownPath) {
    setShownPath(pathname);
    setNavOpen(false);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNavOpen(false);
        menuButton.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  function openNav() {
    setNavOpen(true);
    requestAnimationFrame(() => sidebar.current?.querySelector<HTMLElement>("nav a")?.focus());
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/ops; max-age=31536000; samesite=lax`;
  }

  return (
    <div className={styles.frame} data-collapsed={collapsed ? "true" : undefined}>
      <a href="#ops-main" className="u-skip-link">
        Skip to content
      </a>

      <aside
        id="ops-sidebar"
        ref={sidebar}
        className={clsx(styles.sidebar, navOpen && styles.sidebarOpen)}
        aria-label="Console"
      >
        <div className={styles.brand}>
          <Link href="/ops" className={styles.wordmark}>
            <span className={styles.mark} aria-hidden="true">
              S
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandName}>
                SADA<span className={styles.brandAccent}>3D</span>
              </span>
              <span className={styles.brandProduct}>Operations</span>
            </span>
          </Link>
          <button
            type="button"
            className={styles.navClose}
            onClick={() => {
              setNavOpen(false);
              menuButton.current?.focus();
            }}
            aria-label="Close navigation"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <nav className={styles.nav} aria-label="Console sections">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className={styles.group}>
              <p className={styles.groupLabel} id={`ops-nav-${group.label}`}>
                {group.label}
              </p>
              <ul className={styles.list} aria-labelledby={`ops-nav-${group.label}`}>
                {group.items.map((item) => {
                  const count = item.badge === "issues" ? issues.total : 0;
                  const content = (
                    <>
                      <Icon name={item.icon} size={17} />
                      <span className={styles.linkLabel}>{item.label}</span>
                      {count > 0 && (
                        <>
                          <span
                            className={clsx(styles.count, issues.high > 0 && styles.countHigh)}
                            aria-hidden="true"
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                          <span className="u-visually-hidden">, {count} open</span>
                        </>
                      )}
                      {item.external && (
                        <>
                          <Icon name="external-link" size={13} className={styles.external} />
                          <span className="u-visually-hidden"> (content CMS)</span>
                        </>
                      )}
                    </>
                  );

                  return (
                    <li key={item.href}>
                      {item.external ? (
                        <a
                          href={item.href}
                          className={styles.link}
                          title={collapsed ? `${item.label} · CMS` : undefined}
                        >
                          {content}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          className={styles.link}
                          aria-current={isActive(pathname, item) ? "page" : undefined}
                          title={collapsed ? item.label : undefined}
                        >
                          {content}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.collapse}
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="ops-sidebar"
            title={collapsed ? "Expand sidebar" : undefined}
          >
            <Icon name={collapsed ? "panel-left-open" : "panel-left-close"} size={17} />
            <span className={styles.linkLabel}>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
          </button>
        </div>
      </aside>

      {navOpen && (
        <div className={styles.scrim} aria-hidden="true" onClick={() => setNavOpen(false)} />
      )}

      <div className={styles.body} inert={navOpen || undefined}>
        <header className={styles.topbar}>
          <button
            ref={menuButton}
            type="button"
            className={styles.menuButton}
            onClick={openNav}
            aria-label="Open navigation"
            aria-controls="ops-sidebar"
            aria-expanded={navOpen}
          >
            <Icon name="menu" size={20} />
          </button>

          <button
            type="button"
            className={styles.searchTrigger}
            onClick={() => setCommandOpen(true)}
            aria-haspopup="dialog"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <Icon name="search" size={16} />
            <span className={styles.searchText}>Search orders, customers, designs…</span>
            <kbd className={styles.kbd}>{mac ? "⌘ K" : "Ctrl K"}</kbd>
          </button>

          <div className={styles.topActions}>
            <NotificationsMenu issues={issues} />
            <AccountMenu operator={operator} />
          </div>
        </header>

        <main id="ops-main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>

      {commandOpen && <CommandMenu onClose={() => setCommandOpen(false)} search={search} />}
    </div>
  );
}
