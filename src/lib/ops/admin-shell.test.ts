import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ANALYTICS_PAGES, CATALOG_PAGES, analyticsTabs, catalogTabs } from "@/components/ops/areas";
import { costPerUnit, formatCost, nextStep, stockText } from "@/components/ops/inventory/display";
import { NAV_GROUPS, NAV_ITEMS, isActive, locate } from "@/components/ops/navigation";
import type { InventoryItemView } from "@/lib/inventory/read";
import { BRAND } from "@/lib/brand";
import { readinessSections } from "@/lib/catalog/readiness-panel";
import { AdvancedCmsNotice, BackToAdmin, LoginNote, Logo, Mark } from "@/payload/admin/Brand";

import { LIMITS, parseProductForm } from "./product-form";
import { APPROVAL_LABEL, CLASS_LABEL, LAUNCH_TONE, MEDIA_LABEL, STAGE_LABEL } from "./product-labels";
import { ADMIN_HOME, CMS_HOME, LEGACY_REDIRECTS, operatorLoginHref, safeOpsPath } from "./routes";

/**
 * Stage 22.5 — Reality 3D Admin: the shell's information architecture, the
 * routes behind it, the branding Payload renders, and the product workspace's
 * pure parts. Authorization is covered by `console-guard.test.ts`; the
 * services by the persistence tests.
 */

const CONSOLE = path.resolve("src/app/(admin)/admin/(console)");

