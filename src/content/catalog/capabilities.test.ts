import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { POST as postQuote } from "@/app/api/quotes/route";
import { customLineKey } from "@/lib/cart/identity";
import { addCustomLine } from "@/lib/cart/service";
import type { CustomCartLine } from "@/lib/cart/types";
import { priceLine } from "@/lib/cart/validation";
import { entryFromPayloadDoc } from "@/lib/catalog/payload-entry";
import { FIXTURE_NOW } from "@/lib/catalog/fixtures.testing";
import { capabilitySummary } from "@/lib/content/verification";
import { computeLaunchStatus } from "@/lib/content/launch-admin";
import { BRAND } from "@/lib/brand";
import {
  COMING_SOON_FINISHES,
  COMING_SOON_MATERIALS,
  FINISH_OPTIONS,
  MATERIAL_OPTIONS,
  TECHNOLOGY_OPTIONS,
} from "@/lib/custom-print/options";
import { blockedReason } from "@/lib/custom-print/workflow";
import { EMPTY_CONFIGURATION } from "@/lib/custom-print/types";
import { calculateQuote } from "@/lib/pricing/calculateQuote";
import { PRICING_RULES } from "@/lib/pricing/rules";
import { SITE } from "@/lib/site";
import { Materials } from "@/payload/collections/Materials";
import { TECHNOLOGY_SELECT_OPTIONS } from "@/payload/product-hooks";
import { capabilityProblems } from "@/payload/workflow";
import type { Product as PayloadProduct } from "@/payload-types";

import {
  ROADMAP,
  capabilityStatus,
  resolveRoadmap,
  unavailableReason,
} from "./capabilities";
import { resolveLedger, LIMITATION_TOPICS, type DecisionRecord } from "./decisions";
import ledgerFile from "./decisions/business-decisions.json";
import { CATALOG_ENTRIES } from "./index";
import { MATERIALS, comingSoonMaterials } from "../materials";
import { published } from "../pages";

/*
 * Stage 19.9: Coming Soon is presentation, never permission. Every test here is
 * about a Coming Soon capability being visible and still refused.
 */

const COMING_SOON = [
  ["material", "abs"],
  ["material", "resin"],
  ["technology", "sla"],
  ["finish", "smooth"],
  ["finish", "matte"],
] as const;

/* ---- status ---- */

test("current approved capability is unchanged: FDM, PLA/PETG/TPU, Black/White, Standard are AVAILABLE", () => {
  for (const [kind, value] of [
    ["technology", "fdm"],
    ["material", "pla"],
    ["material", "petg"],
    ["material", "tpu"],
    ["colour", "black"],
    ["colour", "white"],
    ["finish", "standard"],
  ] as const) {
    assert.equal(capabilityStatus(kind, value), "AVAILABLE", `${kind} ${value}`);
  }
  assert.deepEqual(MATERIAL_OPTIONS.map((option) => option.value), ["pla", "petg", "tpu"]);
  assert.deepEqual(FINISH_OPTIONS.map((option) => option.value), ["standard"]);
});

test("ABS, Resin, SLA, Smoothed and Matte are COMING SOON; SLS and unlisted colours are UNAVAILABLE", () => {
  for (const [kind, value] of COMING_SOON) assert.equal(capabilityStatus(kind, value), "COMING_SOON", `${kind} ${value}`);
  assert.equal(capabilityStatus("technology", "sls"), "UNAVAILABLE");
  assert.equal(capabilityStatus("colour", "orange"), "UNAVAILABLE");
  assert.equal(capabilityStatus("material", "nylon"), "UNAVAILABLE");
  assert.equal(capabilityStatus("material", undefined), "UNAVAILABLE");
});

test("the committed roadmap is valid, lists exactly the five planned capabilities, and states no dates or specifications", () => {
  assert.deepEqual(ROADMAP.issues, []);
  assert.deepEqual(
    ROADMAP.entries.map((entry) => `${entry.kind}:${entry.value}`),
    ["material:abs", "material:resin", "technology:sla", "finish:smooth", "finish:matte"],
  );
  for (const entry of ROADMAP.entries) assert.deepEqual(Object.keys(entry).sort(), ["kind", "reference", "value"]);
});

