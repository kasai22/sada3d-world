import type { Metadata } from "next";

import {
  CreateCategories,
  CustomManufacturing,
  FeaturedProducts,
  FinalCTA,
  Hero,
  HowItWorks,
  Industries,
  ManufacturingCapabilities,
  MaterialsShowcase,
} from "@/components/homepage";
import { homeCategories } from "@/content/home";
import { getBrowseCategories } from "@/lib/catalog/query";
import { serializeJsonForScript } from "@/lib/security/serialize";
import { SITE, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  // The root layout's template appends the brand, so the homepage sets an
  // absolute title to avoid "Reality 3D — Reality 3D".
  title: {
    absolute: `${SITE.name} — ${SITE.tagline}`,
  },
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
};

/**
 * Homepage.
 *
 * ── The order, and why it changed in Stage 19 ────────────────────────────
 *
 * Nine sections, composed. One moved: Industries — who this is for — was
 * seventh, after the materials, the products and the process. A first-time
 * visitor was being asked to read three sections of *how* before anything
 * addressed *whether this is for me*.
 *
 * It now sits fourth, directly after the two paths (browse a part, send a
 * file), so the page answers its questions in the order a stranger asks them:
 *
 *   what is this  →  what can I buy  →  what can I have made  →
 *   is it for me  →  what is it made of  →  what does it cost  →
 *   how does it work  →  what can you actually do  →  start
 *
 * Nothing else moved and nothing was redesigned. Only the hero object and the
 * category index are client components; the rest render on the server.
 */
export default async function HomePage() {
  /*
   * Stage 19.9: who the site is. Name, slogan and address only — no ratings,
   * contact claims or founding dates, because none has been supplied.
   */
  const origin = siteUrl().toString();
  const structuredData = [
    { "@context": "https://schema.org", "@type": "Organization", name: SITE.name, slogan: SITE.tagline, url: origin },
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: origin },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonForScript(structuredData) }}
      />
      <Hero />
      <CreateCategories categories={homeCategories(await getBrowseCategories())} />
      <CustomManufacturing />
      <Industries />
      <MaterialsShowcase />
      <FeaturedProducts />
      <HowItWorks />
      <ManufacturingCapabilities />
      <FinalCTA />
    </>
  );
}
