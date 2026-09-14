import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/structure";
import {
  ProductApplications,
  ProductDescription,
  ProductHero,
  ProductManufacturing,
  ProductMaterial,
  ProductSpecifications,
  RelatedProducts,
} from "@/components/product";
import {
  getProduct,
  getRelatedProducts,
  isQuoteOnly,
  partId,
  productParams,
} from "@/lib/catalog/query";
import { categoryLabel } from "@/lib/catalog/taxonomy";
import { categoryHref, productHref } from "@/lib/routes";
import { serializeJsonForScript } from "@/lib/security/serialize";
import { SITE, siteUrl } from "@/lib/site";
import styles from "./page.module.css";

/** Every category/slug pair in the catalog at build time. */
export async function generateStaticParams() {
  return productParams();
}

/**
 * Stage 19.8: products are administrator-managed, so a product published after
 * the build must resolve without one. Unknown params render on request.
 *
 * Unknown products, and valid slugs under the wrong category, still 404 before
 * anything streams: generateMetadata raises notFound() first, and there is no
 * loading boundary above this page (the Phase 5 lesson — a notFound() after a
 * streamed shell cannot change a status already sent).
 */
export const dynamicParams = true;

interface RouteParams {
  params: Promise<{ category: string; slug: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { category, slug } = await params;
  const product = await getProduct(category, slug);

  if (!product) notFound();

  const description = product.description ?? product.summary;
  const path = productHref(product);

  return {
    title: product.name,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      title: `${product.name} — Reality 3D`,
      description,
    },
  };
}

export default async function ProductPage({ params }: RouteParams) {
  const { category, slug } = await params;
  const product = await getProduct(category, slug);

  if (!product) notFound();

  const related = await getRelatedProducts(product);

  /*
   * Product structured data, built from catalog values only. Price is omitted
   * for quote-only parts rather than published as zero, which a consumer would
   * read as free.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? product.summary,
    sku: partId(product),
    category: categoryLabel(product.category),
    material: product.material.toUpperCase(),
    brand: { "@type": "Brand", name: SITE.name },
    url: new URL(productHref(product), siteUrl()).toString(),
    ...(isQuoteOnly(product)
      ? {}
      : {
          offers: {
            "@type": "Offer",
            price: product.price,
            priceCurrency: product.currency,
            availability:
              product.availability === "in-stock"
                ? "https://schema.org/InStock"
                : "https://schema.org/PreOrder",
          },
        }),
  };

  return (
    <div className={`bg-commerce ${styles.page}`}>
      <script
        type="application/ld+json"
        // Catalog values, authored in the CMS. Serialised with `<`, `>` and `&`
        // escaped, so a product name containing `</script>` stays text inside
        // this element instead of ending it. See lib/security/serialize.
        dangerouslySetInnerHTML={{ __html: serializeJsonForScript(jsonLd) }}
      />

      <div className="u-container">
        <Breadcrumbs
          className={styles.crumbs}
          items={[
            { label: "Shop", href: "/shop" },
            {
              label: categoryLabel(product.browseCategory) ?? product.browseCategory,
              href: categoryHref(product.browseCategory),
            },
            { label: product.name },
          ]}
        />

        <ProductHero product={product} />
        <ProductSpecifications product={product} />
        <ProductDescription product={product} />
        <ProductApplications product={product} />
        <ProductMaterial product={product} />
        <ProductManufacturing product={product} />
        <RelatedProducts products={related} />
      </div>
    </div>
  );
}
