import Link from "next/link";

import { Icon, Tag } from "@/components/core";
import { LocalTime } from "@/components/tracking";
import type { CustomerDesignView } from "@/lib/account/types";
import { formatBytes } from "@/lib/bytes";

import { DesignDeleteButton } from "./DesignDeleteButton";
import styles from "./DesignCard.module.css";

export interface DesignCardProps {
  design: CustomerDesignView;
}

/**
 * One saved design.
 *
 * Renders `CustomerDesignView`, which carries no storage reference — the
 * private object key stays on the server. Download is a link to the authorised
 * file route, which checks ownership and redirects to a two-minute signed URL;
 * it is never a link to the bucket.
 *
 * The preview stage stays an empty stage rather than a fake render: no preview
 * image is generated yet, and a thumbnail that is not the customer's part is
 * worse than no thumbnail.
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

        <div className={styles.actions}>
          {/* A plain anchor: the route answers with a redirect, not a page. */}
          <a
            href={`/api/designs/${encodeURIComponent(design.id)}/file`}
            className={styles.action}
          >
            <Icon name="download" size={14} />
            Download
          </a>

          {firstOrder && (
            <Link href={`/account/orders/${firstOrder}`} className={styles.action}>
              View related order
            </Link>
          )}

          <span className={styles.actionsSpacer} />

          <DesignDeleteButton designId={design.id} name={design.name} />
        </div>
      </div>
    </article>
  );
}
