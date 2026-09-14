import { MODEL_ASSETS } from "../../models";
import { provisionalCatalogPrice } from "../../pricing";
import { missing, proposed } from "../../facts";
import type { CatalogEntry } from "../../types";

const model = MODEL_ASSETS.planetaryGearSet;
const { price, basis } = provisionalCatalogPrice({ material: "pla", model });

/**
 * Planetary gear demonstration set.
 *
 * Pre-reset this was "Planetary Carrier … for compact planetary gearboxes". The
 * model has no ring gear and no pinion shafts, so it cannot be a gearbox part;
 * the description now says what the six parts are and what they are not. Parts
 * and envelope are read from the GLB; tooth counts are the generator's.
 */
export const planetaryGearSet: CatalogEntry = {
  intent: "publish",
  priceBasis: basis,
  contentGaps: [
    "No approved product photograph or render — model only.",
    "Price is provisional (derived from the provisional pricing rules).",
    "Not approved for sale: no product approval record (approver, date, reference).",
  ],
  commercial: {
    productClass: proposed("STANDARD_CATALOG_PRODUCT", "Fixed-price catalog part with a verified model (Stage 19.5)"),
    sku: missing("No SKU scheme exists. SKUs are assigned by the business, never generated."),
    customer: proposed(["Educators", "Engineering students", "Design reviewers"], "CATALOG_APPROVAL.md — Stage 19.6 product review"),
    useCase: proposed("A six-part set showing how a planetary stage is arranged; it has no ring gear and is not a working gearbox.", "CATALOG_APPROVAL.md — Stage 19.6 product review"),
    pricingModel: proposed("FIXED", "Catalog price derived from the quote engine; see priceBasis"),
    copy: proposed("Description, applications and stated limitation as published", "Written in Stage 19.5 from measured model facts; limitation stated from the model"),
    weightGrams: missing("Not measured on a produced part, and no material density is recorded to derive it."),
    visual: {
      required: proposed("APPROVED_RENDER", "A render can be produced from the verified model before parts are photographed"),
      renderSpecification: proposed(
        "Rendered from planetary-gear-set.glb showing all six parts, assembled and exploded; the absence of a ring gear must be visible; marked as a render.",
        "Stage 19.7 render policy: a render must show the actual model, and is labelled as a render",
      ),
      owner: "Content / design",
    },
    featured: missing("No homepage feature decision has been made."),
    openQuestions: [
      {
        id: "sell-without-ring-gear",
        question: "Can the Planetary Gear Set be sold in its current configuration without a ring gear?",
        answer: missing("Not answered. Engineering does not infer it; the business decides (Stage 19.8 §5)."),
      },
    ],
  },
  product: {
    id: "p-102",
    slug: "planetary-gear-set",
    name: "Planetary Gear Set",
    summary: "Six parts: carrier plate, sun gear, three pinions, retaining cap.",
    category: "gears",
    browseCategory: "mechanical",
    material: "pla",
    materials: ["pla"],
    technology: "fdm",
    color: "black",
    colors: ["black", "white"],
    price,
    currency: "INR",
    priceStatus: "provisional",
    approvalStatus: "provisional",
    availability: "made-to-order",
    model: { url: model.url, format: model.format },
    description:
      "A six-part planetary gear demonstration set in PLA — carrier plate, sun gear, three pinions and a retaining cap, printed as separate parts. It has no ring gear and no pinion shafts, so it shows how a planetary stage is arranged rather than working as a gearbox.",
    applications: ["Teaching models", "Mechanism demonstrations", "Design reviews"],
    qualityOptions: [{ value: "standard", label: "Standard", layerHeight: "0.20 MM" }],
    specifications: [
      { label: "Print technology", value: "FDM" },
      { label: "Layer height", value: "0.20 MM" },
      { label: "Parts", value: "6" },
      { label: "Assembled envelope", value: "60 × 60 × 23.5 MM" },
      { label: "Sun gear", value: "16 teeth" },
      { label: "Pinions", value: "3 × 10 teeth" },
    ],
  },
};
