"use server";

import { revalidatePath } from "next/cache";

import {
  MAX_ID_LENGTH,
  UNREADABLE,
  asRecord,
  isFiniteNumber,
  isOptionalText,
  isText,
} from "@/lib/api/action-input";

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
 * server's to determine.
 *
 * Arguments are read as `unknown` and projected onto the service's input
 * (`lib/api/action-input`): each field the right type and bounded, anything else
 * dropped. A price sent alongside a line is not ignored by the service — it
 * never reaches it.
 */

/** What a caller gets back: enough to re-render, never the whole cart. */
export type CartActionResult =
  | { ok: true; unitCount: number }
  | { ok: false; message: string };

const REFUSED: CartActionResult = { ok: false, message: UNREADABLE };

/** Material, colour, quality and finish values are short slugs. */
const MAX_OPTION_LENGTH = 64;
const MAX_NAME_LENGTH = 255;

function refresh(): void {
  // The cart page reads the cookie, so it has to be re-rendered after a change.
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

function readCatalogLine(value: unknown): AddCatalogLineInput | undefined {
  const raw = asRecord(value);
  if (
    !raw ||
    !isText(raw.productId, MAX_ID_LENGTH) ||
    !isText(raw.material, MAX_OPTION_LENGTH) ||
    !isText(raw.color, MAX_OPTION_LENGTH) ||
    !isOptionalText(raw.quality, MAX_OPTION_LENGTH) ||
    !isFiniteNumber(raw.quantity)
  ) {
    return undefined;
  }

  return {
    productId: raw.productId,
    material: raw.material,
    color: raw.color,
    ...(typeof raw.quality === "string" ? { quality: raw.quality } : {}),
    quantity: raw.quantity,
  };
}

function readCustomLine(value: unknown): AddCustomLineInput | undefined {
  const raw = asRecord(value);
  const model = asRecord(raw?.model);
  if (!raw || !model) return undefined;

  const triangles = model.triangles;
  if (
    !isText(model.modelId, MAX_ID_LENGTH) ||
    !isText(model.name, MAX_NAME_LENGTH) ||
    !isText(model.extension, 16) ||
    !isFiniteNumber(model.sizeBytes) ||
    !isText(model.formatLabel, 32) ||
    !(triangles === undefined || triangles === null || isFiniteNumber(triangles)) ||
    !isText(raw.material, MAX_OPTION_LENGTH) ||
    !isText(raw.quality, MAX_OPTION_LENGTH) ||
    !isText(raw.finish, MAX_OPTION_LENGTH) ||
    !isFiniteNumber(raw.quantity)
  ) {
    return undefined;
  }

  return {
    model: {
      modelId: model.modelId,
      name: model.name,
      extension: model.extension,
      sizeBytes: model.sizeBytes,
      formatLabel: model.formatLabel,
      ...(isFiniteNumber(triangles) ? { triangles } : {}),
    },
    material: raw.material,
    quality: raw.quality,
    finish: raw.finish,
    quantity: raw.quantity,
  };
}

export async function addCatalogLineAction(input: unknown): Promise<CartActionResult> {
  const line = readCatalogLine(input);
  if (!line) return REFUSED;

  const result = await addCatalogLine(line);
  if (!result.ok) return result;

  refresh();
  return { ok: true, unitCount: result.cart.totals.unitCount };
}

export async function addCustomLineAction(input: unknown): Promise<CartActionResult> {
  const line = readCustomLine(input);
  if (!line) return REFUSED;

  const result = await addCustomLine(line);
  if (!result.ok) return result;

  refresh();
  return { ok: true, unitCount: result.cart.totals.unitCount };
}

export async function setQuantityAction(
  id: unknown,
  quantity: unknown,
): Promise<CartActionResult> {
  if (!isText(id, MAX_ID_LENGTH) || !isFiniteNumber(quantity)) return REFUSED;

  const result = await setQuantity(id, quantity);
  if (!result.ok) return result;

  refresh();
  return { ok: true, unitCount: result.cart.totals.unitCount };
}

export async function removeLineAction(id: unknown): Promise<CartActionResult> {
  if (!isText(id, MAX_ID_LENGTH)) return REFUSED;

  const result = await removeLine(id);
  if (!result.ok) return result;

  refresh();
  return { ok: true, unitCount: result.cart.totals.unitCount };
}

export async function acceptPriceChangeAction(id: unknown): Promise<CartActionResult> {
  if (!isText(id, MAX_ID_LENGTH)) return REFUSED;

  const result = await acceptPriceChange(id);
  if (!result.ok) return result;

  refresh();
  return { ok: true, unitCount: result.cart.totals.unitCount };
}