/** The page file that serves an admin URL, or null. Dynamic segments are not used by the nav. */
function pageFor(href: string): string | null {
  const pathname = href.split(/[?#]/)[0] ?? "";
  if (!pathname.startsWith(ADMIN_HOME)) return null;
  const rest = pathname.slice(ADMIN_HOME.length).replace(/^\//, "");
  const file = path.join(CONSOLE, ...(rest ? rest.split("/") : []), "page.tsx");
  return existsSync(file) ? file : null;
}

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

test("the sidebar is organised by business area, in order", () => {
  assert.deepEqual(
    NAV_GROUPS.map((group) => group.label),
    [null, "Business", "Operations", "Analytics", "Catalog", "System"],
  );
  assert.equal(NAV_GROUPS[0]?.items[0]?.label, "Overview");
  assert.equal(NAV_GROUPS[0]?.items[0]?.href, ADMIN_HOME);

  const labels = (group: string) => NAV_GROUPS.find((entry) => entry.label === group)?.items.map((item) => item.label) ?? [];
  for (const label of ["Sales", "Orders", "Products", "Customers"]) assert.ok(labels("Business").includes(label), label);
  for (const label of ["Manufacturing", "Inventory"]) assert.ok(labels("Operations").includes(label), label);
  assert.deepEqual(labels("Analytics"), ["Revenue", "Product sales", "Material usage"]);
  assert.deepEqual(labels("Catalog"), ["Catalog health", "Categories", "Materials", "Pricing", "Media"]);
  assert.deepEqual(labels("System"), ["Settings", "Advanced CMS"]);
});

test("every sidebar destination is a real admin page, and only Advanced CMS leaves the admin", () => {
  for (const item of NAV_ITEMS) {
    if (item.external) {
      assert.equal(item.href, CMS_HOME, `${item.label} is the only way into Payload`);
      assert.equal(item.label, "Advanced CMS");
      continue;
    }
    assert.ok(pageFor(item.href), `${item.label} → ${item.href} has no page`);
  }
  assert.equal(NAV_ITEMS.filter((item) => item.external).length, 1);
});

test("sidebar labels are unique, and raw CMS collection names are not the navigation", () => {
  const labels = NAV_ITEMS.map((item) => item.label);
  assert.equal(new Set(labels).size, labels.length, "a collapsed rail would show two identical names");
  for (const raw of ["Users", "Globals", "Price approvals", "Collections", "Payload", "Content CMS"]) {
    assert.ok(!labels.includes(raw), `${raw} is a CMS concept, not a business one`);
  }
});

test("the section tabs point at real pages and keep the analytics range", () => {
  for (const page of [...ANALYTICS_PAGES, ...CATALOG_PAGES]) assert.ok(pageFor(page.href), page.href);

  const tabs = analyticsTabs("materials", { range: "ytd" });
  assert.deepEqual(tabs.map((tab) => tab.href), ["/admin/analytics?range=ytd", "/admin/analytics/products?range=ytd", "/admin/analytics/materials?range=ytd"]);
  assert.deepEqual(tabs.map((tab) => tab.current), [false, false, true]);
  assert.equal(catalogTabs("pricing").filter((tab) => tab.current)[0]?.href, "/admin/catalog/pricing");
});

test("exactly one sidebar item is active, the most specific one", () => {
  const cases: [string, string][] = [
    ["/admin", "Overview"],
    ["/admin/orders", "Orders"],
    ["/admin/orders/S3D-000184", "Orders"],
    ["/admin/products", "Products"],
    ["/admin/products/12", "Products"],
    ["/admin/manufacturing", "Manufacturing"],
    ["/admin/inventory", "Inventory"],
    ["/admin/analytics", "Revenue"],
    ["/admin/analytics/products", "Product sales"],
    ["/admin/analytics/materials", "Material usage"],
    ["/admin/catalog", "Catalog health"],
    ["/admin/catalog/categories", "Categories"],
    ["/admin/catalog/media", "Media"],
    ["/admin/settings", "Settings"],
  ];
  for (const [pathname, label] of cases) {
    const active = NAV_ITEMS.filter((item) => isActive(pathname, item)).map((item) => item.label);
    assert.deepEqual(active, [label], pathname);
    assert.equal(locate(pathname)?.item.label, label, `top bar for ${pathname}`);
  }
  assert.equal(locate("/admin/analytics/products")?.group, "Analytics");
  assert.equal(locate("/admin")?.group, null);
  assert.equal(locate("/shop"), null);
});

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

test("Payload is mounted at /cms, and the admin shell owns /admin", () => {
  const config = readFileSync(path.resolve("src/payload.config.ts"), "utf8");
  assert.match(config, /routes: \{ api: "\/payload-api", admin: "\/cms" \}/);
  assert.equal(CMS_HOME, "/cms");

  assert.ok(existsSync(path.resolve("src/app/(payload)/cms/[[...segments]]/page.tsx")), "Payload's catch-all moved with it");
  assert.ok(!existsSync(path.resolve("src/app/(payload)/admin")), "Payload no longer claims /admin");
  assert.ok(pageFor("/admin"), "the admin overview exists");
});

test("old addresses redirect to their new homes, specific rules first", () => {
  const destination = (source: string) => LEGACY_REDIRECTS.find((rule) => rule.source === source)?.destination;
  assert.equal(destination("/ops"), "/admin");
  assert.equal(destination("/ops/production"), "/admin/manufacturing");
  assert.equal(destination("/ops/:path*"), "/admin/:path*");
  assert.equal(destination("/admin/dashboard"), "/admin");
  assert.equal(destination("/admin/collections/:path*"), "/cms/collections/:path*");
  assert.equal(destination("/admin/globals/:path*"), "/cms/globals/:path*");

  const index = (source: string) => LEGACY_REDIRECTS.findIndex((rule) => rule.source === source);
  assert.ok(index("/ops/production") < index("/ops/:path*"), "the renamed page must match before the catch-all");

  // Every /ops page the Stage 21 console had still lands on an admin page.
  for (const old of ["sales", "orders", "products", "customers", "inventory", "analytics", "catalog", "settings", "issues", "payments", "designs"]) {
    assert.ok(pageFor(`/admin/${old}`), `/ops/${old} redirects to a page that does not exist`);
  }
  assert.ok(pageFor("/admin/manufacturing"));

  // No redirect captures an admin page or the sign-in page.
  for (const rule of LEGACY_REDIRECTS) {
    assert.ok(rule.source !== "/admin/login" && rule.source !== "/admin/:path*", rule.source);
    if (rule.source.startsWith("/admin/") && rule.source !== "/admin/dashboard") {
      assert.ok(rule.destination.startsWith(CMS_HOME), `${rule.source} is a Payload view and goes to /cms`);
    }
  }
});

test("signing in lands back inside the admin and never on the sign-in page", () => {
  assert.equal(operatorLoginHref("/admin/products/3?tab=pricing"), "/admin/login?redirect=%2Fadmin%2Fproducts%2F3%3Ftab%3Dpricing");
  assert.equal(safeOpsPath("/admin/login"), ADMIN_HOME);
  assert.equal(safeOpsPath("/cms"), ADMIN_HOME);
});

test("the proxy runs for /admin and skips Payload's /cms", () => {
  const proxy = readFileSync(path.resolve("src/proxy.ts"), "utf8");
  const matcher = /"\/\(\(\?!([^"]+)\)\.\*\)"/.exec(proxy)?.[1] ?? "";
  const excluded = matcher.split("|");
  assert.ok(excluded.includes("cms"), "Payload's panel is excluded");
  assert.ok(!excluded.includes("admin"), "the admin needs the return-path header");
});

