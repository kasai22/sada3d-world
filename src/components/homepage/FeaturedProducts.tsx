import { Button } from "@/components/core";
import { ProductCard } from "@/components/commerce";
import { SectionHeading } from "@/components/structure";
import { FEATURED_PRODUCTS } from "@/content/home";
import styles from "./FeaturedProducts.module.css";

/**
 * 05 — Featured products.
 *
 * Uses ProductCard unchanged. Cards carry no image yet, so they fall back to
 * the design system's placeholder stage; the `image` prop is wired and ready
 * for R2 assets in Phase 16.
 */
export function FeaturedProducts() {
  return (
    <section
      className={`bg-commerce ${styles.section}`}
      aria-labelledby="featured-title"
    >
      <div className="u-container">
        <div className={styles.head}>
          <SectionHeading
            index="05"
            size="lg"
            meta={`${FEATURED_PRODUCTS.length} parts`}
            id="featured-title"
          >
            Ready to make
          </SectionHeading>

          <Button href="/shop" variant="secondary" iconRight="arrow-right">
            View all parts
          </Button>
        </div>

        <div className={styles.grid}>
          {FEATURED_PRODUCTS.map((product) => (
            <ProductCard
              key={product.slug}
              name={product.name}
              href={`/shop/${product.slug}`}
              material={product.material}
              color={product.color}
              price={product.price}
              badge={product.badge}
              meta={product.meta}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
