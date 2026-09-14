import clsx from "clsx";

import { Button, Tag } from "@/components/core";
import { PropertyScale } from "@/components/commerce";
import { MATERIALS, type MaterialSurface } from "@/content/home";
import { comingSoonMaterials } from "@/content/materials";
import { published } from "@/content/pages";
import { colorSwatch } from "@/content/materials";
import { ROUTES } from "@/lib/routes";
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
/** Stage 19.8: only materials with an APPROVED decision are shown (PLA, PETG, TPU). */
const OFFERED = published(MATERIALS);
const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five"];

export function MaterialsShowcase() {
  return (
    <section className={styles.section} aria-labelledby="materials-title">
      <div className="u-container">
        <div className={styles.head}>
          <h2 id="materials-title" className={styles.headline}>
            {COUNT_WORDS[OFFERED.length] ?? OFFERED.length} {OFFERED.length === 1 ? "material" : "materials"}.
            <br />
            One process.
          </h2>
          <p className={styles.headNote}>
            Material sets strength, finish and price. Choose it at configuration
            time, on any part — your quote is calculated from the material and
            the geometry together.
          </p>
        </div>

        <ul className={styles.strip}>
          {OFFERED.map((material) => (
            <li key={material.name} className={styles.specimen}>
              {/* The specimen used to carry a "×1.2" price multiplier here.
                  It was a second copy of PRICING_RULES.materialFactor, which is
                  provisional, and it read as settled price policy. See the note
                  in content/home.ts. */}
              <div
                className={clsx(styles.surface, SURFACE[material.surface])}
                aria-hidden="true"
              />

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

                {/* Swatches are drawn from the catalog's colour taxonomy, so
                    each one has a name the shop also filters by. The strip is
                    decorative and the count carries the meaning, which is why
                    the swatches are hidden and the count is not. */}
                <div className={styles.colors}>
                  {material.colors.map((value) => {
                    const swatch = colorSwatch(value);
                    if (!swatch) return null;

                    return (
                      <span
                        key={value}
                        className={styles.swatch}
                        style={{ background: swatch.hex }}
                        aria-hidden="true"
                      />
                    );
                  })}
                  <span className={styles.colorCount}>
                    {material.colors.length} colours
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className={styles.footer}>
          {comingSoonMaterials().length > 0 && (
          <div className={styles.roadmap}>
            <span className={styles.roadmapLabel}>Coming soon</span>
            <ul className={styles.roadmapList}>
              {comingSoonMaterials().map((material) => (
                <li key={material.value} className={styles.roadmapItem}>
                  {material.name}
                </li>
              ))}
            </ul>
            <p className={styles.roadmapNote}>Not available to order yet.</p>
          </div>
        )}

        <Button href={ROUTES.materials} variant="secondary" iconRight="arrow-right">
            Compare materials
          </Button>
        </div>
      </div>
    </section>
  );
}
