import { Button } from "@/components/core";
import { ProductCard } from "@/components/commerce";
import { SectionHeading } from "@/components/structure";
import {
  availabilityLabel,
  formatPrice,
  priceQualifier,
  productHref,
} from "@/lib/catalog/format";
import { getFeaturedProducts } from "@/lib/catalog/query";
import { COLORS, MATERIALS } from "@/lib/catalog/taxonomy";
import { ROUTES } from "@/lib/routes";
import styles from "./FeaturedProducts.module.css";

/**
 * 06 — Featured products.
 *
 * Reads the catalog rather than a list of its own. Before Stage 19 this
 * rendered eight hand-written product objects and linked each one to
 * `/shop/{slug}`, which is not a route — so every card on the busiest page of
 * the site was a 404, and two of the eight named parts that did not exist.
 *
 * Now the homepage supplies ids, `getFeaturedProducts` resolves them, and
 * `productHref` builds the address. A card can no longer disagree with the shop
 * about a product's name, its price or where it lives.
 *
 * Async, and therefore a Server Component — which it already was. Cards carry
 * no image until real product photography exists; the `image` prop is wired and
 * passes through whatever the catalog holds.
 */
export async function FeaturedProducts() {
  const { products } = await getFeaturedProducts();

  // Every reference failed to resolve. Rendering the heading over an empty grid
  // would be worse than rendering nothing.
  if (products.length === 0) return null;

  return (
    <section
      className={`bg-commerce ${styles.section}`}
      aria-labelledby="featured-title"
    >
      <div className="u-container">
        <div className={styles.head}>
          <SectionHeading
            index="06"
            size="lg"
            meta={`${products.length} ${products.length === 1 ? "part" : "parts"}`}
            id="featured-title"
          >
            Ready to make
          </SectionHeading>

          <Button href={ROUTES.shop} variant="secondary" iconRight="arrow-right">
            View all parts
          </Button>
        </div>

        <div className={styles.grid}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              name={product.name}
              href={productHref(product)}
              material={label(MATERIALS, product.material)}
              color={label(COLORS, product.color)}
              price={formatPrice(product.price)}
              priceNote={priceQualifier(product)}
              // The badge states availability from the catalog field, so a
              // made-to-order part is never labelled as stock.
              badge={availabilityLabel(product)}
              image={product.image}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function label(list: readonly { value: string; label: string }[], value: string) {
  return list.find((entry) => entry.value === value)?.label ?? value;
}
