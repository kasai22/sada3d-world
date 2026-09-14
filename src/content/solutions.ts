/**
 * Solutions — what Reality 3D is actually used for.
 *
 * ── The test every entry here had to pass ────────────────────────────────
 *
 * A solutions page is where invented capability accumulates most easily,
 * because each section costs one paragraph and sounds true. So each of these
 * had to be backed by something already in the repository, and says which:
 *
 *   · CATALOG-BACKED — `browseCategory` names a browse category with published
 *     parts in it. The page counts those parts and refuses to render the
 *     section when the count is zero, so a solution cannot outlive the catalog
 *     that justifies it.
 *   · EDITORIAL — no `browseCategory`. The section is backed by the custom-print
 *     path, which is implemented end to end (upload, geometry analysis,
 *     configuration, quote). It makes no claim about catalog parts and offers
 *     only the upload action.
 *
 * `links.test.ts` resolves every category a section names, and
 * `content.test.ts` checks each one is a browse category.
 *
 * ── Content reset ────────────────────────────────────────────────────────
 *
 * The pre-reset sections pointed at categories that no longer exist —
 * prototyping, automotive, industrial, components, architecture, lifestyle.
 * Sections whose honest next step is uploading a file became editorial.
 * Sections that only made sense as a catalog (brackets and enclosures,
 * architectural models, objects for the home) went with that catalog.
 *
 * ── What was considered and left out ─────────────────────────────────────
 *
 * Medical, dental, aerospace and short-run production were all plausible
 * sections and none is written here. Each would have implied a certification,
 * a material qualification or a volume capability that nothing in this
 * repository supports, and a customer arriving from one of those searches
 * deserves a page that does not exist rather than one that overpromises.
 */

import type { InformationalPage, Publishable } from "./pages";

export interface Solution extends Publishable {
  /** Anchor id, and the value the page's own index links to. */
  value: string;
  name: string;
  /** The customer's problem, in their words. One sentence. */
  problem: string;
  /** How Reality 3D answers it. Two sentences at most. */
  answer: string;
  /** Concretely, the kind of part this covers. */
  suitableParts: readonly string[];
  /**
   * The browse category this solution sends people to, when it is
   * catalog-backed.
   *
   * Must be a value in `BROWSE_CATEGORIES`. A section whose category has no
   * published parts is not rendered — see the page. Absent means the solution
   * is editorial and served by custom print alone.
   */
  browseCategory?: string;
  /**
   * Whether the honest next step is browsing or uploading.
   *
   * Not both-and: a page where every section offers the same two buttons has
   * decided nothing for the reader. An editorial solution is always "custom".
   */
  primaryAction: "browse" | "custom";
}

export const SOLUTIONS: readonly Solution[] = [
  {
    value: "mechanism-models",
    status: "published",
    name: "Mechanism models",
    problem:
      "You need to see how a mechanism is arranged, or show somebody else, before the design is settled.",
    answer:
      "Gears, a planetary gear set and shaft spacers are in the catalog, made when ordered. Each page states what the part is for and what it is not — the gear teeth are not involute, so these suit models and mock-ups rather than drives.",
    suitableParts: ["Spur gears", "Planetary gear sets", "Shaft and rod spacers"],
    browseCategory: "mechanical",
    primaryAction: "browse",
  },
  {
    value: "prototyping",
    status: "published",
    name: "Prototyping",
    problem:
      "You need to hold the design before you commit to tooling, and you need the next version next week.",
    answer:
      "Upload the model and have the part made as it is, one at a time, as many times as the design changes. The quote comes from your configuration before you order.",
    suitableParts: [
      "Form studies",
      "Fit checks between mating parts",
      "Assembly mock-ups before a tooling commitment",
    ],
    primaryAction: "custom",
  },
  {
    value: "replacement-parts",
    status: "published",
    name: "Replacement parts",
    problem:
      "A small plastic part has broken, the assembly around it is fine, and nobody sells the part on its own any more.",
    answer:
      "If you have a model of the part, it can be made one at a time in the material the job needs. The materials page sets out what each material suits and what to avoid.",
    suitableParts: ["Clips and covers", "Brackets and mounts", "Knobs, caps and trim pieces"],
    primaryAction: "custom",
  },
  {
    value: "fixtures-and-jigs",
    status: "published",
    name: "Fixtures and jigs",
    problem:
      "A repeated operation is only as accurate as whatever holds the work, and no off-the-shelf fixture fits your part.",
    answer:
      "Jigs and fixtures made from your own model, to the job rather than adapted to it. Whether a fixture holds your part well enough is something to confirm against the geometry before ordering.",
    suitableParts: ["Drill and assembly guides", "Holding fixtures", "Locating nests"],
    primaryAction: "custom",
  },
];

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export const SOLUTIONS_PAGE: InformationalPage = {
  slug: "solutions",
  status: "published",
  seo: {
    title: "Solutions",
    description:
      "Mechanism models, prototyping, replacement parts, fixtures and jigs. What Reality 3D is used for, and where to start.",
    path: "/solutions",
    index: true,
  },
  intro: {
    eyebrow: "Solutions",
    title: "What people have us make.",
    lead: "Every part below starts in one of two places: a design already in the catalog, or a file you send us. Find the situation that matches yours and the page will tell you which one it is.",
  },
};

/**
 * The closing note.
 *
 * Present because the sections are a description of current demand, not a
 * boundary. Saying so is more useful than adding a section called "Other", and
 * considerably more honest than implying the list is exhaustive.
 */
export const SOLUTIONS_NOTE =
  "This is what Reality 3D is asked for most, not the limit of what can be made. If your part is not described here, send the model — the quote is based on the geometry, not on the category it belongs to.";
