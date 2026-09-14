import type { Metadata } from "next";

import { ContentIndex, PageIntro } from "@/components/content";
import { PropertyScale } from "@/components/commerce";
import { Button, Tag } from "@/components/core";
import { SectionHeading } from "@/components/structure";
import {
  MATERIALS,
  MATERIALS_PAGE,
  TECHNICAL_DATA_NOTE,
  colorSwatch,
  comingSoonMaterials,
  type Material,
} from "@/content/materials";
import { published } from "@/content/pages";
import { allCatalogProducts } from "@/lib/catalog/query";
import { TECHNOLOGIES } from "@/lib/catalog/taxonomy";
import { MATERIAL_OPTIONS } from "@/lib/custom-print/options";
import { ROUTES, shopFilterHref } from "@/lib/routes";
import { SITE } from "@/lib/site";

import styles from "./page.module.css";

const { seo, intro } = MATERIALS_PAGE;

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  alternates: { canonical: seo.path },
  robots: seo.index ? undefined : { index: false, follow: true },
  openGraph: {
    type: "website",
    url: seo.path,
    title: `${seo.title} — ${SITE.name}`,
    description: seo.description,
  },
};

/**
 * /materials
 *
 * ── Editorial content, joined to catalog fact ────────────────────────────
 *
 * The words come from `content/materials.ts`. Everything that is a claim about
 * the system — which technologies a material is printed with, how many parts
 * are made in it, whether the configurator offers it for custom work — is
 * counted from the catalog here, at render time.
 *
 * That split is the whole design. An editor can rewrite what PETG is good for
 * and cannot accidentally publish that fourteen parts are made in it when nine
 * are, because that sentence is not theirs to write.
 *
 * A Server Component with no client island: the page is a document, the index
 * at the top is fragment anchors, and nothing on it needs JavaScript.
 */
