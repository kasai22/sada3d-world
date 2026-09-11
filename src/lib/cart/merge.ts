import { addLine, lineKey } from "./identity";
import { MAX_CART_LINES, type Cart, type CartLine } from "./types";

/**
 * Folding a guest cart into a signed-in customer's cart.
 *
 * Pure: no storage, no pricing, no identity. The repository decides *when* to
 * merge (at sign-in) and persists the result; `priceCart` decides what the
 * result costs and what is wrong with it, exactly as for any other cart.
 *
 * ── The rules ────────────────────────────────────────────────────────────
 *
 * Identity is `lineKey`, the same rule that decides whether adding a part to a
 * cart increases a quantity or starts a new line. The merge introduces no rule
 * of its own:
 *
 *   same catalog product, same configuration   one line, quantities summed,
 *                                              clamped to the per-line maximum
 *   same product, different configuration      separate lines
 *   same custom model, same configuration      one line, quantities summed —
 *                                              the stored quote no longer
 *                                              matches, so pricing flags it
 *                                              `quote_stale` and it must be
 *                                              reviewed before checkout
 *   different custom model or configuration    separate lines
 *
 * The account's lines come first and keep their order and their recorded
 * price and quote; guest lines follow in their own order.
 *
 * Nothing is trusted from either cart. Every price is re-read from the catalog
 * and every custom quote re-run when the merged cart is priced, and a custom
 * line whose file is only in a browser, or whose design is not this customer's,
 * is kept and flagged — never silently dropped, and never made orderable.
 *
 * ── Nothing disappears ───────────────────────────────────────────────────
 *
 * A merged cart is still capped at `MAX_CART_LINES`. Guest lines that would
 * exceed it are returned as `leftover` and stay in the guest cart, rather than
 * being discarded by a limit the customer never saw.
 *
 * ── Idempotent ───────────────────────────────────────────────────────────
 *
 * A guest cart id already merged is merged again as nothing, so running sign-in
 * twice — or a retried action — cannot double a quantity.
 */

export interface CartMergeResult {
  cart: Cart;
  /** Guest lines combined into an existing line or added as a new one. */
  merged: number;
  /** Guest lines that did not fit and stay in the guest cart. */
  leftover: readonly CartLine[];
  /** This guest cart had already been merged; nothing changed. */
  alreadyMerged: boolean;
}

export function mergeGuestCart(
  account: Cart,
  guest: Cart,
  mergedGuestCartIds: readonly string[],
): CartMergeResult {
  if (guest.lines.length === 0) {
    return { cart: account, merged: 0, leftover: [], alreadyMerged: false };
  }

  if (mergedGuestCartIds.includes(guest.id)) {
    return { cart: account, merged: 0, leftover: [], alreadyMerged: true };
  }

  let lines: CartLine[] = [...account.lines];
  const leftover: CartLine[] = [];
  let merged = 0;

  for (const line of guest.lines) {
    const key = lineKey(line);
    const combines = lines.some((existing) => lineKey(existing) === key);

    if (!combines && lines.length >= MAX_CART_LINES) {
      leftover.push(line);
      continue;
    }

    lines = addLine(lines, line);
    merged += 1;
  }

  return { cart: { ...account, lines }, merged, leftover, alreadyMerged: false };
}
