import {
  CATALOG_ENTRIES,
  LAUNCH_POLICY,
  LIMITATIONS,
  MANUFACTURING_CAPABILITY,
  MANUFACTURING_TECHNOLOGIES,
  MATERIAL_CAPABILITIES,
  missingLaunchLimitations,
  processesAndMaterialsApproved as processesAndMaterialsApprovedFn,
  type BusinessApproval,
  type CatalogEntry,
} from "@/content/catalog";
import { assessCommercial, type CommercialAssessment } from "@/lib/catalog/commerce";
import { assessLaunch, type LaunchAssessment, type LaunchOptions } from "@/lib/catalog/launch";
import type { Product } from "@/lib/catalog/types";

/**
 * Launch readiness of a published catalog.
 *
 * ── Separate verdicts, because different people fix them ─────────────────
 *
 *   TECHNICAL       PASS / BLOCKING      a developer fixes a record
 *   COMMERCIAL      decisions approved   the business decides
 *   MANUFACTURING   capability approved  production signs off
 *   MEDIA           approved visuals     content supplies them
 *   CATALOG SIZE    defined vs target    the business defines products
 *   PRICING         approved / not       finance approves
 *   FEATURED        eligible / blocked   follows from all of the above
 *   LAUNCH          READY / NOT READY    only when every one holds
 *
 * ENGINEERING COMPLETE ≠ BUSINESS APPROVED ≠ LAUNCH READY. Per product, the
 * reasons come from `lib/catalog/launch.ts` — the same reasons the admin shows.
 *
 * ── Per product ──────────────────────────────────────────────────────────
 *
 *   REAL         technically valid and launch-ready
 *   PROVISIONAL  technically valid, not launch-ready
 *   BLOCKING     technically invalid — must not be published
 *
 * It reports; it does not hide. Visibility is decided by the catalog mode.
 */

export type Readiness = "real" | "provisional" | "blocking";

export interface ReadinessFinding {
  id: string;
  slug: string;
  readiness: Readiness;
  technical: string[];
  commercial: CommercialAssessment;
  launch: LaunchAssessment;
  /** Every reason, technical first, each one actionable. */
  reasons: string[];
}

export function canonicalEntries(
  entries: readonly CatalogEntry[] = CATALOG_ENTRIES,
): ReadonlyMap<string, CatalogEntry> {
  return new Map(entries.map((entry) => [entry.product.id, entry]));
}

export function assessProduct(
  product: Product,
  canonical: ReadonlyMap<string, CatalogEntry> = canonicalEntries(),
  options: LaunchOptions = {},
): ReadinessFinding {
  const launch = assessLaunch(canonical.get(product.id), product, options);
  const technical = launch.technical.reasons.map((reason) => reason.replace(/^Technical: /, ""));

  return {
    id: product.id,
    slug: product.slug,
    readiness: technical.length > 0 ? "blocking" : launch.launch.ready ? "real" : "provisional",
    technical,
    commercial: assessCommercial(product),
    launch,
    reasons: launch.launch.reasons,
  };
}

export interface LaunchReport {
  findings: ReadinessFinding[];
  counts: Record<Readiness, number>;
  technical: { pass: boolean; blocking: number };
  commercial: {
    approvedProducts: number;
    unapprovedProducts: number;
    approvedPrices: number;
    provisionalPrices: number;
    completeDefinitions: number;
  };
  pricing: { approved: number; provisional: number; quoteOnly: number; missing: number };
  media: { complete: number; missing: number };
  manufacturing: BusinessApproval & {
    technologies: { approved: number; total: number };
    materials: { approved: number; total: number };
    limitations: { stated: number; total: number; missingForLaunch: string[] };
  };
  catalog: {
    target: number;
    targetApproved: boolean;
    defined: number;
    published: number;
    launchReady: number;
    gap: number;
  };
  featured: { eligible: string[]; blocked: string[] };
  minimumApprovedProducts: number;
  launch: { ready: boolean; reasons: string[] };
  /** True when nothing published is technically blocking. */
  launchable: boolean;
}

/** Back-compat name: every caller wanted the whole report. */
export type ReadinessReport = LaunchReport;