test("a roadmap entry never makes anything available — only an APPROVED ledger decision does", () => {
  const withoutFdm = resolveLedger(
    { schemaVersion: 1, decisions: (ledgerFile as { decisions: DecisionRecord[] }).decisions.filter((r) => !(r.kind === "manufacturing-process" && r.subject === "fdm")) },
    new Set(LIMITATION_TOPICS),
  );
  const roadmapFdm = resolveRoadmap({ schemaVersion: 1, entries: [{ kind: "technology", value: "fdm", reference: "test" }] });
  assert.equal(capabilityStatus("technology", "fdm", withoutFdm, roadmapFdm), "COMING_SOON");
  assert.equal(capabilityStatus("material", "pla", withoutFdm, roadmapFdm), "UNAVAILABLE", "a material on an unapproved process is not available");

  // The future path: a finish decision is what makes Smoothed available.
  const approval = { reference: "Test finish decision", approvedBy: "Test", approvedOn: "2026-10-01" };
  const smoothApproved = resolveLedger(
    { schemaVersion: 1, decisions: [...(ledgerFile as { decisions: DecisionRecord[] }).decisions, { id: "BD-2026-10-01-01", kind: "finish", subject: "smooth", decision: "APPROVED", approval }] },
    new Set(LIMITATION_TOPICS),
  );
  assert.deepEqual(smoothApproved.issues, []);
  assert.equal(capabilityStatus("finish", "smooth", smoothApproved), "AVAILABLE");
  assert.equal(capabilityStatus("finish", "matte", smoothApproved), "COMING_SOON");
});

test("invalid roadmap entries are rejected: timelines, specifications, unknown capabilities, missing references, duplicates", () => {
  const resolved = resolveRoadmap({
    schemaVersion: 1,
    entries: [
      { kind: "material", value: "abs", reference: "r", availableFrom: "2026-11-01" },
      { kind: "technology", value: "sla", reference: "r", layerHeight: "0.05 MM" },
      { kind: "material", value: "nylon", reference: "r" },
      { kind: "machine", value: "form-4", reference: "r" },
      { kind: "finish", value: "matte" },
      { kind: "finish", value: "smooth", reference: "r" },
      { kind: "finish", value: "smooth", reference: "r" },
    ],
  });
  assert.deepEqual(resolved.entries.map((entry) => entry.value), ["smooth"]);
  assert.equal(resolved.issues.length, 6);
  assert.ok(resolved.issues[0]!.includes("no timelines"));
  assert.deepEqual(resolveRoadmap({ entries: [] }).entries, []);
});

/* ---- visible ---- */

test("Coming Soon capabilities are visible in the configurator, and apart from the offering", () => {
  assert.deepEqual(COMING_SOON_MATERIALS.map((option) => option.value), ["abs", "resin"]);
  assert.deepEqual(COMING_SOON_FINISHES.map((option) => option.value), ["smooth", "matte"]);
  assert.deepEqual(
    TECHNOLOGY_OPTIONS.map((technology) => [technology.value, technology.status]),
    [["fdm", "AVAILABLE"], ["sla", "COMING_SOON"]],
  );
  for (const option of COMING_SOON_MATERIALS) {
    assert.ok(!("colors" in option) && !("properties" in option), `${option.value} shows no colours or ratings`);
    assert.ok(!/resolution|smoothable|machinable/i.test(option.description), `${option.value} makes no process claim`);
  }
});

test("the materials content separates current materials from coming soon ones", () => {
  assert.deepEqual(published(MATERIALS).map((entry) => entry.value), ["pla", "petg", "tpu"]);
  assert.deepEqual(comingSoonMaterials().map((entry) => entry.value), ["abs", "resin"]);
});

test("content:verify lists capabilities by status and never counts Coming Soon as approved", () => {
  const lines = capabilitySummary().join("\n");
  assert.match(lines, /Technology: +FDM — AVAILABLE · SLA — COMING SOON · SLS — UNAVAILABLE/);
  assert.match(lines, /Materials: +PLA — AVAILABLE · PETG — AVAILABLE · ABS — COMING SOON · TPU — AVAILABLE · Resin — COMING SOON/);
  assert.match(lines, /Finishes: +Standard — AVAILABLE · Smoothed — COMING SOON · Matte — COMING SOON/);
});

/* ---- refused: quote ---- */

const MODEL = { name: "cube.stl", extension: ".stl", sizeBytes: 684, triangles: 12 };

test("the quote engine quotes PLA, PETG and TPU, and refuses every Coming Soon capability", () => {
  for (const material of ["pla", "petg", "tpu"]) {
    assert.equal(calculateQuote({ model: MODEL, material, quality: "standard", finish: "standard", quantity: 1 }).status, "available", material);
  }
  const refused = [
    { material: "abs" },
    { material: "resin" },
    { material: "pla", technology: "sla" },
    { material: "pla", finish: "smooth" },
    { material: "pla", finish: "matte" },
  ];
  for (const selection of refused) {
    const response = calculateQuote({ model: MODEL, quantity: 1, ...selection });
    assert.equal(response.status, "invalid", JSON.stringify(selection));
    assert.ok(
      response.status === "invalid" && response.errors.some((error) => error.message.startsWith("Capability currently unavailable — ")),
      JSON.stringify(selection),
    );
  }
  // A pricing factor exists for all of them; it is not a permission.
  assert.ok(PRICING_RULES.materialFactor.abs && PRICING_RULES.finishFee.smooth);
});

