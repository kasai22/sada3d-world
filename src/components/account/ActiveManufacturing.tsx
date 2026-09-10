import Link from "next/link";

import { StatusDot, type ManufacturingStatus } from "@/components/core";
import { LocalTime } from "@/components/tracking";
import {
  CUSTOMER_STAGES,
  CUSTOMER_STAGE_LABEL,
  stageIndex,
  type CustomerManufacturingStage,
} from "@/lib/manufacturing";
import type { CustomerManufacturingItem } from "@/lib/account/types";

import styles from "./ActiveManufacturing.module.css";

export interface ActiveManufacturingProps {
  items: readonly CustomerManufacturingItem[];
}

/**
 * Customer stage to the design system's status indicator.
 *
 * `ready_to_ship` is `complete` and not `shipped`: manufacturing is finished,
 * the parcel has not left, and the two are different machines. Nothing here
 * conveys state by colour alone — the stage is named in text beside the dot.
 */
const STAGE_STATUS: Record<CustomerManufacturingStage, ManufacturingStatus> = {
  design_verified: "queued",
  preparing: "processing",
  printing: "printing",
  quality_check: "quality",
  packaging: "packaging",
  ready_to_ship: "complete",
};

/**
 * What is being made right now.
 *
 * One row per part, not per order, because a part is the thing that has a
 * stage. An order holding two parts at two stages cannot be described by one
 * row without one of them being wrong.
 *
 * The strip is a position marker, not a progress bar: nothing measures how far
 * through a print a part is, so no percentage is shown or implied. Each segment
 * is a stage that has been reached, and the stage is named in text beside it —
 * the marks are never the only thing saying where the part is.
 */
export function ActiveManufacturing({ items }: ActiveManufacturingProps) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={`${item.orderReference}-${item.itemId}`} className={styles.item}>
          <div className={styles.head}>
            <div className={styles.identity}>
              <p className={styles.name}>{item.itemName}</p>
              <p className={styles.order}>
                <Link href={`/account/orders/${item.orderReference}`}>
                  {item.orderReference}
                </Link>
                {item.demo && <span className={styles.demo}>Demonstration</span>}
              </p>
            </div>

            <div className={styles.status}>
              <StatusDot
                status={item.held ? "paused" : STAGE_STATUS[item.stage]}
                pulse={!item.held}
                label={
                  item.held ? "Paused" : CUSTOMER_STAGE_LABEL[item.stage]
                }
              />
              {item.held && (
                <span className={styles.heldStage}>
                  at {CUSTOMER_STAGE_LABEL[item.stage]}
                </span>
              )}
            </div>
          </div>

          <StageStrip current={item.stage} furthest={item.furthestStage} />

          <p className={styles.updated}>
            Updated <LocalTime value={item.lastUpdatedAt} />
          </p>
        </li>
      ))}
    </ul>
  );
}

interface StageStripProps {
  current: CustomerManufacturingStage;
  furthest: CustomerManufacturingStage;
}

/**
 * Six segments, marked to the furthest stage the part has actually reached.
 *
 * Marked from `furthest` rather than from `current` on purpose: finishing and
 * rework map back to an earlier stage, and a strip drawn from the current stage
 * would un-mark printing for a part that has genuinely printed. The current
 * stage is called out separately above.
 */
function StageStrip({ current, furthest }: StageStripProps) {
  const currentIndex = stageIndex(current);
  const furthestIndex = Math.max(stageIndex(furthest), currentIndex);

  return (
    <ol className={styles.strip} aria-label="Manufacturing stages">
      {CUSTOMER_STAGES.map((stage, index) => {
        const reached = index <= furthestIndex;
        const here = index === currentIndex;

        return (
          <li
            key={stage}
            className={`${styles.segment} ${reached ? styles.reached : ""} ${
              here ? styles.here : ""
            }`}
            aria-current={here ? "step" : undefined}
          >
            <span className="u-visually-hidden">
              {CUSTOMER_STAGE_LABEL[stage]}
              {here ? " — current" : reached ? " — complete" : " — not started"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