export default async function MaterialsPage() {
  const materials = published(MATERIALS);

  /*
   * The whole catalog, once.
   *
   * Not `queryCatalog`: its `items` are a single page of twelve, so counting
   * them would have under-reported every material on the page while looking
   * entirely correct.
   */
  const products = await allCatalogProducts();
  const counts = countBy(products, (product) => product.material);

  const customPrintable = new Set(MATERIAL_OPTIONS.map((option) => option.value));

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <PageIntro crumbs={[{ label: "Materials" }]} intro={intro} />

        <ContentIndex
          label="Materials"
          entries={materials.map((entry) => ({
            value: entry.value,
            label: entry.name,
            meta: partsLabel(counts[entry.value] ?? 0),
          }))}
        />

        <section className={styles.why} aria-labelledby="why-material">
          <SectionHeading id="why-material" size="md" index="01">
            Why material decides the part
          </SectionHeading>

          <div className={styles.whyGrid}>
            <p className={styles.whyLead}>
              The same geometry printed in two materials is two different
              products. One flexes and seals; the other holds a tolerance and
              cracks if you bend it. Neither is better — they answer different
              questions.
            </p>

            <ul className={styles.whyList}>
              <li>
                <span className={styles.whyKey}>Performance</span>
                <span className={styles.whyValue}>
                  How much load the part carries, and whether it returns to
                  shape afterwards.
                </span>
              </li>
              <li>
                <span className={styles.whyKey}>Finish</span>
                <span className={styles.whyValue}>
                  How the surface reads off the machine: matte or semi-gloss,
                  as printed. No post-processing finish is offered yet.
                </span>
              </li>
              <li>
                <span className={styles.whyKey}>Durability</span>
                <span className={styles.whyValue}>
                  How the part behaves in heat, in sunlight, and after being
                  dropped.
                </span>
              </li>
              <li>
                <span className={styles.whyKey}>Cost</span>
                <span className={styles.whyValue}>
                  Material is one of the inputs to your quote, alongside the
                  geometry itself.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <div className={styles.materials}>
          {materials.map((entry, index) => {
            const count = counts[entry.value] ?? 0;
            const technologies = technologiesFor(entry);

            return (
              <section
                key={entry.value}
                id={entry.value}
                className={styles.material}
                aria-labelledby={`${entry.value}-name`}
              >
                <SectionHeading
                  id={`${entry.value}-name`}
                  as="h2"
                  size="lg"
                  index={String(index + 2).padStart(2, "0")}
                  meta={entry.code.toUpperCase()}
                >
                  {entry.name}
                </SectionHeading>

                <div className={styles.materialGrid}>
                  <div className={styles.materialMain}>
                    <p className={styles.description}>{entry.description}</p>

                    <div className={styles.pair}>
                      <div>
                        <h3 className={styles.subhead}>Choose it for</h3>
                        <ul className={styles.bullets}>
                          {entry.bestFor.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h3 className={styles.subhead}>Choose something else for</h3>
                        <ul className={styles.bullets}>
                          {entry.avoidFor.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div>
                      <h3 className={styles.subhead}>Typical applications</h3>
                      <div className={styles.tags}>
                        {entry.applications.map((application) => (
                          <Tag key={application} mono={false}>
                            {application}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={styles.materialAside}>
                    <div className={styles.block}>
                      <h3 className={styles.blockTitle}>Relative properties</h3>
                      <dl className={styles.properties}>
                        <PropertyScale
                          label="Strength"
                          rating={entry.properties.strength}
                        />
                        <PropertyScale
                          label="Flex"
                          rating={entry.properties.flexibility}
                        />
                        <PropertyScale label="Heat" rating={entry.properties.heat} />
                      </dl>
                    </div>

                    <div className={styles.block}>
                      <h3 className={styles.blockTitle}>Technology</h3>
                      {technologies.length > 0 ? (
                        <p className={styles.blockValue}>
                          {technologies.join(" · ")}
                        </p>
                      ) : (
                        // Only reachable for a material record with no
                        // technology, which validation would already refuse.
                        <p className={styles.blockNote}>
                          Confirmed per part at quote.
                        </p>
                      )}
                    </div>

                    <div className={styles.block}>
                      <h3 className={styles.blockTitle}>Colours</h3>
                      <ul className={styles.colors}>
                        {entry.colors.map((value) => {
                          const swatch = colorSwatch(value);
                          if (!swatch) return null;

                          return (
                            <li key={value} className={styles.color}>
                              <span
                                className={styles.swatch}
                                style={{ background: swatch.hex }}
                                aria-hidden="true"
                              />
                              {swatch.label}
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    <div className={styles.block}>
                      <h3 className={styles.blockTitle}>Custom print</h3>
                      <p className={styles.blockValue}>
                        {customPrintable.has(entry.value)
                          ? "Available for uploaded models"
                          : "Catalog parts only"}
                      </p>
                    </div>

                    <div className={styles.actions}>
                      {count > 0 ? (
                        <Button
                          href={shopFilterHref("material", entry.value)}
                          variant="secondary"
                          size="sm"
                          iconRight="arrow-right"
                        >
                          {partsLabel(count)} in {entry.name}
                        </Button>
                      ) : (
                        // No parts is a fact, not an empty state to hide. The
                        // material is still orderable for custom work, so the
                        // page says the true thing and offers the real route.
                        <p className={styles.blockNote}>
                          No catalog parts in {entry.name} yet.
                        </p>
                      )}

                      {customPrintable.has(entry.value) && (
                        <Button
                          href={ROUTES.customPrint}
                          variant="ghost"
                          size="sm"
                          iconRight="upload"
                        >
                          Print your own
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        {comingSoonMaterials().length > 0 && (
          <section className={styles.roadmap} aria-labelledby="coming-soon">
            <SectionHeading id="coming-soon" size="md">
              Coming soon
            </SectionHeading>
            <p className={styles.roadmapLead}>
              Materials planned for {SITE.name}. They are not available to order
              yet — no quote, cart or custom print accepts them — and no date has
              been set.
            </p>
            <ul className={styles.roadmapList}>
              {comingSoonMaterials().map((entry) => (
                <li key={entry.value} id={entry.value} className={styles.roadmapItem}>
                  <div className={styles.roadmapTop}>
                    <h3 className={styles.roadmapName}>{entry.name}</h3>
                    <Tag>Coming soon</Tag>
                  </div>
                  <span className={styles.roadmapCode}>{entry.code}</span>
                  <p className={styles.roadmapDescription}>{entry.description}</p>
                  <p className={styles.blockNote}>Not available to order yet.</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.note} aria-labelledby="technical-data">
          <SectionHeading id="technical-data" size="md">
            On technical data
          </SectionHeading>
          <p className={styles.noteText}>{TECHNICAL_DATA_NOTE}</p>

          <div className={styles.noteActions}>
            <Button href={ROUTES.customPrint} iconRight="arrow-right">
              Get a quote on your part
            </Button>
            <Button href={ROUTES.shop} variant="secondary">
              Browse the catalog
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function partsLabel(count: number): string {
  return `${count} ${count === 1 ? "part" : "parts"}`;
}

function countBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

/**
 * The technologies this material is printed with.
 *
 * Content reset: this used to be read off the catalog parts made in the
 * material, which made it a statement about the catalog rather than about the
 * material — TPU and resin have no catalog parts today, and the page would
 * have said they are printed with nothing. The canonical material record
 * states it, and `validateProduct` holds every product to the same record, so
 * the page and the catalog cannot disagree about which process prints what.
 */
function technologiesFor(material: Material): readonly string[] {
  return TECHNOLOGIES.filter((technology) =>
    (material.technologies as readonly string[]).includes(technology.value),
  ).map(
    (technology) => technology.label,
  );
}
