import Link from "next/link";

import { Icon, Tag } from "@/components/core";
import { LocalTime } from "@/components/tracking";
import type { CustomerDesignView } from "@/lib/account/types";
import { formatBytes } from "@/lib/bytes";

import styles from "./DesignCard.module.css";

export interface DesignCardProps {
  design: CustomerDesignView;
}

/**
 * One saved design.
 *
 * Renders `CustomerDesignView`, which carries no storage reference — the
 * private object key stays on the server, and a download will be an authorised
 * request rather than a link to a bucket.
 *
 * The preview stage is a placeholder until Phase 16 stores one. It is drawn as
 * an empty stage rather than as a fake render: a thumbnail that is not the
 * customer's part is worse than no thumbnail.
 *
 * The only action offered is one that works: the orders this design was made
 * for, when there are any. There is no "Open" button, because there is nothing
 * to open until the file can be retrieved.
 */
export function DesignCard({ design }: DesignCardProps) {
  const [firstOrder] = design.orderReferences;

  return (
    <article className={styles.card}>
      <div className={styles.stage}>
        <span className={styles.grid} aria-hidden="true" />
        <span className={styles.placeholder} aria-hidden="true">
          <Icon name="box" size={28} />
        </span>
        <Tag className={styles.format}>{design.format}</Tag>
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>{design.name}</h3>

        <dl className={styles.meta}>
          <div className={styles.metaRow}>
            <dt className={styles.metaKey}>Added</dt>
            <dd className={styles.metaValue}>
              <LocalTime value={design.createdAt} dateOnly />
            </dd>
          </div>
          <div className={styles.metaRow}>
            <dt className={styles.metaKey}>Size</dt>
            <dd className={styles.metaValue}>{formatBytes(design.sizeBytes)}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt className={styles.metaKey}>Orders</dt>
            <dd className={styles.metaValue}>
              {design.orderReferences.length === 0
                ? "Not ordered"
                : design.orderReferences.length}
            </dd>
          </div>
        </dl>

        {firstOrder && (
          <p className={styles.actions}>
            <Link href={`/account/orders/${firstOrder}`} className={styles.action}>
              View related order
            </Link>
          </p>
        )}
      </div>
    </article>
  );
}
