"use server";

import { revalidatePath } from "next/cache";

import {
  cancelPurchase,
  createInventoryItem,
  createPurchase,
  createSupplier,
  receivePurchase,
  recordOpeningBalance,
  recordStockMovement,
  syncInventoryDefinitions,
  updateInventoryItem,
} from "@/lib/inventory/service";
import { EVENTS, log } from "@/lib/observability";
import { getCatalogHealth } from "@/lib/ops/analytics/catalog";
import { currentOperator, type OperatorSession } from "@/lib/ops/operator";
import type { OpsActionResult } from "@/lib/ops/types";

/**
 * Inventory write endpoints (Stage 22; consumables and suppliers on items in Stage 22.6).
 *
 * Each is a public POST, so each resolves the operator itself. The form's
 * fields are passed through as text; `lib/inventory/service` validates them,
 * locks the item and writes the balance and its movement together. No action
 * here accepts a quantity to set.
 */

const SIGNED_OUT: OpsActionResult = {
  ok: false,
  message: "Your operator session has ended. Sign in again, then try once more.",
};

const FAILED: OpsActionResult = {
  ok: false,
  message: "That change could not be completed. Reload the page to see the current stock.",
};

/** The form's text fields, as a plain record. Files and repeated fields are ignored. */
function fields(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !(key in values) && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

async function run(action: string, work: (operator: OperatorSession) => Promise<OpsActionResult>): Promise<OpsActionResult> {
  const operator = await currentOperator();
  if (!operator) return SIGNED_OUT;

  try {
    const result = await work(operator);
    if (result.ok) revalidatePath("/admin", "layout");
    return result;
  } catch (error) {
    log.error(EVENTS.opsActionRefused, {
      operatorId: operator.id,
      action,
      error: error instanceof Error ? error.name : "unknown",
    });
    return FAILED;
  }
}

export async function syncDefinitionsAction(): Promise<OpsActionResult> {
  return run("inventory_sync", async (operator) => {
    const catalog = await getCatalogHealth(operator);
    if (!catalog.reachable) return { ok: false, message: "The CMS catalog could not be read, so product definitions cannot be created." };
    const products = catalog.products
      .filter((product) => product.approvalStatus !== "archived")
      .map((product) => ({ id: product.productId, name: product.name }));
    const result = await syncInventoryDefinitions(operator, products);
    return { ok: result.ok, message: result.message };
  });
}

export async function createItemAction(_previous: OpsActionResult | null, form: FormData): Promise<OpsActionResult> {
  return run("inventory_create_item", async (operator) => {
    const values = fields(form);
    // A finished product is a catalog product: its name comes from the catalog, never from the form.
    let catalog: { id: string; name: string }[] = [];
    if (values.itemType === "FINISHED_PRODUCT") {
      const health = await getCatalogHealth(operator);
      if (!health.reachable) return { ok: false, message: "The CMS catalog could not be read, so the product cannot be checked. Try again." };
      catalog = health.products.filter((product) => product.approvalStatus !== "archived").map((product) => ({ id: product.productId, name: product.name }));
    }
    return createInventoryItem(operator, values, catalog);
  });
}

export async function updateItemAction(_previous: OpsActionResult | null, form: FormData): Promise<OpsActionResult> {
  return run("inventory_update_item", (operator) => {
    const { active, ...values } = fields(form);
    const clear = form.getAll("clear").filter((value): value is string => typeof value === "string");
    return updateInventoryItem(operator, {
      ...values,
      clear,
      ...(active === "true" ? { active: true } : active === "false" ? { active: false } : {}),
    });
  });
}

export async function openingBalanceAction(_previous: OpsActionResult | null, form: FormData): Promise<OpsActionResult> {
  return run("inventory_opening", (operator) => recordOpeningBalance(operator, fields(form)));
}

export async function movementAction(_previous: OpsActionResult | null, form: FormData): Promise<OpsActionResult> {
  return run("inventory_movement", (operator) => recordStockMovement(operator, fields(form)));
}

export async function createSupplierAction(_previous: OpsActionResult | null, form: FormData): Promise<OpsActionResult> {
  return run("inventory_supplier", (operator) => createSupplier(operator, fields(form)));
}

export async function createPurchaseAction(_previous: OpsActionResult | null, form: FormData): Promise<OpsActionResult> {
  return run("inventory_purchase", (operator) => createPurchase(operator, fields(form)));
}

export async function receivePurchaseAction(_previous: OpsActionResult | null, form: FormData): Promise<OpsActionResult> {
  return run("inventory_receive", (operator) => receivePurchase(operator, fields(form)));
}

export async function cancelPurchaseAction(_previous: OpsActionResult | null, form: FormData): Promise<OpsActionResult> {
  return run("inventory_cancel_purchase", (operator) => cancelPurchase(operator, fields(form)));
}
