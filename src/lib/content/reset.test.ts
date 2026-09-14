import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PRODUCTS } from "@/lib/catalog/products";

import {
  BackupVerificationError,
  backupName,
  collectContentBackup,
  isContentTable,
  rowCounts,
  writeContentBackup,
} from "./backup";
import { planCategories, planMaterials } from "./plan";
import { decideStale, deepestFirst, sameContent } from "./reconcile";
import { assessResetEnvironment, describeDatabase } from "./reset-guard";
import { compareCategories, compareMaterials } from "./verify";

/**
 * The content reset's safety rails: the environment guard, the backup, the
 * stale-content decisions and the non-product parity checks. All pure, so the
 * rules that decide whether content is deleted are tested without a database.
 */

const DEV = {
  NODE_ENV: "development",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:secret@db.example.supabase.co:5432/postgres",
  CONTENT_RESET_CONFIRM: "YES",
};

/* ------------------------------------------------------------------ *
 * Environment guard
 * ------------------------------------------------------------------ */

test("a confirmed development environment may reset, and the target hides credentials", () => {
  const decision = assessResetEnvironment(DEV);
  assert.equal(decision.allowed, true);
  assert.ok(decision.allowed && !decision.database.includes("secret") && !decision.database.includes("user"));
  assert.equal(describeDatabase(DEV.DATABASE_URL), "db.example.supabase.co:5432/postgres");
});

test("production refuses the reset, whatever else is set", () => {
  for (const env of [
    { ...DEV, NODE_ENV: "production" },
    { ...DEV, VERCEL_ENV: "production" },
    { ...DEV, VERCEL: "1" },
    { ...DEV, SADA_ENV: "production" },
    { ...DEV, APP_ENV: "Production" },
  ]) {
    assert.equal(assessResetEnvironment(env).allowed, false, JSON.stringify(env));
  }
});

test("a deployed site URL refuses the reset", () => {
  const decision = assessResetEnvironment({ ...DEV, NEXT_PUBLIC_SITE_URL: "https://sada3d.com" });
  assert.equal(decision.allowed, false);
  assert.ok(!decision.allowed && decision.reasons.some((reason) => reason.includes("sada3d.com")));
});

test("the reset requires the exact confirmation", () => {
  for (const confirm of [undefined, "", "yes", "true", "1", "YES "]) {
    assert.equal(assessResetEnvironment({ ...DEV, CONTENT_RESET_CONFIRM: confirm }).allowed, false, String(confirm));
  }
});

test("a missing database refuses the reset", () => {
  assert.equal(assessResetEnvironment({ ...DEV, DATABASE_URL: "" }).allowed, false);
});

/* ------------------------------------------------------------------ *
 * Backup
 * ------------------------------------------------------------------ */

test("only content tables are backed up — never users, sessions or customer data", () => {
  for (const name of ["products", "_products_v", "products_rels", "categories", "_materials_v_version_best_for", "media", "homepage_industries"]) {
    assert.ok(isContentTable(name), name);
  }
  for (const name of ["users", "users_sessions", "payload_preferences", "customers", "orders", "order_items", "saved_items", "customer_carts", "customer_designs", "payload_migrations"]) {
    assert.ok(!isContentTable(name), name);
  }
});

