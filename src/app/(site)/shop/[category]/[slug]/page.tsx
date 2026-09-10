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
import { siteUrl } from "@/lib/site";
import styles from "./page.module.css";

/** Every valid category/slug pair in the catalog. */
export async function generateStaticParams() {
  return productParams();
}

/**
 * Unknown products, and valid slugs under the wrong category, 404 at the
 * routing layer rather than inside the component.
 *
 * This is the Phase 5 lesson applied up front: a notFound() raised after a
 * streamed shell cannot change a status that has already been sent. Restricting
 * the params means the response is a real 404 before rendering starts.
 */
export const dynamicParams = false;

interface RouteParams {
  params: Promise<{ category: string; slug: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { category, slug } = await params;
  const product = await getProduct(category, slug);

  if (!product) return {};

  const description = product.description ?? product.summary;
  const path = `/shop/${product.browseCategory}/${product.slug}`;

  return {
    title: product.name,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      title: `${product.name} — SADA 3D`,
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
    url: new URL(`/shop/${product.browseCategory}/${product.slug}`, siteUrl()).toString(),
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
        // Values come from the catalog, not from user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="u-container">
        <Breadcrumbs
          className={styles.crumbs}
          items={[
            { label: "Shop", href: "/shop" },
            {
              label: categoryLabel(product.browseCategory) ?? product.browseCategory,
              href: `/shop/${product.browseCategory}`,
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
