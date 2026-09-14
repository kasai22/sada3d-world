import { MODEL_ASSETS } from "../../models";
import { provisionalCatalogPrice } from "../../pricing";
import { missing, proposed } from "../../facts";
import type { CatalogEntry } from "../../types";

const model = MODEL_ASSETS.spurGear24t;
const { price, basis } = provisionalCatalogPrice({ material: "pla", model });

/**
 * 24-tooth spur gear.
 *
 * Every specification row is a property of the model file: the envelope is
 * measured, and tooth count, bore and face width are the generator's parameters.
 * The tooth form is stated because it matters — the flanks are straight, not
 * involute, and a buyer designing a drive needs to know that before ordering.
 */
export const spurGear24t: CatalogEntry = {
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
    customer: proposed(["Educators", "Product designers", "Hobbyists"], "CATALOG_APPROVAL.md — Stage 19.6 product review"),
    useCase: proposed("A 24-tooth gear for mechanism mock-ups and teaching models, not for power transmission.", "CATALOG_APPROVAL.md — Stage 19.6 product review"),
    pricingModel: proposed("FIXED", "Catalog price derived from the quote engine; see priceBasis"),
    copy: proposed("Description, applications and stated limitation as published", "Written in Stage 19.5 from measured model facts; limitation stated from the model"),
    weightGrams: missing("Not measured on a produced part, and no material density is recorded to derive it."),
    visual: {
      required: proposed("APPROVED_RENDER", "A render can be produced from the verified model before parts are photographed"),
      renderSpecification: proposed(
        "Rendered from spur-gear-24t.stl at true proportions, in the ordered colour, with the bore and trapezoidal teeth visible; marked as a render.",
        "Stage 19.7 render policy: a render must show the actual model, and is labelled as a render",
      ),
      owner: "Content / design",
    },
    featured: missing("No homepage feature decision has been made."),
  },
  product: {
    id: "p-101",
    slug: "spur-gear-24t",
    name: "Spur Gear, 24 Teeth",
    summary: "24 teeth, 6 mm bore, 8 mm face width.",
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
      "A 24-tooth spur gear with a 6 mm bore, printed in PLA. The teeth have a straight-flanked trapezoidal profile rather than an involute one, so it suits mock-ups, mechanism demonstrations and teaching models rather than continuous power transmission.",
    applications: ["Mechanism mock-ups", "Teaching models", "Prototype assemblies"],
    qualityOptions: [{ value: "standard", label: "Standard", layerHeight: "0.20 MM" }],
    specifications: [
      { label: "Print technology", value: "FDM" },
      { label: "Layer height", value: "0.20 MM" },
      { label: "Outside diameter", value: "49.9 MM" },
      { label: "Face width", value: "8 MM" },
      { label: "Bore", value: "6 MM" },
      { label: "Teeth", value: "24" },
      { label: "Tooth profile", value: "Trapezoidal" },
    ],
  },
};