async function quoteStatus(body: Record<string, unknown>) {
  const response = await postQuote(
    new Request("http://localhost/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" },
      body: JSON.stringify({ model: MODEL, quantity: 1, ...body }),
    }),
  );
  return { status: response.status, body: (await response.json()) as { error?: { issues?: { message: string }[] } } };
}

test("POST /api/quotes: ABS, Resin, SLA, Smoothed and Matte → HTTP 400 naming the capability as coming soon", async () => {
  const ok = await quoteStatus({ material: "pla", quality: "standard", finish: "standard" });
  assert.equal(ok.status, 200);

  for (const body of [
    { material: "abs" },
    { material: "resin" },
    { material: "pla", technology: "sla" },
    { material: "pla", finish: "smooth" },
    { material: "pla", finish: "matte" },
  ]) {
    const { status, body: payload } = await quoteStatus(body);
    assert.equal(status, 400, JSON.stringify(body));
    assert.ok(
      payload.error?.issues?.some((issue) => /^Capability currently unavailable — .*coming soon to Reality 3D\.$/.test(issue.message)),
      JSON.stringify(payload),
    );
  }
});

/* ---- refused: cart and checkout ---- */

test("a Coming Soon capability cannot enter the cart", async () => {
  const model = { modelId: "mdl_test0001", name: "gear.stl", extension: ".stl", sizeBytes: 28884, formatLabel: "Binary STL" };
  for (const [material, finish] of [["abs", "standard"], ["resin", "standard"], ["pla", "smooth"], ["pla", "matte"]] as const) {
    const result = await addCustomLine({ model, material, quality: "standard", finish, quantity: 1 });
    assert.equal(result.ok, false, `${material}/${finish}`);
    assert.match(result.ok ? "" : result.message, /coming soon to Reality 3D/);
  }
});

test("a Coming Soon capability cannot reach checkout, even as a tampered stored cart line", async () => {
  const model = { modelId: "mdl_test0001", name: "gear.stl", extension: ".stl", sizeBytes: 28884, formatLabel: "Binary STL", triangles: 576 };
  const configuration = { material: "abs", quality: "standard", finish: "standard" };
  const line: CustomCartLine = {
    type: "custom",
    id: customLineKey({ model, configuration }),
    quantity: 1,
    model,
    configuration,
    // A quote a client could have forged: the server recomputes and refuses it.
    quote: { rulesVersion: PRICING_RULES.version, total: 999, basis: "configuration", provisional: true, quotedAt: "2026-01-01T00:00:00.000Z" },
    addedAt: "2026-01-01T00:00:00.000Z",
  };
  const priced = await priceLine(line);
  assert.equal(priced.lineTotal, null);
  const blocking = priced.issues.filter((issue) => issue.severity === "blocking");
  assert.ok(blocking.some((issue) => issue.code === "quote_unavailable" && /ABS printing is coming soon/.test(issue.message)));
});

test("the configurator cannot continue with a Coming Soon value restored from storage", () => {
  assert.equal(blockedReason("material", { ...EMPTY_CONFIGURATION, material: "abs" }), "ABS printing is coming soon to Reality 3D.");
  assert.equal(blockedReason("finish", { ...EMPTY_CONFIGURATION, finish: "matte" }), "The Matte finish is coming soon to Reality 3D.");
  assert.equal(blockedReason("material", { ...EMPTY_CONFIGURATION, material: "pla" }), null);
});

test("server refusal text for Coming Soon differs from unavailable, and nothing available is refused", () => {
  assert.equal(unavailableReason("material", "pla"), undefined);
  assert.match(unavailableReason("technology", "sla")!, /^Capability currently unavailable — SLA printing is coming soon/);
  assert.equal(unavailableReason("technology", "sls"), "That manufacturing process is not currently offered.");
});

/* ---- admin and catalog ---- */

test("admin: capability status is visible on technologies and materials, and creates no approval", () => {
  assert.deepEqual(
    TECHNOLOGY_SELECT_OPTIONS.map((option) => option.label),
    ["FDM — Available now", "SLA — Coming soon", "SLS — Not available"],
  );
  const field = Materials.fields.find((candidate) => "name" in candidate && candidate.name === "capabilityStatus") as {
    virtual?: boolean;
    hooks?: { afterRead?: ((args: { siblingData: unknown }) => unknown)[] };
  };
  assert.equal(field?.virtual, true, "computed on read, never stored");
  const read = (value: string) => field.hooks!.afterRead![0]!({ siblingData: { value } });
  assert.equal(read("pla"), "AVAILABLE NOW");
  assert.equal(read("abs"), "COMING SOON");
  assert.equal(read("resin"), "COMING SOON");
});

