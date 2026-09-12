import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * The console's authorization, checked statically.
 *
 * Three rules, each of which would be easy to forget while adding a page and
 * expensive to notice afterwards:
 *
 *   1. every console page resolves the operator itself, because a layout does
 *      not re-render on client navigation and cannot stand in for the page
 *      beneath it — and the layout resolves one too, so it fails closed;
 *   2. every server action resolves the operator itself, because an action is a
 *      public POST endpoint whoever rendered the form;
 *   3. every cross-customer read or write in `lib/ops` takes an
 *      `OperatorSession`, so there is no call that compiles without having been
 *      through the gate.
 *
 * These are static checks of source, like `security/boundary.test.ts`. They
 * cannot prove the check does the right thing — `persistence.test.ts` exercises
 * that — but they fail the build the moment one is missing.
 */

const OPS_ROUTES = path.resolve("src/app/(ops)");
const OPS_LIB = path.resolve("src/lib/ops");

/** Modules that read or change records across customers. */
const GATED_MODULES = [
  "customers.ts",
  "dashboard.ts",
  "designs.ts",
  "issues.ts",
  "mutations.ts",
  "orders.ts",
  "payments.ts",
  "production.ts",
  "search.ts",
  "system.ts",
];

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const relative = (file: string) => path.relative(path.resolve("src"), file).split(path.sep).join("/");

const routeFiles = filesUnder(OPS_ROUTES);

test("the console route group exists and was found", () => {
  assert.ok(routeFiles.length >= 10, "the scanner found almost no console routes");
});

test("every console page requires an operator, with its own return path", () => {
  const missing = routeFiles
    .filter((file) => /[/\\]page\.tsx$/.test(file))
    .filter((file) => !readFileSync(file, "utf8").includes("requireOperator("))
    .map(relative);

  assert.deepEqual(missing, [], "these console pages never call requireOperator");
});

test("the console layout resolves an operator before it renders a shell", () => {
  const layouts = routeFiles.filter((file) => /[/\\]layout\.tsx$/.test(file));
  assert.ok(layouts.length >= 1, "no console layout was found");

  const missing = layouts
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return !source.includes("currentOperator(") && !source.includes("requireOperator(");
    })
    .map(relative);

  assert.deepEqual(missing, [], "these console layouts render without resolving an operator");
});

test("every console server action resolves the operator itself", () => {
  const actionFiles = routeFiles.filter((file) => {
    const source = readFileSync(file, "utf8");
    return /^\s*["']use server["']/.test(source);
  });

  assert.ok(actionFiles.length >= 2, "no server action files were found to check");

  const problems: string[] = [];

  for (const file of actionFiles) {
    const source = readFileSync(file, "utf8");

    if (!source.includes("currentOperator(")) {
      problems.push(`${relative(file)} never resolves an operator`);
      continue;
    }

    // Each exported action's body, up to the next export.
    const exports = [...source.matchAll(/export async function (\w+)/g)];

    exports.forEach((match, index) => {
      const start = match.index ?? 0;
      const end = exports[index + 1]?.index ?? source.length;
      const body = source.slice(start, end);

      // Either the action checks directly, or it delegates to the local helper
      // that does — `run` is defined in the same file and checks first.
      if (!body.includes("currentOperator(") && !body.includes("run(")) {
        problems.push(`${relative(file)}#${match[1]} does not check the operator`);
      }
    });
  }

  assert.deepEqual(problems, [], "these server actions are reachable without an operator check");
});

test("every cross-customer read and write takes an operator session", () => {
  const problems: string[] = [];

  for (const name of GATED_MODULES) {
    const file = path.join(OPS_LIB, name);
    const source = readFileSync(file, "utf8");

    const exported = [...source.matchAll(/export async function (\w+)\s*\(/g)].map((match) => match[1]);
    const gated = new Set(
      [...source.matchAll(/export async function (\w+)\s*\(\s*_?operator: OperatorSession/g)].map(
        (match) => match[1],
      ),
    );

    for (const fn of exported) {
      if (fn && !gated.has(fn)) problems.push(`lib/ops/${name}#${fn}`);
    }
  }

  assert.deepEqual(
    problems,
    [],
    "these exported functions read or change records without requiring an operator session",
  );
});

test("the operator gate is the only place an operator session is minted", () => {
  const minted = filesUnder(OPS_LIB)
    .filter((file) => !file.endsWith(".test.ts"))
    .filter((file) => path.basename(file) !== "operator.ts")
    .filter((file) => /as unknown as OperatorSession|as OperatorSession/.test(readFileSync(file, "utf8")))
    .map(relative);

  assert.deepEqual(minted, [], "these modules cast their own operator session");
});
