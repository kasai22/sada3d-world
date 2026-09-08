import { Breadcrumbs, type Crumb } from "@/components/structure";
import styles from "./MarketplaceIntro.module.css";

export interface MarketplaceIntroProps {
  crumbs: readonly Crumb[];
  eyebrow: string;
  title: string;
  description: string;
}

/** Compact page introduction: breadcrumb, title, one supporting line. */
export function MarketplaceIntro({
  crumbs,
  eyebrow,
  title,
  description,
}: MarketplaceIntroProps) {
  return (
    <div className={styles.intro}>
      <Breadcrumbs items={crumbs} className={styles.crumbs} />

      <p className={styles.eyebrow}>
        <span className={styles.eyebrowRule} aria-hidden="true" />
        {eyebrow}
      </p>

      <div className={styles.layout}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
      </div>
    </div>
  );
}
