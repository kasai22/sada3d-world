import type { Metadata } from "next";

import { Button } from "@/components/core";
import { Footer, Header } from "@/components/navigation";
import { SectionHeading } from "@/components/structure";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * Error states stay technical and calm — a status code and a route out, not an
 * apology.
 *
 * Lives at the app root so it catches unmatched URLs across the whole site: a
 * route-group not-found only handles notFound() raised inside that group, so
 * this one carries the shell itself.
 */
export default function NotFound() {
  return (
    <div className={styles.shell}>
      <a href="#main" className="u-skip-link">
        Skip to content
      </a>

      <Header />

      <main id="main" className={`bg-engineering ${styles.wrap}`}>
        <div className={`u-container ${styles.inner}`}>
          <p className={styles.code}>ERR_404</p>

          <SectionHeading as="h1" size="lg">
            Page not found
          </SectionHeading>

          <p className="t-body-lg">
            The route does not exist. It may have been renamed, or the part it
            referenced is no longer published.
          </p>

          <div className={styles.actions}>
            <Button href="/shop" iconRight="arrow-right">
              Explore designs
            </Button>
            <Button href="/" variant="secondary">
              Return home
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
