"use server";

import { revalidatePath } from "next/cache";

import { requireCustomerContext } from "@/lib/account/identity";
import { removeSavedProduct, saveProduct } from "@/lib/account/saved";

/**
 * Saved-item actions.
 *
 * Each one resolves the customer on the server, from the auth adapter, before
 * it does anything. The browser sends a product id and nothing else — it does
 * not, and cannot, say whose list to change. That is the whole of the
 * authorization model and it is why these are three-line functions.
 *
 * A signed-out caller is refused. Today that is every caller in production,
 * because there is no authentication yet.
 */

export type SavedItemActionResult = { ok: true } | { ok: false; message: string };

const SIGNED_OUT: SavedItemActionResult = {
  ok: false,
  message: "Sign in to change your saved parts.",
};

export async function saveItemAction(
  productId: string,
): Promise<SavedItemActionResult> {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await saveProduct(gate.context.identity, productId);
  if (!result.ok) return result;

  revalidatePath("/account/saved");
  return { ok: true };
}

export async function removeSavedItemAction(
  productId: string,
): Promise<SavedItemActionResult> {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await removeSavedProduct(gate.context.identity, productId);
  if (!result.ok) return result;

  revalidatePath("/account/saved");
  return { ok: true };
}
