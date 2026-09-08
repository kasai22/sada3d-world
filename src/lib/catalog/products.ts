import type { Product } from "./types";

/**
 * Local catalog.
 *
 * Mock data, deliberately kept in one place behind queryCatalog so Phase 14 can
 * replace this module with Payload without touching a component. This is not
 * Payload data and is not presented as such.
 *
 * Prices are whole rupees. No product carries an image yet — cards fall back to
 * the design system's placeholder stage until R2 lands in Phase 16.
 */
export const PRODUCTS: readonly Product[] = [
  // ---- mechanical ----
  {
    id: "p-001", slug: "precision-gear", name: "Precision Gear",
    summary: "Spur gear, 24 teeth, 6 mm bore.",
    category: "gears", browseCategory: "mechanical",
    material: "pla", technology: "fdm", color: "black",
    price: 399, currency: "INR", availability: "in-stock", badge: "In stock",
    model: { url: "/models/precision-gear.stl", format: "stl" },
    description:
      "A 24-tooth spur gear for prototyping and light-duty mechanical assemblies. The bore is sized for a 6 mm shaft with a clearance fit.",
    applications: ["Prototyping", "Mechanical assemblies", "Educational models"],
    materials: ["pla", "petg", "abs"],
    colors: ["black", "white", "graphite", "orange"],
    qualityOptions: [
      { value: "standard", label: "Standard", layerHeight: "0.20 MM" },
      { value: "precision", label: "Precision", layerHeight: "0.16 MM" },
      { value: "high-detail", label: "High detail", layerHeight: "0.12 MM" },
    ],
    specifications: [
      { label: "Print technology", value: "FDM" },
      { label: "Layer height", value: "0.16 MM" },
      { label: "Infill", value: "20%" },
      { label: "Dimensions", value: "48 × 48 × 8 MM" },
      { label: "Bore", value: "6 MM" },
      { label: "Teeth", value: "24" },
      { label: "Est. print time", value: "01:12:00" },
      { label: "Weight", value: "34 G" },
    ],
    materialNotes: ["Dimensionally stable", "Matte finish", "Low moisture absorption"],
  },
  {
    id: "p-002", slug: "planetary-carrier", name: "Planetary Carrier",
    summary: "Three-pinion carrier for compact gearboxes.",
    category: "gears", browseCategory: "mechanical",
    material: "pla", technology: "fdm", color: "orange",
    price: 520, currency: "INR", availability: "in-stock",
    // A six-part assembly, so the viewer offers the exploded view. The parts
    // are the ones the model file declares; nothing is inferred.
    model: { url: "/models/planetary-carrier.glb", format: "glb" },
    description:
      "A three-pinion carrier for compact planetary gearboxes. Supplied as separate parts for assembly.",
    applications: ["Gearbox prototyping", "Mechanical assemblies"],
    materials: ["pla", "petg", "abs"],
    colors: ["orange", "black", "graphite"],
  },
  { id: "p-003", slug: "helical-pinion", name: "Helical Pinion", summary: "Quiet-running pinion, 20 degree helix.", category: "gears", browseCategory: "mechanical", material: "petg", technology: "fdm", color: "graphite", price: 610, currency: "INR", availability: "made-to-order" },
  { id: "p-004", slug: "torque-wrench-handle", name: "Torque Wrench Handle", summary: "Replacement grip for a 3/8 inch drive.", category: "tools", browseCategory: "mechanical", material: "abs", technology: "fdm", color: "black", price: 480, currency: "INR", availability: "in-stock" },
  { id: "p-005", slug: "hex-key-organiser", name: "Hex Key Organiser", summary: "Holds nine keys, 1.5 to 10 mm.", category: "tools", browseCategory: "mechanical", material: "pla", technology: "fdm", color: "titanium", price: 240, currency: "INR", availability: "in-stock" },
  { id: "p-006", slug: "thrust-bearing-cage", name: "Thrust Bearing Cage", summary: "Retains 12 balls, 30 mm race.", category: "bearings", browseCategory: "mechanical", material: "petg", technology: "fdm", color: "grey", price: 340, currency: "INR", availability: "in-stock" },
  { id: "p-007", slug: "linear-bearing-block", name: "Linear Bearing Block", summary: "Mount for a 12 mm supported rail.", category: "bearings", browseCategory: "mechanical", material: "abs", technology: "fdm", color: "black", price: 720, currency: "INR", availability: "made-to-order" },

  // ---- automotive ----
  { id: "p-008", slug: "dash-vent-clip", name: "Dash Vent Clip", summary: "Blade clip for round and slat vents.", category: "interior", browseCategory: "automotive", material: "tpu", technology: "fdm", color: "black", price: 180, currency: "INR", availability: "in-stock" },
  { id: "p-009", slug: "console-cup-insert", name: "Console Cup Insert", summary: "Reduces a 90 mm holder to 66 mm.", category: "interior", browseCategory: "automotive", material: "tpu", technology: "fdm", color: "black", price: 260, currency: "INR", availability: "in-stock" },
  { id: "p-010", slug: "mirror-base-cover", name: "Mirror Base Cover", summary: "Weather cover for a folding mirror base.", category: "exterior", browseCategory: "automotive", material: "abs", technology: "fdm", color: "black", price: 540, currency: "INR", availability: "made-to-order" },
  { id: "p-011", slug: "number-plate-frame", name: "Number Plate Frame", summary: "Single-row frame, 305 x 105 mm.", category: "exterior", browseCategory: "automotive", material: "petg", technology: "fdm", color: "graphite", price: 420, currency: "INR", availability: "in-stock" },
  { id: "p-012", slug: "coolant-hose-clamp", name: "Coolant Hose Clamp", summary: "Two-piece clamp for 19 mm hose.", category: "engine-bay", browseCategory: "automotive", material: "petg", technology: "fdm", color: "blue", price: 310, currency: "INR", availability: "in-stock", badge: "New" },
  { id: "p-013", slug: "sensor-loom-guide", name: "Sensor Loom Guide", summary: "Routes four looms away from heat.", category: "engine-bay", browseCategory: "automotive", material: "abs", technology: "fdm", color: "black", price: 380, currency: "INR", availability: "made-to-order" },

  // ---- industrial ----
  {
    id: "p-014", slug: "drill-alignment-jig", name: "Drill Alignment Jig",
    summary: "Holds 90 degrees to a flat face.",
    category: "jigs", browseCategory: "industrial",
    material: "abs", technology: "fdm", color: "titanium",
    price: 860, currency: "INR", availability: "in-stock",
    description:
      "Guides a hand drill square to a flat face. Sized for 4, 6 and 8 mm bits.",
    applications: ["Workshop tooling", "Assembly", "Repair"],
    // No specifications recorded for this part yet, so the page omits that
    // section rather than filling it in.
  },
  { id: "p-015", slug: "weld-positioning-jig", name: "Weld Positioning Jig", summary: "Sets a repeatable 45 degree joint.", category: "jigs", browseCategory: "industrial", material: "petg", technology: "fdm", color: "graphite", price: 1180, currency: "INR", availability: "made-to-order" },
  {
    id: "p-016", slug: "inspection-fixture", name: "Inspection Fixture",
    summary: "Datum fixture for repeat gauging.",
    category: "fixtures", browseCategory: "industrial",
    material: "resin", technology: "sla", color: "grey",
    price: 2680, currency: "INR", availability: "made-to-order", badge: "SLA",
    description:
      "A three-datum fixture for repeat dimensional checks. Printed in SLA resin for surface finish and feature resolution.",
    applications: ["Dimensional inspection", "Quality control", "Short-run gauging"],
    materials: ["resin"],
    colors: ["grey"],
    specifications: [
      { label: "Print technology", value: "SLA" },
      { label: "Layer height", value: "0.05 MM" },
      { label: "Dimensions", value: "120 × 90 × 45 MM" },
      { label: "Est. print time", value: "08:20:00" },
      { label: "Weight", value: "164 G" },
    ],
    materialNotes: ["High resolution", "Smooth surface", "Rigid"],
  },
  { id: "p-017", slug: "vacuum-work-holder", name: "Vacuum Work Holder", summary: "Holds thin sheet during machining.", category: "fixtures", browseCategory: "industrial", material: "abs", technology: "fdm", color: "black", price: 1420, currency: "INR", availability: "in-stock" },
  { id: "p-018", slug: "press-tool-insert", name: "Press Tool Insert", summary: "Sacrificial insert for a 10 t press.", category: "tooling", browseCategory: "industrial", material: "resin", technology: "sls", color: "grey", price: 3240, currency: "INR", availability: "made-to-order" },
  { id: "p-019", slug: "forming-die-blank", name: "Forming Die Blank", summary: "Machinable blank, 80 x 80 x 40 mm.", category: "tooling", browseCategory: "industrial", material: "abs", technology: "fdm", color: "titanium", price: 1960, currency: "INR", availability: "made-to-order" },

  // ---- components ----
  {
    id: "p-020", slug: "cable-bracket", name: "Cable Bracket",
    summary: "Wall bracket for 8 mm loom.",
    category: "brackets", browseCategory: "components",
    material: "petg", technology: "fdm", color: "graphite",
    price: 249, currency: "INR", availability: "in-stock",
    model: { url: "/models/cable-bracket.stl", format: "stl" },
    description:
      "A single-screw bracket that retains an 8 mm loom against a flat surface.",
    applications: ["Cable management", "Workshop fit-out"],
    materials: ["petg", "pla"],
    colors: ["graphite", "black", "white"],
    specifications: [
      { label: "Print technology", value: "FDM" },
      { label: "Layer height", value: "0.20 MM" },
      { label: "Dimensions", value: "34 × 22 × 14 MM" },
      { label: "Weight", value: "21 G" },
    ],
  },
  { id: "p-021", slug: "angle-mount-bracket", name: "Angle Mount Bracket", summary: "30 degree mount, four M4 holes.", category: "brackets", browseCategory: "components", material: "pla", technology: "fdm", color: "white", price: 220, currency: "INR", availability: "in-stock" },
  {
    id: "p-022", slug: "sensor-enclosure", name: "Sensor Enclosure",
    summary: "Sealed housing, 60 x 40 x 25 mm.",
    category: "housings", browseCategory: "components",
    material: "abs", technology: "fdm", color: "black",
    price: 760, currency: "INR", availability: "in-stock",
    description:
      "A two-part housing for board-level sensors, with a lidded seam and four M3 mounting bosses.",
    applications: ["Sensor housings", "Electronics enclosures", "Field instruments"],
    materials: ["abs", "petg"],
    colors: ["black", "graphite"],
    qualityOptions: [
      { value: "standard", label: "Standard", layerHeight: "0.20 MM" },
      { value: "precision", label: "Precision", layerHeight: "0.16 MM" },
    ],
    specifications: [
      { label: "Print technology", value: "FDM" },
      { label: "Layer height", value: "0.20 MM" },
      { label: "Infill", value: "30%" },
      { label: "Dimensions", value: "60 × 40 × 25 MM" },
      { label: "Wall thickness", value: "2.4 MM" },
      { label: "Est. print time", value: "03:48:00" },
      { label: "Weight", value: "88 G" },
    ],
    materialNotes: ["Impact resistant", "Machinable", "Vapour-smoothable"],
  },
  { id: "p-023", slug: "manifold-housing", name: "Manifold Housing", summary: "Four-port housing with M5 bosses.", category: "housings", browseCategory: "components", material: "petg", technology: "fdm", color: "graphite", price: 890, currency: "INR", availability: "in-stock" },
  {
    id: "p-024", slug: "hex-drive-coupler", name: "Hex Drive Coupler",
    summary: "6 mm hex to 8 mm shaft coupler.",
    category: "couplers", browseCategory: "components",
    material: "abs", technology: "fdm", color: "titanium",
    price: 640, currency: "INR", availability: "in-stock", badge: "New",
    model: { url: "/models/hex-drive-coupler.stl", format: "stl" },
    description:
      "Adapts a 6 mm hex drive to an 8 mm round shaft, with a grub-screw seat on the round side.",
    applications: ["Drive trains", "Tool adapters"],
    materials: ["abs", "petg"],
    colors: ["titanium", "black"],
    qualityOptions: [
      { value: "precision", label: "Precision", layerHeight: "0.16 MM" },
      { value: "high-detail", label: "High detail", layerHeight: "0.12 MM" },
    ],
    specifications: [
      { label: "Print technology", value: "FDM" },
      { label: "Layer height", value: "0.12 MM" },
      { label: "Infill", value: "40%" },
      { label: "Dimensions", value: "22 × 22 × 34 MM" },
      { label: "Weight", value: "58 G" },
    ],
  },
  {
    id: "p-025", slug: "flexible-shaft-coupler", name: "Flexible Shaft Coupler",
    summary: "Absorbs 2 degrees of misalignment.",
    category: "couplers", browseCategory: "components",
    material: "tpu", technology: "fdm", color: "orange",
    price: 460, currency: "INR", availability: "in-stock",
    description:
      "A helical-cut coupler in TPU. The flexure takes angular misalignment between two shafts without transmitting it to the bearing.",
    applications: ["Drive couplings", "Vibration isolation"],
    // Single material and colour, so the page presents both as metadata rather
    // than as a choice the customer does not actually have.
    materials: ["tpu"],
    colors: ["orange"],
    specifications: [
      { label: "Print technology", value: "FDM" },
      { label: "Layer height", value: "0.20 MM" },
      { label: "Shore hardness", value: "95A" },
      { label: "Dimensions", value: "25 × 25 × 30 MM" },
      { label: "Bore", value: "5 MM" },
      { label: "Weight", value: "12 G" },
    ],
    materialNotes: ["Elastomeric", "Abrasion resistant"],
  },
  { id: "p-026", slug: "captive-nut-plate", name: "Captive Nut Plate", summary: "Holds six M3 nuts against rotation.", category: "fasteners", browseCategory: "components", material: "pla", technology: "fdm", color: "black", price: 150, currency: "INR", availability: "in-stock" },
  { id: "p-027", slug: "knurled-thumb-screw", name: "Knurled Thumb Screw", summary: "M6 x 20, printed thread.", category: "fasteners", browseCategory: "components", material: "petg", technology: "fdm", color: "white", price: 120, currency: "INR", availability: "in-stock" },

  // ---- lifestyle ----
  { id: "p-028", slug: "faceted-planter", name: "Faceted Planter", summary: "120 mm planter with drainage tray.", category: "decor", browseCategory: "lifestyle", material: "pla", technology: "fdm", color: "white", price: 680, currency: "INR", availability: "in-stock" },
  { id: "p-029", slug: "louvre-wall-light", name: "Louvre Wall Light", summary: "Diffuser shade for an E14 fitting.", category: "decor", browseCategory: "lifestyle", material: "resin", technology: "sla", color: "grey", price: 1540, currency: "INR", availability: "made-to-order", badge: "SLA" },
  { id: "p-030", slug: "desk-cable-tray", name: "Desk Cable Tray", summary: "Under-desk tray, 300 mm span.", category: "organization", browseCategory: "lifestyle", material: "petg", technology: "fdm", color: "black", price: 590, currency: "INR", availability: "in-stock" },
  { id: "p-031", slug: "modular-drawer-divider", name: "Modular Drawer Divider", summary: "Interlocking dividers, 50 mm pitch.", category: "organization", browseCategory: "lifestyle", material: "pla", technology: "fdm", color: "graphite", price: 330, currency: "INR", availability: "in-stock" },

  // ---- architecture ----
  { id: "p-032", slug: "massing-model-block", name: "Massing Model Block", summary: "1:500 massing block, 40 mm tall.", category: "scale-models", browseCategory: "architecture", material: "resin", technology: "sla", color: "white", price: 2240, currency: "INR", availability: "made-to-order" },
  { id: "p-033", slug: "louvre-facade-panel", name: "Louvre Facade Panel", summary: "1:20 facade study, 150 mm square.", category: "facade-studies", browseCategory: "architecture", material: "resin", technology: "sla", color: "grey", price: 2860, currency: "INR", availability: "made-to-order" },

  // ---- prototyping ----
  { id: "p-034", slug: "ergonomic-grip-blank", name: "Ergonomic Grip Blank", summary: "Sandable blank for hand studies.", category: "form-studies", browseCategory: "prototyping", material: "pla", technology: "fdm", color: "white", price: 410, currency: "INR", availability: "in-stock" },
  { id: "p-035", slug: "tolerance-test-block", name: "Tolerance Test Block", summary: "Checks fit from 0.1 to 0.5 mm.", category: "fit-checks", browseCategory: "prototyping", material: "pla", technology: "fdm", color: "orange", price: 190, currency: "INR", availability: "in-stock", badge: "New" },

  // ---- custom ----
  {
    id: "p-036", slug: "custom-part-from-model", name: "Custom Part From Model",
    summary: "Your geometry, quoted from the file.",
    category: "custom-products", browseCategory: "custom-products",
    material: "pla", technology: "fdm", color: "black",
    // Price 0 marks this quote-only: there is no catalog price because the part
    // does not exist until a model is uploaded.
    price: 0, currency: "INR", availability: "made-to-order",
    description:
      "Upload a model and we quote it from your geometry. Material, quality and finish are chosen during configuration.",
    materials: ["pla", "petg", "abs", "tpu", "resin"],
  },
];
