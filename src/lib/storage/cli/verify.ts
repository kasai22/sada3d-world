import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { loadEnvForCli } from "@/lib/env";
import { analyzeModel, isAnalyzable } from "@/lib/models";

import {
  StorageError,
  resolveStorageAdapter,
  storageStatus,
  type StorageAdapter,
} from "../index";
import { readBounded, sha256Hex } from "../stream";

/*
 * First: Next loads `.env` for the application, a plain `tsx` process does not.
 * The adapter reads its configuration at call time, so this runs before it.
 */
loadEnvForCli();

/**
 * `npm run storage:verify` — exercises the real Cloudflare R2 bucket.
 *
 * The unit and integration tests run against a local S3 stub and an in-memory
 * double, and they say nothing about whether R2 is reachable, whether the
 * credentials work, or whether R2 enforces what the signature says. This does.
 *
 *   npm run storage:verify
 *   npm run storage:verify -- --file ./part.3mf          also stores, re-reads
 *                                                        and analyses a real file
 *   npm run storage:verify -- --origin https://reality3d.in  also checks the bucket's
 *                                                        CORS policy for that origin
 *
 * Everything it writes goes under `verification/…` — never under
 * `customer-designs/` — and is deleted before it exits, whether steps passed or
 * failed.
 *
 * It prints PASS, FAIL or SKIP per step and never prints a credential, a
 * signed URL or an endpoint. Exit code: 0 all passed, 1 a step failed,
 * 2 storage is not configured (BLOCKED).
 */

interface Args {
  file?: string;
  origin?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--file" && value) {
      args.file = value;
      index += 1;
    } else if (flag === "--origin" && value) {
      args.origin = value;
      index += 1;
    }
  }
  return args;
}

/** What went wrong, without anything that could carry a secret. */
function describe(error: unknown): string {
  if (error instanceof StorageError) return `${error.kind}: ${error.message}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return "unknown failure";
}

let failures = 0;

async function step(name: string, run: () => Promise<string | void>): Promise<void> {
  try {
    const detail = await run();
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name} — ${describe(error)}`);
  }
}

