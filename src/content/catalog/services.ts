import { PRICING_RULES } from "@/lib/pricing/rules";

import { known, missing, proposed, type Fact } from "./facts";
import type { PricingModel, ProductClass } from "./types";

/**
 * Services — what Reality 3D sells that is not a catalog product.
 *
 * Listed in the launch catalog so its commercial state is visible beside the
 * products, and deliberately not counted towards the launch catalog size: a
 * service is made to the customer's geometry, not chosen from a list.
 */
export interface ServiceDefinition {
  id: string;
  name: string;
  route: string;
  productClass: ProductClass;
  implemented: Fact<string>;
  pricingModel: Fact<PricingModel>;
  pricing: Fact<string>;
  manufacturing: Fact<string>;
  leadTime: Fact<string>;
}

export const SERVICES: readonly ServiceDefinition[] = [
  {
    id: "svc-custom-print",
    name: "Custom manufacturing from your model",
    route: "/custom-print",
    productClass: "CUSTOM_MANUFACTURING_SERVICE",
    implemented: known(
      "Upload (STL, 3MF, OBJ, STEP), geometry analysis, material/quality/finish configuration, instant quote, cart and order",
      "app/(site)/custom-print, lib/custom-print, lib/pricing, lib/cart",
    ),
    pricingModel: proposed("CONFIGURABLE", "Priced by the quote engine from the customer's selections"),
    pricing: proposed(
      `Quote engine rules ${PRICING_RULES.version}, marked provisional: not approved commercial pricing, and not geometry-based`,
      "lib/pricing/rules.ts",
    ),
    manufacturing: proposed(
      "The configurator offering; see MANUFACTURING_CAPABILITY.md — no process or material is approved",
      "src/content/catalog/manufacturing.ts",
    ),
    leadTime: missing("No production lead time has been set."),
  },
];
