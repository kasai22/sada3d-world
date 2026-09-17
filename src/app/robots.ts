import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * robots.txt.
 *
 * ── What is disallowed, and why each one ─────────────────────────────────
 *
 * Every entry is a surface that is either private, per-session, or not content:
 *
 *   /api, /payload-api  the product API and the CMS API. Neither is a page.
 *   /admin              Reality 3D Admin — internal, and access-gated.
 *   /cms                the Payload CMS admin panel.
 *   /ops                the Stage 21 console address, now a redirect to /admin.
 *   /account            one customer's own data.
 *   /cart, /checkout    per-session state; there is nothing stable to index.
 *   /orders             order tracking, reachable with a reference.
 *   /login, /auth       authentication surfaces.
 *   /foundations        the design-system gallery. It also sets noindex itself.
 *
 * These are not a security measure — robots.txt is a request, and the access
 * rules that actually protect /admin and /account live in the application. This
 * keeps them out of an index, which is a separate and much weaker job.
 *
 * The catalog's filtered permutations are not disallowed. They are the same
 * parts in a different order and already point their canonical at /shop, which
 * is the correct signal; blocking them here would also stop a crawler reaching
 * the products those pages link to.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/payload-api/",
        "/admin",
        "/cms",
        "/ops",
        "/account",
        "/cart",
        "/checkout",
        "/orders",
        "/login",
        "/auth/",
        "/foundations",
      ],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  };
}