test("admin: a future product on a Coming Soon capability can be drafted, never published", () => {
  assert.deepEqual(capabilityProblems({ technology: "fdm", material: "abs" }, false), []);
  assert.match(capabilityProblems({ technology: "fdm", material: "abs" }, true)[0]!, /ABS is coming soon — .*cannot be published until ABS is approved/);
  assert.match(capabilityProblems({ technology: "sla", material: "resin" }, true).join(" "), /SLA is coming soon.*Resin is coming soon/);
  assert.match(capabilityProblems({ technology: "sls" }, false)[0]!, /not an available or planned manufacturing process/);
  assert.deepEqual(capabilityProblems({ technology: "fdm", material: "petg" }, true), []);
});

const spur = CATALOG_ENTRIES.find((entry) => entry.product.id === "p-101")!;

function futureDoc(material: string, technology: string): PayloadProduct {
  const p = spur.product;
  return {
    id: 90,
    _status: "draft",
    productId: "p-190",
    slug: "future-housing",
    name: "Future housing",
    summary: p.summary,
    description: p.description,
    price: p.price,
    priceStatus: "provisional",
    approvalStatus: "provisional",
    currency: "INR",
    availability: p.availability,
    category: { id: 1, value: p.category },
    browseCategory: { id: 2, value: p.browseCategory },
    material: { id: 9, value: material },
    materials: [{ id: 9, value: material }],
    technology,
    color: "black",
    colors: [{ value: "black" }],
    specifications: p.specifications,
    model: p.model,
    source: "admin",
  } as unknown as PayloadProduct;
}

test("catalog: a product using a Coming Soon capability cannot become launch-ready, and says why", () => {
  const abs = entryFromPayloadDoc(futureDoc("abs", "fdm"), [], FIXTURE_NOW);
  assert.ok(abs.ok);
  assert.equal(abs.launch.launch.ready, false);
  assert.equal(abs.launch.manufacturing, "NOT_APPROVED");
  assert.ok(abs.launch.launch.reasons.some((reason) => /Material not approved: ABS — coming soon, not available for production/.test(reason)));
});

test("admin launch status labels a Coming Soon product as COMING SOON — NOT APPROVED", async () => {
  const doc = futureDoc("abs", "fdm");
  const status = await computeLaunchStatus({ findByID: async () => doc, find: async () => ({ docs: [] }) } as never, 90);
  assert.equal(status.manufacturing, "COMING SOON — NOT APPROVED");
  assert.match(status.launch, /^NOT READY/);
  assert.ok(status.reasons.includes("Not published"));
});

/* ---- brand ---- */

test("the customer-facing brand is Reality 3D, with its tagline and domain", () => {
  assert.equal(BRAND.name, "Reality 3D");
  assert.equal(SITE.name, "Reality 3D");
  assert.equal(SITE.tagline, "Imagine. Design. Create.");
  assert.equal(SITE.domain, "reality3d.in");
  // The root layout imports CSS, so its metadata is checked in source: every title is built from SITE.
  const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
  assert.ok(layout.includes("default: `${SITE.name} — ${SITE.tagline}`"));
  assert.ok(layout.includes("template: `%s — ${SITE.name}`"));
  assert.ok(!layout.includes("Manufacturing, reimagined"));
  const home = readFileSync(join(process.cwd(), "src/app/(site)/page.tsx"), "utf8");
  assert.ok(home.includes("absolute: `${SITE.name} — ${SITE.tagline}`") && home.includes("\"@type\": \"Organization\""));
});

test("no customer-facing source renders the old brand", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      // brand.ts records the rename itself ("formerly SADA 3D").
      else if (/\.(tsx?|css)$/.test(name) && !name.endsWith(".test.ts") && name !== "brand.ts") {
        const text = readFileSync(path, "utf8");
        if (/SADA 3D|>SADA<|SADA<span/.test(text)) offenders.push(path);
      }
    }
  };
  for (const dir of ["src/app", "src/components", "src/content", "src/lib", "src/payload"]) walk(join(process.cwd(), dir));
  assert.deepEqual(offenders, [], "brand text must read Reality 3D (lowercase sada3d identifiers are internal and allowed)");

  for (const component of ["Header", "Footer", "MobileNav"]) {
    const source = readFileSync(join(process.cwd(), `src/components/navigation/${component}.tsx`), "utf8");
    assert.ok(source.includes(">Reality</span>"), `${component} wordmark`);
  }
});

test("internal identifiers keep their historical names, so sessions, carts and stored data survive the rename", () => {
  const cart = readFileSync(join(process.cwd(), "src/lib/cart/repository.ts"), "utf8");
  assert.ok(cart.includes('CART_COOKIE = "sada3d_cart"'));
  const keys = readFileSync(join(process.cwd(), "src/lib/storage/keys.ts"), "utf8");
  assert.ok(keys.includes('"sada3d:customer-design-owner:v1:"'), "changing the hash context would orphan every stored design's ownership");
});
