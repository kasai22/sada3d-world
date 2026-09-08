import styles from "./loading.module.css";

/**
 * Marketplace skeleton.
 *
 * Mirrors the real layout's boxes so the page does not shift when results
 * arrive, and carries a status role so the wait is announced rather than
 * silent.
 */
export default function ShopLoading() {
  return (
    <div className="bg-commerce">
      <div className={`u-container ${styles.page}`} role="status" aria-live="polite">
        <span className="u-visually-hidden">Loading products</span>

        <div className={`${styles.block} ${styles.crumbs}`} />
        <div className={`${styles.block} ${styles.title}`} />
        <div className={`${styles.block} ${styles.lead}`} />

        <div className={styles.rail} aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`${styles.block} ${styles.railItem}`} />
          ))}
        </div>

        <div className={styles.layout} aria-hidden="true">
          <div className={`${styles.block} ${styles.sidebar}`} />

          <div>
            <div className={`${styles.block} ${styles.toolbar}`} />
            <div className={styles.grid}>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className={`${styles.block} ${styles.card}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
