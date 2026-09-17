import Link from "next/link";
import clsx from "clsx";

import { Icon, type IconName } from "@/components/core/Icon";
import type { AttentionArea, AttentionItem } from "@/lib/ops/analytics/types";
import { formatCount } from "@/lib/ops/format";
import { SEVERITY_LABEL } from "@/lib/ops/pipeline";

import styles from "./command.module.css";

const AREA_ICON: Record<AttentionArea, IconName> = {
  orders: "truck",
  payments: "wallet",
  manufacturing: "factory",
  inventory: "boxes",
  catalog: "box",
  capability: "wrench",
};

const AREA_LABEL: Record<AttentionArea, string> = {
  orders: "Orders",
  payments: "Payments",
  manufacturing: "Manufacturing",
  inventory: "Inventory",
  catalog: "Catalog",
  capability: "Capability",
};

/**
 * "Needs your attention": one row per condition, with how many records are in
 * it and a link to where they are. Severity is a word and a rule, never colour
 * alone.
 */
export function AttentionList({ items, limit }: { items: readonly AttentionItem[]; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;

  return (
    <ul className={styles.attention}>
      {shown.map((item) => {
        const body = (
          <>
            <span className={styles.attentionIcon} aria-hidden="true">
              <Icon name={AREA_ICON[item.area]} size={16} />
            </span>
            <span className={styles.attentionText}>
              <span className={styles.attentionTitle}>
                {item.title}
                {item.cms && (
                  <>
                    <Icon name="external-link" size={12} className={styles.attentionExternal} />
                    <span className="u-visually-hidden"> (opens the CMS)</span>
                  </>
                )}
              </span>
              <span className={styles.attentionDetail}>{item.detail}</span>
              <span className={styles.attentionMeta}>
                {AREA_LABEL[item.area]} · {SEVERITY_LABEL[item.severity]} priority
              </span>
            </span>
            <span className={styles.attentionCount}>{formatCount(item.count)}</span>
          </>
        );

        return (
          <li key={item.id} className={clsx(styles.attentionItem, styles[`severity_${item.severity}`])}>
            {item.cms ? (
              <a href={item.href} className={styles.attentionLink}>
                {body}
              </a>
            ) : (
              <Link href={item.href} className={styles.attentionLink}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
