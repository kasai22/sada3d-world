import assert from "node:assert/strict";
import test from "node:test";

import { R2_ENV } from "@/lib/storage/config";

import {
  R2_UPLOAD_WILDCARD,
  baseSecurityHeaders,
  contentSecurityPolicy,
  securityHeaderRules,
  uploadOriginFromEnv,
} from "./headers";

function directives(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (!name) continue;
    assert.equal(map.has(name), false, `${name} is listed twice`);
    map.set(name, values);
  }
  return map;
}

function header(entries: { key: string; value: string }[], key: string): string | undefined {
  return entries.find((entry) => entry.key === key)?.value;
}

/** Cloudflare account ids are 32 hex characters; a shorter one is not configured. */
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const UPLOAD = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

test("the production policy never allows eval, plugins, framing or foreign scripts", () => {
  const policy = contentSecurityPolicy({ production: true, uploadOrigin: UPLOAD });
  const map = directives(policy);

  assert.doesNotMatch(policy, /unsafe-eval/);
  assert.doesNotMatch(policy, /[\r\n]/);
  assert.deepEqual(map.get("default-src"), ["'self'"]);
  assert.deepEqual(map.get("object-src"), ["'none'"]);
  assert.deepEqual(map.get("base-uri"), ["'self'"]);
  assert.deepEqual(map.get("form-action"), ["'self'"]);
  assert.deepEqual(map.get("frame-ancestors"), ["'none'"]);

  // No script from anywhere but this origin.
  for (const source of map.get("script-src") ?? []) {
    assert.ok(["'self'", "'unsafe-inline'"].includes(source), `unexpected script source ${source}`);
  }

  // A script that runs can talk to this origin and the upload endpoint, nothing else.
  assert.deepEqual(map.get("connect-src"), ["'self'", "blob:", "data:", UPLOAD]);
});

test("development adds eval and the hot-reload socket, and nothing else", () => {
  const map = directives(contentSecurityPolicy({ production: false, uploadOrigin: UPLOAD }));

  assert.ok(map.get("script-src")?.includes("'unsafe-eval'"));
  assert.ok(map.get("connect-src")?.includes("ws:"));
  assert.deepEqual(map.get("object-src"), ["'none'"]);
});

test("HSTS is sent only in production; the other headers always", () => {
  const production = baseSecurityHeaders({ production: true });
  const development = baseSecurityHeaders({ production: false });

  assert.equal(header(production, "Strict-Transport-Security"), "max-age=31536000");
  assert.equal(header(development, "Strict-Transport-Security"), undefined);

  for (const entries of [production, development]) {
    assert.equal(header(entries, "X-Content-Type-Options"), "nosniff");
    assert.equal(header(entries, "X-Frame-Options"), "DENY");
    assert.equal(header(entries, "Referrer-Policy"), "strict-origin-when-cross-origin");
    assert.match(header(entries, "Permissions-Policy") ?? "", /camera=\(\)/);
  }
});

test("the upload origin is the configured R2 endpoint, or R2 and nothing wider", () => {
  assert.equal(uploadOriginFromEnv({}), R2_UPLOAD_WILDCARD);

  const configured = uploadOriginFromEnv({
    [R2_ENV.accountId]: ACCOUNT_ID,
    [R2_ENV.accessKeyId]: "key",
    [R2_ENV.secretAccessKey]: "secret",
    [R2_ENV.bucket]: "models",
  });
  assert.equal(configured, UPLOAD);

  // A half-configured storage does not widen anything.
  assert.equal(uploadOriginFromEnv({ [R2_ENV.accountId]: "abc123" }), R2_UPLOAD_WILDCARD);
});

test("the download redirect and the email-link handler keep no-referrer over the site default", () => {
  const rules = securityHeaderRules({ production: true, uploadOrigin: UPLOAD });
  const base = rules.findIndex((rule) => rule.source === "/:path*");

  for (const source of ["/api/designs/:id/file", "/auth/confirm"]) {
    const index = rules.findIndex(
      (rule) =>
        rule.source === source &&
        rule.headers.some((entry) => entry.key === "Referrer-Policy" && entry.value === "no-referrer"),
    );
    // Same path, same key: the later rule wins, so it must come after the base rule.
    assert.ok(index > base, `${source} must restate no-referrer after the base rule`);
  }
});

test("every path gets the base headers, and the policy skips only Payload's paths", () => {
  const rules = securityHeaderRules({ production: true, uploadOrigin: UPLOAD });

  const base = rules.find((rule) => rule.source === "/:path*");
  assert.ok(base, "no rule applies the base headers to every path");

  const csp = rules.find((rule) =>
    rule.headers.some((entry) => entry.key === "Content-Security-Policy"),
  );
  assert.ok(csp);

  // The source is a path-to-regexp pattern; its regex part must exclude exactly these.
  const pattern = new RegExp(`^/${/\((\(\?![^)]*\)\.\*)\)/.exec(csp.source)?.[1] ?? "$^"}$`);
  for (const path of ["/", "/shop", "/account/orders", "/api/checkout"]) {
    assert.match(path, pattern, `${path} should carry the policy`);
  }
  for (const path of ["/admin", "/admin/collections/users", "/payload-api/users"]) {
    assert.doesNotMatch(path, pattern, `${path} should not carry the policy`);
  }
});
