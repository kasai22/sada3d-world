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
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  // The root layout's template appends the brand, so the homepage sets an
  // absolute title to avoid "SADA 3D — SADA 3D".
  title: {
    absolute: `${SITE.name} — Manufacturing, reimagined.`,
  },
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: `${SITE.name} — Manufacturing, reimagined.`,
    description: SITE.description,
  },
};

/**
 * Homepage.
 *
 * Nine sections, composed. Content comes from content/home.ts so Phase 14 can
 * move it to Payload without touching these components. Only the hero object
 * and the category index are client components; the rest render on the server.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <CreateCategories />
      <CustomManufacturing />
      <MaterialsShowcase />
      <FeaturedProducts />
      <HowItWorks />
      <Industries />
      <ManufacturingCapabilities />
      <FinalCTA />
    </>
  );
}
