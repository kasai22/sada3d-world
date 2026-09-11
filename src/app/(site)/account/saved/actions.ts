"use server";

import { revalidatePath } from "next/cache";

import { requireCustomerContext } from "@/lib/account/identity";
import { removeSavedProduct, saveProduct } from "@/lib/account/saved";
import { MAX_ID_LENGTH, UNREADABLE, isText } from "@/lib/api/action-input";

/**
 * Saved-item actions.
 *
 * Each one resolves the customer on the server, from the auth adapter, before
 * it does anything. The browser sends a product id and nothing else — it does
 * not, and cannot, say whose list to change. That is the whole of the
 * authorization model and it is why these are short functions.
 *
 * The product id is read as `unknown` and must be bounded text before it is
 * looked up; the service then checks it is a real catalog part.
 */

export type SavedItemActionResult = { ok: true } | { ok: false; message: string };

const SIGNED_OUT: SavedItemActionResult = {
  ok: false,
  message: "Sign in to change your saved parts.",
};

const REFUSED: SavedItemActionResult = { ok: false, message: UNREADABLE };

export async function saveItemAction(productId: unknown): Promise<SavedItemActionResult> {
  if (!isText(productId, MAX_ID_LENGTH)) return REFUSED;

  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await saveProduct(gate.context.identity, productId);
  if (!result.ok) return result;

  revalidatePath("/account/saved");
  return { ok: true };
}

export async function removeSavedItemAction(productId: unknown): Promise<SavedItemActionResult> {
  if (!isText(productId, MAX_ID_LENGTH)) return REFUSED;

  const gate = await requireCustomerContext();
  if (!gate.authenticated) return SIGNED_OUT;

  const result = await removeSavedProduct(gate.context.identity, productId);
  if (!result.ok) return result;

  revalidatePath("/account/saved");
  return { ok: true };
}
