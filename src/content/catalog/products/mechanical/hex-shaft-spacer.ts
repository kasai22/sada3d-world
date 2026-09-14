import { MODEL_ASSETS } from "../../models";
import { provisionalCatalogPrice } from "../../pricing";
import { missing, proposed } from "../../facts";
import type { CatalogEntry } from "../../types";

const model = MODEL_ASSETS.hexShaftSpacer;
const { price, basis } = provisionalCatalogPrice({ material: "petg", model });

/**
 * Hex shaft spacer.
 *
 * Pre-reset this model was sold as a "Hex Drive Coupler: 6 mm hex to 8 mm shaft,
 * with a grub-screw seat". The file is a hexagonal body with a plain 8 mm
 * through-bore — no hex socket, no grub-screw seat — so it is catalogued as what
 * it is. Every dimension below is measured from the file.
 */
export const hexShaftSpacer: CatalogEntry = {
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
    customer: proposed(["Prototype builders", "Mechanism builders"], "CATALOG_APPROVAL.md — Stage 19.6 product review"),
    useCase: proposed("Holding a set gap between parts on an 8 mm shaft or rod; it does not clamp the shaft.", "CATALOG_APPROVAL.md — Stage 19.6 product review"),
    pricingModel: proposed("FIXED", "Catalog price derived from the quote engine; see priceBasis"),
    copy: proposed("Description, applications and stated limitation as published", "Written in Stage 19.5 from measured model facts; limitation stated from the model"),
    weightGrams: missing("Not measured on a produced part, and no material density is recorded to derive it."),
    visual: {
      required: proposed("APPROVED_RENDER", "A render can be produced from the verified model before parts are photographed"),
      renderSpecification: proposed(
        "Rendered from hex-shaft-spacer.stl showing the hexagonal body and plain 8 mm bore; marked as a render.",
        "Stage 19.7 render policy: a render must show the actual model, and is labelled as a render",
      ),
      owner: "Content / design",
    },
    featured: missing("No homepage feature decision has been made."),
  },
  product: {
    id: "p-103",
    slug: "hex-shaft-spacer",
    name: "Hex Shaft Spacer, 8 mm Bore",
    summary: "Hexagonal spacer, 8 mm bore, 34 mm long.",
    category: "spacers",
    browseCategory: "mechanical",
    material: "petg",
    materials: ["petg"],
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
      "A hexagonal spacer with a plain 8 mm through-bore, printed in PETG, for holding a set distance between parts on an 8 mm shaft or rod. It has no set-screw seat, so it locates between the parts either side of it rather than clamping the shaft.",
    applications: ["Shaft and rod spacing", "Prototype mechanisms"],
    qualityOptions: [{ value: "standard", label: "Standard", layerHeight: "0.20 MM" }],
    specifications: [
      { label: "Print technology", value: "FDM" },
      { label: "Layer height", value: "0.20 MM" },
      { label: "Length", value: "34 MM" },
      { label: "Across flats", value: "19.05 MM" },
      { label: "Across corners", value: "22 MM" },
      { label: "Bore", value: "8 MM" },
    ],
  },
};
