import type { Metadata } from "next";

import { CustomPrintWorkflow } from "@/components/custom-print";
import { Breadcrumbs } from "@/components/structure";
import styles from "./page.module.css";

const DESCRIPTION =
  "Upload a 3D design, configure manufacturing options, and prepare your part for a quote.";

export const metadata: Metadata = {
  title: "Custom 3D printing",
  description: DESCRIPTION,
  alternates: { canonical: "/custom-print" },
  openGraph: {
    type: "website",
    url: "/custom-print",
    title: "Custom 3D printing — SADA 3D",
    description: DESCRIPTION,
  },
};

/**
 * Custom manufacturing.
 *
 * The page itself is a Server Component: only the workflow is interactive, and
 * it is the single client island on the route.
 */
export default function CustomPrintPage() {
  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <div className={styles.intro}>
          <Breadcrumbs
            className={styles.crumbs}
            items={[{ label: "Custom print" }]}
          />

          <p className={styles.eyebrow}>
            <span className={styles.eyebrowRule} aria-hidden="true" />
            Digital to physical
          </p>

          <div className={styles.layout}>
            <h1 className={styles.title}>Custom manufacturing.</h1>
            <p className={styles.description}>{DESCRIPTION}</p>
          </div>
        </div>

        <CustomPrintWorkflow />
      </div>
    </div>
  );
}
