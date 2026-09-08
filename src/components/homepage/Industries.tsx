import clsx from "clsx";

import { INDUSTRIES } from "@/content/home";
import styles from "./Industries.module.css";

/**
 * 07 — Industries.
 *
 * Editorial panels rather than cards: mixed column spans and a shared hairline
 * grid, so the section reads as a page spread and makes clear the platform
 * serves creators and engineers alike.
 */
export function Industries() {
  return (
    <section
      className={`bg-commerce ${styles.section}`}
      aria-labelledby="industries-title"
    >
      <div className="u-container">
        <div className={styles.head}>
          <h2 id="industries-title" className={styles.headline}>
            Built for what
            <br />
            you&rsquo;re building.
          </h2>
        </div>

        <ul className={styles.grid}>
          {INDUSTRIES.map((industry) => (
            <li
              key={industry.index}
              className={clsx(
                styles.panel,
                industry.span === "wide" ? styles.wide : styles.narrow,
              )}
            >
              <span className={styles.index} aria-hidden="true">
                {industry.index}
              </span>
              <h3 className={styles.name}>{industry.name}</h3>
              <p className={styles.summary}>{industry.summary}</p>
              <span className={styles.rule} aria-hidden="true" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
