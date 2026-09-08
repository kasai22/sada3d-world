"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import clsx from "clsx";

import { Icon } from "@/components/core";
import { CATEGORIES } from "@/content/home";
import styles from "./CreateCategories.module.css";

/**
 * 02 — What you can create.
 *
 * An index of what SADA 3D makes, not a tile grid. Pointing at a row changes
 * the stage beside it; the stage is decorative and duplicates text that is
 * already in the list, so it carries aria-hidden and the list stays complete
 * on its own.
 */
export function CreateCategories() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = CATEGORIES[activeIndex] ?? CATEGORIES[0];

  return (
    <section
      className={`bg-commerce ${styles.section}`}
      aria-labelledby="create-title"
    >
      <div className="u-container">
        <div className={styles.head}>
          <h2 id="create-title" className={styles.headline}>
            From idea
            <br />
            to object.
          </h2>
          <p className={styles.headNote}>
            Eight categories, one process. Browse parts that are ready to make,
            or bring geometry of your own.
          </p>
        </div>

        <div className={styles.layout}>
          <ul className={styles.list}>
            {CATEGORIES.map((category, index) => (
              <li key={category.href}>
                <Link
                  href={category.href}
                  className={clsx(
                    "u-plain",
                    styles.row,
                    index === activeIndex && styles.active,
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                >
                  <span className={styles.index} aria-hidden="true">
                    {category.index}
                  </span>

                  <span>
                    <span className={styles.name}>{category.name}</span>
                    <span className={styles.descriptor}>
                      {category.descriptor}
                    </span>
                  </span>

                  <span className={styles.arrow} aria-hidden="true">
                    <Icon name="arrow-right" size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className={styles.stage} aria-hidden="true">
            <span className={styles.stageGrid} />

            <div className={styles.stageInner}>
              <span className={styles.stageNumeral}>{active?.index}</span>

              <div
                className={styles.mark}
                style={{ "--seed": activeIndex + 1 } as CSSProperties}
              >
                <span className={styles.ring} />
                <span className={styles.ring} />
                <span className={styles.ring} />
              </div>
            </div>

            <div className={styles.stageMeta}>
              <span className={styles.stageName}>{active?.name}</span>
              <span>{active?.index} / 08</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
