import { Button, Icon } from "@/components/core";
import { WORKFLOW } from "@/content/home";
import { ROUTES } from "@/lib/routes";
import styles from "./HowItWorks.module.css";

/**
 * 06 — How it works.
 *
 * The detailed walkthrough. Section 03 shows the same four stages as a compact
 * summary; this is where each one gets its own explanation, so the two read as
 * a claim and its evidence rather than as a repeat.
 */
export function HowItWorks() {
  return (
    <section
      className={`bg-engineering ${styles.section}`}
      aria-labelledby="how-title"
    >
      <div className="u-container">
        <div className={styles.head}>
          <h2 id="how-title" className={styles.headline}>
            Four steps
            <br />
            to physical.
          </h2>
          <p className={styles.headNote}>
            The same process whether you order a listed part or upload geometry
            of your own.
          </p>
        </div>

        <ol className={styles.steps}>
          {WORKFLOW.map((step) => (
            <li key={step.index} className={styles.step}>
              <span className={styles.node} aria-hidden="true" />

              <span className={styles.index} aria-hidden="true">
                {step.index}
              </span>

              <span className={styles.glyph} aria-hidden="true">
                <Icon name={step.icon} size={20} />
              </span>

              <h3 className={styles.name}>{step.name}</h3>
              <p className={styles.summary}>{step.summary}</p>
              <p className={styles.meta}>{step.meta}</p>
            </li>
          ))}
        </ol>

        <div className={styles.footer}>
          <Button href={ROUTES.howItWorks} variant="technical" iconRight="arrow-right">
            Read the full process
          </Button>
        </div>
      </div>
    </section>
  );
}
