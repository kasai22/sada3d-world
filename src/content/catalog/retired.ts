/**
 * Identifiers the content reset retired.
 *
 * ── Why they are recorded, not just deleted ──────────────────────────────
 *
 * A cart line and a saved item hold a product id and nothing else. Guest carts
 * live in browsers the reset cannot reach, so an old "p-001" can arrive at the
 * cart service at any time after this change. Today it resolves to nothing and
 * the customer is told the part is no longer available, which is correct.
 *
 * If a future product were given one of these ids, that same stale line would
 * silently resolve to a *different* part at a different price. So reuse is
 * refused by `validateCatalog`, permanently. The same applies to slugs, which
 * are half of every URL that may still be bookmarked or indexed.
 */

/** p-001 … p-036 from the pre-reset local catalog, plus the Payload test record. */
export const RETIRED_PRODUCT_IDS: ReadonlySet<string> = new Set([
  ...Array.from({ length: 36 }, (_, index) => `p-${String(index + 1).padStart(3, "0")}`),
  "SKU001",
]);

export const RETIRED_SLUGS: ReadonlySet<string> = new Set([
  "precision-gear", "planetary-carrier", "helical-pinion", "torque-wrench-handle",
  "hex-key-organiser", "thrust-bearing-cage", "linear-bearing-block", "dash-vent-clip",
  "console-cup-insert", "mirror-base-cover", "number-plate-frame", "coolant-hose-clamp",
  "sensor-loom-guide", "drill-alignment-jig", "weld-positioning-jig", "inspection-fixture",
  "vacuum-work-holder", "press-tool-insert", "forming-die-blank", "cable-bracket",
  "angle-mount-bracket", "sensor-enclosure", "manifold-housing", "hex-drive-coupler",
  "flexible-shaft-coupler", "captive-nut-plate", "knurled-thumb-screw", "faceted-planter",
  "louvre-wall-light", "desk-cable-tray", "modular-drawer-divider", "massing-model-block",
  "louvre-facade-panel", "ergonomic-grip-blank", "tolerance-test-block",
  "custom-part-from-model", "payload_test", "payload_test2",
]);
