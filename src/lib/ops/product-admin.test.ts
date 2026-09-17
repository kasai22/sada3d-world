import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { computeLaunchStatus } from "@/lib/content/launch-admin";
import { Products } from "@/payload/collections/Products";
import type { Product as PayloadProduct } from "@/payload-types";

import type { OperatorSession } from "./operator";
import { setPayloadClientForTests } from "./payload";
import { createProduct, productData, refusalFrom, updateProductSection, valuesFromProduct } from "./product-admin";
import { EMPTY_PRODUCT_FORM, PRODUCT_SECTIONS, parseProductForm, type ProductFormValues } from "./product-form";

/**
 * Product create and edit (Reality 3D Admin) against a stand-in Payload that
 * runs the Products collection's **real** hooks — product id assignment, source
 * marking and the workflow/capability guard — on exactly the data the service
 * sends. What is proved: who may write, what is written (a draft, unapproved,
 * unpublished), that the collection's rules still decide, that refusals come
 * back as field errors, and that invalid input writes nothing.
 */

const OPERATOR = { id: "7", name: "Owner", email: "owner@reality3d.in" } as unknown as OperatorSession;
const USER = { id: 7, collection: "users", email: "owner@reality3d.in", name: "Owner" };

const CATEGORIES = [
  { id: 1, name: "Mechanical", value: "mechanical", isBrowse: true, parent: null, _status: "published" },
  { id: 2, name: "Gears", value: "gears", isBrowse: false, parent: 1, _status: "published" },
  { id: 3, name: "Loose", value: "loose", isBrowse: false, parent: null, _status: "published" },
];
const MATERIALS = [
  { id: 10, name: "PLA", value: "pla", _status: "published" },
  { id: 11, name: "ABS", value: "abs", _status: "draft" },
  { id: 12, name: "Resin", value: "resin", _status: "draft" },
];

interface Call {
  op: "create" | "update";
  args: Record<string, unknown>;
  stored?: Record<string, unknown>;
}

let calls: Call[];
let authUser: unknown;
let existingProducts: Record<string, unknown>[];
let refuseWith: unknown;

/** Runs the collection's own hooks, in Payload's order, as Payload would for this request. */
async function runHooks(operation: "create" | "update", data: Record<string, unknown>, originalDoc?: Record<string, unknown>) {
  const req = { payload: fake, user: authUser, context: {} } as never;
  let next = data;
  for (const hook of Products.hooks?.beforeValidate ?? []) {
    next = ((await hook({ data: next, operation, req, context: {}, collection: {} as never, originalDoc } as never)) ?? next) as Record<string, unknown>;
  }
  for (const hook of Products.hooks?.beforeChange ?? []) {
    next = ((await hook({ data: next, operation, req, context: {}, collection: {} as never, originalDoc } as never)) ?? next) as Record<string, unknown>;
  }
  return next;
}

const fake = {
  async auth() {
    return { user: authUser };
  },
  async find({ collection, where }: { collection: string; where?: Record<string, { equals?: unknown }> }) {
    if (collection === "categories") return { docs: CATEGORIES, totalDocs: CATEGORIES.length };
    if (collection === "materials") return { docs: MATERIALS, totalDocs: MATERIALS.length };
    if (collection === "media") return { docs: [], totalDocs: 0 };
    if (collection === "price-approvals") return { docs: [], totalDocs: 0 };
    if (collection === "products") {
      const [field, condition] = Object.entries(where ?? {})[0] ?? [];
      const docs = field ? existingProducts.filter((doc) => doc[field] === condition?.equals) : existingProducts;
      return { docs, totalDocs: docs.length };
    }
    return { docs: [], totalDocs: 0 };
  },
  async findByID({ collection, id }: { collection: string; id: number }) {
    if (collection === "materials") return MATERIALS.find((doc) => doc.id === id) ?? null;
    const doc = existingProducts.find((row) => row.id === id);
    if (!doc) throw new Error("Not Found");
    return doc;
  },
  async create(args: { data: Record<string, unknown> }) {
    if (refuseWith) throw refuseWith;
    const stored = await runHooks("create", { ...args.data });
    calls.push({ op: "create", args, stored });
    return { id: 104, ...stored };
  },
  async update(args: { id: number; data: Record<string, unknown> }) {
    if (refuseWith) throw refuseWith;
    const original = existingProducts.find((doc) => doc.id === args.id);
    const stored = await runHooks("update", { ...args.data }, original);
    calls.push({ op: "update", args, stored });
    return { id: args.id, ...stored };
  },
};

