import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { safeReturnPath } from "@/lib/account/routes";
import {
  MAX_TRACKED,
  anonymousSubject,
  clientAddress,
  enforceRateLimit,
  resetRateLimits,
  trackedRateLimitCount,
  type RateLimitRule,
} from "@/lib/api/rate-limit";
import { checkReadiness } from "@/lib/api/readiness";
import {
  DEFAULT_JSON_LIMIT_BYTES,
  failure,
  infrastructureCause,
  readBoundedBytes,
  readJson,
  rejectUnknownFields,
} from "@/lib/api/respond";
import { DatabaseUnavailableError } from "@/lib/db/client";
import { PayloadTooLargeError, RateLimitedError, ValidationError } from "@/lib/errors";
import { setLogSink, type LogRecord } from "@/lib/observability";
import {
  MAX_TRACKED_REFERENCES,
  authorizeOrderByEmail,
  trackedLookupCount,
} from "@/lib/orders/access";
import { parseOrderReference, referenceFromSegment } from "@/lib/orders/reference";

/**
 * Stage 18 request hardening.
 *
 * Every refusal here is one a hostile or broken client can trigger without an
 * account, which is why each is tested at the boundary that enforces it.
 */

let records: LogRecord[] = [];

beforeEach(() => {
  records = [];
  setLogSink({ name: "test", write: (record) => records.push(record) });
  resetRateLimits();
});

afterEach(() => {
  setLogSink(null);
});

function jsonRequest(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    duplex: "half",
  } as RequestInit);
}

/** A body that never ends. Reading it to completion would never return. */
function endlessBody(): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(16 * 1024).fill(0x20);
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(chunk);
    },
  });
}

/* ------------------------------------------------------------------ *
 * Bodies
 * ------------------------------------------------------------------ */

test("a JSON body over the limit is refused with 413", async () => {
  const body = `${" ".repeat(DEFAULT_JSON_LIMIT_BYTES)}{}`;
  await assert.rejects(readJson(jsonRequest(body)), PayloadTooLargeError);
});

test("a declared length over the limit is refused before anything is read", async () => {
  const request = jsonRequest("{}", { "content-length": String(50 * 1024 * 1024) });
  await assert.rejects(readJson(request), PayloadTooLargeError);
});

test("a body with no declared length is stopped at the limit, not read to the end", async () => {
  await assert.rejects(readBoundedBytes(jsonRequest(endlessBody()), 64 * 1024), PayloadTooLargeError);
});

test("a body within the limit is read exactly", async () => {
  assert.deepEqual(await readJson(jsonRequest('{"quantity":2}')), { quantity: 2 });
});

test("invalid UTF-8 and invalid JSON are validation errors, not crashes", async () => {
  await assert.rejects(readJson(jsonRequest(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]))), ValidationError);
  await assert.rejects(readJson(jsonRequest("{")), ValidationError);
  await assert.rejects(readJson(jsonRequest("")), ValidationError);
});

test("unknown fields are refused by name rather than ignored", () => {
  assert.doesNotThrow(() => rejectUnknownFields({ contact: {}, address: {} }, ["contact", "address"]));

  assert.throws(
    () => rejectUnknownFields({ contact: {}, customerId: "cus_x", total: 1 }, ["contact"]),
    (error: unknown) =>
      error instanceof ValidationError &&
      JSON.stringify(error).includes("customerId") &&
      JSON.stringify(error).includes("total"),
  );
});

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

test("an unexpected error is answered with one sentence and logged without its message", async () => {
  const leaked = "insert into orders (contact_email) values ('alice@example.com')";
  const response = failure(Object.assign(new Error(leaked), { code: "23505" }), "POST /api/test");

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "private, no-store");

  const body = await response.text();
  assert.doesNotMatch(body, /alice|insert|contact_email/);

  const logged = records.find((record) => record.event === "api.request.failed");
  assert.ok(logged, "the failure was not logged");
  assert.doesNotMatch(JSON.stringify(logged), /alice|insert|contact_email/);
  assert.equal(logged.fields.code, "23505");
});

test("a database that cannot be reached is a 503, found through the cause chain", async () => {
  const wrapped = new Error("Failed query: select * from orders where reference = $1", {
    cause: Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432"), { code: "ECONNREFUSED" }),
  });

  const response = failure(wrapped, "GET /api/test");
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /10\.0\.0\.5|select|ECONNREFUSED/);

  assert.equal(failure(new DatabaseUnavailableError("DATABASE_URL is not set"), "x").status, 503);
});

test("a cyclic cause chain is classified without looping", () => {
  const error = new Error("loop") as Error & { cause?: unknown };
  error.cause = error;
  assert.equal(infrastructureCause(error), null);
});

test("a rate-limited response says when to try again", () => {
  const response = failure(new RateLimitedError("Too many requests.", 12.3), "x");
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
});

/* ------------------------------------------------------------------ *
 * Rate limiting
 * ------------------------------------------------------------------ */

const LONG: RateLimitRule = { name: "test.long", limit: 1, windowMs: 60 * 60_000 };
const SHORT: RateLimitRule = { name: "test.short", limit: 1, windowMs: 1_000 };

