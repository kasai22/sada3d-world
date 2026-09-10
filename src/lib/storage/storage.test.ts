import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { inspectModelHead, ModelFileError } from "@/lib/custom-print/inspect";
import { MAX_MODEL_BYTES, MODEL_CONTENT_TYPES } from "@/lib/custom-print/types";
import { cube3mf, cubeObj, cubeStl } from "@/lib/models/fixtures";

import { readR2Config } from "./config";
import {
  attachmentDisposition,
  designObjectKey,
  isDesignId,
  keyBelongsTo,
  newDesignId,
  newObjectId,
  ownerSegment,
  sanitizeFileName,
} from "./keys";
import { createMemoryStorage } from "./memory.testing";
import { r2StorageAdapter } from "./r2";
import { BoundedReadError, readBounded, sha256Hex } from "./stream";
import { StorageError } from "./types";

/**
 * Storage: the provider-neutral pieces, and the R2 adapter.
 *
 * The adapter is exercised against a local HTTP server speaking the S3 wire
 * shapes the SDK expects. That proves the adapter sends path-style requests to
 * the configured endpoint, signs them, maps provider responses into the storage
 * vocabulary and never puts a secret in a URL, a message or a log. It does not
 * prove anything about Cloudflare: `npm run storage:verify` is what talks to
 * R2, and nothing here claims otherwise.
 */

/* ------------------------------------------------------------------ *
 * Keys
 * ------------------------------------------------------------------ */

test("a design key is server-shaped and says nothing about the customer", () => {
  const designId = newDesignId();
  const key = designObjectKey({ customerId: "cus_alice@example.com", designId, objectId: newObjectId() });

  assert.match(key, /^customer-designs\/[0-9a-f]{32}\/dsn_[0-9a-f]{24}\/obj_[0-9a-f]{24}\/source$/);
  assert.ok(!key.includes("alice"), "the customer id leaked into the key");
  assert.ok(key.includes(designId));
});

test("design and object ids are random and never repeat", () => {
  const ids = new Set(Array.from({ length: 2000 }, () => newDesignId()));
  assert.equal(ids.size, 2000);
  for (const id of ids) assert.ok(isDesignId(id));

  assert.equal(isDesignId("dsn_1"), false);
  assert.equal(isDesignId("customer-designs/abc/dsn_x/obj_y/source"), false);
  assert.equal(isDesignId(42), false);
});

test("a hostile customer id cannot become a path segment", () => {
  for (const hostile of ["../../other", "a/b/c", "..\\..", "", "\u0000"]) {
    if (hostile === "") {
      assert.throws(() => ownerSegment(hostile));
      continue;
    }
    assert.match(ownerSegment(hostile), /^[0-9a-f]{32}$/);
  }
});

test("malformed ids are refused rather than put into a key", () => {
  assert.throws(() =>
    designObjectKey({ customerId: "c", designId: "../dsn", objectId: newObjectId() }),
  );
  assert.throws(() =>
    designObjectKey({ customerId: "c", designId: newDesignId(), objectId: "obj_../../x" }),
  );
});

test("a key only belongs to the customer and design it was made for", () => {
  const designId = newDesignId();
  const key = designObjectKey({ customerId: "alice", designId, objectId: newObjectId() });

  assert.equal(keyBelongsTo(key, "alice", designId), true);
  assert.equal(keyBelongsTo(key, "bob", designId), false);
  assert.equal(keyBelongsTo(key, "alice", newDesignId()), false);

  const bobs = designObjectKey({ customerId: "bob", designId, objectId: newObjectId() });
  assert.equal(keyBelongsTo(bobs, "alice", designId), false, "another namespace was accepted");

  for (const tampered of [
    `${key}/../../other`,
    key.replace("/source", "/../source"),
    `/${key}`,
    key.replace("customer-designs", "public"),
    "customer-designs/../../etc/passwd",
  ]) {
    assert.equal(keyBelongsTo(tampered, "alice", designId), false, tampered);
  }
});

/* ------------------------------------------------------------------ *
 * File names
 * ------------------------------------------------------------------ */

