import { Button } from "@/components/core";
import styles from "./FinalCTA.module.css";

/** 09 — Final CTA. The brand line, delivered as the page's closing statement. */
export function FinalCTA() {
  return (
    <section className={`bg-hero ${styles.section}`} aria-labelledby="cta-title">
      <div className={`u-container ${styles.inner}`}>
        <span className={styles.rule} aria-hidden="true" />

        <h2 id="cta-title" className={styles.headline}>
          <span>Imagine.</span>
          <span className={styles.headlineAccent}>Design.</span>
          <span>Create.</span>
        </h2>

        <p className={styles.lead}>Turn your next idea into something real.</p>

        <div className={styles.actions}>
          <Button href="/custom-print" size="lg" iconRight="arrow-right">
            Start printing
          </Button>
          <Button href="/shop" size="lg" variant="secondary">
            Explore designs
          </Button>
        </div>

        <div className={styles.readout}>
          <span>SADA 3D / Digital manufacturing</span>
          <span>Imagine. Design. Create.</span>
        </div>
      </div>
    </section>
  );
}