test("the limiter never tracks more than its cap, however many subjects arrive", () => {
  for (let index = 0; index < MAX_TRACKED + 500; index += 1) {
    enforceRateLimit(LONG, `anon:source:${index}`, 1_000);
  }

  assert.ok(trackedRateLimitCount() <= MAX_TRACKED);
  assert.ok(records.some((record) => record.event === "api.rate_limiter.saturated"));
});

test("expired windows are evicted before live ones", () => {
  enforceRateLimit(LONG, "cus_keep", 0);
  for (let index = 0; index < MAX_TRACKED - 1; index += 1) {
    enforceRateLimit(SHORT, `anon:source:${index}`, 0);
  }

  // Full. A new subject after the short windows have expired makes room from them.
  enforceRateLimit(SHORT, "anon:source:new", 5_000);

  assert.throws(() => enforceRateLimit(LONG, "cus_keep", 5_001), RateLimitedError);
});

test("a source is the platform's first forwarded address, bounded, and never stored raw", () => {
  const headers = new Headers({ "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" });
  assert.equal(clientAddress(headers), "203.0.113.9");
  assert.equal(clientAddress(new Headers()), "unknown");
  assert.equal(clientAddress(new Headers({ "x-forwarded-for": "x".repeat(5_000) })).length, 64);

  const subject = anonymousSubject("source", "203.0.113.9");
  assert.doesNotMatch(subject, /203/);
  assert.match(subject, /^anon:source:[0-9a-f]{32}$/);
});

test("an email-link source that keeps trying is refused before any token is checked", async () => {
  const [{ GET }, { NextRequest }, { RATE_LIMITS }] = await Promise.all([
    import("@/app/auth/confirm/route"),
    import("next/server"),
    import("@/lib/api/rate-limit"),
  ]);

  const visit = () =>
    GET(
      new NextRequest("http://localhost/auth/confirm?token_hash=guess&type=signup", {
        headers: { "x-forwarded-for": "198.51.100.7" },
      }),
    );

  for (let attempt = 0; attempt < RATE_LIMITS.emailLinkSource.limit; attempt += 1) {
    assert.equal((await visit()).status, 303, `attempt ${attempt + 1} should be answered`);
  }

  const refused = await visit();
  assert.equal(refused.status, 429);
  assert.ok(Number(refused.headers.get("retry-after")) > 0);
  assert.equal(refused.headers.get("cache-control"), "private, no-store");
  assert.equal(refused.headers.get("referrer-policy"), "no-referrer");
});

/* ------------------------------------------------------------------ *
 * Redirects
 * ------------------------------------------------------------------ */

test("a return path cannot smuggle a traversal or a host through encoding", () => {
  for (const hostile of [
    "/account/%2e%2e/%2e%2e//evil.example",
    "/account/%2E%2E",
    "/account/%2F%2Fevil.example",
    "/account/%5cevil.example",
    "/account/../admin",
    "/account/./orders",
    "/account/orders/..",
  ]) {
    assert.equal(safeReturnPath(hostile), undefined, hostile);
  }

  assert.equal(safeReturnPath("/account/orders/S3D-000184"), "/account/orders/S3D-000184");
  assert.equal(safeReturnPath("/cart"), "/cart");
});

/* ------------------------------------------------------------------ *
 * Order references
 * ------------------------------------------------------------------ */

test("only the reference shapes this system issues are accepted", () => {
  assert.equal(parseOrderReference(" s3d-000184 "), "S3D-000184");
  assert.equal(parseOrderReference("DEMO-0001"), "DEMO-0001");

  for (const hostile of ["S3D-1", "S3D-000184; drop table orders", "../S3D-000184", "x".repeat(10_000), 42, null]) {
    assert.equal(parseOrderReference(hostile), undefined, String(hostile).slice(0, 40));
  }

  assert.equal(referenceFromSegment("S3D-000184"), "S3D-000184");
  // A malformed escape would throw inside decodeURIComponent: a 404, never a 500.
  assert.equal(referenceFromSegment("%E0%A4%A"), undefined);
});

test("the lookup throttle is bounded, and text that is not a reference is never tracked", async () => {
  const before = trackedLookupCount();
  await authorizeOrderByEmail("not-a-reference", "a@guess.example");
  await authorizeOrderByEmail("S3D-000184".padEnd(5_000, "0"), "a@guess.example");
  assert.equal(trackedLookupCount(), before);

  for (let index = 0; index < MAX_TRACKED_REFERENCES + 100; index += 1) {
    await authorizeOrderByEmail(`S3D-${7_000_000 + index}`, "a@guess.example");
  }

  assert.ok(trackedLookupCount() <= MAX_TRACKED_REFERENCES);
});

/* ------------------------------------------------------------------ *
 * Readiness
 * ------------------------------------------------------------------ */

test("readiness reports one boolean per dependency and nothing else", async () => {
  const report = await checkReadiness({ production: true, timeoutMs: 200 });

  assert.deepEqual(Object.keys(report).sort(), ["checks", "ready"]);
  assert.deepEqual(Object.keys(report.checks).sort(), ["auth", "database", "storage"]);
  for (const value of Object.values(report.checks)) assert.equal(typeof value, "boolean");

  if (!report.checks.database || !report.checks.storage || !report.checks.auth) {
    assert.equal(report.ready, false);
  }
});