test("directory components are dropped whatever separator they use", () => {
  assert.equal(sanitizeFileName("../../etc/passwd.stl"), "passwd.stl");
  assert.equal(sanitizeFileName("..\\..\\windows\\part.3mf"), "part.3mf");
  assert.equal(sanitizeFileName("C:\\Users\\me\\Desktop\\bracket.obj"), "bracket.obj");
  assert.equal(sanitizeFileName("/absolute/path/gear.step"), "gear.step");
});

test("control characters, reserved characters and leading dots are removed", () => {
  assert.equal(sanitizeFileName("br\u0000ack\u0007et.stl"), "bracket.stl");
  assert.equal(sanitizeFileName('a<b>c:"d|e?f*.stl'), "abcdef.stl");
  assert.equal(sanitizeFileName("...hidden.stl"), "hidden.stl");
  assert.equal(sanitizeFileName("  spaced   out  .STL "), "spaced out.stl");
});

test("names that leave nothing usable are refused", () => {
  for (const unusable of [".stl", "noextension", "..", "../", "", "part.", 12, null, undefined]) {
    assert.equal(sanitizeFileName(unusable), null, String(unusable));
  }
});

test("a long name is bounded and keeps its extension", () => {
  const name = sanitizeFileName(`${"x".repeat(400)}.3mf`);
  assert.ok(name);
  assert.ok(name.length <= 128);
  assert.ok(name.endsWith(".3mf"));
});

