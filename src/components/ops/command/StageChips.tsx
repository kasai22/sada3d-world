import Link from "next/link";
import clsx from "clsx";

import { formatCount } from "@/lib/ops/format";
import { ORDER_STAGES, ORDER_STAGE_HINT, ORDER_STAGE_LABEL, hrefWith, type OrderStage } from "@/lib/ops/query";

import styles from "./command.module.css";

/**
 * The order quick filters, each with the number of orders it opens. The count
 * and the list come from the same SQL condition.
 */
export function StageChips({
  counts,
  active,
  path = "/admin/orders",
}: {
  counts: Record<OrderStage, number>;
  active?: OrderStage;
  path?: string;
}) {
  return (
    <nav className={styles.chips} aria-label="Order quick filters">
      <Link href={path} className={clsx(styles.chip, !active && styles.chipActive)} aria-current={!active ? "true" : undefined}>
        All
      </Link>
      {ORDER_STAGES.map((stage) => (
        <Link
          key={stage}
          href={hrefWith(path, { stage })}
          className={clsx(styles.chip, active === stage && styles.chipActive)}
          aria-current={active === stage ? "true" : undefined}
          title={ORDER_STAGE_HINT[stage]}
        >
          {ORDER_STAGE_LABEL[stage]}
          <span className={styles.chipCount}>{formatCount(counts[stage])}</span>
        </Link>
      ))}
    </nav>
  );
}
