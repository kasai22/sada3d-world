import clsx from "clsx";

import styles from "./Skeleton.module.css";

/** A placeholder bar. Decorative: the region that uses it announces loading. */
export function Skeleton({
  width = "100%",
  height = 14,
  className,
}: {
  width?: string | number;
  height?: number;
  className?: string;
}) {
  return <span className={clsx(styles.skeleton, className)} style={{ width, height }} aria-hidden="true" />;
}

/** The loading shape of a console page: header, a figure row and a table. */
export function PageSkeleton({ figures = 4, rows = 8 }: { figures?: number; rows?: number }) {
  return (
    <div className={styles.page} role="status" aria-live="polite">
      <span className="u-visually-hidden">Loading</span>
      <Skeleton width={120} height={11} />
      <Skeleton width={260} height={26} className={styles.title} />
      {figures > 0 && (
        <div className={styles.figures}>
          {Array.from({ length: figures }, (_, index) => (
            <div key={index} className={styles.figure}>
              <Skeleton width="45%" height={11} />
              <Skeleton width="60%" height={24} />
              <Skeleton width="80%" height={11} />
            </div>
          ))}
        </div>
      )}
      <div className={styles.table}>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={styles.row}>
            <Skeleton width="14%" />
            <Skeleton width="22%" />
            <Skeleton width="12%" />
            <Skeleton width="10%" />
            <Skeleton width="16%" />
          </div>
        ))}
      </div>
    </div>
  );
}
