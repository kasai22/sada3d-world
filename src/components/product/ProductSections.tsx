import { ProductCard } from "@/components/commerce";
import { Tag } from "@/components/core";
import { SectionHeading, SpecTable, type SpecRow } from "@/components/structure";
import { formatPrice, partId } from "@/lib/catalog/query";
import { AVAILABILITY, COLORS, MATERIALS, TECHNOLOGIES } from "@/lib/catalog/taxonomy";
import type { Product } from "@/lib/catalog/types";
import styles from "./ProductSections.module.css";

function label(list: readonly { value: string; label: string }[], value: string) {
  return list.find((entry) => entry.value === value)?.label ?? value;
}

/* ------------------------------------------------------------------ *
 * Technical specifications
 * ------------------------------------------------------------------ */

/**
 * Rendered only when the part actually has recorded specifications.
 *
 * Nothing is derived, estimated or filled in: a part with no measurements shows
 * no specification table rather than a table of blanks or invented figures.
 */
export function ProductSpecifications({ product }: { product: Product }) {
  const specs = product.specifications;
  if (!specs || specs.length === 0) return null;

  const rows: SpecRow[] = [
    { label: "Part ID", value: partId(product) },
    ...specs.map((spec) => ({ label: spec.label, value: spec.value })),
  ];

  // Split down the middle so a long table does not become a single narrow rail.
  const half = Math.ceil(rows.length / 2);

  return (
    <section className={styles.section} aria-labelledby="specifications">
      <div className={styles.split}>
        <div className={styles.head}>
          <SectionHeading id="specifications" size="lg" index="01">
            Technical specifications
          </SectionHeading>
        </div>

        <div className={styles.specs}>
          <SpecTable
            rows={rows.slice(0, half)}
            caption="Technical specifications, part one"
            highlight={["Part ID"]}
          />
          {rows.length > half && (
            <SpecTable
              rows={rows.slice(half)}
              caption="Technical specifications, part two"
            />
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Description
 * ------------------------------------------------------------------ */

export function ProductDescription({ product }: { product: Product }) {
  if (!product.description) return null;

  return (
    <section className={styles.section} aria-labelledby="description">
      <div className={styles.split}>
        <div className={styles.head}>
          <SectionHeading id="description" size="lg" index="02">
            Description
          </SectionHeading>
        </div>
        <p className={styles.body}>{product.description}</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Applications
 * ------------------------------------------------------------------ */

export function ProductApplications({ product }: { product: Product }) {
  const applications = product.applications;
  if (!applications || applications.length === 0) return null;

  return (
    <section className={styles.sectionTight} aria-labelledby="applications">
      <div className={styles.split}>
        <div className={styles.head}>
          <SectionHeading id="applications" index="03">
            Applications
          </SectionHeading>
        </div>

        <ul className={styles.applications}>
          {applications.map((application) => (
            <li key={application}>
              <Tag mono={false}>{application}</Tag>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Material
 * ------------------------------------------------------------------ */

export function ProductMaterial({ product }: { product: Product }) {
  const notes = product.materialNotes;
  if (!notes || notes.length === 0) return null;

  return (
    <section className={styles.sectionTight} aria-labelledby="material">
      <div className={styles.split}>
        <div className={styles.head}>
          <SectionHeading id="material" index="04">
            {label(MATERIALS, product.material)}
          </SectionHeading>
        </div>

        <ul className={styles.notes}>
          {notes.map((note) => (
            <li key={note} className={styles.note}>
              <span className={styles.noteRule} aria-hidden="true" />
              {note}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Manufacturing
 * ------------------------------------------------------------------ */

/**
 * Always rendered: every value here comes from the base catalog record, so it
 * is known for every part.
 */
export function ProductManufacturing({ product }: { product: Product }) {
  const rows: SpecRow[] = [
    { label: "Technology", value: label(TECHNOLOGIES, product.technology) },
    { label: "Material", value: label(MATERIALS, product.material) },
    { label: "Colour", value: label(COLORS, product.color) },
    { label: "Availability", value: label(AVAILABILITY, product.availability) },
  ];

  // A single quality option is a fact about how the part is made.
  const quality = product.qualityOptions;
  if (quality?.length === 1 && quality[0]) {
    rows.push({
      label: "Quality",
      value: `${quality[0].label} · ${quality[0].layerHeight}`,
    });
  }

  return (
    <section className={styles.sectionTight} aria-labelledby="manufacturing">
      <div className={styles.split}>
        <div className={styles.head}>
          <SectionHeading id="manufacturing" index="05">
            Manufacturing
          </SectionHeading>
        </div>

        <SpecTable rows={rows} caption="Manufacturing details" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Related
 * ------------------------------------------------------------------ */

export function RelatedProducts({ products }: { products: readonly Product[] }) {
  if (products.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="related">
      <div className={styles.head}>
        <SectionHeading id="related" size="lg" meta={`${products.length} parts`}>
          Related parts
        </SectionHeading>
      </div>

      <ul className={styles.related}>
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard
              name={product.name}
              href={`/shop/${product.browseCategory}/${product.slug}`}
              material={label(MATERIALS, product.material)}
              color={label(COLORS, product.color)}
              price={formatPrice(product.price)}
              badge={product.badge}
              image={product.image}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
