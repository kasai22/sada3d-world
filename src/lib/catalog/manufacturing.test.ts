import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  CATALOG_ENTRIES,
  LIMITATIONS,
  MANUFACTURING_CAPABILITY,
  MANUFACTURING_TECHNOLOGIES,
  MATERIAL_CAPABILITIES,
  capabilityVerdict,
  factValue,
  manufacturingApproved,
  manufacturingStatus,
  missingLaunchLimitations,
  processesAndMaterialsApproved,
  validateFact,
  type Fact,
} from "@/content/catalog";
import { SERVICES } from "@/content/catalog/services";
import { MATERIALS } from "@/content/materials";
import { GENERATED_DOCS } from "@/lib/content/docs";
import { computeLaunchStatus } from "@/lib/content/launch-admin";
import { planProducts } from "@/lib/content/plan";
import { sameContent } from "@/lib/content/reconcile";
import {
  CONFIGURATOR_MATERIALS,
  MATERIAL_OPTIONS,
  QUALITY_OPTIONS,
  SLA_QUALITY_OPTIONS,
  qualityOptionsFor,
} from "@/lib/custom-print/options";
import { calculateQuote } from "@/lib/pricing/calculateQuote";

import { launchReadyEntry } from "./fixtures.testing";
import { PRODUCTS } from "./products";
import { validateCatalog, validateCommercialDefinition, validateProduct } from "./validation";

/**
 * Stage 19.7 — commercial catalog definition and manufacturing sign-off.
 */

/* ------------------------------------------------------------------ *
 * The specification is honest and well-formed
 * ------------------------------------------------------------------ */

function everyFact(): [string, Fact<unknown>][] {
  const facts: [string, Fact<unknown>][] = [];
  for (const t of MANUFACTURING_TECHNOLOGIES) {
    for (const [key, value] of Object.entries(t)) {
      if (value && typeof value === "object" && "state" in value && key !== "approval") {
        facts.push([`${t.value}.${key}`, value as Fact<unknown>]);
      }
    }
  }
  for (const m of MATERIAL_CAPABILITIES) {
    facts.push([`${m.material}.status`, m.status], [`${m.material}.colours`, m.colours], [`${m.material}.layerHeights`, m.layerHeights], [`${m.material}.finishes`, m.finishes]);
  }
  for (const l of LIMITATIONS) facts.push([`limitation ${l.topic}`, l.policy]);
  for (const s of SERVICES) facts.push([`${s.id}.implemented`, s.implemented], [`${s.id}.pricing`, s.pricing], [`${s.id}.leadTime`, s.leadTime]);
  return facts;
}

test("every manufacturing fact is well-formed: sources for KNOWN/PROPOSED, notes for MISSING, references for APPROVED", () => {
  const problems = everyFact().flatMap(([subject, fact]) => validateFact(fact, subject));
  assert.deepEqual(problems, []);
});

test("a MISSING fact carries no value, and an APPROVED fact without a reference is refused", () => {
  assert.deepEqual(validateFact({ state: "MISSING", note: "x", value: 1 } as never, "x").length, 1);
  assert.equal(
    validateFact({ state: "APPROVED", value: 1, approval: { reference: "", approvedOn: "2026-01-01", approvedBy: "x" } }, "x").length,
    1,
  );
  assert.equal(validateFact({ state: "PROPOSED", value: 1, source: "" }, "x").length, 1);
});

test("the approved decisions — and only they — are approved in the specification (Stage 19.8)", () => {
  const fdm = MANUFACTURING_TECHNOLOGIES.find((t) => t.value === "fdm")!;
  const sla = MANUFACTURING_TECHNOLOGIES.find((t) => t.value === "sla")!;

  assert.equal(fdm.approval.state, "APPROVED");
  assert.equal(sla.approval.state, "BLOCKED");

  const states = Object.fromEntries(MATERIAL_CAPABILITIES.map((m) => [m.material, m.approval.state]));
  assert.deepEqual(states, { pla: "APPROVED", petg: "APPROVED", abs: "BLOCKED", tpu: "APPROVED", resin: "BLOCKED" });

  // Every APPROVED fact carries the reference of the decision that approved it.
  for (const [subject, fact] of everyFact()) {
    if (fact.state === "APPROVED") assert.match(fact.approval.reference, /BD-\d{4}-\d{2}-\d{2}-\d{2}/, subject);
  }

  // Processes and materials are approved; manufacturing as a whole is not, because
  // launch-required limitations are still missing.
  assert.equal(processesAndMaterialsApproved(), true);
  assert.equal(manufacturingApproved(), false);
  assert.equal(MANUFACTURING_CAPABILITY.approved, false);
  assert.equal(manufacturingStatus(), "PARTIALLY APPROVED");
});

