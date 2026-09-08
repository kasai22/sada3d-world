import clsx from "clsx";

import { Button, Tag } from "@/components/core";
import { PropertyScale } from "@/components/commerce";
import { MATERIALS, type MaterialSurface } from "@/content/home";
import styles from "./MaterialsShowcase.module.css";

const SURFACE: Record<MaterialSurface, string | undefined> = {
  matte: styles.matte,
  gloss: styles.gloss,
  machined: styles.machined,
  soft: styles.soft,
  translucent: styles.translucent,
};

/**
 * 04 — Materials.
 *
 * Each specimen gets a surface treatment matched to how the material actually
 * behaves in light, so PLA does not read like resin. Reuses PropertyScale;
 * MaterialCard is the configurator's selection control and would be the wrong
 * semantics for a showcase.
 */
export function MaterialsShowcase() {
  return (
    <section className={styles.section} aria-labelledby="materials-title">
      <div className="u-container">
        <div className={styles.head}>
          <h2 id="materials-title" className={styles.headline}>
            Five materials.
            <br />
            One process.
          </h2>
          <p className={styles.headNote}>
            Material sets strength, finish and price. Choose it at configuration
            time, on any part.
          </p>
        </div>

        <ul className={styles.strip}>
          {MATERIALS.map((material) => (
            <li key={material.name} className={styles.specimen}>
              <div
                className={clsx(styles.surface, SURFACE[material.surface])}
                aria-hidden="true"
              >
                <span className={styles.multiplier}>×{material.multiplier}</span>
              </div>

              <div className={styles.body}>
                <div>
                  <h3 className={styles.name}>{material.name}</h3>
                  <span className={styles.code}>{material.code}</span>
                </div>

                <p className={styles.description}>{material.description}</p>

                <dl className={styles.properties}>
                  <PropertyScale label="Strength" rating={material.properties.strength} />
                  <PropertyScale
                    label="Flex"
                    rating={material.properties.flexibility}
                  />
                  <PropertyScale label="Heat" rating={material.properties.heat} />
                </dl>

                <div className={styles.applications}>
                  {material.applications.map((application) => (
                    <Tag key={application} mono={false}>
                      {application}
                    </Tag>
                  ))}
                </div>

                <div className={styles.colors}>
                  {material.colors.map((color) => (
                    <span
                      key={color}
                      className={styles.swatch}
                      style={{ background: color }}
                      aria-hidden="true"
                    />
                  ))}
                  <span className={styles.colorCount}>
                    {material.colors.length} colours
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className={styles.footer}>
          <Button href="/materials" variant="secondary" iconRight="arrow-right">
            Compare materials
          </Button>
        </div>
      </div>
    </section>
  );
}
