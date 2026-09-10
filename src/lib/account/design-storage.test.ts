import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { eq } from "drizzle-orm";

import { designDetailDto, parseUploadIntent, uploadIntentDto } from "@/lib/api/designs";
import { orderDetailDto } from "@/lib/api/dto";
import { RATE_LIMITS, enforceRateLimit, resetRateLimits } from "@/lib/api/rate-limit";
import type { CartTotals, CustomCartLine, PricedCart } from "@/lib/cart/types";
import { toOrderItems } from "@/lib/checkout/service";
import { MAX_MODEL_BYTES } from "@/lib/custom-print/types";
import { setDatabaseProvider, type DatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import { customerDesigns, geometryAnalyses } from "@/lib/db/schema";
import {
  DomainError,
  InfrastructureError,
  NotFoundError,
  RateLimitedError,
  UploadRejectedError,
  ValidationError,
} from "@/lib/errors";
import { cube3mf, cubeObj, cubeStl, twoPart3mf } from "@/lib/models/fixtures";
import { setLogSink, type LogRecord } from "@/lib/observability";
import { aggregateOrderStatus } from "@/lib/orders/aggregate";
import { orderRepository } from "@/lib/orders/repository";
import type { Order } from "@/lib/orders/types";
import { setStorageAdapter } from "@/lib/storage";
import { designObjectKey, keyBelongsTo, newDesignId, newObjectId, ownerSegment } from "@/lib/storage/keys";
import { createMemoryStorage, type MemoryStorage } from "@/lib/storage/memory.testing";
import { sha256Hex } from "@/lib/storage/stream";

import {
  ABANDONED_UPLOAD_GRACE_MS,
  DELETED_OBJECT_GRACE_MS,
  authorizeDesignDownload,
  deleteCustomerDesign,
  designFileAvailability,
  linkOrderToDesigns,
  readCustomerDesign,
  resolveManufacturingFiles,
  sweepDesignStorage,
} from "./design-files";
import {
  MAX_ACTIVE_UPLOADS,
  completeUpload,
  createUploadIntent,
  type UploadIntent,
} from "./design-uploads";
import { customerDesignRepository, listCustomerDesigns } from "./designs";
import type { CustomerIdentity } from "./types";

/**
 * Durable design storage, end to end.
 *
 * Against real PostgreSQL (PGlite, with the committed migrations) and the
 * storage double, so every constraint, guarded transition and failure ordering
 * is the real one. The double enforces what a signed URL carries — expiry,
 * type, length — and lets any operation fail on demand.
 *
 * What these tests do not show is that Cloudflare R2 behaves like the double.
 * That is `npm run storage:verify`, run against the real bucket.
 */

let harness: TestDatabase;
let storage: MemoryStorage;
const logs: LogRecord[] = [];
let sequence = 0;
let stlSize = 10;

const MINUTE = 60_000;

before(async () => {
  harness = await createTestDatabase();
  setDatabaseProvider(harness);
  setLogSink({ name: "capture", write: (record) => logs.push(record) });
});

beforeEach(() => {
  storage = createMemoryStorage();
  setStorageAdapter(storage);
  resetRateLimits();
});

after(async () => {
  setStorageAdapter(null);
  setLogSink(null);
  setDatabaseProvider(null);
  await harness.destroy();
});

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const customer = (): CustomerIdentity => ({ id: `cus_storage_${(sequence += 1)}` });

/** A valid binary STL whose bytes no other test uses. */
const uniqueStl = () => cubeStl((stlSize += 1));

const inputFor = (bytes: Uint8Array, fileName: string) => ({
  fileName,
  sizeBytes: bytes.byteLength,
  sha256: sha256Hex(bytes),
});

type UploadRequired = Extract<UploadIntent, { status: "upload_required" }>;

async function requestUpload(
  identity: CustomerIdentity,
  bytes: Uint8Array,
  fileName: string,
): Promise<UploadRequired> {
  const intent = await createUploadIntent(identity, inputFor(bytes, fileName));
  assert.equal(intent.status, "upload_required");
  return intent as UploadRequired;
}

async function storeVerified(identity: CustomerIdentity, bytes: Uint8Array, fileName: string) {
  const intent = await requestUpload(identity, bytes, fileName);
  storage.upload(intent.upload, bytes);
  return completeUpload(identity, intent.design.id);
}

async function rowFor(designId: string) {
  const db = await harness.database();
  const rows = await db.select().from(customerDesigns).where(eq(customerDesigns.id, designId));
  return rows[0];
}

async function rejection(work: () => Promise<unknown>): Promise<DomainError> {
  try {
    await work();
  } catch (error) {
    assert.ok(error instanceof DomainError, `expected a domain error, got ${String(error)}`);
    return error;
  }
  assert.fail("expected the operation to be refused");
}

const TOTALS: CartTotals = {
  currency: "INR",
  subtotal: 900,
  shipping: { known: false, reason: "Confirmed before dispatch" },
  tax: { known: false, reason: "Added on the tax invoice" },
  total: 900,
  excluded: ["Shipping", "GST"],
  unitCount: 2,
  provisional: true,
};

function customLine(designId: string, name: string, sizeBytes: number): CustomCartLine {
  const now = new Date().toISOString();
  return {
    type: "custom",
    id: `custom:${designId}:petg:precision:standard`,
    quantity: 2,
    model: { modelId: designId, name, extension: ".stl", sizeBytes, formatLabel: "STL" },
    configuration: { material: "petg", quality: "precision", finish: "standard" },
    quote: {
      rulesVersion: "test",
      total: 900,
      basis: "configuration",
      provisional: true,
      quotedAt: now,
    },
    addedAt: now,
  };
}

/* ------------------------------------------------------------------ *
 * The happy path
 * ------------------------------------------------------------------ */

test("an intent writes a pending design with a server-generated key before any upload", async () => {
  const alice = customer();
  const bytes = cube3mf();

  const intent = await requestUpload(alice, bytes, "bracket.3mf");
  const row = await rowFor(intent.design.id);

  assert.ok(row);
  assert.equal(row.storageState, "pending");
  assert.equal(row.customerId, alice.id);
  assert.equal(row.sha256, sha256Hex(bytes));
  assert.ok(row.storageKey && keyBelongsTo(row.storageKey, alice.id, intent.design.id));
  assert.equal(row.contentType, "model/3mf", "the content type was not the server's");
  assert.equal(intent.upload.headers["Content-Type"], "model/3mf");
  assert.equal(storage.objects.size, 0, "something was stored before the upload");

  const dto = uploadIntentDto(intent);

  // No field of the response names the key or the customer…
  assert.ok(
    !JSON.stringify({ ...dto, upload: null }).includes(row.storageKey),
    "the storage key is a field of the response",
  );
  assert.ok(!JSON.stringify(dto).includes(alice.id), "the customer id reached the response");

  // …and the one place the key appears is the path of the signed URL, which
  // has to address the object it authorises a single PUT of.
  assert.ok(dto.upload);
  assert.ok(new URL(dto.upload.url).pathname.endsWith(row.storageKey));
});

test("a stored 3MF is verified and measured from the persisted bytes", async () => {
  const alice = customer();
  const bytes = cube3mf();

  const { design, analysis } = await storeVerified(alice, bytes, "cube.3mf");

  assert.equal(design.storageState, "verified");
  assert.ok(design.verifiedAt);
  assert.ok(analysis);
  assert.equal(analysis.objectCount, 1);
  assert.equal(analysis.volume.state, "available");
  assert.ok(analysis.volume.state === "available" && Math.abs(analysis.volume.value - 1000) < 1e-6);
  assert.equal(design.analysisIdentity, `${analysis.identity}.v1`);

  // The identity is derived from the stored bytes, so it is stable.
  assert.equal(analysis.identity, `mdl_${sha256Hex(bytes).slice(0, 32)}`);

  const db = await harness.database();
  const records = await db
    .select()
    .from(geometryAnalyses)
    .where(eq(geometryAnalyses.sha256, sha256Hex(bytes)));
  assert.equal(records.length, 1, "the analysis was not recorded durably");
});

test("a multi-part 3MF keeps its structure through storage", async () => {
  const alice = customer();
  const { analysis } = await storeVerified(alice, twoPart3mf(), "assembly.3mf");

  assert.ok(analysis);
  assert.equal(analysis.objectCount, 2);
  assert.equal(analysis.objects.length, 2);
});

test("STL and OBJ are measured; STEP is stored and verified but never measured", async () => {
  const alice = customer();

  const stl = await storeVerified(alice, uniqueStl(), "part.stl");
  assert.equal(stl.design.storageState, "verified");
  assert.ok(stl.analysis);

  const obj = await storeVerified(alice, cubeObj(7), "part.obj");
  assert.ok(obj.analysis);

  const stepBytes = new TextEncoder().encode("ISO-10303-21;\nHEADER;\nFILE_NAME('gear');\nENDSEC;\nEND-ISO-10303-21;\n");
  const step = await storeVerified(alice, stepBytes, "gear.step");
  assert.equal(step.design.storageState, "verified");
  assert.equal(step.analysis, null, "a STEP file acquired measurements");
  assert.equal(designDetailDto(step.design, step.analysis).analysisState, "unsupported");

  const available = await designFileAvailability(alice, step.design.id, { verifyObject: true });
  assert.equal(available.durable, true);
});

test("the account lists verified designs only", async () => {
  const alice = customer();

  const verified = await storeVerified(alice, uniqueStl(), "kept.stl");
  await requestUpload(alice, uniqueStl(), "unfinished.stl");

  const listed = await listCustomerDesigns(alice);
  assert.equal(listed.status, "ok");
  assert.ok(listed.status === "ok");
  assert.deepEqual(listed.items.map((item) => item.id), [verified.design.id]);
  assert.ok(!JSON.stringify(listed).includes(verified.design.fileKey));
});

/* ------------------------------------------------------------------ *
 * Idempotency
 * ------------------------------------------------------------------ */

test("finalising twice converges on one verified design", async () => {
  const alice = customer();
  const bytes = uniqueStl();
  const intent = await requestUpload(alice, bytes, "twice.stl");
  storage.upload(intent.upload, bytes);

  const [first, second] = await Promise.all([
    completeUpload(alice, intent.design.id),
    completeUpload(alice, intent.design.id),
  ]);
  const third = await completeUpload(alice, intent.design.id);

  for (const result of [first, second, third]) {
    assert.equal(result.design.id, intent.design.id);
    assert.equal(result.design.storageState, "verified");
  }

  const designs = await customerDesignRepository.list(alice.id);
  assert.equal(designs.length, 1);
});

test("requesting an upload twice for the same file resumes the same design", async () => {
  const alice = customer();
  const bytes = uniqueStl();

  const first = await requestUpload(alice, bytes, "again.stl");
  const second = await requestUpload(alice, bytes, "again-renamed.stl");

  assert.equal(second.design.id, first.design.id);
  assert.notEqual(second.upload.url, first.upload.url, "the same signature was handed out twice");

  storage.upload(second.upload, bytes);
  await completeUpload(alice, first.design.id);

  const third = await createUploadIntent(alice, inputFor(bytes, "again.stl"));
  assert.equal(third.status, "already_stored");
  assert.equal(third.design.id, first.design.id);
  assert.equal(uploadIntentDto(third).upload, null);

  assert.equal((await customerDesignRepository.list(alice.id)).length, 1);
});

test("the same file from two customers is two designs in two namespaces", async () => {
  const alice = customer();
  const bob = customer();
  const bytes = uniqueStl();

  const mine = await storeVerified(alice, bytes, "shared.stl");
  const theirs = await storeVerified(bob, bytes, "shared.stl");

  assert.notEqual(mine.design.id, theirs.design.id);
  assert.notEqual(mine.design.fileKey, theirs.design.fileKey);
  assert.ok(keyBelongsTo(mine.design.fileKey, alice.id, mine.design.id));
  assert.ok(keyBelongsTo(theirs.design.fileKey, bob.id, theirs.design.id));
});

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

test("unsupported, empty, oversized and unnamed uploads are refused", async () => {
  const alice = customer();
  const sha256 = sha256Hex(new Uint8Array([1]));

  for (const input of [
    { fileName: "virus.exe", sizeBytes: 10, sha256 },
    { fileName: "model.glb", sizeBytes: 10, sha256 },
    { fileName: "part.stl", sizeBytes: 0, sha256 },
    { fileName: "part.stl", sizeBytes: MAX_MODEL_BYTES + 1, sha256 },
    { fileName: "../../etc/passwd", sizeBytes: 10, sha256 },
    { fileName: "part.stl", sizeBytes: 10, sha256: "not-a-checksum" },
    { fileName: "part.stl", sizeBytes: 10, sha256: "A".repeat(63) },
  ]) {
    const error = await rejection(() => createUploadIntent(alice, input));
    assert.ok(error instanceof ValidationError, JSON.stringify(input));
  }

  assert.equal((await customerDesignRepository.list(alice.id)).length, 0);
});

test("a traversal filename is stored as its base name, inside the customer's namespace", async () => {
  const alice = customer();
  const bob = customer();
  const bytes = uniqueStl();

  const intent = await requestUpload(
    alice,
    bytes,
    `customer-designs/${ownerSegment(bob.id)}/../../bracket.stl`,
  );

  assert.equal(intent.design.name, "bracket.stl");
  assert.ok(keyBelongsTo(intent.design.fileKey, alice.id, intent.design.id));
  assert.ok(!intent.design.fileKey.includes(ownerSegment(bob.id)));
});

test("an intent naming a customer or a storage key is refused, not obeyed", () => {
  const valid = { fileName: "part.stl", sizeBytes: 684, sha256: "a".repeat(64) };

  assert.deepEqual(parseUploadIntent(valid), valid);

  for (const extra of [
    { customerId: "cus_someone_else" },
    { storageKey: "customer-designs/other/dsn_x/obj_y/source" },
    { key: "anything" },
    { contentType: "text/html" },
  ]) {
    assert.throws(
      () => parseUploadIntent({ ...valid, ...extra }),
      (error: unknown) => error instanceof ValidationError,
      JSON.stringify(extra),
    );
  }
});

test("a customer cannot hold more than the allowed uploads in flight", async () => {
  const alice = customer();

  for (let index = 0; index < MAX_ACTIVE_UPLOADS; index += 1) {
    await requestUpload(alice, uniqueStl(), `open-${index}.stl`);
  }

  const error = await rejection(() => createUploadIntent(alice, inputFor(uniqueStl(), "one-more.stl")));
  assert.ok(error instanceof RateLimitedError);
});

test("the per-customer rate limit refuses, says when to retry, and resets", () => {
  const rule = { name: "test.rule", limit: 2, windowMs: 1000 };

  enforceRateLimit(rule, "cus_a", 0);
  enforceRateLimit(rule, "cus_a", 10);
  assert.throws(
    () => enforceRateLimit(rule, "cus_a", 20),
    (error: unknown) => error instanceof RateLimitedError && error.retryAfterSeconds >= 1,
  );

  // Another customer's budget is their own.
  enforceRateLimit(rule, "cus_b", 20);
  // And the window ends.
  enforceRateLimit(rule, "cus_a", 1000);

  assert.ok(RATE_LIMITS.uploadIntent.limit > 0);
});

/* ------------------------------------------------------------------ *
 * Verification refuses what does not match
 * ------------------------------------------------------------------ */

test("finalising before the upload arrives waits while the window is open, then fails", async () => {
  const alice = customer();
  const intent = await requestUpload(alice, uniqueStl(), "late.stl");

  const early = await rejection(() => completeUpload(alice, intent.design.id));
  assert.equal(early.kind, "conflict");
  assert.equal((await rowFor(intent.design.id))?.storageState, "pending");

  const later = new Date(Date.now() + 11 * MINUTE);
  const expired = await rejection(() => completeUpload(alice, intent.design.id, later));
  assert.ok(expired instanceof UploadRejectedError);
  assert.equal(expired.reason, "upload_missing");
  assert.equal((await rowFor(intent.design.id))?.storageState, "failed");
});

test("bytes that differ from the declared checksum are refused and removed", async () => {
  const alice = customer();
  const declared = uniqueStl();
  const intent = await requestUpload(alice, declared, "swapped.stl");

  // Same length and type, so the signature allows it — different content.
  const swapped = new Uint8Array(declared);
  swapped[100] = (swapped[100] ?? 0) ^ 0xff;
  storage.upload(intent.upload, swapped);

  const first = await rejection(() => completeUpload(alice, intent.design.id));
  assert.ok(first instanceof UploadRejectedError);
  assert.equal(first.reason, "checksum_mismatch");
  assert.equal(first.kind, "upload_rejected");
  assert.ok(!storage.objects.has(intent.design.fileKey), "refused bytes were left in storage");

  // The verdict is recorded: retrying gives the same answer.
  const second = await rejection(() => completeUpload(alice, intent.design.id));
  assert.ok(second instanceof UploadRejectedError);
  assert.equal(second.reason, "checksum_mismatch");
  assert.equal(second.message, first.message);

  // Removal is not *recorded* until the upload URL has expired, because the
  // browser could still put the object back. The sweep records it after.
  assert.equal((await rowFor(intent.design.id))?.objectRemovedAt, null);
  await sweepDesignStorage({ now: new Date(Date.now() + 11 * MINUTE) });
  assert.ok((await rowFor(intent.design.id))?.objectRemovedAt);
});

test("an object of the wrong size is refused without being read", async () => {
  const alice = customer();
  const bytes = uniqueStl();
  const intent = await requestUpload(alice, bytes, "resized.stl");

  await storage.put({
    key: intent.design.fileKey,
    body: new Uint8Array(bytes.byteLength + 50),
    contentType: "model/stl",
  });
  storage.calls.length = 0;

  const error = await rejection(() => completeUpload(alice, intent.design.id));
  assert.ok(error instanceof UploadRejectedError);
  assert.equal(error.reason, "size_mismatch");
  assert.ok(!storage.calls.includes("get"), "the oversized object was downloaded");
});

test("a file whose bytes are not its extension's format is refused", async () => {
  const alice = customer();
  const stl = uniqueStl();

  const intent = await requestUpload(alice, stl, "disguised.3mf");
  storage.upload(intent.upload, stl);

  const error = await rejection(() => completeUpload(alice, intent.design.id));
  assert.ok(error instanceof UploadRejectedError);
  assert.equal(error.reason, "format_invalid");
});

test("a damaged 3MF and one carrying a DOCTYPE are refused by the parser", async () => {
  const alice = customer();

  const whole = cube3mf();
  const truncated = whole.slice(0, whole.byteLength - 40);

  const doctype = cube3mf({
    rawModel:
      '<?xml version="1.0"?><!DOCTYPE model [<!ENTITY lol "lol">]>' +
      '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
      "<resources></resources><build></build></model>",
  });

  for (const [name, bytes] of [
    ["truncated.3mf", truncated],
    ["doctype.3mf", doctype],
  ] as const) {
    const intent = await requestUpload(alice, bytes, name);
    storage.upload(intent.upload, bytes);

    const error = await rejection(() => completeUpload(alice, intent.design.id));
    assert.ok(error instanceof UploadRejectedError, name);
    assert.equal(error.reason, "model_unreadable", name);
    assert.equal((await rowFor(intent.design.id))?.storageState, "failed");
  }
});

/* ------------------------------------------------------------------ *
 * Failure ordering
 * ------------------------------------------------------------------ */

test("storage failing during finalisation leaves the design pending, and a retry verifies it", async () => {
  const alice = customer();
  const bytes = uniqueStl();
  const intent = await requestUpload(alice, bytes, "retry.stl");
  storage.upload(intent.upload, bytes);

  storage.failNext("get");
  const error = await rejection(() => completeUpload(alice, intent.design.id));
  assert.ok(error instanceof InfrastructureError);
  assert.equal(error.message.includes("R2"), false, "a provider detail reached the customer");
  assert.equal((await rowFor(intent.design.id))?.storageState, "pending");

  const retried = await completeUpload(alice, intent.design.id);
  assert.equal(retried.design.storageState, "verified");
});

test("the database failing after the object is stored loses track of nothing", async () => {
  const alice = customer();
  const bytes = uniqueStl();
  const intent = await requestUpload(alice, bytes, "db-down.stl");
  storage.upload(intent.upload, bytes);

  /*
   * Fails the third database call of finalisation: after the design was read
   * and the stored object verified, at the point the analysis is written.
   */
  let calls = 0;
  const flaky: DatabaseProvider = {
    name: "flaky",
    async database() {
      calls += 1;
      if (calls === 3) throw new Error("connection terminated unexpectedly");
      return harness.database();
    },
    async close() {},
  };

  setDatabaseProvider(flaky);
  try {
    await assert.rejects(() => completeUpload(alice, intent.design.id));
  } finally {
    setDatabaseProvider(harness);
  }

  // The row still names the object, and the object is still there.
  const row = await rowFor(intent.design.id);
  assert.equal(row?.storageState, "pending");
  assert.ok(storage.objects.has(intent.design.fileKey));

  const retried = await completeUpload(alice, intent.design.id);
  assert.equal(retried.design.storageState, "verified");
});

test("a failed signing leaves a pending row that the sweep closes", async () => {
  const alice = customer();
  const bytes = uniqueStl();

  storage.failNext("signUpload");
  const error = await rejection(() => createUploadIntent(alice, inputFor(bytes, "unsigned.stl")));
  assert.ok(error instanceof InfrastructureError);

  const [pending] = await customerDesignRepository.list(alice.id);
  assert.equal(pending?.storageState, "pending");

  const later = new Date(Date.now() + 11 * MINUTE + ABANDONED_UPLOAD_GRACE_MS);
  const report = await sweepDesignStorage({ now: later });

  assert.ok(report.abandoned >= 1);
  const closed = await rowFor(pending?.id ?? "");
  assert.equal(closed?.storageState, "failed");
  assert.equal(closed?.failureCode, "upload_abandoned");
  assert.ok(closed?.objectRemovedAt);
});

test("an upload nobody finalised is closed and its object removed", async () => {
  const alice = customer();
  const bytes = uniqueStl();
  const intent = await requestUpload(alice, bytes, "abandoned.stl");
  storage.upload(intent.upload, bytes);

  const later = new Date(Date.now() + 11 * MINUTE + ABANDONED_UPLOAD_GRACE_MS);
  await sweepDesignStorage({ now: later });

  assert.equal((await rowFor(intent.design.id))?.storageState, "failed");
  assert.ok(!storage.objects.has(intent.design.fileKey), "the orphan object survived");
});

test("a removal that fails is retried by the next sweep", async () => {
  const alice = customer();
  const { design } = await storeVerified(alice, uniqueStl(), "stubborn.stl");

  await deleteCustomerDesign(alice, design.id);
  const due = new Date(Date.now() + DELETED_OBJECT_GRACE_MS + 11 * MINUTE);

  storage.failNext("delete");
  const first = await sweepDesignStorage({ now: due });
  assert.ok(first.failed >= 1);
  assert.ok(storage.objects.has(design.fileKey));
  assert.equal((await rowFor(design.id))?.objectRemovedAt, null);
  assert.ok(logs.some((record) => record.event === "storage.cleanup.required"));

  const second = await sweepDesignStorage({ now: due });
  assert.ok(second.removed >= 1);
  assert.ok(!storage.objects.has(design.fileKey));
  assert.ok((await rowFor(design.id))?.objectRemovedAt);
});

/* ------------------------------------------------------------------ *
 * Retrieval and deletion
 * ------------------------------------------------------------------ */

test("a download is a short-lived URL for the owner's verified file", async () => {
  const alice = customer();
  const { design } = await storeVerified(alice, uniqueStl(), "download.stl");

  const before = Date.now();
  const signed = await authorizeDesignDownload(alice, design.id);

  assert.ok(signed.url.includes(encodeURI(design.fileKey).split("/").pop() ?? "source"));
  assert.ok(Date.parse(signed.expiresAt) - before <= 121_000, "the URL lives too long");
});

test("another customer's design and a design that does not exist are the same 404", async () => {
  const alice = customer();
  const bob = customer();
  const { design } = await storeVerified(alice, uniqueStl(), "private.stl");

  const attempts: [string, () => Promise<unknown>][] = [
    ["download", () => authorizeDesignDownload(bob, design.id)],
    ["read", () => readCustomerDesign(bob, design.id)],
    ["complete", () => completeUpload(bob, design.id)],
    ["delete", () => deleteCustomerDesign(bob, design.id)],
  ];

  const unknown = await rejection(() => authorizeDesignDownload(bob, newDesignId()));
  assert.ok(unknown instanceof NotFoundError);

  for (const [label, attempt] of attempts) {
    const error = await rejection(attempt);
    assert.ok(error instanceof NotFoundError, label);
    assert.equal(error.message, unknown.message, `${label} distinguished "not yours" from "not found"`);
  }

  // And Alice's design is untouched by any of it.
  assert.equal((await rowFor(design.id))?.storageState, "verified");
});

test("a storage key is not a way to ask for a file", async () => {
  const alice = customer();
  const { design } = await storeVerified(alice, uniqueStl(), "keyed.stl");

  for (const hostile of [
    design.fileKey,
    `../${design.id}`,
    `${design.id}/../other`,
    "customer-designs/anything/dsn_000000000000000000000000/obj_x/source",
  ]) {
    const error = await rejection(() => authorizeDesignDownload(alice, hostile));
    assert.ok(error instanceof NotFoundError, hostile);
  }
});

test("a key altered in the database to point elsewhere is refused", async () => {
  const alice = customer();
  const bob = customer();
  const { design } = await storeVerified(alice, uniqueStl(), "tampered.stl");

  const foreign = designObjectKey({ customerId: bob.id, designId: design.id, objectId: newObjectId() });
  const db = await harness.database();
  await db.update(customerDesigns).set({ storageKey: foreign }).where(eq(customerDesigns.id, design.id));

  const error = await rejection(() => authorizeDesignDownload(alice, design.id));
  assert.ok(error instanceof NotFoundError);

  const availability = await designFileAvailability(alice, design.id, { verifyObject: false });
  assert.equal(availability.durable, false);
});

test("pending, failed and deleted designs cannot be downloaded", async () => {
  const alice = customer();

  const pending = await requestUpload(alice, uniqueStl(), "pending.stl");
  assert.ok((await rejection(() => authorizeDesignDownload(alice, pending.design.id))) instanceof NotFoundError);

  const { design } = await storeVerified(alice, uniqueStl(), "deleted.stl");
  await deleteCustomerDesign(alice, design.id);
  await deleteCustomerDesign(alice, design.id); // idempotent

  assert.ok((await rejection(() => authorizeDesignDownload(alice, design.id))) instanceof NotFoundError);
  assert.ok((await rejection(() => readCustomerDesign(alice, design.id))) instanceof NotFoundError);
  assert.equal((await designFileAvailability(alice, design.id, { verifyObject: true })).durable, false);
});

test("a deleted design keeps its object through the grace period, then loses it", async () => {
  const alice = customer();
  const { design } = await storeVerified(alice, uniqueStl(), "graceful.stl");

  const deletedAt = new Date();
  await deleteCustomerDesign(alice, design.id, deletedAt);

  await sweepDesignStorage({ now: new Date(deletedAt.getTime() + DELETED_OBJECT_GRACE_MS / 2) });
  assert.ok(storage.objects.has(design.fileKey), "removed inside the grace period");

  await sweepDesignStorage({ now: new Date(deletedAt.getTime() + DELETED_OBJECT_GRACE_MS + 11 * MINUTE) });
  assert.ok(!storage.objects.has(design.fileKey), "not removed after the grace period");
});

test("an object that disappears after verification is caught before an order and on download", async () => {
  const alice = customer();
  const { design } = await storeVerified(alice, uniqueStl(), "vanishing.stl");

  // The database still says verified; only storage knows better.
  assert.equal((await designFileAvailability(alice, design.id, { verifyObject: false })).durable, true);

  storage.vanish(design.fileKey);

  assert.equal((await designFileAvailability(alice, design.id, { verifyObject: true })).durable, false);
  assert.ok((await rejection(() => authorizeDesignDownload(alice, design.id))) instanceof NotFoundError);

  const files = await resolveManufacturingFiles(alice, [
    customLine(design.id, design.name, design.sizeBytes),
  ]);
  assert.equal(files.ok, false);
  assert.ok(logs.some((record) => record.event === "design.object.missing"));
});

/* ------------------------------------------------------------------ *
 * Custom orders
 * ------------------------------------------------------------------ */

test("only a verified, stored design of the customer's own can be ordered", async () => {
  const alice = customer();
  const bob = customer();

  const verified = await storeVerified(alice, uniqueStl(), "orderable.stl");
  const pending = await requestUpload(alice, uniqueStl(), "unfinished.stl");

  const cases: [string, CustomerIdentity | null, string, boolean][] = [
    ["a guest", null, verified.design.id, false],
    ["a file only in the browser", alice, "mdl_abc12345", false],
    ["an unfinished upload", alice, pending.design.id, false],
    ["someone else's design", bob, verified.design.id, false],
    ["their own verified design", alice, verified.design.id, true],
  ];

  for (const [label, identity, designId, expected] of cases) {
    const result = await designFileAvailability(identity, designId, { verifyObject: true });
    assert.equal(result.durable, expected, label);
    if (!result.durable) assert.ok(result.reason.length > 0, label);
  }
});

test("storage not being configured makes designs unavailable rather than faked", async () => {
  const alice = customer();
  setStorageAdapter(null);

  try {
    const listed = await listCustomerDesigns(alice);
    assert.equal(listed.status, "unavailable");

    const error = await rejection(() => createUploadIntent(alice, inputFor(uniqueStl(), "nowhere.stl")));
    assert.ok(error instanceof InfrastructureError);

    const availability = await designFileAvailability(alice, newDesignId(), { verifyObject: true });
    assert.equal(availability.durable, false);
  } finally {
    setStorageAdapter(storage);
  }
});

test("an order snapshots the file, and later changes to the design cannot touch it", async () => {
  const alice = customer();
  const { design } = await storeVerified(alice, uniqueStl(), "ordered-bracket.stl");
  const line = customLine(design.id, design.name, design.sizeBytes);

  const files = await resolveManufacturingFiles(alice, [line]);
  assert.ok(files.ok);
  const snapshot = files.files.get(line.id);
  assert.ok(snapshot);
  assert.equal(snapshot.storageKey, design.fileKey);
  assert.equal(snapshot.sha256, design.sha256);
  assert.equal(snapshot.analysisIdentity, design.analysisIdentity);
  assert.deepEqual(snapshot.configuration, line.configuration);

  const priced: PricedCart = {
    id: "cart_snapshot",
    lines: [{ line, name: design.name, spec: "PETG / PRECISION / STANDARD", unitPrice: 450, lineTotal: 900, issues: [] }],
    totals: TOTALS,
    issues: [],
    checkoutReady: true,
  };

  const reference = await orderRepository.nextReference();
  const items = toOrderItems(priced, reference, files.files);
  const payment = { status: "paid" as const, provider: "mock" };
  const now = new Date().toISOString();

  const order: Order = {
    reference,
    cartId: priced.id,
    customerId: alice.id,
    status: aggregateOrderStatus({ items, payment }),
    payment,
    items,
    shipments: [],
    totals: TOTALS,
    contact: { name: "Test", email: "test@example.com", phone: "9876543210" },
    address: { line1: "42 Industrial Estate", city: "Hyderabad", state: "TG", postalCode: "500032", country: "IN" },
    placedAt: now,
    updatedAt: now,
    provisional: true,
  };

  await orderRepository.createOrder(order);
  await linkOrderToDesigns(order);

  const stored = await orderRepository.findOrder(reference);
  assert.ok(stored);
  assert.deepEqual(stored.items[0]?.sourceFile, snapshot);

  // A later save — a status moving — cannot rewrite which file was ordered.
  await orderRepository.saveOrder({
    ...stored,
    items: stored.items.map((item) => ({
      ...item,
      fulfillmentStatus: "in_progress" as const,
      ...(item.sourceFile
        ? { sourceFile: { ...item.sourceFile, storageKey: "customer-designs/evil", sha256: "0".repeat(64) } }
        : {}),
    })),
  });

  const resaved = await orderRepository.findOrder(reference);
  assert.equal(resaved?.items[0]?.fulfillmentStatus, "in_progress");
  assert.deepEqual(resaved?.items[0]?.sourceFile, snapshot, "the snapshot was rewritten");

  // The account knows the design was ordered.
  const linked = await customerDesignRepository.get(alice.id, design.id);
  assert.deepEqual(linked?.orderReferences, [reference]);

  // Deleting the design leaves the order, and its object, alone — forever.
  await deleteCustomerDesign(alice, design.id);
  await sweepDesignStorage({ now: new Date(Date.now() + 10 * DELETED_OBJECT_GRACE_MS) });

  assert.ok(storage.objects.has(snapshot.storageKey), "an ordered file was removed");
  assert.deepEqual((await orderRepository.findOrder(reference))?.items[0]?.sourceFile, snapshot);

  // And no customer-facing projection carries the key.
  assert.ok(!JSON.stringify(orderDetailDto(resaved ?? stored)).includes(snapshot.storageKey));
});

/* ------------------------------------------------------------------ *
 * Observability
 * ------------------------------------------------------------------ */

test("the storage lifecycle is logged by id, never by key, URL or filename", async () => {
  const alice = customer();
  logs.length = 0;

  const bytes = uniqueStl();
  const intent = await requestUpload(alice, bytes, "secret-project-name.stl");
  storage.upload(intent.upload, bytes);
  await completeUpload(alice, intent.design.id);
  await authorizeDesignDownload(alice, intent.design.id);
  await rejection(() => authorizeDesignDownload(customer(), intent.design.id));

  const events = logs.map((record) => record.event);
  for (const expected of [
    "design.upload.intent_created",
    "design.upload.finalized",
    "design.analysis.started",
    "design.analysis.completed",
    "design.object.verified",
    "design.download.granted",
    "design.download.denied",
  ]) {
    assert.ok(events.includes(expected), `${expected} was not logged`);
  }

  const serialised = JSON.stringify(logs);
  assert.ok(!serialised.includes(intent.design.fileKey), "a storage key was logged");
  assert.ok(!serialised.includes("signature="), "a signed URL was logged");
  assert.ok(!serialised.includes("secret-project-name"), "a customer filename was logged");
});
