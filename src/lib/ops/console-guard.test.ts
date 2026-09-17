import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

/** Stage 22.5: Reality 3D Admin, at /admin. */
const OPS_ROUTES = path.resolve("src/app/(admin)");
/**
 * The one page under /admin that renders without an operator: the sign-in
 * page. Its own test below checks what it may and may not do.
 */
const SIGN_IN_DIR = path.join(OPS_ROUTES, "admin", "login");
const OUTER_LAYOUT = path.join(OPS_ROUTES, "admin", "layout.tsx");
const OPS_LIB = path.resolve("src/lib/ops");
const ANALYTICS_LIB = path.join(OPS_LIB, "analytics");
/** Stage 22: stock, costs and suppliers are operator data, read and written only through the console. */
const INVENTORY_LIB = path.resolve("src/lib/inventory");
const INVENTORY_MODULES = ["consumption.ts", "read.ts", "service.ts"];

/** Modules that read or change records across customers. */
const GATED_MODULES = [
  "catalog-admin.ts",
  "customers.ts",
  "dashboard.ts",
  "designs.ts",
  "issues.ts",
  "mutations.ts",
  "orders.ts",
  "payments.ts",
  "product-admin.ts",
  "production.ts",
  "search.ts",
  "system.ts",
];

/** Stage 21: the command centre's analytics services. Pure helpers export no async function. */
const ANALYTICS_MODULES = [
  "attention.ts",
  "catalog.ts",
  "inventory.ts",
  "manufacturing.ts",
  "materials.ts",
  "orders.ts",
  "products.ts",
  "revenue.ts",
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
const consoleFiles = routeFiles.filter((file) => !file.startsWith(SIGN_IN_DIR));

test("the console route group exists and was found", () => {
  assert.ok(routeFiles.length >= 10, "the scanner found almost no console routes");
});

test("every console page requires an operator, with its own return path", () => {
  const missing = consoleFiles
    .filter((file) => /[/\\]page\.tsx$/.test(file))
    .filter((file) => !readFileSync(file, "utf8").includes("requireOperator("))
    .map(relative);

  assert.deepEqual(missing, [], "these console pages never call requireOperator");
});

test("the console layout resolves an operator before it renders a shell", () => {
  const shell = path.join(OPS_ROUTES, "admin", "(console)", "layout.tsx");
  const layouts = routeFiles.filter((file) => /[/\\]layout\.tsx$/.test(file));
  assert.ok(layouts.includes(shell), "the admin shell layout was not found");
  assert.match(readFileSync(shell, "utf8"), /requireOperator\(/);

  // The /admin layout also wraps the sign-in page, so it renders nothing but its children.
  const outer = readFileSync(OUTER_LAYOUT, "utf8");
  assert.doesNotMatch(outer, /ShellFrame|@\/lib\/ops\/|@\/lib\/inventory|@\/components\/ops/, "the /admin layout renders ungated content");

  const missing = layouts
    .filter((file) => file !== OUTER_LAYOUT)
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return !source.includes("currentOperator(") && !source.includes("requireOperator(");
    })
    .map(relative);

  assert.deepEqual(missing, [], "these console layouts render without resolving an operator");
});

