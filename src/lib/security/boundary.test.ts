import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * The client/server boundary.
 *
 * A module marked "use client" is shipped to every browser, and so is every
 * module it imports at runtime, transitively. This walks that graph from every
 * client entry and fails if it reaches something that must stay on the server:
 * a database driver, a storage or auth SDK, Payload, request headers, or code
 * that reads a server-only environment variable.
 *
 * Stops at "use server" modules, which a client imports as RPC references and
 * whose bodies never reach the browser. Skips `import type`, which is erased.
 *
 * A static check of source, not of the built bundle — `next build` would also
 * fail on most of these, but not on an environment read, which would simply be
 * `undefined` in the browser and silently wrong.
 */

const SRC = path.resolve("src");

const FORBIDDEN_PACKAGES: readonly RegExp[] = [
  /^node:/,
  /^(fs|path|crypto|child_process|os|net|tls|zlib|stream|http|https|async_hooks)$/,
  /^pg$/,
  /^pg-/,
  /^@electric-sql\/pglite/,
  /^drizzle-(orm|kit)(\/|$)/,
  /^@aws-sdk\//,
  /^@smithy\//,
  /^@supabase\//,
  /^payload(\/|$)/,
  /^@payloadcms\//,
  /^next\/headers$/,
  /^server-only$/,
];

/** Modules that exist only to hold server state or credentials. */
const FORBIDDEN_LOCAL: readonly string[] = [
  "lib/db/client.ts",
  "lib/auth/server.ts",
  "lib/auth/supabase.ts",
  "lib/storage/r2.ts",
  "lib/storage/index.ts",
  "payload.config.ts",
  // The operations console's operator gate and its cross-customer reads.
  "lib/ops/operator.ts",
];

/** An environment read that is neither public nor the build mode. */
const SERVER_ENV = /process\.env\.(?!NEXT_PUBLIC_|NODE_ENV\b)[A-Z_]/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

function hasDirective(source: string, directive: "use client" | "use server"): boolean {
  return new RegExp(`^\\s*["']${directive}["']`).test(stripComments(source));
}

/** Runtime import specifiers. Type-only imports are erased and not followed. */
export function runtimeImports(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];

  const statics = /(?:^|[\n;])\s*(?:import|export)\s+(type\s+)?(?:([\w$*\s{},]*?)\s+from\s+)?["']([^"']+)["']/g;
  for (const match of code.matchAll(statics)) {
    const [, typeOnly, clause, specifier] = match;
    if (typeOnly || !specifier) continue;

    // `import { type A, type B } from "x"` is erased too.
    const braces = clause?.trim().match(/^\{([\s\S]*)\}$/);
    if (braces) {
      const names = (braces[1] ?? "").split(",").map((name) => name.trim()).filter(Boolean);
      if (names.length > 0 && names.every((name) => name.startsWith("type "))) continue;
    }

    found.push(specifier);
  }

  for (const match of code.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1]) found.push(match[1]);
  }

  return found;
}

function resolveLocal(from: string, specifier: string): string | undefined {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return undefined;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

const relative = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

function clientEntries(): string[] {
  return sourceFiles(SRC).filter((file) => hasDirective(readFileSync(file, "utf8"), "use client"));
}

function violations(): string[] {
  const problems = new Set<string>();

  for (const entry of clientEntries()) {
    const parents = new Map<string, string | null>([[entry, null]]);
    const queue = [entry];

    const chain = (file: string): string => {
      const steps: string[] = [];
      for (let at: string | null | undefined = file; at; at = parents.get(at)) steps.unshift(relative(at));
      return steps.join(" → ");
    };

    while (queue.length > 0) {
      const file = queue.shift() as string;
      const source = readFileSync(file, "utf8");

      // A server action is an RPC reference on the client; its body stays on the server.
      if (file !== entry && hasDirective(source, "use server")) continue;

      if (FORBIDDEN_LOCAL.includes(relative(file))) {
        problems.add(`${chain(file)} (server-only module)`);
        continue;
      }

      if (SERVER_ENV.test(stripComments(source))) {
        problems.add(`${chain(file)} (reads a server-only environment variable)`);
      }

      for (const specifier of runtimeImports(source)) {
        const local = resolveLocal(file, specifier);

        if (local) {
          if (!parents.has(local)) {
            parents.set(local, file);
            queue.push(local);
          }
          continue;
        }

        if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
          if (FORBIDDEN_PACKAGES.some((pattern) => pattern.test(specifier))) {
            problems.add(`${chain(file)} imports ${specifier}`);
          }
        }
      }
    }
  }

  return [...problems].sort();
}

test("the import scanner follows runtime imports and skips erased ones", () => {
  const imports = runtimeImports(
    [
      '"use client";',
      'import { Pool } from "pg";',
      'import type { Order } from "drizzle-orm";',
      'import { type A, type B } from "@aws-sdk/client-s3";',
      'import { type C, d } from "@supabase/ssr";',
      "import {",
      "  e,",
      '} from "./local";',
      'export { f } from "payload";',
      'import "./side-effect.css";',
      '// import { g } from "next/headers";',
      'const h = await import("node:crypto");',
    ].join("\n"),
  );

  assert.deepEqual(imports.sort(), ["./local", "./side-effect.css", "@supabase/ssr", "node:crypto", "payload", "pg"]);
});

test("the scan finds the application's client components", () => {
  assert.ok(clientEntries().length >= 10, "the scanner found almost no client components");
});

test("no client component can reach a server-only module, SDK or secret", () => {
  assert.deepEqual(violations(), []);
});
