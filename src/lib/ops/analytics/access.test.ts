import assert from "node:assert/strict";
import test from "node:test";

import { operatorFromUser } from "../operator";
import { OPS_HOME, operatorLoginHref, safeOpsPath } from "../routes";

/**
 * Who may see the command centre, as a runtime rule.
 *
 * `console-guard.test.ts` proves every console page, action and analytics read
 * goes through the operator gate; this proves what the gate decides. An
 * operator is an authenticated user of Payload's `users` collection. An
 * anonymous request and a storefront customer are not, and are sent to sign in
 * with a return path that can only lead back into the console.
 */

test("an anonymous request is not an operator", () => {
  assert.equal(operatorFromUser(null), null);
  assert.equal(operatorFromUser(undefined), null);
  assert.equal(operatorFromUser("token"), null);
});

test("a storefront customer is not an operator, whatever their record looks like", () => {
  // A Supabase Auth user: no Payload collection at all.
  assert.equal(
    operatorFromUser({ id: "5b0c5a44-7a4e-4d2e-9d63-1f1e3f1f0b11", email: "buyer@example.com", aud: "authenticated", role: "authenticated" }),
    null,
  );
  // The application's customer mapping row.
  assert.equal(operatorFromUser({ id: "cus_123", authProvider: "supabase", authSubject: "abc" }), null);
  // A user of any other auth collection, should one ever be added.
  assert.equal(operatorFromUser({ id: 1, email: "buyer@example.com", collection: "customers" }), null);
});

test("an incomplete Payload user is refused rather than half-trusted", () => {
  assert.equal(operatorFromUser({ collection: "users", id: 1 }), null);
  assert.equal(operatorFromUser({ collection: "users", email: "ops@example.com" }), null);
  assert.equal(operatorFromUser({ collection: "users", id: { nested: true }, email: "ops@example.com" }), null);
});

test("a signed-in Payload user is an operator, identified and nothing more", () => {
  const operator = operatorFromUser({
    collection: "users",
    id: 7,
    email: "owner@reality3d.in",
    name: "Owner",
    hash: "must-not-travel",
    salt: "must-not-travel",
  });
  assert.ok(operator);
  assert.deepEqual({ ...operator }, { id: "7", name: "Owner", email: "owner@reality3d.in" });

  const unnamed = operatorFromUser({ collection: "users", id: "8", email: "ops@reality3d.in", name: "" });
  assert.equal(unnamed?.name, "ops@reality3d.in");
});

test("signing in returns only to a Reality 3D Admin page", () => {
  for (const page of ["/admin", "/admin/sales?range=ytd", "/admin/catalog?view=review", "/admin/inventory"]) {
    assert.equal(safeOpsPath(page), page);
    assert.equal(operatorLoginHref(page), `/admin/login?redirect=${encodeURIComponent(page)}`);
  }
  for (const hostile of ["https://evil.example/admin", "//evil.example", "/account", "/admin/../account", "/admin%2f..%2faccount", "/ops", "/cms", "/admin/login"]) {
    assert.equal(safeOpsPath(hostile), OPS_HOME, hostile);
  }
});
