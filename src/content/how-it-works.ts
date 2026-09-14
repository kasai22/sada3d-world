/**
 * The process, as the software actually performs it.
 *
 * ── Why every stage names who acts ───────────────────────────────────────
 *
 * "Upload, configure, manufacture, deliver" is true and tells a customer
 * almost nothing, because it hides the only question they are really asking:
 * *what happens without me, and what is waiting on me?*
 *
 * So each stage carries an `actor`, and the actor is load-bearing rather than
 * decorative. It is what stops the page implying automation that does not
 * exist. Geometry analysis is automatic and is marked SYSTEM. Manufacturing is
 * not: nothing in this product decides on its own that a part can be made, and
 * a page that drew an unbroken automated line from upload to machine would be
 * describing a factory nobody has built.
 *
 * ── What each stage is checked against ───────────────────────────────────
 *
 * Every stage below corresponds to something implemented:
 *
 *   01  /shop and /custom-print, both routed
 *   02  lib/geometry/analyze and /api/models/analyze
 *   03  lib/custom-print STEPS — material, quality, finish
 *   04  lib/pricing and /api/quotes, provisional and labelled so
 *   05  lib/cart and lib/checkout, /cart and /checkout
 *   06  lib/manufacturing — the job state machine
 *   07  the quality_check state in that machine
 *   08  lib/orders shipments, and /orders for tracking
 *
 * A ninth stage was considered and is not here. There is no returns or
 * warranty process in the repository, so there is nothing to describe.
 */

import { ROUTES } from "@/lib/routes";

import type { InformationalPage, Publishable } from "./pages";

/**
 * Who does the thing.
 *
 * Four values, and the distinction between the last two matters most: `sada` is
 * a person at Reality 3D doing work, `system` is software doing it unattended.
 * Collapsing them would be the exact overstatement this page exists to avoid.
 */
export type StageActor = "customer" | "system" | "sada";

export const ACTOR_LABEL: Record<StageActor, string> = {
  customer: "You",
  system: "Automated",
  sada: "Reality 3D",
};

export interface ProcessStage extends Publishable {
  /** Anchor id. */
  value: string;
  index: string;
  name: string;
  actor: StageActor;
  /** What happens, in one or two sentences. */
  summary: string;
  /** The specifics. Each must be something the product actually does. */
  detail: readonly string[];
  /**
   * Stated where a stage has a limit a customer would otherwise discover late.
   *
   * Optional because most stages have none. Where one exists it is on the page,
   * not in a footnote: a customer who finds out at checkout is a customer who
   * was told too late.
   */
  caveat?: string;
  /** Where this stage is actually performed, when it is a page. */
  href?: string;
}

export const PROCESS_STAGES: readonly ProcessStage[] = [
  {
    value: "choose-or-upload",
    status: "published",
    index: "01",
    name: "Choose or upload",
    actor: "customer",
    summary:
      "Start from a part in the catalog, or send a model of your own. Everything after this point is the same either way.",
    detail: [
      "Browse the shop for a design that already exists.",
      "Or upload a model in STL, 3MF, OBJ or STEP.",
    ],
    href: ROUTES.customPrint,
  },
  {
    value: "validate",
    status: "published",
    index: "02",
    name: "Validate and analyse",
    actor: "system",
    summary:
      "An uploaded file is read and measured as soon as it arrives. Nothing waits for a person at this stage.",
    detail: [
      "The file is checked for structure before anything else is done with it.",
      "Bounding box, dimensions and mesh topology are measured from the geometry.",
      "Units are resolved from the file, and flagged rather than guessed when the file does not declare them.",
    ],
    caveat:
      "STEP files are accepted and stored, but are not analysed automatically — only STL, 3MF and OBJ are measurable today, and a STEP part is reviewed by hand.",
  },
  {
    value: "configure",
    status: "published",
    index: "03",
    name: "Configure",
    actor: "customer",
    summary:
      "Choose the material, the layer height and the finish. Each choice changes the part, and the page says how before you pick.",
    detail: [
      "Material, from the five offered.",
      "Layer height, trading surface detail against time on the machine.",
      "Finish, applied after the part comes off the machine.",
    ],
    href: ROUTES.materials,
  },
  {
    value: "quote",
    status: "published",
    index: "04",
    name: "Quote",
    actor: "system",
    summary:
      "The configuration is priced and the figure is shown with its workings, including what it does not yet cover.",
    detail: [
      "Setup, material, quality and finish are itemised rather than rolled into one number.",
      "Shipping and taxes are excluded and are stated as excluded.",
    ],
    caveat:
      "Quotes are calculated from provisional pricing rules and are labelled provisional wherever they appear. They are not a commercial offer, and the figure is confirmed before an order is manufactured.",
  },
  {
    value: "order",
    status: "published",
    index: "05",
    name: "Order",
    actor: "customer",
    summary:
      "Add the part to your cart, give a delivery address, and place the order. You get a reference you can track with, with or without an account.",
    detail: [
      "Catalog parts and custom parts go in the same cart.",
      "An order reference is issued on placement and is enough to track the order on its own.",
    ],
    caveat:
      "Online card payment is not live yet. Orders are placed and recorded, and are marked provisional until payment is settled directly.",
    href: ROUTES.cart,
  },
  {
    value: "manufacture",
    status: "published",
    index: "06",
    name: "Manufacture",
    actor: "sada",
    summary:
      "The part is reviewed for manufacturability, prepared and printed. A person makes each of those decisions.",
    detail: [
      "The design is checked against what the process can actually produce.",
      "The build file and the material are prepared for the machine.",
      "The part is printed, and finishing work is done off the machine.",
    ],
  },
  {
    value: "quality",
    status: "published",
    index: "07",
    name: "Quality check",
    actor: "sada",
    summary:
      "Every part is inspected before it is packed. A part that does not pass goes back into production rather than into a box.",
    detail: [
      "Inspection is a stage of the job, not an optional step at the end.",
      "A failed inspection returns the part to production, and the order tracking shows it.",
    ],
  },
  {
    value: "ship",
    status: "published",
    index: "08",
    name: "Pack and ship",
    actor: "sada",
    summary:
      "Approved parts are packed and dispatched. Progress is visible against the order the whole way.",
    detail: [
      "An order with several parts can ship in more than one parcel.",
      "Carrier and tracking details appear against the order once the parcel is dispatched.",
    ],
    caveat:
      "Tracking details are shown only once a carrier record exists for the parcel. Nothing is estimated or filled in before then.",
    href: ROUTES.orderLookup,
  },
];

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export const HOW_IT_WORKS_PAGE: InformationalPage = {
  slug: "how-it-works",
  status: "published",
  seo: {
    title: "How it works",
    description:
      "The eight stages between a 3D model and a finished part, and who performs each one — you, the software, or Reality 3D.",
    path: "/how-it-works",
    index: true,
  },
  intro: {
    eyebrow: "Process",
    title: "How it works.",
    lead: "Eight stages between a digital model and a part in your hands. Each one below says who performs it, because the useful question is not what happens — it is what happens without you.",
  },
};