test("the build volume is approved from the decision; nothing else numeric was invented", () => {
  const fdm = MANUFACTURING_TECHNOLOGIES.find((t) => t.value === "fdm")!;
  assert.equal(fdm.buildEnvelopeMm.state, "APPROVED");
  assert.deepEqual(factValue(fdm.buildEnvelopeMm), { x: 256, y: 256, z: 256 });
  assert.equal(fdm.tooling.state, "KNOWN", "nozzle data is a printer specification, not an approval");
  assert.equal(fdm.leadTime.state, "MISSING");
  assert.equal(fdm.inspection.state, "MISSING");
  assert.equal(MANUFACTURING_TECHNOLOGIES.find((t) => t.value === "sla")?.layerHeights.state, "MISSING");

  assert.deepEqual(missingLaunchLimitations(), ["Minimum wall thickness", "Minimum feature size", "Dimensional accuracy"]);
  for (const topic of ["Production tolerance", "Unsupported overhangs", "Bridging", "Inspection criteria"]) {
    assert.equal(LIMITATIONS.find((l) => l.topic === topic)?.policy.state, "MISSING", topic);
  }
});

test("the offered capability is derived from the configurator definitions and the decisions", () => {
  const fdm = MANUFACTURING_TECHNOLOGIES.find((t) => t.value === "fdm")!;
  assert.deepEqual(factValue(fdm.materials), MATERIAL_OPTIONS.map((o) => o.name));
  assert.deepEqual(MATERIAL_OPTIONS.map((o) => o.value), ["pla", "petg", "tpu"]);

  for (const option of MATERIAL_OPTIONS) {
    const capability = MATERIAL_CAPABILITIES.find((c) => c.material === option.value)!;
    assert.equal(capability.technology, option.technology);
    assert.deepEqual(factValue(capability.colours), ["Black", "White"], option.value);
    assert.equal(option.colors.length, 2);
  }
  assert.deepEqual(QUALITY_OPTIONS.map((q) => q.layerHeight), ["0.20 MM", "0.16 MM", "0.12 MM"]);
});

test("a material's technology has one source: the configurator definitions", () => {
  for (const material of MATERIALS) {
    const option = CONFIGURATOR_MATERIALS.find((o) => o.value === material.value)!;
    assert.deepEqual([...material.technologies], [option.technology]);
  }
});

/* ------------------------------------------------------------------ *
 * Unsupported combinations are rejected everywhere
 * ------------------------------------------------------------------ */

test("FDM + resin and SLA + filament are unsupported combinations, never capabilities", () => {
  const fdmResin = capabilityVerdict("resin", "fdm");
  assert.equal(fdmResin.approved, false);
  assert.ok(fdmResin.reasons.some((r) => /unsupported combination/.test(r)));
  assert.ok(capabilityVerdict("pla", "sla").reasons.some((r) => /unsupported combination/.test(r)));
  assert.ok(capabilityVerdict("nylon", "sls").reasons.length >= 2);
});

test("FDM layer heights are offered for FDM materials only; resin is not offered at all", () => {
  for (const option of MATERIAL_OPTIONS) {
    assert.equal(option.technology, "fdm");
    assert.deepEqual(qualityOptionsFor(option.value), QUALITY_OPTIONS, option.value);
  }
  assert.deepEqual(qualityOptionsFor("resin"), [], "an unapproved material has no qualities");
  assert.ok(!/\d/.test(SLA_QUALITY_OPTIONS[0]!.layerHeight), "an SLA layer height must not be invented");
});

test("a catalog product cannot claim an FDM layer height on SLA resin", () => {
  const spur = PRODUCTS[0]!;
  const codes = validateProduct({
    ...spur,
    material: "resin",
    materials: ["resin"],
    technology: "sla",
    colors: ["grey"],
    color: "grey",
  }).map((i) => i.code);
  assert.ok(codes.includes("invalid-quality"), "0.20 MM on resin must be refused");
});

