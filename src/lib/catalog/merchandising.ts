/**
 * Merchandising rules (Stage 20). Dependency-free: shared by the Payload
 * collection and the storefront validation.
 *
 * Featured and Recommended are editorial choices an administrator makes. A
 * sales ranking ("Best seller", "Most popular", "#1") is a claim about order
 * data, and none exists — so no label, badge or copy may state one. If a ranking
 * is ever shown, it is derived from orders, never typed.
 */

export const SALES_CLAIM = /best[\s-]*sell|top[\s-]*sell|most[\s-]*popular|#\s*1\b|number[\s-]*one\b|\bbestseller/i;
