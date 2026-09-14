import { Breadcrumbs, type Crumb } from "@/components/structure";
import type { PageIntro as PageIntroContent } from "@/content/pages";

import styles from "./PageIntro.module.css";

export interface PageIntroProps {
  crumbs: readonly Crumb[];
  intro: PageIntroContent;
}

/**
 * The masthead the three informational pages share.
 *
 * Deliberately the same composition as `MarketplaceIntro` and the custom-print
 * intro — breadcrumb, orange-ruled eyebrow, display heading, one supporting
 * paragraph — rather than a new one. Three new pages was exactly the moment the
 * storefront could have acquired a fourth way of opening a page.
 *
 * It renders the page's only `h1`. Every other heading on these pages is an h2
 * or below, so the outline has one root.
 */
export function PageIntro({ crumbs, intro }: PageIntroProps) {
  return (
    <div className={styles.intro}>
      <Breadcrumbs items={crumbs} className={styles.crumbs} />

      <p className={styles.eyebrow}>
        <span className={styles.eyebrowRule} aria-hidden="true" />
        {intro.eyebrow}
      </p>

      <div className={styles.layout}>
        <h1 className={styles.title}>{intro.title}</h1>
        <p className={styles.lead}>{intro.lead}</p>
      </div>
    </div>
  );
}
