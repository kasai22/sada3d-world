import Link from "next/link";
import clsx from "clsx";

import { formatAge } from "@/lib/ops/format";
import type { OpsIssue } from "@/lib/ops/pipeline";

import { DemoTag, SeverityBadge } from "./StatusBadge";
import styles from "./IssueList.module.css";

/**
 * Issues, most severe first. Each says what is wrong, why it matters, which
 * record it is about and how long it has been true.
 */
export function IssueList({ issues, now }: { issues: readonly OpsIssue[]; now: Date }) {
  return (
    <ul className={styles.list}>
      {issues.map((issue) => (
        <li key={issue.id} className={clsx(styles.issue, styles[issue.severity])}>
          <span className={styles.severity}>
            <SeverityBadge severity={issue.severity} />
          </span>
          <span className={styles.body}>
            <Link href={issue.href} className={styles.title}>
              {issue.title}
            </Link>
            <span className={styles.detail}>{issue.detail}</span>
          </span>
          <span className={styles.meta}>
            <span className={styles.subject}>{issue.subject}</span>
            {issue.demo && <DemoTag />}
            <time className={styles.age} dateTime={issue.since} title={`Since ${issue.since}`}>
              {formatAge(issue.since, now)}
            </time>
          </span>
        </li>
      ))}
    </ul>
  );
}