test("the server quote engine refuses an FDM layer height for resin, whatever the client sends", () => {
  const model = { name: "part.stl", extension: ".stl", sizeBytes: 10 };
  assert.equal(calculateQuote({ model, material: "resin", quality: "high-detail", quantity: 1 }).status, "invalid");
});

/* ------------------------------------------------------------------ *
 * Commercial definitions
 * ------------------------------------------------------------------ */

test("every canonical product has a commercial definition, and none is approved or invented", () => {
  for (const entry of CATALOG_ENTRIES) {
    const c = entry.commercial;
    assert.equal(c.sku.state, "MISSING", `${entry.product.id} SKU must not be generated`);
    assert.equal(c.weightGrams.state, "MISSING", `${entry.product.id} weight must not be invented`);
    assert.equal(c.featured.state, "MISSING");
    for (const fact of [c.productClass, c.customer, c.useCase, c.pricingModel, c.copy, c.visual.required]) {
      assert.notEqual(fact.state, "APPROVED", entry.product.id);
    }
  }
  assert.deepEqual(validateCatalog(CATALOG_ENTRIES).issues, []);
});

test("contradictory commercial definitions are refused", () => {
  const product = launchReadyEntry.product;
  const approval = { reference: "TEST FIXTURE", approvedOn: "2026-09-20", approvedBy: "Test fixture" };

  const quoteModelFixedPrice = {
    ...launchReadyEntry.commercial,
    pricingModel: { state: "APPROVED" as const, value: "QUOTE_ONLY" as const, approval },
  };
  assert.ok(validateCommercialDefinition(product, quoteModelFixedPrice).some((p) => /QUOTE_ONLY but the price status/.test(p)));

  const serviceAsProduct = {
    ...launchReadyEntry.commercial,
    productClass: { state: "APPROVED" as const, value: "CUSTOM_MANUFACTURING_SERVICE" as const, approval },
  };
  assert.ok(validateCommercialDefinition(product, serviceAsProduct).some((p) => /not a catalog product/.test(p)));

  assert.deepEqual(validateCommercialDefinition(product, undefined), ["Missing commercial catalog definition"]);
});

test("the custom manufacturing service is recorded as a service, not counted as a product", () => {
  assert.equal(SERVICES.length, 1);
  assert.equal(SERVICES[0]!.productClass, "CUSTOM_MANUFACTURING_SERVICE");
  assert.ok(!CATALOG_ENTRIES.some((entry) => entry.product.id === SERVICES[0]!.id));
});

/* ------------------------------------------------------------------ *
 * Import: approved-only columns, idempotent
 * ------------------------------------------------------------------ */

test("the importer writes structured commercial fields, and no commercial approval exists to write", () => {
  for (const row of planProducts()) {
    assert.equal(row.sku, null, `${row.productId}: a SKU is never generated`);
    assert.equal(row.productClass, "STANDARD_CATALOG_PRODUCT", "the PROPOSED value is written as a value…");
    assert.equal(row.commercialApproval, null, "…and never as an approval");
    assert.equal(row.visualApproval, null);
    assert.ok(row.customers.length > 0);
  }
  const p102 = planProducts().find((row) => row.productId === "p-102")!;
  assert.deepEqual(p102.openQuestions.map((q) => [q.questionId, q.answer]), [["sell-without-ring-gear", "unanswered"]]);
});

test("planning is deterministic, and an identical stored product is unchanged on a second import", () => {
  assert.deepEqual(planProducts(), planProducts());

  const [row] = planProducts();
  const planned = {
    sku: row!.sku,
    customers: row!.customers.map((value) => ({ value })),
    useCase: row!.useCase,
    commercialApproval: { reference: null, approvedBy: null, approvedOn: null },
    openQuestions: row!.openQuestions,
  };
  // Payload adds row ids and returns nulls; neither is a change.
  const stored = {
    ...planned,
    id: 7,
    customers: row!.customers.map((value, index) => ({ id: `c${index}`, value })),
    commercialApproval: { reference: null, approvedBy: null, approvedOn: null },
  };
  assert.equal(sameContent(stored, planned), true, "a second import must not rewrite an identical product");
  assert.equal(sameContent({ ...stored, useCase: "edited in the admin" }, planned), false);
});