export function auditLaunchReadiness(
  products: readonly Product[],
  entries: readonly CatalogEntry[] = CATALOG_ENTRIES,
  options: {
    manufacturing?: BusinessApproval;
    minimumApprovedProducts?: number;
    missingLimitations?: readonly string[];
    /** Whether the launch target is an approved decision. Defaults to the ledger. */
    launchTargetApproved?: boolean;
  } & LaunchOptions = {},
): LaunchReport {
  const canonical = canonicalEntries(entries);
  const findings = products.map((product) => assessProduct(product, canonical, options));
  const manufacturing = options.manufacturing ?? MANUFACTURING_CAPABILITY;
  const minimum = options.minimumApprovedProducts ?? LAUNCH_POLICY.minimumApprovedProducts;
  const missingLimitations = [...(options.missingLimitations ?? missingLaunchLimitations())];
  const processesAndMaterialsApproved = processesAndMaterialsApprovedFn();

  const counts: Record<Readiness, number> = { real: 0, provisional: 0, blocking: 0 };
  for (const finding of findings) counts[finding.readiness] += 1;

  const count = (predicate: (launch: LaunchAssessment) => boolean) =>
    findings.filter((finding) => predicate(finding.launch)).length;

  const approvedProducts = count((l) => l.approval === "APPROVED");
  const pricing = {
    approved: count((l) => l.price === "APPROVED"),
    provisional: count((l) => l.price === "PROVISIONAL"),
    quoteOnly: count((l) => l.price === "QUOTE_ONLY"),
    missing: count((l) => l.price === "MISSING"),
  };
  const mediaComplete = count((l) => l.media === "APPROVED");
  const completeDefinitions = count((l) => l.commercial === "COMPLETE");

  const catalog = {
    target: minimum,
    targetApproved: options.launchTargetApproved ?? LAUNCH_POLICY.approved,
    defined: entries.length,
    published: products.length,
    launchReady: counts.real,
    gap: Math.max(0, minimum - counts.real),
  };

  const reasons: string[] = [];
  const targetApproved = options.launchTargetApproved ?? LAUNCH_POLICY.approved;
  if (!targetApproved) {
    reasons.push(
      `Launch target not approved (PROPOSED: ${minimum} launch-ready products — the business may approve ${minimum} or a smaller launch)`,
    );
  }
  if (counts.blocking > 0) reasons.push(`${counts.blocking} published product(s) are technically blocking`);
  if (catalog.gap > 0) {
    reasons.push(
      `Catalog size: ${catalog.launchReady} launch-ready of ${catalog.target} required (${catalog.defined} defined, gap ${catalog.gap})`,
    );
  }
  if (findings.length - approvedProducts > 0) reasons.push(`${findings.length - approvedProducts} product(s) not approved`);
  if (pricing.provisional + pricing.missing > 0) {
    reasons.push(`${pricing.provisional + pricing.missing} product(s) missing an approved price`);
  }
  if (findings.length - mediaComplete > 0) reasons.push(`${findings.length - mediaComplete} product(s) missing an approved image`);
  if (findings.length - completeDefinitions > 0) {
    reasons.push(`${findings.length - completeDefinitions} product(s) with commercial decisions not approved`);
  }
  if (!processesAndMaterialsApproved && !options.manufacturing) {
    reasons.push("Manufacturing processes and materials not approved");
  }
  if (!manufacturing.approved && missingLimitations.length === 0) reasons.push("Manufacturing capability not approved");
  if (missingLimitations.length > 0) {
    reasons.push(`Manufacturing limitations not stated: ${missingLimitations.join(", ")}`);
  }

  return {
    findings,
    counts,
    technical: { pass: counts.blocking === 0, blocking: counts.blocking },
    commercial: {
      approvedProducts,
      unapprovedProducts: findings.length - approvedProducts,
      approvedPrices: pricing.approved + pricing.quoteOnly,
      provisionalPrices: pricing.provisional + pricing.missing,
      completeDefinitions,
    },
    pricing,
    media: { complete: mediaComplete, missing: findings.length - mediaComplete },
    manufacturing: {
      ...manufacturing,
      technologies: {
        approved: MANUFACTURING_TECHNOLOGIES.filter((t) => t.approval.state === "APPROVED").length,
        total: MANUFACTURING_TECHNOLOGIES.length,
      },
      materials: {
        approved: MATERIAL_CAPABILITIES.filter((m) => m.approval.state === "APPROVED").length,
        total: MATERIAL_CAPABILITIES.length,
      },
      limitations: {
        stated: LIMITATIONS.filter((l) => l.policy.state === "APPROVED" || l.policy.state === "KNOWN").length,
        total: LIMITATIONS.length,
        missingForLaunch: missingLimitations,
      },
    },
    catalog,
    featured: {
      eligible: findings.filter((f) => f.launch.featured === "ELIGIBLE").map((f) => f.id),
      blocked: findings.filter((f) => f.launch.featured === "NOT_ELIGIBLE").map((f) => f.id),
    },
    minimumApprovedProducts: minimum,
    launch: { ready: reasons.length === 0, reasons },
    launchable: counts.blocking === 0,
  };
}