/* ------------------------------------------------------------------ *
 * Branding
 * ------------------------------------------------------------------ */

test("Payload's panel wears Reality 3D branding through its supported slots", () => {
  const config = readFileSync(path.resolve("src/payload.config.ts"), "utf8");
  for (const slot of ["Logo: \"/payload/admin/Brand#Logo\"", "Icon: \"/payload/admin/Brand#Mark\"", "beforeNavLinks", "beforeDashboard", "afterLogin"]) {
    assert.ok(config.includes(slot), slot);
  }
  assert.match(config, /theme: "dark"/);
  assert.match(config, /icons: \[\{ rel: "icon", url: "\/favicon\.ico" \}\]/, "no Payload favicon");
  assert.match(config, /siteName: "Reality 3D"/, "no 'Payload App' site name");
  assert.match(config, /defaultOGImageType: "off"/);

  const importMap = readFileSync(path.resolve("src/app/(payload)/cms/importMap.ts"), "utf8");
  for (const name of ["Logo", "Mark", "BackToAdmin", "AdvancedCmsNotice", "LoginNote"]) {
    assert.ok(importMap.includes(`"/payload/admin/Brand#${name}"`), `the import map resolves ${name}`);
  }

  const layout = readFileSync(path.resolve("src/app/(payload)/layout.tsx"), "utf8");
  assert.match(layout, /import "\.\/custom\.css";/);
  const css = readFileSync(path.resolve("src/app/(payload)/custom.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /\.(nav|template-|collections|dashboard|login)\b/, "no selectors against Payload's internal markup");
});

test("the rendered Payload brand says Reality 3D, never Payload", () => {
  const logo = renderToStaticMarkup(createElement(Logo));
  assert.match(logo, /REALITY/);
  assert.match(logo, /3D/);
  assert.ok(logo.includes(BRAND.tagline), "Imagine. Design. Create.");
  assert.equal(BRAND.tagline, "Imagine. Design. Create.");

  for (const markup of [logo, renderToStaticMarkup(createElement(Mark)), renderToStaticMarkup(createElement(BackToAdmin))]) {
    assert.doesNotMatch(markup, /payload/i);
  }
  assert.match(renderToStaticMarkup(createElement(BackToAdmin)), /href="\/admin"/);
  assert.match(renderToStaticMarkup(createElement(AdvancedCmsNotice)), /Reality 3D Admin/);
  assert.match(renderToStaticMarkup(createElement(LoginNote)), /href="\/admin\/login"/);
});

test("the admin shell and sign-in page carry the Reality 3D brand", () => {
  const shell = readFileSync(path.resolve("src/components/ops/ShellFrame.tsx"), "utf8");
  assert.match(shell, /REALITY<span className=\{styles\.brandAccent\}>3D<\/span>/);
  assert.ok(shell.includes(BRAND.tagline));
  assert.doesNotMatch(shell, /Operations<\/span>/, "the Stage 21 'Operations' product name is gone");

  const signIn = readFileSync(path.resolve("src/app/(admin)/admin/login/page.tsx"), "utf8");
  assert.match(signIn, /BRAND\.tagline/);
  assert.match(signIn, /REALITY/);
});

/* ------------------------------------------------------------------ *
 * Product workspace
 * ------------------------------------------------------------------ */

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

test("a workspace section is shape-checked before Payload sees it", () => {
  const ok = parseProductForm(form({ name: "  Spur Gear  ", summary: "24T module 1", categoryId: "2", sku: "rg-gear-024" }), ["overview"]);
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.values.name, "Spur Gear");
  assert.equal(ok.values.sku, "RG-GEAR-024");
  assert.equal(ok.values.slug, "spur-gear", "the URL segment is made from the name when left empty");

  assert.ok(parseProductForm(form({ name: " ", summary: "x", categoryId: "2" }), ["overview"]).errors.name);
  assert.match(parseProductForm(form({ name: "A", summary: "B", categoryId: "2", sku: "RG GEAR" }), ["overview"]).errors.sku ?? "", /Invalid SKU format/);
  assert.ok(parseProductForm(form({ name: "A", summary: "B", categoryId: "2", description: "x".repeat((LIMITS.description ?? 0) + 1) }), ["overview"]).errors.description);

  // Only the section being saved is checked: a pricing save does not need a name.
  assert.deepEqual(parseProductForm(form({ price: "450" }), ["pricing"]).errors, {});
});

test("the launch panel is the Stage 20 assessment, grouped, with where to fix each failure", () => {
  const sections = readinessSections([
    "• Missing approved price",
    "• Product not approved",
    "• Not published",
    "• Technical: model file not found",
  ]);
  assert.deepEqual(
    sections.map((section) => [section.section, section.passed]),
    [
      ["TECHNICAL", false],
      ["MANUFACTURING", true],
      ["COMMERCIAL", true],
      ["PRICE", false],
      ["MEDIA", true],
      ["PRODUCT APPROVAL", false],
      ["PUBLICATION", false],
    ],
  );
  const technical = sections[0]!;
  assert.deepEqual(technical.lines, ["model file not found"]);
  assert.match(technical.action ?? "", /3D model/);
  assert.equal(sections[1]!.action, null);

  const ready = readinessSections([], true);
  assert.ok(ready.every((section) => section.passed));
  assert.match(ready.find((section) => section.section === "PRICE")!.lines[0]!, /Quote only/);
});

test("every product status has a word as well as a colour", () => {
  for (const stage of ["NOT READY", "READY FOR REVIEW", "APPROVED", "LAUNCH READY"] as const) {
    assert.ok(STAGE_LABEL[stage]);
    assert.ok(LAUNCH_TONE[stage]);
  }
  assert.equal(Object.keys(APPROVAL_LABEL).length, 5);
  assert.equal(Object.keys(CLASS_LABEL).length, 3);
  assert.equal(Object.keys(MEDIA_LABEL).length, 4);
});

test("the product list, workspace and catalog pages exist and open the workspace, not the CMS", () => {
  for (const page of ["products", "products/create", "catalog/categories", "catalog/materials", "catalog/pricing", "catalog/media", "analytics/materials"]) {
    assert.ok(pageFor(`/admin/${page}`), page);
  }
  assert.ok(existsSync(path.join(CONSOLE, "products", "[id]", "page.tsx")));

  const list = readFileSync(path.join(CONSOLE, "products", "page.tsx"), "utf8");
  assert.match(list, /<RowLink href=\{row\.href\}>/, "rows open row.href, the workspace");
  assert.match(list, /<Button href="\/admin\/products\/create"[^>]*>\s*Add product/, "Add product opens the Reality 3D create page");
  assert.doesNotMatch(list, /collections\/products\/create|cmsCollectionHref|CMS_HOME/, "the product list never sends creation to the CMS");

  const workspace = readFileSync(path.join(CONSOLE, "products", "[id]", "page.tsx"), "utf8");
  assert.doesNotMatch(workspace, /collections\/products\/create/);
  const create = readFileSync(path.join(CONSOLE, "products", "create", "page.tsx"), "utf8");
  assert.match(create, /requireOperator\(PATH\)/);
  assert.doesNotMatch(create, /\/cms|cmsCollectionHref/, "the create page never leaves the admin");
  const catalog = readFileSync(path.resolve("src/lib/ops/analytics/catalog.ts"), "utf8");
  assert.match(catalog, /href: productWorkspaceHref\(doc\.id\)/);
});

/* ------------------------------------------------------------------ *
 * Stage 22.6: inventory workspace and the shared UX rules
 * ------------------------------------------------------------------ */

test("inventory is one workspace: tabs are URLs, adding an item is a page, and there is no second inventory app", () => {
  const page = readFileSync(path.join(CONSOLE, "inventory", "page.tsx"), "utf8");
  for (const tab of ["overview", "raw", "finished", "consumables", "movements", "purchases", "suppliers"]) {
    assert.match(page, new RegExp(`"${tab}"`), tab);
  }
  assert.ok(pageFor("/admin/inventory/new"), "the add-item page exists");
  assert.match(page, /\/new`, \{ kind: addKind \}/, "the primary action opens the add-item page for the current kind");
  assert.equal(NAV_ITEMS.filter((item) => item.href.startsWith("/admin/inventory")).length, 1, "inventory is one navigation item");
  assert.ok(!existsSync(path.join(CONSOLE, "consumables")), "consumables are a tab, not an application");

  const add = readFileSync(path.join(CONSOLE, "inventory", "new", "page.tsx"), "utf8");
  assert.match(add, /requireOperator\(PATH\)/);
  const itemForm = readFileSync(path.resolve("src/components/ops/inventory/ItemForm.tsx"), "utf8");
  assert.doesNotMatch(itemForm, /name="(quantity|currentQuantity|openingQuantity)"/, "adding an item never asks for stock");
  assert.match(add, /createItemAction/);
});

test("an item's next step follows from its status, and unknown stock never reads as zero", () => {
  const item = (overrides: Partial<InventoryItemView>): InventoryItemView => ({
    id: "inv_1", name: "Label", sku: null, itemType: "CONSUMABLE", group: "CONSUMABLE", category: "Packaging", material: null,
    colour: null, unit: "pcs", productId: null, supplierId: null, supplierName: null, notes: null, active: true, current: null,
    reorderLevel: null, targetStock: null, unitCost: null, unitCostSource: null, status: "NOT_TRACKED", reorderQuantity: null,
    value: null, openedAt: null, updatedAt: "2026-09-16T00:00:00.000Z", ...overrides,
  });
  assert.equal(nextStep(item({})), "Enter opening stock");
  assert.equal(nextStep(item({ current: 0, status: "OUT_OF_STOCK", reorderQuantity: 500_000 })), "Reorder 500 pcs");
  assert.equal(nextStep(item({ current: 50_000, status: "REORDER", reorderQuantity: null })), "Reorder — set a target to size it");
  assert.equal(nextStep(item({ current: 50_000, status: "NO_REORDER_LEVEL" })), "Set a reorder level");
  assert.equal(nextStep(item({ current: 50_000, status: "HEALTHY" })), "Record a unit cost");
  assert.equal(nextStep(item({ current: 50_000, status: "HEALTHY", unitCost: 0.5 })), "No action");

  assert.equal(stockText(null, "kg"), "Not tracked");
  assert.equal(stockText(0, "kg"), "0 kg");
  assert.equal(costPerUnit(null, "pack"), "Missing");
  assert.equal(costPerUnit(250, "pack"), "₹250 / pack");
  assert.equal(formatCost(0.5), "₹0.50");
  assert.equal(formatCost(1250), "₹1,250");
});

test("the admin's shared UX rules are in the shared components, not per page", () => {
  const shell = readFileSync(path.resolve("src/components/ops/ShellFrame.module.css"), "utf8");
  assert.match(shell, /--text-muted: #8a919b;/, "muted text meets AA on admin surfaces");
  assert.match(shell, /--type-technical-sm: var\(--fw-regular\) var\(--fs-label\)/, "captions are 12px in the admin");
  assert.match(shell, /:where\(\.main > \* \+ \*\) \{\s*margin-top: var\(--spacing-5\);/, "one vertical rhythm");

  const table = readFileSync(path.resolve("src/components/ops/Table.module.css"), "utf8");
  assert.match(table, /\.th \{[^}]*font: var\(--type-label\);[^}]*letter-spacing: var\(--ls-label\);/, "table headers use the label type");

  const command = readFileSync(path.resolve("src/components/ops/command/command.module.css"), "utf8");
  assert.match(command, /\.chip,\s*\.chip:hover \{[^}]*border-radius: var\(--radius-chip\);/, "filter chips are not pills");
  assert.doesNotMatch(command, /repeat\(7,/, "no seven-across KPI rows");

  const inventoryCss = readFileSync(path.resolve("src/components/ops/inventory/inventory.module.css"), "utf8");
  assert.match(inventoryCss, /height: var\(--control-height-sm\);/, "native inventory fields match the design-system input height");
  assert.ok(!existsSync(path.resolve("src/components/ops/layout.module.css")), "the unused duplicate layout stylesheet is gone");

  const overview = readFileSync(path.join(CONSOLE, "page.tsx"), "utf8");
  assert.equal((overview.match(/<KpiCard/g) ?? []).length, 6, "the overview leads with six figures");
});

test("the product launch panel states progress and exactly one next step", () => {
  const workspace = readFileSync(path.join(CONSOLE, "products", "[id]", "page.tsx"), "utf8");
  assert.match(workspace, /checks pass/);
  assert.match(workspace, /const nextSection = sections\.find\(\(section\) => !section\.passed\);/);
  assert.match(workspace, /Next step/);
});