function skip(name: string, why: string): void {
  console.log(`SKIP  ${name} — ${why}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readAll(storage: StorageAdapter, key: string, size: number) {
  const readable = await storage.get(key);
  assert(readable, "object was not found");
  return readBounded(readable.body, size);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const status = storageStatus();

  if (!status.configured) {
    console.error("BLOCKED  Cloudflare R2 is not configured for this process:");
    for (const problem of status.problems) console.error(`  · ${problem}`);
    console.error("Set the R2_* variables in .env.local (see .env.example) and run again.");
    process.exitCode = 2;
    return;
  }

  const storage = resolveStorageAdapter();
  const prefix = `verification/${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
  const created = new Set<string>();

  console.log(`Verifying ${storage.name} under ${prefix}/`);

  const bytes = new Uint8Array(randomBytes(64 * 1024));
  const checksum = sha256Hex(bytes);
  const direct = `${prefix}/direct.bin`;

  try {
    await step("credentials and bucket: server-side PUT", async () => {
      created.add(direct);
      const object = await storage.put({
        key: direct,
        body: bytes,
        contentType: "application/octet-stream",
      });
      return `${object.size} bytes`;
    });

    await step("HEAD reports the stored size", async () => {
      const head = await storage.head(direct);
      assert(head, "HEAD found no object");
      assert(head.size === bytes.byteLength, `HEAD size ${head.size} ≠ ${bytes.byteLength}`);
    });

    await step("GET returns the same bytes (SHA-256)", async () => {
      const read = await readAll(storage, direct, bytes.byteLength);
      assert(read.sha256 === checksum, "checksum mismatch after GET");
    });

    await step("HEAD and GET of a missing object answer null", async () => {
      assert((await storage.head(`${prefix}/absent.bin`)) === null, "HEAD invented an object");
      assert((await storage.get(`${prefix}/absent.bin`)) === null, "GET invented an object");
    });

    const signedKey = `${prefix}/signed.bin`;

    await step("signed PUT with the declared type and length is accepted", async () => {
      const target = await storage.signUpload({
        key: signedKey,
        contentType: "model/3mf",
        size: bytes.byteLength,
        expiresInSeconds: 120,
      });
      created.add(signedKey);

      const response = await fetch(target.url, {
        method: "PUT",
        headers: target.headers,
        body: bytes,
      });
      assert(response.ok, `R2 answered HTTP ${response.status}`);

      const read = await readAll(storage, signedKey, bytes.byteLength);
      assert(read.sha256 === checksum, "stored bytes differ from uploaded bytes");
    });

    await step("signed PUT with a different length is refused", async () => {
      const key = `${prefix}/wrong-length.bin`;
      const target = await storage.signUpload({
        key,
        contentType: "model/3mf",
        size: bytes.byteLength,
        expiresInSeconds: 120,
      });
      created.add(key);

      const response = await fetch(target.url, {
        method: "PUT",
        headers: target.headers,
        body: bytes.subarray(0, bytes.byteLength - 1),
      });
      assert(!response.ok, `R2 accepted a body whose length was not signed (HTTP ${response.status})`);
      return `HTTP ${response.status}`;
    });

    await step("signed PUT with a different content type is refused", async () => {
      const key = `${prefix}/wrong-type.bin`;
      const target = await storage.signUpload({
        key,
        contentType: "model/3mf",
        size: bytes.byteLength,
        expiresInSeconds: 120,
      });
      created.add(key);

      const response = await fetch(target.url, {
        method: "PUT",
        headers: { "Content-Type": "text/html" },
        body: bytes,
      });
      assert(!response.ok, `R2 accepted a content type that was not signed (HTTP ${response.status})`);
      return `HTTP ${response.status}`;
    });

    await step("an expired signed PUT is refused", async () => {
      const key = `${prefix}/expired.bin`;
      const target = await storage.signUpload({
        key,
        contentType: "model/3mf",
        size: bytes.byteLength,
        expiresInSeconds: 1,
      });
      created.add(key);

      await new Promise((resolve) => setTimeout(resolve, 2500));

      const response = await fetch(target.url, {
        method: "PUT",
        headers: target.headers,
        body: bytes,
      });
      assert(!response.ok, `R2 accepted an expired signature (HTTP ${response.status})`);
      return `HTTP ${response.status}`;
    });

    await step("signed GET returns the bytes as an attachment", async () => {
      const signed = await storage.signDownload({
        key: signedKey,
        fileName: "verification part.3mf",
        contentType: "model/3mf",
        expiresInSeconds: 60,
      });

      const response = await fetch(signed.url);
      assert(response.ok, `R2 answered HTTP ${response.status}`);
      const body = new Uint8Array(await response.arrayBuffer());
      assert(sha256Hex(body) === checksum, "downloaded bytes differ");

      const disposition = response.headers.get("content-disposition") ?? "";
      assert(/attachment/i.test(disposition), "Content-Disposition override was not applied");
    });

    if (args.origin) {
      const origin = args.origin;
      await step(`CORS allows a browser upload from ${origin}`, async () => {
        const target = await storage.signUpload({
          key: `${prefix}/cors.bin`,
          contentType: "model/3mf",
          size: 1,
          expiresInSeconds: 60,
        });

        const preflight = await fetch(target.url, {
          method: "OPTIONS",
          headers: {
            Origin: origin,
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "content-type",
          },
        });

        const allowed = preflight.headers.get("access-control-allow-origin");
        assert(
          allowed === origin || allowed === "*",
          `preflight did not allow the origin (HTTP ${preflight.status}); configure the bucket CORS policy`,
        );
      });
    } else {
      skip("CORS for browser uploads", "pass --origin https://your-site to check it");
    }

    if (args.file) {
      const path = args.file;
      await step(`a real file (${basename(path)}) round-trips and analyses from storage`, async () => {
        const file = new Uint8Array(await readFile(path));
        const key = `${prefix}/sample-${basename(path).replace(/[^A-Za-z0-9._-]/g, "_")}`;
        created.add(key);

        await storage.put({ key, body: file, contentType: "application/octet-stream" });
        const read = await readAll(storage, key, file.byteLength);
        assert(read.sha256 === sha256Hex(file), "checksum mismatch after round trip");

        if (!isAnalyzable(path)) return `${file.byteLength} bytes stored; format is not mesh-analysable`;

        const analysis = await analyzeModel({ fileName: basename(path), bytes: read.bytes });
        return `${file.byteLength} bytes, ${analysis.objectCount} object(s), bounding box ${analysis.boundingBox.size.x.toFixed(1)} × ${analysis.boundingBox.size.y.toFixed(1)} × ${analysis.boundingBox.size.z.toFixed(1)} mm`;
      });
    } else {
      skip("a real model file from storage", "pass --file ./part.3mf to check it");
    }

    await step("DELETE removes the object, and deleting again succeeds", async () => {
      await storage.delete(direct);
      assert((await storage.head(direct)) === null, "object still present after DELETE");
      await storage.delete(direct);
      created.delete(direct);
    });
  } finally {
    for (const key of created) {
      try {
        await storage.delete(key);
      } catch (error) {
        console.log(`WARN  could not remove ${key} — ${describe(error)}`);
      }
    }
  }

  console.log(failures === 0 ? "\nAll storage checks passed." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(`Storage verification could not run — ${describe(error)}`);
  process.exitCode = 1;
}
