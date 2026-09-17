import type { Metadata } from "next";

import { ContentIndex, PageIntro } from "@/components/content";
import { Button, Tag } from "@/components/core";
import { SectionHeading } from "@/components/structure";
import { published } from "@/content/pages";
import { SOLUTIONS, SOLUTIONS_NOTE, SOLUTIONS_PAGE } from "@/content/solutions";
import { allCatalogProducts } from "@/lib/catalog/query";
import { getCategoryIndex } from "@/lib/catalog/query";
import { browseCategoriesFor, categoryLabel } from "@/lib/catalog/taxonomy";
import { ROUTES, categoryHref } from "@/lib/routes";
import { SITE } from "@/lib/site";

import styles from "./page.module.css";

const { seo, intro } = SOLUTIONS_PAGE;

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
 * /solutions
 *
 * ── The rule that keeps this page honest ─────────────────────────────────
 *
 * A section is rendered only when its browse category is a real route *and*
 * has at least one published part behind it. Both halves matter:
 *
 *   · a category outside `BROWSE_CATEGORIES` has no page, so its "Browse"
 *     button would be a 404 — the same defect the homepage's featured products
 *     had;
 *   · a category with no parts sends the customer to an empty results page
 *     after a paragraph promising Reality 3D does this work.
 *
 * So a solution that loses its catalog stops being advertised. It is not a
 * deploy and it is not a decision anyone has to remember to make.
 */
export default async function SolutionsPage() {
  const products = await allCatalogProducts();

  const counts = new Map<string, number>();
  for (const product of products) {
    counts.set(
      product.browseCategory,
      (counts.get(product.browseCategory) ?? 0) + 1,
    );
  }

  const categoryIndex = await getCategoryIndex();
  const browse = new Set(browseCategoriesFor(products, categoryIndex));

  /*
   * Catalog-backed sections need a routable category with parts in it.
   * Editorial sections name no category and are served by custom print.
   */
  const solutions = published(SOLUTIONS)
    .map((solution) => ({
      ...solution,
      count: solution.browseCategory ? (counts.get(solution.browseCategory) ?? 0) : 0,
      routable: solution.browseCategory ? browse.has(solution.browseCategory) : true,
    }))
    .filter(
      (solution) => !solution.browseCategory || (solution.routable && solution.count > 0),
    );

  const metaFor = (solution: (typeof solutions)[number]) =>
    solution.browseCategory
      ? `${solution.count} ${solution.count === 1 ? "part" : "parts"}`
      : "From your model";

  return (
    <div className={`bg-commerce ${styles.page}`}>
      <div className="u-container">
        <PageIntro crumbs={[{ label: "Solutions" }]} intro={intro} />

        <ContentIndex
          label="Solutions"
          entries={solutions.map((solution) => ({
            value: solution.value,
            label: solution.name,
            meta: metaFor(solution),
          }))}
        />

        <div className={styles.solutions}>
          {solutions.map((solution, index) => {
            const label = solution.browseCategory
              ? (categoryLabel(solution.browseCategory, categoryIndex) ?? solution.browseCategory)
              : "Custom print";

            const browseButton = solution.browseCategory && (
              <Button
                href={categoryHref(solution.browseCategory)}
                variant={solution.primaryAction === "browse" ? "primary" : "secondary"}
                iconRight="arrow-right"
              >
                Browse {label.toLowerCase()}
              </Button>
            );

            const customButton = (
              <Button
                href={ROUTES.customPrint}
                variant={solution.primaryAction === "custom" ? "primary" : "secondary"}
                iconLeft="upload"
              >
                Upload a model
              </Button>
            );

            return (
              <section
                key={solution.value}
                id={solution.value}
                className={styles.solution}
                aria-labelledby={`${solution.value}-name`}
              >
                <SectionHeading
                  id={`${solution.value}-name`}
                  as="h2"
                  size="lg"
                  index={String(index + 1).padStart(2, "0")}
                  meta={metaFor(solution)}
                >
                  {solution.name}
                </SectionHeading>

                <div className={styles.grid}>
                  <div className={styles.body}>
                    <div>
                      <h3 className={styles.subhead}>The problem</h3>
                      <p className={styles.problem}>{solution.problem}</p>
                    </div>

                    <div>
                      <h3 className={styles.subhead}>How it is made</h3>
                      <p className={styles.answer}>{solution.answer}</p>
                    </div>
                  </div>

                  <div className={styles.aside}>
                    <div>
                      <h3 className={styles.subhead}>Suitable parts</h3>
                      <ul className={styles.bullets}>
                        {solution.suitableParts.map((part) => (
                          <li key={part}>{part}</li>
                        ))}
                      </ul>
                    </div>

                    <div className={styles.where}>
                      <h3 className={styles.subhead}>Where these live</h3>
                      <Tag mono={false}>{label}</Tag>
                    </div>

                    {/*
                      The primary action differs per solution, deliberately.
                      Replacement parts start from the catalog; a prototype
                      starts from a file. A page where every section offered the
                      same two buttons would have decided nothing for the reader.
                    */}
                    <div className={styles.actions}>
                      {solution.primaryAction === "browse" ? (
                        <>
                          {browseButton}
                          {customButton}
                        </>
                      ) : (
                        <>
                          {customButton}
                          {browseButton}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <section className={styles.note} aria-labelledby="solutions-note">
          <SectionHeading id="solutions-note" size="md">
            Not listed here
          </SectionHeading>
          <p className={styles.noteText}>{SOLUTIONS_NOTE}</p>

          <div className={styles.noteActions}>
            <Button href={ROUTES.customPrint} iconRight="arrow-right">
              Start a custom part
            </Button>
            <Button href={ROUTES.materials} variant="secondary">
              Compare materials
            </Button>
            <Button href={ROUTES.howItWorks} variant="ghost">
              See the process
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