test("a download name is safe in a header and keeps the real name", () => {
  const value = attachmentDisposition('Ölflansch "v2".stl');
  assert.match(value, /^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
  assert.ok(!value.slice(0, value.indexOf("filename*")).includes('"v2"'));
  assert.ok(value.includes(encodeURIComponent('Ölflansch "v2".stl')));
});

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

const SECRET = "s3cr3t-value-that-must-never-be-printed";
const ACCOUNT = "0123456789abcdef0123456789abcdef";

test("no R2 variables at all is absent, not an error", () => {
  const result = readR2Config({});
  assert.equal(result.status, "absent");
});

test("a partial configuration is invalid and names what is missing", () => {
  const result = readR2Config({ R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: SECRET });
  assert.equal(result.status, "invalid");
  assert.ok(result.status === "invalid");
  assert.ok(result.problems.some((problem) => problem.includes("R2_BUCKET")));
  assert.ok(!JSON.stringify(result).includes(SECRET), "a secret value reached a message");
});

test("the endpoint is derived from the account id", () => {
  const result = readR2Config({
    R2_ACCOUNT_ID: ACCOUNT,
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: SECRET,
    R2_BUCKET: "sada3d-designs",
  });

  assert.equal(result.status, "configured");
  assert.ok(result.status === "configured");
  assert.equal(result.config.endpoint, `https://${ACCOUNT}.r2.cloudflarestorage.com`);
});

test("unusable values are refused", () => {
  const base = { R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: SECRET, R2_BUCKET: "sada3d-designs" };

  const cases: Record<string, string>[] = [
    { ...base, R2_ENDPOINT: "http://example.com" },
    { ...base, R2_ENDPOINT: "https://x.r2.cloudflarestorage.com/sada3d-designs" },
    { ...base, R2_ENDPOINT: "not a url" },
    { ...base, R2_ACCOUNT_ID: "not-an-account" },
    { ...base, R2_ENDPOINT: "https://x.example", R2_BUCKET: "Bad_Bucket" },
    { ...base, R2_ENDPOINT: "http://127.0.0.1:9000", NODE_ENV: "production" },
  ];

  for (const env of cases) {
    const result = readR2Config(env);
    assert.equal(result.status, "invalid", JSON.stringify({ ...env, R2_SECRET_ACCESS_KEY: "…" }));
    assert.ok(!JSON.stringify(result).includes(SECRET));
  }
});

test("plain HTTP is allowed only to loopback, and only outside production", () => {
  const result = readR2Config({
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: SECRET,
    R2_BUCKET: "sada3d-designs",
    R2_ENDPOINT: "http://127.0.0.1:9000",
  });
  assert.equal(result.status, "configured");
});

/* ------------------------------------------------------------------ *
 * Bounded reads
 * ------------------------------------------------------------------ */

async function* chunks(bytes: Uint8Array, size: number) {
  for (let offset = 0; offset < bytes.byteLength; offset += size) {
    yield bytes.subarray(offset, offset + size);
  }
}

test("a bounded read returns exactly the bytes and their checksum", async () => {
  const bytes = cube3mf();
  const read = await readBounded(chunks(bytes, 97), bytes.byteLength);

  assert.deepEqual(read.bytes, bytes);
  assert.equal(read.sha256, sha256Hex(bytes));
});

test("a stream longer than declared is stopped at the boundary", async () => {
  const bytes = cube3mf();
  await assert.rejects(
    () => readBounded(chunks(bytes, 64), bytes.byteLength - 1),
    (error: unknown) => error instanceof BoundedReadError && error.reason === "too_large",
  );
});

test("a stream shorter than declared is truncated, not accepted", async () => {
  const bytes = cube3mf();
  await assert.rejects(
    () => readBounded(chunks(bytes, 64), bytes.byteLength + 10),
    (error: unknown) => error instanceof BoundedReadError && error.reason === "truncated",
  );
});

/* ------------------------------------------------------------------ *
 * Format signatures — the check verification runs on stored bytes
 * ------------------------------------------------------------------ */

const head = (bytes: Uint8Array) => bytes.subarray(0, 512);

test("each supported format is recognised from its own bytes", () => {
  const threeMf = cube3mf();
  assert.equal(
    inspectModelHead({ fileName: "a.3mf", size: threeMf.byteLength, head: head(threeMf) }).format,
    "3mf",
  );

  const stl = cubeStl();
  const stlInspection = inspectModelHead({ fileName: "a.stl", size: stl.byteLength, head: head(stl) });
  assert.equal(stlInspection.formatLabel, "Binary STL");
  assert.equal(stlInspection.triangles, 12);

  const obj = cubeObj();
  assert.equal(
    inspectModelHead({ fileName: "a.obj", size: obj.byteLength, head: head(obj) }).format,
    "obj",
  );

  const step = new TextEncoder().encode("ISO-10303-21;\nHEADER;\nENDSEC;\n");
  assert.equal(
    inspectModelHead({ fileName: "a.step", size: step.byteLength, head: step }).format,
    "step",
  );
});

test("an extension that does not match the bytes is refused", () => {
  const stl = cubeStl();
  const cases: [string, Uint8Array][] = [
    ["renamed.3mf", stl],
    ["renamed.step", stl],
    ["renamed.obj", stl],
  ];

  for (const [name, bytes] of cases) {
    assert.throws(
      () => inspectModelHead({ fileName: name, size: bytes.byteLength, head: head(bytes) }),
      ModelFileError,
      name,
    );
  }
});

test("unsupported types and sizes are refused before any bytes are read", () => {
  const tiny = new Uint8Array([1, 2, 3]);
  assert.throws(() => inspectModelHead({ fileName: "part.exe", size: 3, head: tiny }), ModelFileError);
  assert.throws(() => inspectModelHead({ fileName: "part.glb", size: 3, head: tiny }), ModelFileError);
  assert.throws(() => inspectModelHead({ fileName: "part.stl", size: 0, head: tiny }), ModelFileError);
  assert.throws(
    () => inspectModelHead({ fileName: "part.stl", size: MAX_MODEL_BYTES + 1, head: tiny }),
    /upload limit/,
  );
});

test("the stored content type is the server's, whatever a browser would claim", () => {
  assert.equal(MODEL_CONTENT_TYPES[".stl"], "model/stl");
  assert.equal(MODEL_CONTENT_TYPES[".3mf"], "model/3mf");
  assert.equal(MODEL_CONTENT_TYPES[".stp"], MODEL_CONTENT_TYPES[".step"]);
});

/* ------------------------------------------------------------------ *
 * The test double enforces what a signature carries
 * ------------------------------------------------------------------ */

test("a signed upload is refused when expired, resized, retyped or altered", async () => {
  const storage = createMemoryStorage();
  const bytes = cubeStl();
  const target = await storage.signUpload({
    key: "k",
    contentType: "model/stl",
    size: bytes.byteLength,
    expiresInSeconds: 60,
  });

  assert.throws(() => storage.upload(target, bytes, { now: Date.now() + 61_000 }), /expired/i);
  assert.throws(() => storage.upload(target, bytes.subarray(1)), /Signature/);
  assert.throws(() => storage.upload(target, bytes, { contentType: "text/html" }), /Signature/);
  assert.throws(
    () => storage.upload({ ...target, url: target.url.replace("k?", "other?") }, bytes),
    /Signature/,
  );

  storage.upload(target, bytes);
  assert.equal((await storage.head("k"))?.size, bytes.byteLength);
});

/* ------------------------------------------------------------------ *
 * The R2 adapter, against a local S3 stub
 * ------------------------------------------------------------------ */

const BUCKET = "sada3d-test";
const ACCESS_KEY = "AKIASADA3DTESTKEY";

interface StubRequest {
  method: string;
  path: string;
  query: string;
  authorization: string;
  headers: IncomingMessage["headers"];
}

let server: Server;
let endpoint: string;
const requests: StubRequest[] = [];
const stubObjects = new Map<string, { body: Buffer; type: string }>();

const xml = (code: string, message: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;

before(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stub");
    const [, bucket = "", ...rest] = url.pathname.split("/");
    const key = rest.map(decodeURIComponent).join("/");

    requests.push({
      method: request.method ?? "",
      path: `${bucket}/${key}`,
      query: url.search,
      authorization: String(request.headers.authorization ?? ""),
      headers: request.headers,
    });

    if (bucket !== BUCKET) {
      response.writeHead(404, { "content-type": "application/xml" });
      response.end(xml("NoSuchBucket", "The specified bucket does not exist."));
      return;
    }

    if (key.startsWith("denied/")) {
      response.writeHead(403, { "content-type": "application/xml" });
      response.end(request.method === "HEAD" ? undefined : xml("AccessDenied", "Access Denied"));
      return;
    }

    if (key.startsWith("broken/")) {
      response.writeHead(500, { "content-type": "application/xml" });
      response.end(request.method === "HEAD" ? undefined : xml("InternalError", "We encountered an internal error."));
      return;
    }

    const found = stubObjects.get(key);

    switch (request.method) {
      case "PUT": {
        const parts: Buffer[] = [];
        request.on("data", (part: Buffer) => parts.push(part));
        request.on("end", () => {
          stubObjects.set(key, {
            body: Buffer.concat(parts),
            type: String(request.headers["content-type"] ?? ""),
          });
          response.writeHead(200, { ETag: '"stub-etag"' });
          response.end();
        });
        return;
      }
      case "HEAD":
        if (!found) {
          response.writeHead(404);
          response.end();
          return;
        }
        response.writeHead(200, {
          "content-length": String(found.body.byteLength),
          "content-type": found.type,
          etag: '"stub-etag"',
          "last-modified": new Date().toUTCString(),
        });
        response.end();
        return;
      case "GET":
        if (!found) {
          response.writeHead(404, { "content-type": "application/xml" });
          response.end(xml("NoSuchKey", "The specified key does not exist."));
          return;
        }
        response.writeHead(200, {
          "content-length": String(found.body.byteLength),
          "content-type": found.type,
          etag: '"stub-etag"',
        });
        response.end(found.body);
        return;
      case "DELETE":
        stubObjects.delete(key);
        response.writeHead(204);
        response.end();
        return;
      default:
        response.writeHead(405);
        response.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function adapter() {
  return r2StorageAdapter({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET,
    bucket: BUCKET,
    endpoint,
  });
}

test("the adapter stores, describes, reads and removes an object", async () => {
  const storage = adapter();
  const bytes = cube3mf();
  const key = designObjectKey({ customerId: "alice", designId: newDesignId(), objectId: newObjectId() });

  const stored = await storage.put({ key, body: bytes, contentType: "model/3mf" });
  assert.equal(stored.size, bytes.byteLength);
  assert.equal(stored.etag, "stub-etag", "the entity tag kept its quotes");

  const head = await storage.head(key);
  assert.equal(head?.size, bytes.byteLength);
  assert.equal(head?.contentType, "model/3mf");

  const readable = await storage.get(key);
  assert.ok(readable);
  const read = await readBounded(readable.body, readable.object.size);
  assert.equal(read.sha256, sha256Hex(bytes));

  await storage.delete(key);
  assert.equal(await storage.head(key), null);
  await storage.delete(key); // idempotent
});

test("requests are path-style, to the configured endpoint, and signed", async () => {
  const storage = adapter();
  requests.length = 0;

  await storage.head("customer-designs/x/y/z/source");

  const request = requests[0];
  assert.ok(request, "no request reached the endpoint");
  assert.equal(request.path, `${BUCKET}/customer-designs/x/y/z/source`);
  assert.match(request.authorization, /^AWS4-HMAC-SHA256 Credential=AKIASADA3DTESTKEY\//);
  assert.ok(!request.authorization.includes(SECRET), "the secret was sent");
  assert.equal(request.headers["x-amz-checksum-crc32"], undefined, "a default checksum was added");
});

test("a missing object is null, not an exception", async () => {
  const storage = adapter();
  assert.equal(await storage.head("absent/object"), null);
  assert.equal(await storage.get("absent/object"), null);
});

test("a refusal and an outage become storage errors that reveal nothing", async () => {
  const storage = adapter();

  await assert.rejects(
    () => storage.get("denied/object"),
    (error: unknown) => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.kind, "denied");
      assert.ok(!error.message.includes(SECRET));
      assert.ok(!error.message.includes("denied/object"), "the key reached the message");
      assert.ok(!error.message.includes(endpoint), "the endpoint reached the message");
      return true;
    },
  );

  await assert.rejects(
    () => storage.put({ key: "broken/object", body: new Uint8Array([1]), contentType: "model/stl" }),
    (error: unknown) => error instanceof StorageError && error.kind === "unavailable",
  );
});

test("a signed upload is short-lived and signs the type and the length", async () => {
  const storage = adapter();
  const bytes = cubeStl();
  const key = "customer-designs/owner/dsn/obj/source";
  const before = Date.now();

  const target = await storage.signUpload({
    key,
    contentType: "model/stl",
    size: bytes.byteLength,
    expiresInSeconds: 600,
  });

  const url = new URL(target.url);
  assert.equal(url.origin, endpoint);
  assert.equal(decodeURIComponent(url.pathname), `/${BUCKET}/${key}`);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
  assert.equal(target.method, "PUT");
  assert.deepEqual(target.headers, { "Content-Type": "model/stl" });

  const signed = (url.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
  assert.ok(signed.includes("content-type"), `content-type is not signed: ${signed.join(";")}`);
  assert.ok(signed.includes("content-length"), `content-length is not signed: ${signed.join(";")}`);
  assert.ok(signed.includes("host"));

  assert.ok(!target.url.includes(SECRET), "the secret is in the URL");
  assert.equal(url.searchParams.get("x-amz-checksum-crc32"), null);
  assert.equal(url.searchParams.get("x-amz-sdk-checksum-algorithm"), null);

  const expires = Date.parse(target.expiresAt);
  assert.ok(expires >= before + 599_000 && expires <= Date.now() + 601_000);

  // The URL works as a browser would use it.
  const response = await fetch(target.url, {
    method: "PUT",
    headers: target.headers,
    body: new Uint8Array(bytes),
  });
  assert.equal(response.status, 200);
  assert.equal((await storage.head(key))?.size, bytes.byteLength);
});

test("a signed download is short-lived and names the file as an attachment", async () => {
  const storage = adapter();

  const signed = await storage.signDownload({
    key: "customer-designs/owner/dsn/obj/source",
    fileName: "bracket v2.stl",
    contentType: "model/stl",
    expiresInSeconds: 120,
  });

  const url = new URL(signed.url);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "120");
  assert.match(url.searchParams.get("response-content-disposition") ?? "", /^attachment;/);
  assert.ok(!signed.url.includes(SECRET));
});

test("a signing window outside the allowed range is refused", async () => {
  const storage = adapter();

  for (const seconds of [0, -1, 1.5, 3601]) {
    await assert.rejects(
      () => storage.signUpload({ key: "k", contentType: "model/stl", size: 10, expiresInSeconds: seconds }),
      (error: unknown) => error instanceof StorageError && error.kind === "invalid_request",
    );
  }

  await assert.rejects(
    () => storage.signUpload({ key: "k", contentType: "model/stl", size: 0, expiresInSeconds: 60 }),
    (error: unknown) => error instanceof StorageError && error.kind === "invalid_request",
  );
});