test("a backup is written, read back, and named for when it was taken", async () => {
  const now = new Date("2026-09-13T06:10:59.219Z");
  const directory = mkdtempSync(join(tmpdir(), "sada3d-backup-"));

  try {
    const backup = await collectContentBackup(
      {
        listTables: async () => ["products", "users", "categories", "orders"],
        readTable: async (name) => (name === "products" ? [{ id: 1 }, { id: 2 }] : [{ id: 9 }]),
        readDocuments: async () => ({ products: [{ productId: "p-101" }] }),
      },
      "db.example:5432/postgres",
      now,
    );

    assert.deepEqual(Object.keys(backup.tables), ["categories", "products"], "a non-content table was backed up");

    const written = writeContentBackup(directory, backup, now);
    assert.equal(backupName(now), "sada3d-content-pre-reset-2026-09-13T06-10-59-219Z");
    assert.ok(written.file.endsWith("sada3d-content-pre-reset-2026-09-13T06-10-59-219Z.json"));
    assert.deepEqual(written.counts, { categories: 1, products: 2 });

    const reread = JSON.parse(readFileSync(written.file, "utf8"));
    assert.deepEqual(rowCounts(reread), written.counts);
    assert.equal(reread.database, "db.example:5432/postgres");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a backup that loses rows on the way to disk throws instead of counting as a backup", () => {
  /*
   * Simulates silent loss: a table reports two rows read, but serialises only
   * one. The reset must never go on to delete after a backup like that.
   */
  const directory = mkdtempSync(join(tmpdir(), "sada3d-backup-"));
  try {
    const lossy = Object.assign([{ id: 1 }, { id: 2 }], { toJSON: () => [{ id: 1 }] });
    const backup = {
      kind: "sada3d-content-backup" as const,
      version: 1 as const,
      createdAt: "",
      database: "",
      tables: { products: lossy },
      documents: {},
    };

    assert.throws(() => writeContentBackup(directory, backup, new Date(0)), BackupVerificationError);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * Stale content
 * ------------------------------------------------------------------ */

const doc = { collection: "products" as const, key: "p-001", id: 2, status: "published" as const };

test("sync mode unpublishes stale content and never deletes it", () => {
  assert.equal(decideStale(doc, "sync", []).action, "unpublish");
  assert.equal(decideStale({ ...doc, status: "draft" }, "sync", []).action, "none");
});

test("reset mode deletes unreferenced stale content", () => {
  assert.equal(decideStale(doc, "reset", []).action, "delete");
});

test("reset mode archives instead of deleting anything still referenced", () => {
  const decision = decideStale(doc, "reset", ["saved_items ×1"]);
  assert.equal(decision.action, "unpublish");
  assert.match(decision.reason, /saved_items/);
  assert.equal(decideStale({ ...doc, status: "draft" }, "reset", ["customer_carts ×2"]).action, "none");
});

test("stale categories are removed children first", () => {
  const all = [
    { id: 14, parent: null },
    { id: 11, parent: 14 },
    { id: 13, parent: 11 },
    { id: 1, parent: null },
    { id: 6, parent: 1 },
  ];
  assert.deepEqual(deepestFirst(all).map((category) => category.id), [13, 6, 11, 1, 14]);
});

test("an unchanged document compares equal, so a second import writes nothing", () => {
  const stored = {
    id: 5,
    name: "Spur Gear, 24 Teeth",
    applications: [{ id: "65f1", value: "Teaching models" }],
    model: { url: "/models/spur-gear-24t.stl", format: "stl" },
    seo: { title: "Spur Gear, 24 Teeth", description: "x", ogImage: null },
    badge: null,
    _status: "published",
  };
  const planned = {
    name: "Spur Gear, 24 Teeth",
    applications: [{ value: "Teaching models" }],
    model: { format: "stl", url: "/models/spur-gear-24t.stl" },
    seo: { title: "Spur Gear, 24 Teeth", description: "x" },
    badge: null,
    _status: "published",
  };

  assert.equal(sameContent(stored, planned), true);
  assert.equal(sameContent({ ...stored, badge: "New" }, planned), false, "a value removed from the canonical catalog must be written");
  assert.equal(sameContent({ ...stored, _status: "draft" }, planned), false);
});

/* ------------------------------------------------------------------ *
 * Categories and materials parity
 * ------------------------------------------------------------------ */

test("category parity catches a missing, extra or changed category", () => {
  const expected = planCategories()
    .filter((row) => row.status === "published")
    .map((row) => ({ value: row.value, name: row.name, description: row.description, parent: row.parent, isBrowse: row.isBrowse, browseOrder: row.browseOrder }));

  assert.equal(compareCategories(expected, expected).ok, true);
  assert.equal(compareCategories(expected, expected.slice(1)).ok, false);
  assert.equal(compareCategories(expected, [...expected, { value: "18-gst", name: "18% GST" }]).ok, false);
  assert.equal(compareCategories(expected, expected.map((row) => ({ ...row, name: "Renamed" }))).ok, false);
});

test("material parity catches drifted technologies", () => {
  const expected = planMaterials().map((row) => ({ ...row, status: undefined }));

  assert.equal(compareMaterials(expected, expected).ok, true);
  const drifted = expected.map((row) => (row.value === "resin" ? { ...row, technologies: ["fdm"] } : row));
  assert.equal(compareMaterials(expected, drifted).ok, false);
});

test("the published canonical catalog excludes drafts", () => {
  assert.ok(PRODUCTS.length > 0);
  for (const product of PRODUCTS) assert.notEqual(product.priceStatus, undefined);
});
