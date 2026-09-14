import { launchTargetDecision } from "./decisions";
import { manufacturingApproved } from "./manufacturing";

/**
 * Business approvals that sit above any single product.
 *
 * ── Why these are recorded, not assumed ──────────────────────────────────
 *
 * A product can be perfectly described and still not be sellable, because what
 * it depends on has not been signed off: the materials and qualities the
 * configurator offers, and the rules its price comes from. Stage 19.6 makes
 * those approvals explicit so launch readiness can say *which* decision is
 * missing instead of implying that a clean validator means a real business.
 *
 * Every entry here is set by a person at Reality 3D, with a reference to where the
 * decision was made. None has been. Changing `approved` to true without a
 * reference is refused by `catalog.test.ts`.
 */

export interface BusinessApproval {
  approved: boolean;
  /** Where the decision is recorded — a signed quote sheet, a meeting note. */
  reference: string | null;
  /** What exactly is (or is not) approved. */
  scope: string;
}

/**
 * The manufacturing offering: materials, colours, qualities and finishes.
 *
 * `lib/custom-print/options.ts` states in its own header that these are "the
 * choices the interface offers, not a statement of verified manufacturing
 * capability", to be confirmed against real machine and process capability
 * before launch. Until that confirmation exists, no product can be launchable,
 * whatever its own approval says.
 *
 * Stage 19.7: derived from the manufacturing capability specification
 * (`manufacturing.ts`) rather than set here, so there is one record of what is
 * approved. It is approved only when every offered process and material is.
 */
export const MANUFACTURING_CAPABILITY: BusinessApproval = {
  approved: manufacturingApproved(),
  reference: manufacturingApproved() ? "src/content/catalog/manufacturing.ts" : null,
  scope:
    "PLA, PETG, ABS and TPU on FDM and resin on SLA; the colours in MATERIAL_OPTIONS; the three FDM layer heights; the three finishes.",
};

/**
 * The pricing rules (`lib/pricing/rules.ts`, version demo-2026-01).
 *
 * Informational for catalog products — a catalog product becomes commercially
 * priced through its own price approval record, not through these rules — but
 * it is what custom-print quotes are charged by, and it is not approved.
 */
export const PRICING_RULES_APPROVAL: BusinessApproval = {
  approved: false,
  reference: null,
  scope: "Setup fee, base unit cost, material and quality factors, finish fees, minimum order (rules demo-2026-01).",
};

/**
 * What "enough products to launch" means.
 *
 * Twelve is the lower end of the 12–20 launch catalog set in the Stage 19.6
 * brief. It is a business target, not a technical limit: a smaller launch is a
 * legitimate decision, and making it is changing this number with a reference.
 */
const TARGET = launchTargetDecision();

/**
 * Stage 19.8: the launch target is an explicit business decision. With no
 * `launch-target` decision in the ledger the 12-product figure from the Stage
 * 19.6 brief stands as PROPOSED, and launch readiness reports the target itself
 * as unapproved. The business may approve 12 or explicitly approve a smaller
 * launch; either is a ledger record.
 */
export const LAUNCH_POLICY = {
  minimumApprovedProducts: TARGET?.value ?? 12,
  approved: TARGET !== undefined,
  reference: TARGET
    ? `${TARGET.record.approval.reference} [${TARGET.record.id}]`
    : "Stage 19.6 brief: curated launch catalog, target 12–20 products. PROPOSED — no launch-target decision recorded.",
} as const;
