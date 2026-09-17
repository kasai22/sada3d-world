import type { MetadataRoute } from "next";

import { allCatalogProducts, getCategoryIndex } from "@/lib/catalog/query";
import { browseCategoriesFor } from "@/lib/catalog/taxonomy";
import { ROUTES, categoryHref, productHref } from "@/lib/routes";
import { siteUrl } from "@/lib/site";

/**
 * The sitemap.
 *
 * ── Built from the same helpers the pages link with ──────────────────────
 *
 * Not from a hand-kept list. A sitemap written by hand is a third copy of the
 * URL scheme — after the routes and the links — and it is the copy nobody ever
 * looks at, so it is the copy that rots first. `productHref` and `categoryHref`
 * are the same functions the storefront navigates by, so a sitemap entry and a
 * link on the page cannot disagree, and `links.test.ts` already proves every
 * address they produce resolves.
 *
 * ── What is deliberately absent ──────────────────────────────────────────
 *
 * Everything behind an identity or a session: the cart, checkout, the account
 * area, order tracking, the ops console and the CMS admin. None of them is
 * public content, and `robots.ts` disallows them outright. `/foundations` is a
 * design-system gallery and carries `noindex` of its own.
 *
 * Filtered catalog URLs are also absent: `/shop?material=petg` is the same
 * catalog in a different order, and the shop already points those at `/shop` as
 * their canonical.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  const absolute = (path: string) => new URL(path, origin).toString();

  const lastModified = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: absolute(ROUTES.home), lastModified, changeFrequency: "weekly", priority: 1 },
    { url: absolute(ROUTES.shop), lastModified, changeFrequency: "daily", priority: 0.9 },
    {
      url: absolute(ROUTES.customPrint),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: absolute(ROUTES.materials),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: absolute(ROUTES.solutions),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: absolute(ROUTES.howItWorks),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];

  const served = await allCatalogProducts();
  const categories: MetadataRoute.Sitemap = browseCategoriesFor(served, await getCategoryIndex()).map((category) => ({
    url: absolute(categoryHref(category)),
    lastModified,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const products: MetadataRoute.Sitemap = served.map(
    (product) => ({
      url: absolute(productHref(product)),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    }),
  );

  return [...pages, ...categories, ...products];
}
