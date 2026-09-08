import {
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  type Cart,
  type CartLine,
  type CatalogCartLine,
  type CustomCartLine,
} from "./types";

/**
 * Line identity and merging.
 *
 * Pure. No storage, no catalog, no React.
 *
 * Identity is what decides whether adding something increases a quantity or
 * starts a new line. It is derived from what the part *is*, so the same key
 * always means the same thing to make, and two different things never collide.
 */

/** Lowercased and punctuation-free, so a key is stable and comparable. */
function part(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

/**
 * A catalog line is identified by the product and its configuration.
 *
 * PLA/black and PETG/black are different parts to make, so they are different
 * lines however similar they look on the page.
 */
export function catalogLineKey(line: {
  productId: string;
  configuration: { material: string; color: string; quality?: string };
}): string {
  return [
    "catalog",
    part(line.productId),
    part(line.configuration.material),
    part(line.configuration.color),
    part(line.configuration.quality) || "default",
  ].join(":");
}

/**
 * A custom line is identified by the model and the whole configuration.
 *
 * Every field participates. Two custom lines merge only when they are the same
 * model made the same way — which is one job done twice, not two jobs. They are
 * never merged because they happen to share a material: a manufacturing job is
 * defined by all of its inputs, and treating a partial match as identity would
 * silently combine two different parts.
 *
 * In practice each upload gets its own model id, so merging is rare by
 * construction.
 */
export function customLineKey(line: {
  model: { modelId: string };
  configuration: { material: string; quality: string; finish: string };
}): string {
  return [
    "custom",
    part(line.model.modelId),
    part(line.configuration.material),
    part(line.configuration.quality),
    part(line.configuration.finish),
  ].join(":");
}

export function lineKey(line: CartLine): string {
  return line.type === "catalog" ? catalogLineKey(line) : customLineKey(line);
}

/** Quantity clamped into the range a line is allowed to hold. */
export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(Math.max(Math.trunc(quantity), 1), MAX_LINE_QUANTITY);
}

/**
 * Adds a line, merging into an existing one with the same identity.
 *
 * Order is preserved: a merge updates the line where it already sits rather
 * than moving it to the end, so the cart does not rearrange itself under the
 * customer.
 */
export function addLine(lines: readonly CartLine[], incoming: CartLine): CartLine[] {
  const key = lineKey(incoming);
  const index = lines.findIndex((line) => lineKey(line) === key);

  if (index === -1) {
    if (lines.length >= MAX_CART_LINES) return [...lines];
    return [...lines, { ...incoming, quantity: clampQuantity(incoming.quantity) }];
  }

  const existing = lines[index];
  if (!existing) return [...lines];

  const merged = {
    ...existing,
    quantity: clampQuantity(existing.quantity + incoming.quantity),
  } as CartLine;

  const next = [...lines];
  next[index] = merged;
  return next;
}

export function removeLine(lines: readonly CartLine[], id: string): CartLine[] {
  return lines.filter((line) => line.id !== id);
}

export function setLineQuantity(
  lines: readonly CartLine[],
  id: string,
  quantity: number,
): CartLine[] {
  if (quantity < 1) return removeLine(lines, id);

  return lines.map((line) =>
    line.id === id ? ({ ...line, quantity: clampQuantity(quantity) } as CartLine) : line,
  );
}

/**
 * Merges a guest cart into an account cart.
 *
 * Defined now so the behaviour is a decision rather than an accident when
 * authentication arrives in Phase 17. The account cart is the base; guest lines
 * are added through the same identity rule that governs everything else, so
 * matching configurations combine their quantities and anything else becomes
 * its own line. Nothing is dropped silently, and nothing is merged on a partial
 * match.
 */
export function mergeCarts(account: Cart, guest: Cart): Cart {
  let lines: CartLine[] = [...account.lines];

  for (const line of guest.lines) {
    lines = addLine(lines, line);
  }

  return {
    id: account.id,
    lines,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * A stable fingerprint of what the cart is asking for.
 *
 * Identity, configuration and quantity — not price. Checkout derives its
 * idempotency key from this, so submitting the same cart twice is recognised as
 * the same request while changing anything about it is not.
 */
export function cartFingerprint(cart: Cart): string {
  return cart.lines
    .map((line) => `${lineKey(line)}x${line.quantity}`)
    .sort()
    .join("|");
}

/** Narrowing helpers, so consumers stop reaching for `line.type ===`. */
export function isCatalogLine(line: CartLine): line is CatalogCartLine {
  return line.type === "catalog";
}

export function isCustomLine(line: CartLine): line is CustomCartLine {
  return line.type === "custom";
}