function existing(overrides: Partial<PayloadProduct> = {}): Record<string, unknown> {
  return {
    id: 50,
    productId: "p-103",
    name: "Hex Spacer",
    slug: "hex-spacer",
    sku: "R3D-HEX-01",
    summary: "M5 hex spacer",
    category: 2,
    browseCategory: 1,
    technology: "fdm",
    material: 10,
    materials: [10],
    color: "black",
    colors: [{ value: "black" }],
    price: 120,
    priceStatus: "provisional",
    currency: "INR",
    availability: "made-to-order",
    approvalStatus: "provisional",
    _status: "draft",
    source: "admin",
    visual: { src: "/catalog/hex-spacer/front.jpg", alt: "Spacer", kind: "photo", approval: { reference: "MEDIA-1", approvedBy: "Owner", approvedOn: "2026-09-10" } },
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

const valid = (overrides: Partial<ProductFormValues> = {}): ProductFormValues => ({
  ...EMPTY_PRODUCT_FORM,
  name: "Spur Gear 24T",
  slug: "spur-gear-24t",
  summary: "Module 1 spur gear, 24 teeth",
  categoryId: "2",
  technology: "fdm",
  materialId: "10",
  color: "black",
  qualities: ["standard"],
  price: "450",
  ...overrides,
});

beforeEach(() => {
  calls = [];
  authUser = USER;
  refuseWith = undefined;
  existingProducts = [
    { id: 1, productId: "p-101", sku: "R3D-G-01", slug: "gear-a" },
    { id: 2, productId: "p-102", sku: null, slug: "gear-b" },
    { id: 3, productId: "p-103", sku: null, slug: "gear-c" },
  ];
  setPayloadClientForTests({ payload: async () => fake as never, headers: async () => new Headers() });
});

afterEach(() => setPayloadClientForTests(null));

/* ------------------------------------------------------------------ *
 * Authorization
 * ------------------------------------------------------------------ */

test("anonymous and customer sessions are refused, and nothing is written", async () => {
  for (const user of [null, { id: 7, collection: "customers", email: "c@example.com" }, { ...USER, id: 8 }]) {
    authUser = user;
    const created = await createProduct(OPERATOR, valid());
    assert.deepEqual(created, { ok: false, message: "Unauthorized.", errors: {} });
    const updated = await updateProductSection(OPERATOR, 50, "overview", valid());
    assert.equal(updated.ok ? "ok" : updated.message, "Unauthorized.");
  }
  assert.equal(calls.length, 0);
});

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */

test("a valid product is created through the Products collection as an unpublished, unapproved draft", async () => {
  const result = await createProduct(OPERATOR, valid({ sku: "RG-GEAR-024", customers: "Makers\nSchools" }));
  assert.deepEqual(result, { ok: true, id: 104, productId: "p-104", message: "Product created as an unpublished draft." });
  assert.equal(calls.length, 1);

  const [{ args, stored }] = calls as [Call];
  assert.equal(args.collection, "products");
  assert.equal(args.overrideAccess, false, "Payload access control applies");
  assert.equal(args.user, USER, "saved as the signed-in operator");
  assert.equal(args.draft, false, "a validated save, so Payload's field validators run");

  const data = args.data as Record<string, unknown>;
  assert.equal(data._status, "draft", "not published");
  assert.equal(data.approvalStatus, "draft", "not approved");
  assert.equal(data.priceStatus, "provisional", "a price is never approved by entering it");
  assert.equal(data.browseCategory, 1, "the browse category is the category's browse root");
  assert.deepEqual(data.customers, [{ value: "Makers" }, { value: "Schools" }]);
  assert.deepEqual(data.qualityOptions, [{ value: "standard", label: "Standard", layerHeight: "0.20 MM" }]);
  assert.equal("approval" in data || "commercialApproval" in data || "openQuestions" in data, false, "no approval record is written");
  assert.deepEqual((data.visual as { approval: unknown }).approval, { reference: null, approvedBy: null, approvedOn: null });

  // The collection's own hooks ran on it.
  assert.equal(stored?.productId, "p-104", "assignProductId gave the next stable id");
  assert.equal(stored?.source, "admin", "markSource recorded an administrator-managed product");
});

test("SKU rules run: a malformed SKU never reaches Payload, and a duplicate is refused by name", async () => {
  const parsed = parseProductForm(formOf(valid({ sku: "rg gear" })), PRODUCT_SECTIONS);
  assert.match(parsed.errors.sku ?? "", /Invalid SKU format/);

  const duplicate = await createProduct(OPERATOR, valid({ sku: "R3D-G-01" }));
  assert.equal(duplicate.ok, false);
  assert.equal(!duplicate.ok && duplicate.errors.sku, "SKU already exists on another product.");

  const slug = await createProduct(OPERATOR, valid({ slug: "gear-a" }));
  assert.match(!slug.ok ? (slug.errors.slug ?? "") : "", /already uses this URL segment/);
  assert.equal(calls.length, 0, "no mutation on invalid input");
});

test("invalid input writes nothing and says which field is wrong", async () => {
  const empty = parseProductForm(new FormData(), PRODUCT_SECTIONS);
  assert.deepEqual(Object.keys(empty.errors).sort(), ["categoryId", "color", "materialId", "name", "summary", "technology"]);
  assert.equal(empty.errors.categoryId, "Category is required.");

  const cases: [Partial<ProductFormValues>, keyof ProductFormValues, RegExp][] = [
    [{ categoryId: "99" }, "categoryId", /no longer exists/],
    [{ categoryId: "3" }, "categoryId", /not under a browse category/],
    [{ materialId: "999" }, "materialId", /Material unavailable/],
    [{ technology: "sls" }, "technology", /not an available or planned manufacturing process/],
    [{ materialId: "12" }, "materialId", /Invalid manufacturing combination: Resin is a SLA material/],
    [{ color: "orange" }, "color", /not an approved production colour/],
    [{ qualities: ["ultra"] }, "qualities", /approved layer heights/],
    [{ productClass: "QUOTE_ONLY_PRODUCT", price: "450" }, "price", /quote-only product has no catalog price/],
  ];
  for (const [overrides, field, message] of cases) {
    const result = await createProduct(OPERATOR, valid(overrides));
    assert.equal(result.ok, false, JSON.stringify(overrides));
    assert.match(!result.ok ? (result.errors[field] ?? "") : "", message, JSON.stringify(overrides));
  }
  assert.equal(calls.length, 0);
});

test("a Coming Soon capability can be drafted, but can never be published or become launch ready", async () => {
  const drafted = await createProduct(OPERATOR, valid({ materialId: "11" }));
  assert.ok(drafted.ok, "ABS may be drafted for the roadmap");

  // Publishing it is refused by the collection's own capability guard.
  existingProducts.push(existing({ id: 60, material: 11, materials: [11] }) as never);
  const hook = Products.hooks!.beforeChange![0]!;
  await assert.rejects(
    async () =>
      hook({
        data: { _status: "published" },
        originalDoc: existingProducts.at(-1),
        operation: "update",
        req: { payload: fake, user: USER, context: {} },
        context: {},
      } as never),
    /ABS is coming soon .* cannot be published/,
  );

  // And its launch assessment says NOT READY.
  const doc = { ...existing({ id: 60 }), material: { id: 11, value: "abs" }, materials: [{ id: 11, value: "abs" }], category: { id: 2, value: "gears" }, browseCategory: { id: 1, value: "mechanical" } };
  const status = await computeLaunchStatus({ findByID: async () => doc, find: async () => ({ docs: [] }) } as never, 60);
  assert.equal(status.manufacturing, "COMING SOON — NOT APPROVED");
  assert.equal(status.stage, "NOT READY");
});

test("approval cannot be bypassed through the form", async () => {
  // Approval fields in a submitted form are not form fields: they are dropped.
  const form = formOf(valid());
  form.set("approvalStatus", "approved");
  form.set("priceStatus", "approved");
  form.set("_status", "published");
  const parsed = parseProductForm(form, PRODUCT_SECTIONS);
  assert.equal("approvalStatus" in parsed.values || "priceStatus" in parsed.values || "_status" in parsed.values, false);
  await createProduct(OPERATOR, parsed.values);
  const data = calls[0]!.args.data as Record<string, unknown>;
  assert.equal(data.approvalStatus, "draft");
  assert.equal(data._status, "draft");
  assert.equal(data.priceStatus, "provisional");

  // An approved price stays approved only while the price is unchanged; the workflow guard refuses an approved status with no record.
  const approvedDoc = existing({ priceStatus: "approved", price: 120 }) as unknown as PayloadProduct;
  const options = { categories: [], technologies: [], materials: [], colours: [], qualities: [], media: [], comingSoonFinishes: [] };
  const context = { options, browseCategoryId: 1, existing: approvedDoc };
  assert.equal(productData({ ...valuesFromProduct(approvedDoc), price: "120" }, ["pricing"], context).priceStatus, "approved");
  assert.equal(productData({ ...valuesFromProduct(approvedDoc), price: "150" }, ["pricing"], context).priceStatus, "provisional");
  await assert.rejects(
    async () =>
      Products.hooks!.beforeChange![0]!({
        data: { priceStatus: "approved", price: 150 },
        originalDoc: { ...approvedDoc, id: undefined },
        operation: "update",
        req: { payload: fake, user: USER, context: {} },
        context: {},
      } as never),
    /price can only be marked approved when a price approval is in effect/,
  );
});

test("Payload's refusals come back as field errors, never as a generic failure", () => {
  const validation = refusalFrom({ message: "The following field is invalid: color", data: { errors: [{ path: "color", message: '"orange" is not an approved production colour.' }] } });
  assert.equal(validation.errors.color, '"orange" is not an approved production colour.');
  assert.equal(validation.message, "Some fields need attention.");

  const nested = refusalFrom({ data: { errors: [{ path: "qualityOptions.0.layerHeight", message: "not an approved layer height" }] } });
  assert.ok(nested.errors.qualities);

  const hook = refusalFrom({ message: 'SKU "rg": A SKU uses uppercase letters' });
  assert.match(hook.errors.sku ?? "", /SKU/);
  assert.match(hook.message, /SKU/);

  const unique = refusalFrom({ message: 'duplicate key value violates unique constraint "products_sku_idx"' });
  assert.equal(unique.errors.sku, "SKU already exists on another product.");

  assert.doesNotMatch(refusalFrom({}).message, /something went wrong/i);
});

test("a refusal from Payload itself is returned and nothing is reported as saved", async () => {
  refuseWith = { message: "ABS is not an available or planned material.", data: undefined };
  const result = await createProduct(OPERATOR, valid());
  assert.equal(result.ok, false);
  assert.match(!result.ok ? (result.errors.materialId ?? "") : "", /not an available or planned material/);
});

/* ------------------------------------------------------------------ *
 * Edit (regression: the workspace keeps working, safely)
 * ------------------------------------------------------------------ */

test("editing a never-published product is a validated save that keeps it unpublished", async () => {
  existingProducts.push(existing());
  const result = await updateProductSection(OPERATOR, 50, "overview", valid({ name: "Hex Spacer M5", sku: "R3D-HEX-01", slug: "hex-spacer" }));
  assert.ok(result.ok, !result.ok ? JSON.stringify(result) : "");
  const [{ args }] = calls as [Call];
  assert.equal(args.draft, false);
  assert.equal((args.data as Record<string, unknown>)._status, "draft");
  assert.equal((args.data as Record<string, unknown>).name, "Hex Spacer M5");
  assert.equal("price" in (args.data as object), false, "only the saved section is written");
  assert.equal((args.data as Record<string, unknown>).approvalStatus, undefined, "approval status is left alone");
});

test("editing a published product saves a draft version and leaves the live one alone", async () => {
  existingProducts.push(existing({ _status: "published" }));
  const result = await updateProductSection(OPERATOR, 50, "pricing", valid({ price: "130" }));
  assert.ok(result.ok);
  assert.match(result.ok ? result.message : "", /published product is unchanged/);
  const [{ args }] = calls as [Call];
  assert.equal(args.draft, true);
  assert.equal("_status" in (args.data as object), false, "never unpublishes");
});

test("replacing an approved image clears its media approval; keeping it keeps the approval", async () => {
  existingProducts.push(existing());
  await updateProductSection(OPERATOR, 50, "media", valid({ visualSrc: "/catalog/hex-spacer/front.jpg", visualKind: "photo", visualAlt: "Spacer, front" }));
  await updateProductSection(OPERATOR, 50, "media", valid({ visualSrc: "/catalog/hex-spacer/side.jpg", visualKind: "photo" }));
  const [kept, replaced] = calls.map((call) => (call.args.data as { visual: { approval: Record<string, unknown> } }).visual.approval);
  assert.equal(kept?.reference, "MEDIA-1");
  assert.deepEqual(replaced, { reference: null, approvedBy: null, approvedOn: null });
});

test("a missing product or section is refused without a write", async () => {
  const missing = await updateProductSection(OPERATOR, 404, "overview", valid());
  assert.equal(missing.ok ? "" : missing.message, "That product does not exist.");
  const bad = await updateProductSection(OPERATOR, -1, "overview", valid());
  assert.equal(bad.ok, false);
  assert.equal(calls.length, 0);
});

function formOf(values: ProductFormValues): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) for (const entry of value) form.append(key, entry);
    else form.set(key, value);
  }
  return form;
}
