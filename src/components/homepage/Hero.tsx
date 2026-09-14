import { Button } from "@/components/core";
import { TECHNOLOGIES } from "@/lib/catalog/taxonomy";
import { ROUTES } from "@/lib/routes";
import { HeroObject } from "./HeroObject";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={`bg-hero ${styles.hero}`} aria-labelledby="hero-title">
      <div className={`u-container ${styles.inner}`}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowRule} aria-hidden="true" />
            Digital to physical
          </p>

          <h1 id="hero-title" className={styles.headline}>
            Manufacturing,
            <br />
            reimagined.
          </h1>

          <p className={styles.lead}>
            Turn digital designs into physical products through advanced
            on-demand manufacturing.
          </p>

          <div className={styles.actions}>
            <Button href={ROUTES.customPrint} size="lg" iconRight="arrow-right">
              Start printing
            </Button>
            <Button href={ROUTES.shop} size="lg" variant="secondary">
              Explore designs
            </Button>
          </div>
        </div>

        <div className={styles.visual}>
          <HeroObject />
        </div>
      </div>

      <div className={`u-container ${styles.readout}`}>
        <span>Digital fabrication / 01</span>
        <span className={`${styles.readoutGroup} ${styles.readoutSecondary}`}>
          {/* Approved processes only (Stage 19.8): SLA is not approved for launch. */}
          <span>{TECHNOLOGIES.map((technology) => technology.label).join(" · ")}</span>
          <span>Made to order</span>
        </span>
      </div>
    </section>
  );
}
