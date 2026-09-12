import Link from "next/link";

import { Icon, type IconName } from "@/components/core/Icon";
import { formatAgo } from "@/lib/ops/format";
import type { ActivityEntry, ActivityKind } from "@/lib/ops/types";

import { DemoTag } from "./StatusBadge";
import styles from "./ActivityFeed.module.css";

const KIND_ICON: Record<ActivityKind, IconName> = {
  order: "clipboard",
  production: "factory",
  design: "file-box",
  shipment: "truck",
};

/** Recent events, newest first. Relative times are computed once, on the server. */
export function ActivityFeed({ entries, now }: { entries: readonly ActivityEntry[]; now: Date }) {
  return (
    <ul className={styles.feed}>
      {entries.map((entry) => (
        <li key={entry.id} className={styles.entry}>
          <span className={styles.icon} aria-hidden="true">
            <Icon name={KIND_ICON[entry.kind]} size={15} />
          </span>
          <span className={styles.body}>
            <Link href={entry.href} className={styles.title}>
              {entry.title}
            </Link>
            <span className={styles.detail}>
              {entry.detail}
              {entry.demo && <DemoTag />}
            </span>
          </span>
          <time className={styles.time} dateTime={entry.at} title={entry.at}>
            {formatAgo(entry.at, now)}
          </time>
        </li>
      ))}
    </ul>
  );
}
