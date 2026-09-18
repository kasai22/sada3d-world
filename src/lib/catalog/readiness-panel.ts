import type { LaunchStage } from "@/payload/workflow";

import type { LaunchAssessment } from "./launch";

/**
 * The product readiness panel (Stage 20) — the admin's Launch status view.
 *
 * Every launch reason is filed under the section an administrator fixes it in,
 * with a pointer to the admin tab or collection that holds the value. The
 * pointers name places that exist in the admin; they are not links, because a
 * Payload edit-view tab has no URL.
 *
 * Pure: input is the assessment the release gate uses.
 */

export type PanelSection =
  | "TECHNICAL"
  | "MANUFACTURING"
  | "COMMERCIAL"
  | "PRICE"
  | "MEDIA"
  | "PRODUCT APPROVAL"
  | "PUBLICATION";

const ACTIONS: Record<PanelSection, string> = {
  TECHNICAL: "Basic information, Category, Dimensions, Media and 3D model tabs",
  MANUFACTURING: "Manufacturing and Material tabs (capability itself is approved in the business decision ledger, not per product)",
  COMMERCIAL: "Basic information (SKU), Application and Pricing tabs, then Approval tab → Commercial approval",
  PRICE: "Pricing tab, and Catalog › Price approvals (append-only)",
  MEDIA: "Media tab → Visual, then its Media approval",
  "PRODUCT APPROVAL": "Approval tab (refused until every section above passes)",
  PUBLICATION: "Publish (top right of the product)",
};

export function sectionOf(reason: string): PanelSection {
  if (reason.startsWith("Technical:")) return "TECHNICAL";
  if (reason === "Not published") return "PUBLICATION";
  if (/^Product not approved/.test(reason)) return "PRODUCT APPROVAL";
  if (/^(Manufacturing|Material not approved|.* is not a supported (technology|material)|.*unsupported combination)/.test(reason)) {
    return "MANUFACTURING";
  }
  if (/approved image|media/i.test(reason)) return "MEDIA";
  if (/^(Missing approved price|Missing price status)/.test(reason)) return "PRICE";
  return "COMMERCIAL";
}

export interface PanelInput {
  assessment: Pick<LaunchAssessment, "technical" | "price" | "media" | "manufacturing" | "commercial">;
  /** Every reason, as the admin launch status lists them (including "Not published"). */
  reasons: readonly string[];
  approvalStatus: string | null | undefined;
  published: boolean;
  material: string;
  technology: string;
  stage: LaunchStage;
}

export function readinessPanel(input: PanelInput): string {
  const { assessment } = input;
  const grouped = new Map<PanelSection, string[]>();
  for (const reason of input.reasons) {
    const section = sectionOf(reason);
    grouped.set(section, [...(grouped.get(section) ?? []), reason.replace(/^Technical: /, "")]);
  }

  const passLabel: Record<PanelSection, string> = {
    TECHNICAL: "Valid",
    MANUFACTURING: `${input.technology.toUpperCase()} / ${input.material.toUpperCase()} approved`,
    COMMERCIAL: "Definition complete",
    PRICE: assessment.price === "QUOTE_ONLY" ? "Quote only — no fixed price required" : "Approved",
    MEDIA: "Approved",
    "PRODUCT APPROVAL": "Approved",
    PUBLICATION: "Published",
  };

  const lines: string[] = [];
  for (const section of Object.keys(ACTIONS) as PanelSection[]) {
    const reasons = grouped.get(section) ?? [];
    lines.push(section);
    if (reasons.length === 0) {
      lines.push(`✓ ${passLabel[section]}`);
    } else {
      for (const reason of reasons) lines.push(`✕ ${reason}`);
      lines.push(`  → ${ACTIONS[section]}`);
    }
    lines.push("");
  }
  lines.push("FINAL", input.stage);
  return lines.join("\n");
}

/** One-line summary for the product list: "TECH ✓ · MFG ✕ · COMM ✕ · PRICE ✕ · MEDIA ✕ · APPROVAL ✕". */
export function readinessLine(reasons: readonly string[]): string {
  const blocked = new Set(reasons.map(sectionOf));
  const mark = (section: PanelSection) => (blocked.has(section) ? "✕" : "✓");
  return [
    `TECH ${mark("TECHNICAL")}`,
    `MFG ${mark("MANUFACTURING")}`,
    `COMM ${mark("COMMERCIAL")}`,
    `PRICE ${mark("PRICE")}`,
    `MEDIA ${mark("MEDIA")}`,
    `APPROVAL ${mark("PRODUCT APPROVAL")}`,
  ].join(" · ");
}

export interface ReadinessSection {
  section: PanelSection;
  passed: boolean;
  /** Pass label when passed; otherwise the failing reasons. */
  lines: string[];
  /** Where it is fixed, when it fails. */
  action: string | null;
}

/**
 * The same panel as `readinessPanel`, as data (Stage 22.5), for Reality 3D
 * Admin's product workspace. `reasons` are the admin launch status reasons,
 * with or without their "• " bullets.
 */
export function readinessSections(reasons: readonly string[], quoteOnly = false): ReadinessSection[] {
  const cleaned = reasons.map((reason) => reason.replace(/^•\s*/, "").trim()).filter(Boolean);
  const grouped = new Map<PanelSection, string[]>();
  for (const reason of cleaned) {
    const section = sectionOf(reason);
    grouped.set(section, [...(grouped.get(section) ?? []), reason.replace(/^Technical: /, "")]);
  }
  const passLabel: Record<PanelSection, string> = {
    TECHNICAL: "Valid",
    MANUFACTURING: "Approved",
    COMMERCIAL: "Definition complete",
    PRICE: quoteOnly ? "Quote only — no fixed price required" : "Approved",
    MEDIA: "Approved",
    "PRODUCT APPROVAL": "Approved",
    PUBLICATION: "Published",
  };
  return (Object.keys(ACTIONS) as PanelSection[]).map((section) => {
    const failing = grouped.get(section) ?? [];
    return failing.length === 0
      ? { section, passed: true, lines: [passLabel[section]], action: null }
      : { section, passed: false, lines: failing, action: ACTIONS[section] };
  });
}