test("every console server action resolves the operator itself", () => {
  const actionFiles = consoleFiles.filter((file) => {
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

  for (const file of [
    ...GATED_MODULES.map((name) => path.join(OPS_LIB, name)),
    ...ANALYTICS_MODULES.map((name) => path.join(ANALYTICS_LIB, name)),
    ...INVENTORY_MODULES.map((name) => path.join(INVENTORY_LIB, name)),
  ]) {
    const name = path.relative(OPS_LIB, file).split(path.sep).join("/");
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

test("every analytics module is listed, so a new one cannot skip the operator check", () => {
  const modules = readdirSync(ANALYTICS_LIB)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .filter((name) => /export async function/.test(readFileSync(path.join(ANALYTICS_LIB, name), "utf8")))
    .sort();
  assert.deepEqual(modules, [...ANALYTICS_MODULES].sort());
});

test("every inventory module that touches the database is listed", () => {
  const modules = readdirSync(INVENTORY_LIB)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .filter((name) => /export async function/.test(readFileSync(path.join(INVENTORY_LIB, name), "utf8")))
    .sort();
  assert.deepEqual(modules, [...INVENTORY_MODULES].sort());
});

test("business analytics are reachable only from the console", () => {
  /*
   * Revenue, inventory, the production pipeline, customer counts and catalog
   * approvals are operator data. No storefront page, customer account page,
   * API route or non-console module may import the console's read models. The
   * proxy is the one exception, and it imports only the pure route helpers.
   */
  const scanned = [
    ...filesUnder(path.resolve("src/app")).filter((file) => !file.startsWith(OPS_ROUTES)),
    ...filesUnder(path.resolve("src/components")).filter(
      (file) => !file.startsWith(path.resolve("src/components/ops")),
    ),
    ...filesUnder(path.resolve("src/lib")).filter(
      (file) => !file.startsWith(OPS_LIB) && !file.startsWith(INVENTORY_LIB) && !file.endsWith(".test.ts"),
    ),
    path.resolve("src/proxy.ts"),
  ];

  assert.ok(scanned.length > 50, "the scanner found almost nothing to check");

  const problems: string[] = [];
  for (const file of scanned) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']/g)) {
      const specifier = match[1] ?? match[2] ?? "";
      const reachesOps =
        /^@\/(lib\/ops|components\/ops|lib\/inventory)(\/|$)/.test(specifier) ||
        (specifier.startsWith(".") &&
          /[/\\](lib[/\\]ops|components[/\\]ops|lib[/\\]inventory)([/\\]|$)/.test(path.resolve(path.dirname(file), specifier)));
      if (!reachesOps) continue;
      if (relative(file) === "proxy.ts" && specifier === "@/lib/ops/routes") continue;
      problems.push(`${relative(file)} imports ${specifier}`);
    }
  }

  assert.deepEqual(problems, [], "these non-console modules reach the console's read models");
});

test("old addresses are redirects into the gated admin, not second entry points", () => {
  const config = readFileSync(path.resolve("next.config.ts"), "utf8");
  assert.match(config, /LEGACY_REDIRECTS\.map\(\(rule\) => \(\{ \.\.\.rule, permanent: false \}\)\)/);
  assert.ok(
    !filesUnder(path.resolve("src/app")).some((file) => /admin[/\\]dashboard/.test(file)),
    "a page at /admin/dashboard would bypass the console layout",
  );
  assert.ok(!existsSync(path.resolve("src/app/(ops)")), "the Stage 21 /ops route group must not come back beside /admin");
});

test("the sign-in page is the only ungated admin route, and it touches no business data", () => {
  const files = routeFiles.filter((file) => file.startsWith(SIGN_IN_DIR));
  assert.ok(files.some((file) => file.endsWith("page.tsx")), "the sign-in page was not found");

  const allowed = new Set([
    "@/lib/ops/operator",
    "@/lib/ops/routes",
    "@/lib/ops/query",
    "@/lib/brand",
    "@/components/core/Button",
    "@/components/core/Icon",
    "@/components/forms/Input",
    "@payloadcms/next/auth",
    "@payload-config",
    "payload",
    "next",
    "next/navigation",
    "react",
  ]);
  const problems: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']/g)) {
      const specifier = match[1] ?? match[2] ?? "";
      if (!specifier.startsWith(".") && !allowed.has(specifier)) problems.push(`${relative(file)} imports ${specifier}`);
    }
  }
  assert.deepEqual(problems, [], "the ungated sign-in page reaches beyond authentication");

  const page = readFileSync(path.join(SIGN_IN_DIR, "page.tsx"), "utf8");
  assert.match(page, /if \(await currentOperator\(\)\) redirect\(returnTo\)/, "a signed-in operator is sent on");
  assert.match(page, /safeOpsPath\(/, "the return path is validated");

  const action = readFileSync(path.join(SIGN_IN_DIR, "actions.ts"), "utf8");
  assert.match(action, /^"use server";/);
  assert.match(action, /login\(\{ collection: "users", config, email, password \}\)/, "sign-in is Payload's own login operation");
  assert.match(action, /safeOpsPath\(form\.get\("redirect"\)\)/, "the action validates the return path itself");
});

test("catalog writes go through Payload as the signed-in user, never around its access control", () => {
  const reads = readFileSync(path.join(OPS_LIB, "catalog-admin.ts"), "utf8");
  assert.doesNotMatch(reads, /payload\.(update|create|delete)\(/, "the catalog read models do not write");

  const source = readFileSync(path.join(OPS_LIB, "product-admin.ts"), "utf8");
  const writes = [...source.matchAll(/payload\.(update|create|delete)\(\{([\s\S]*?)\n {4}\}\);/g)];
  assert.deepEqual(writes.map((match) => match[1]).sort(), ["create", "update"], "products are created and edited exactly one way each, and never deleted here");
  for (const [, , body] of writes) {
    assert.match(body ?? "", /overrideAccess: false/);
    assert.match(body ?? "", /\buser,/);
    assert.doesNotMatch(body ?? "", /overrideAccess: true|disableVerification|context:/);
  }
  // A new product is unpublished and in approval status draft, with full validation.
  assert.match(source, /_status: "draft",\s*approvalStatus: "draft",/);
  assert.match(source, /draft: false,/);
  assert.match(source, /String\(user\.id\) !== operator\.id/, "the Payload user must be the operator the gate admitted");

  for (const action of ["products/actions.ts", "products/[id]/actions.ts"]) {
    const file = readFileSync(path.join(OPS_ROUTES, "admin", "(console)", action), "utf8");
    assert.match(file, /if \(!operator\) return \{ status: "error", message: "Unauthorized\."/, `${action} refuses without an operator`);
  }
});