/* ------------------------------------------------------------------ *
 * Documents cannot drift
 * ------------------------------------------------------------------ */

test("MANUFACTURING_CAPABILITY.md and LAUNCH_CATALOG.md match the canonical data exactly", () => {
  for (const doc of GENERATED_DOCS) {
    const committed = readFileSync(join(process.cwd(), doc.path), "utf8");
    assert.equal(committed, doc.render(), `${doc.path} is stale — run npm run content:docs`);
  }
});

test("the launch catalog reports the real catalog size and does not claim the target is met", () => {
  const doc = readFileSync(join(process.cwd(), "LAUNCH_CATALOG.md"), "utf8");
  assert.match(doc, /\| 12 \| 3 \| 0 \| 0 \| 0 \| 12 \|/);
  assert.ok(!/Launch status \| READY/.test(doc));
});

/* ------------------------------------------------------------------ *
 * Admin launch status, against a stub Payload
 * ------------------------------------------------------------------ */

test("the admin launch status explains exactly why a product cannot launch", async () => {
  const entry = CATALOG_ENTRIES[0]!;
  const p = entry.product;
  const doc = {
    id: 5,
    _status: "published",
    productId: p.id,
    slug: p.slug,
    name: p.name,
    summary: p.summary,
    description: p.description,
    price: p.price,
    priceStatus: p.priceStatus,
    approvalStatus: p.approvalStatus,
    currency: "INR",
    availability: p.availability,
    category: { id: 1, value: p.category },
    browseCategory: { id: 2, value: p.browseCategory },
    material: { id: 3, value: p.material },
    materials: [{ id: 3, value: p.material }],
    technology: p.technology,
    color: p.color,
    colors: (p.colors ?? []).map((value) => ({ value })),
    qualityOptions: p.qualityOptions,
    specifications: p.specifications,
    model: p.model,
    source: "seed",
    sku: null,
    productClass: "STANDARD_CATALOG_PRODUCT",
    pricingModel: "FIXED",
    customers: [{ value: "Educators" }],
    useCase: "Mechanism mock-ups",
    visualRequirement: "APPROVED_RENDER",
  };
  const payload = {
    findByID: async () => doc,
    find: async () => ({ docs: [] }),
  } as never;

  const status = await computeLaunchStatus(payload, 5);

  assert.match(status.launch, /^NOT READY — \d+ reasons$/);
  assert.equal(status.technical, "PASS");
  assert.equal(status.price, "PROVISIONAL");
  assert.equal(status.media, "MISSING");
  // PLA on FDM is approved (BD-2026-09-14-02, -04), but the launch-required limitations are not.
  assert.equal(status.manufacturing, "NOT_APPROVED");
  assert.ok(status.reasons.includes("Manufacturing limitations not approved: Minimum wall thickness, Minimum feature size, Dimensional accuracy"));
  assert.ok(!status.reasons.includes("Material not approved"));
  assert.equal(status.commercial, "INCOMPLETE");
  for (const reason of ["Product not approved", "Missing approved price", "Missing approved image", "Missing SKU"]) {
    assert.ok(status.reasons.includes(reason), `admin reasons lack "${reason}"`);
  }
  assert.ok(!status.reasons.includes("Manufacturing process not approved"));

  // Entered but not approved: values read as PROPOSED, never as approved.
  assert.ok(status.reasons.includes("Product class not approved (PROPOSED)"));

  // An approval record approves the commercial definition; the SKU is still missing.
  const approved = await computeLaunchStatus(
    {
      ...(payload as object),
      findByID: async () => ({
        ...doc,
        commercialApproval: { reference: "Decision log #1", approvedBy: "Owner", approvedOn: "2026-09-14" },
      }),
    } as never,
    5,
  );
  assert.ok(!approved.reasons.includes("Product class not approved"));
  assert.ok(approved.reasons.includes("Missing SKU"));

  // A partial approval record approves nothing.
  const partial = await computeLaunchStatus(
    { ...(payload as object), findByID: async () => ({ ...doc, commercialApproval: { reference: "x" } }) } as never,
    5,
  );
  assert.ok(partial.reasons.includes("Product class not approved (PROPOSED)"));
});
