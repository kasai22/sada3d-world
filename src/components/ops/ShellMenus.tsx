"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";

import { Icon } from "@/components/core/Icon";
import { initials } from "@/lib/ops/format";
import { SEVERITY_LABEL } from "@/lib/ops/pipeline";
import { CMS_HOME, OPERATOR_ACCOUNT_PATH, OPERATOR_LOGOUT_PATH } from "@/lib/ops/routes";

import type { ShellIssueSummary } from "./ShellFrame";
import styles from "./ShellMenus.module.css";

/**
 * A button that opens a panel, and the three ways it closes: pressing the
 * button again, Escape (focus returns to the button), or a pointer press
 * anywhere outside.
 */
function useDisclosure() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, root, trigger };
}

export function NotificationsMenu({ issues }: { issues: ShellIssueSummary }) {
  const { open, setOpen, root, trigger } = useDisclosure();
  const panelId = useId();
  const close = () => setOpen(false);

  return (
    <div className={styles.root} ref={root}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={issues.total > 0 ? `Issues: ${issues.total} open` : "Issues: none open"}
      >
        <Icon name="bell" size={18} />
        {issues.total > 0 && (
          <span className={clsx(styles.badge, issues.high > 0 && styles.badgeHigh)} aria-hidden="true">
            {issues.total > 9 ? "9+" : issues.total}
          </span>
        )}
      </button>

      {open && (
        <div id={panelId} className={styles.panel} role="region" aria-label="Needs attention">
          <div className={styles.panelHeader}>
            <span>Needs attention</span>
            <span className={styles.panelMeta}>{issues.total} open</span>
          </div>

          {issues.top.length === 0 ? (
            <p className={styles.empty}>Nothing needs attention right now.</p>
          ) : (
            <ul className={styles.issues}>
              {issues.top.map((issue) => (
                <li key={issue.id}>
                  <Link href={issue.href} className={styles.issue} onClick={close}>
                    <span className={clsx(styles.severity, styles[issue.severity])} aria-hidden="true" />
                    <span className={styles.issueText}>
                      <span className={styles.issueTitle}>
                        <span className="u-visually-hidden">{SEVERITY_LABEL[issue.severity]} severity: </span>
                        {issue.title}
                      </span>
                      <span className={styles.issueSubject}>{issue.subject}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link href="/ops/issues" className={styles.footer} onClick={close}>
            View all issues
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}

export function AccountMenu({ operator }: { operator: { name: string; email: string } }) {
  const { open, setOpen, root, trigger } = useDisclosure();
  const panelId = useId();

  return (
    <div className={styles.root} ref={root}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account: ${operator.name}`}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initials(operator.name)}
        </span>
      </button>

      {open && (
        <div id={panelId} className={clsx(styles.panel, styles.narrow)} role="region" aria-label="Account">
          <div className={styles.identity}>
            <span className={styles.identityName}>{operator.name}</span>
            <span className={styles.identityEmail}>{operator.email}</span>
          </div>
          <ul className={styles.menu}>
            <li>
              <a href={CMS_HOME} className={styles.menuItem}>
                <Icon name="library" size={15} />
                Content CMS
              </a>
            </li>
            <li>
              <a href={OPERATOR_ACCOUNT_PATH} className={styles.menuItem}>
                <Icon name="user" size={15} />
                Your operator account
              </a>
            </li>
            <li className={styles.separator} role="presentation" />
            <li>
              <a href={OPERATOR_LOGOUT_PATH} className={styles.menuItem}>
                <Icon name="log-out" size={15} />
                Sign out
              </a>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
