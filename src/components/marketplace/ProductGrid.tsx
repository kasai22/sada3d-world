import { ProductCard } from "@/components/commerce";
import { formatPrice } from "@/lib/catalog/format";
import { AVAILABILITY, COLORS, MATERIALS } from "@/lib/catalog/taxonomy";
import type { Product } from "@/lib/catalog/types";
import styles from "./ProductGrid.module.css";

export interface ProductGridProps {
  products: readonly Product[];
  /** Marks the first row for eager loading once real images exist. */
  priorityCount?: number;
}

function label(list: readonly { value: string; label: string }[], value: string) {
  return list.find((entry) => entry.value === value)?.label ?? value;
}

/**
 * The results grid.
 *
 * Uses ProductCard unchanged and deliberately passes no `meta`: the card stays
 * minimal here — name, material, colour, price, availability. Specifications
 * belong on the product page.
 */
export function ProductGrid({ products, priorityCount = 0 }: ProductGridProps) {
  return (
    <ul className={styles.grid}>
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            name={product.name}
            href={`/shop/${product.browseCategory}/${product.slug}`}
            material={label(MATERIALS, product.material)}
            color={label(COLORS, product.color)}
            price={formatPrice(product.price)}
            badge={
              product.badge ?? label(AVAILABILITY, product.availability)
            }
            image={product.image}
            priority={index < priorityCount}
          />
        </li>
      ))}
    </ul>
  );
}
