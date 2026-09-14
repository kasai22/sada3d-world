import { BROWSE_CATEGORIES, categoryLabel } from "./catalog/taxonomy";
import { ROUTES, categoryHref } from "./routes";

/**
 * The storefront's navigation, as data.
 *
 * ── Why it is not inside the components ──────────────────────────────────
 *
 * Because a test has to be able to read it. Stage 19 found a dead link in the
 * footer — "Functional", pointing at `/shop/functional`, a category that exists
 * in the taxonomy and has no page — and the only reason it survived was that
 * nothing could enumerate the footer's destinations without rendering it.
 *
 * `npm test` runs `node --test` over `.ts`, with no DOM and no React renderer,
 * so a link list inside a `.tsx` component is a link list no test can check.
 * Moving it here makes "every header link resolves" and "every footer link
 * resolves" assertions over data rather than assertions over a rendered tree —
 * which is both stronger and possible.
 *
 * `links.test.ts` reads these and resolves every destination against the real
 * route table and the real catalog.
 */

export interface NavItem {
  href: string;
  label: string;
}

/**
 * The five primary destinations.
 *
 * Apple-like simplicity, and a mental model a first-time visitor can predict:
 * Shop is finished parts, Custom Print is your own file, Materials is what it
 * can be made from, Solutions is what people use it for, How It Works is the
 * process. Three of the five did not exist before Stage 19.
 *
 * The header and the mobile drawer render this same list, so mobile cannot be
 * left behind when desktop changes.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: ROUTES.shop, label: "Shop" },
  { href: ROUTES.customPrint, label: "Custom Print" },
  { href: ROUTES.materials, label: "Materials" },
  { href: ROUTES.solutions, label: "Solutions" },
  { href: ROUTES.howItWorks, label: "How It Works" },
];

export interface FooterColumn {
  title: string;
  links: readonly NavItem[];
}

/**
 * Footer columns for a served catalog. Stage 19.8: the shop column names the
 * served catalog's browse categories, so the layout passes them in.
 */
export function footerColumns(browseCategories: readonly string[]): readonly FooterColumn[] {
  return [
  {
    title: "Manufacture",
    links: [
      { href: ROUTES.customPrint, label: "Custom print" },
      { href: ROUTES.materials, label: "Materials" },
      { href: ROUTES.howItWorks, label: "How it works" },
      { href: ROUTES.solutions, label: "Solutions" },
    ],
  },
  {
    title: "Shop",
    links: [
      { href: ROUTES.shop, label: "All parts" },
      /*
       * Browse categories, and they have to be.
       *
       * This column used to lead with "Functional" pointing at
       * /shop/functional. Functional is a real node in the category tree — the
       * parent of Mechanical, Automotive and Industrial — but it is not in
       * BROWSE_CATEGORIES, and /shop/[category] is generated with
       * dynamicParams disabled, so the link was a routing-level 404.
       *
       * categoryHref cannot catch that: it is a string function, and
       * "/shop/functional" is a perfectly well-formed string. links.test.ts
       * catches it, by resolving these against the same allowlist the route is
       * generated from.
       */
      /*
       * Content reset: these were three hand-written categories, two of which
       * (Automotive, Lifestyle) no longer exist. They are now the first three
       * browse categories, so the footer cannot link a category page that has
       * nothing on it.
       */
      ...browseCategories.slice(0, 3).map((value) => ({
        href: categoryHref(value),
        label: categoryLabel(value) ?? value,
      })),
    ],
  },
  {
    title: "Account",
    links: [
      { href: ROUTES.account, label: "Your account" },
      { href: ROUTES.accountOrders, label: "Orders" },
      { href: ROUTES.accountDesigns, label: "Saved designs" },
      // The guest route. Someone who ordered without an account has no account
      // orders to look at, and this is the page that actually helps them.
      { href: ROUTES.orderLookup, label: "Track an order" },
    ],
  },
];
}

/** The repository seed's footer — what a build with no catalog source serves. */
export const FOOTER_COLUMNS: readonly FooterColumn[] = footerColumns(BROWSE_CATEGORIES);
