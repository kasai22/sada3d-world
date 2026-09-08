import { SectionHeading } from "@/components/structure";
import { CAPABILITY_METRICS, TECHNOLOGIES } from "@/content/home";
import styles from "./ManufacturingCapabilities.module.css";

/**
 * 08 — Manufacturing capabilities.
 *
 * Figures come from content/home.ts, where they are marked PLACEHOLDER. They
 * are qualified on the page rather than presented as verified specifications,
 * and must be replaced with confirmed operational data before launch.
 */
export function ManufacturingCapabilities() {
  return (
    <section
      className={`bg-engineering ${styles.section}`}
      aria-labelledby="capabilities-title"
    >
      <div className="u-container">
        <div className={styles.head}>
          <SectionHeading
            index="08"
            size="lg"
            id="capabilities-title"
            meta="Manufacturing"
          >
            Capabilities
          </SectionHeading>
        </div>

        <ul className={styles.metrics}>
          {CAPABILITY_METRICS.map((metric) => (
            <li key={metric.label} className={styles.metric}>
              <span className={styles.metricValue}>{metric.value}</span>
              <span className={styles.metricLabel}>{metric.label}</span>
            </li>
          ))}
        </ul>

        <ul className={styles.technologies}>
          {TECHNOLOGIES.map((technology) => (
            <li key={technology.code} className={styles.technology}>
              <span className={styles.code}>{technology.code}</span>

              <div className={styles.technologyBody}>
                <h3 className={styles.name}>{technology.name}</h3>
                <p className={styles.summary}>{technology.summary}</p>
              </div>

              <span className={styles.detail}>{technology.detail}</span>
            </li>
          ))}
        </ul>

        <p className={styles.note}>
          Indicative figures. Tolerance and lead time are confirmed per part at
          quote.
        </p>
      </div>
    </section>
  );
}
