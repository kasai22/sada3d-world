"use server";

import { revalidatePath } from "next/cache";

import {
  acceptPriceChange,
  addCatalogLine,
  addCustomLine,
  removeLine,
  setQuantity,
  type AddCatalogLineInput,
  type AddCustomLineInput,
} from "./service";

/**
 * The cart's server boundary.
 *
 * Every mutation the browser can ask for arrives here and nowhere else. These
 * are the functions that run with the cookie in hand, and they are deliberately
 * thin: validation, pricing and storage all live in the service, so this file
 * has no business rules to get wrong.
 *
 * What crosses the boundary is an intent — what to buy, how it is configured,
 * how many. Never a price, never a total, never a product name. Those are the
 * server's to determine, and a request that supplied them would be ignored.
 */

/** What a caller gets back: enough to re-render, never the whole cart. */
export type CartActionResult =
  | { ok: true; unitCount: number }
  | { ok: false; message: string };

function refresh(): void {
  // The cart page reads the cookie, so it has to be re-rendered after a change.
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

export async function addCatalogLineAction(
  input: AddCatalogLineInput,
): Promise<CartActionResult> {
  const result = await addCatalogLine(input);
  if (!result.ok) return result;

  refresh();
  return { ok: true, unitCount: result.cart.totals.unitCount };
}

export async function addCustomLineAction(
  input: AddCustomLineInput,
): Promise<CartActionResult> {
  const result = await addCustomLine(input);
  if (!result.ok) return result;

  refresh();
  return { ok: true, unitCount: result.cart.totals.unitCount };
}

export async function setQuantityAction(
  id: string,
  quantity: number,
): Promise<CartActionResult> {
  const result = await setQuantity(id, quantity);
  if (!result.ok) return result;

  refresh();
  return { ok: true, unitCount: result.cart.totals.unitCount };
}

export async function removeLineAction(id: string): Promise<CartActionResult> {
  const result = await removeLine(id);
  if (!result.ok) return result;

  refresh();
  return { ok: true, unitCount: result.cart.totals.unitCount };
}

export async function acceptPriceChangeAction(
  id: string,
): Promise<CartActionResult> {
  const result = await acceptPriceChange(id);
  if (!result.ok) return result;

  refresh();
  return { ok: true, unitCount: result.cart.totals.unitCount };
}
