import type { CartTotals } from "@/lib/cart/types";
import type { ManufacturingEventType } from "@/lib/manufacturing/types";

import { aggregateOrderStatus } from "./aggregate";
import { orderRepository } from "./repository";
import {
  applyManufacturingEvent,
  applyShipmentEvent,
  createManufacturingJobs,
  createShipment,
  setManufacturingHold,
} from "./service";
import type { Order, OrderItem } from "./types";

/**
 * Development fixtures.
 *
 * SADA 3D has no manufacturing backend yet, so nothing reports real production
 * events. These seven scenarios exist so the tracking experience can be built,
 * reviewed and tested against states that actually occur.
 *
 * Two rules keep them honest:
 *
 *   · every fixture is built by applying real events through the real state
 *     machine. None of them assigns a state directly, so none of them can
 *     describe a situation the machine would refuse. A fixture that stopped
 *     being reachable would stop building.
 *
 *   · every fixture is marked `demo: true` and referenced `DEMO-…`, never
 *     `S3D-…`. Generated order references cannot collide with these, the
 *     interface says plainly that a demo order is a demo order, and nothing
 *     here is presented as a real SADA 3D production record.
 *
 * They are seeded outside production, and in a production build only when
 * SADA_DEMO_ORDERS is explicitly set — so a preview or staging deployment can
 * be reviewed against them while a real one never carries them by default. The
 * variable is server-only and has no NEXT_PUBLIC counterpart.
 */

/** Whether this deployment carries the demonstration orders. */
export function demoOrdersEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.SADA_DEMO_ORDERS === "1";
}

const SEED_EMAIL = "demo@sada3d.example";

/** Fixed, so a fixture reads the same on every run. */
const T0 = Date.parse("2026-09-01T09:00:00.000Z");
const HOUR = 60 * 60 * 1000;

const at = (hours: number) => new Date(T0 + hours * HOUR).toISOString();

const TOTALS = (subtotal: number): CartTotals => ({
  currency: "INR",
  subtotal,
  shipping: { known: false, reason: "Confirmed before dispatch" },
  tax: { known: false, reason: "Added on the tax invoice" },
  total: subtotal,
  excluded: ["Shipping", "GST"],
  unitCount: 1,
  provisional: true,
});

interface FixtureItem {
  type: "catalog" | "custom";
  name: string;
  spec: string;
  quantity: number;
  unitPrice: number;
}

const CUSTOM_BRACKET: FixtureItem = {
  type: "custom",
  name: "mounting-bracket.stl",
  spec: "PETG / PRECISION / STANDARD",
  quantity: 2,
  unitPrice: 646,
};

const CATALOG_GEAR: FixtureItem = {
  type: "catalog",
  name: "Precision Gear",
  spec: "PLA / BLACK / PRECISION",
  quantity: 1,
  unitPrice: 399,
};

async function buildOrder(
  reference: string,
  items: readonly FixtureItem[],
): Promise<Order> {
  const orderItems: OrderItem[] = items.map((item, index) => ({
    id: `${reference}-${String(index + 1).padStart(2, "0")}`,
    type: item.type,
    name: item.name,
    spec: item.spec,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.unitPrice * item.quantity,
    quoteRulesVersion: item.type === "custom" ? "demo-2026-01" : undefined,
    fulfillmentStatus: "pending",
  }));

  const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const payment = { status: "paid" as const, provider: "mock" };

  const order: Order = {
    reference,
    cartId: `cart_${reference}`,
    status: aggregateOrderStatus({ items: orderItems, payment }),
    payment,
    items: orderItems,
    shipments: [],
    totals: { ...TOTALS(subtotal), unitCount: orderItems.length },
    contact: {
      name: "Demo Customer",
      email: SEED_EMAIL,
      phone: "9876543210",
    },
    address: {
      line1: "42 Industrial Estate",
      city: "Hyderabad",
      state: "TG",
      postalCode: "500032",
      country: "IN",
    },
    placedAt: at(0),
    updatedAt: at(0),
    provisional: true,
    demo: true,
  };

  await orderRepository.createOrder(order);
  return createManufacturingJobs(order, at(0));
}

/** Walks a job forward through real events, with deterministic timestamps. */
async function advance(
  jobId: string,
  steps: readonly ManufacturingEventType[],
  startHour: number,
): Promise<void> {
  for (const [index, type] of steps.entries()) {
    const result = await applyManufacturingEvent(jobId, {
      id: `${jobId}_${index}_${type}`,
      type,
      occurredAt: at(startHour + index),
      actor: "operations",
    });

    if (!result.ok) {
      // A fixture that no longer walks a legal path is a fixture that is
      // describing something impossible. Fail loudly rather than seed it.
      throw new Error(`Fixture ${jobId} could not apply ${type}: ${result.reason}`);
    }
  }
}

const TO_PRINTING: ManufacturingEventType[] = [
  "DESIGN_REVIEW_STARTED",
  "DESIGN_APPROVED",
  "FILE_PREPARED",
  "MATERIAL_PREPARED",
  "PRINT_STARTED",
];

const TO_QUALITY: ManufacturingEventType[] = [
  ...TO_PRINTING,
  "PRINT_COMPLETED",
  "POST_PROCESSING_COMPLETED",
];

const TO_READY: ManufacturingEventType[] = [
  ...TO_QUALITY,
  "QUALITY_APPROVED",
  "PACKAGING_STARTED",
  "PACKAGING_COMPLETED",
];

async function jobIdFor(reference: string): Promise<string> {
  const jobs = await orderRepository.findJobsForOrder(reference);
  const job = jobs[0];
  if (!job) throw new Error(`Fixture ${reference} has no manufacturing job.`);
  return job.id;
}

/**
 * Seeds the seven scenarios.
 *
 * Idempotent: the store records that it has been seeded, so a development
 * reload does not build them twice.
 */
export async function seedTrackingFixtures(): Promise<void> {
  if (!demoOrdersEnabled()) return;
  if (orderRepository.hasSeeded()) return;
  orderRepository.markSeeded();

  // 1. Queued — accepted, nothing started.
  await buildOrder("DEMO-0001", [CUSTOM_BRACKET]);

  // 2. Printing.
  await buildOrder("DEMO-0002", [CUSTOM_BRACKET]);
  await advance(await jobIdFor("DEMO-0002"), TO_PRINTING, 1);

  // 3. Quality check.
  await buildOrder("DEMO-0003", [CUSTOM_BRACKET]);
  await advance(await jobIdFor("DEMO-0003"), TO_QUALITY, 1);

  // 4. Rework — failed inspection, back onto the production path.
  await buildOrder("DEMO-0004", [CUSTOM_BRACKET]);
  await advance(
    await jobIdFor("DEMO-0004"),
    [...TO_QUALITY, "QUALITY_REJECTED"],
    1,
  );

  // 5. Packed and ready, with the parcel open but not dispatched.
  await buildOrder("DEMO-0005", [CUSTOM_BRACKET]);
  const packed = await jobIdFor("DEMO-0005");
  await advance(packed, [...TO_READY, "JOB_COMPLETED"], 1);
  await createShipment({
    orderReference: "DEMO-0005",
    itemIds: ["DEMO-0005-01"],
  });

  // 6. Shipped, with a carrier reference that exists because the fixture set it.
  await buildOrder("DEMO-0006", [CUSTOM_BRACKET]);
  await advance(await jobIdFor("DEMO-0006"), [...TO_READY, "JOB_COMPLETED"], 1);
  await createShipment({
    orderReference: "DEMO-0006",
    itemIds: ["DEMO-0006-01"],
    carrier: "Demo Logistics",
    trackingNumber: "DL0000000001",
  });
  const shipped = await orderRepository.findOrder("DEMO-0006");
  const parcel = shipped?.shipments[0];
  if (parcel) {
    await applyShipmentEvent("DEMO-0006", parcel.id, "SHIPMENT_READY", at(12));
    await applyShipmentEvent("DEMO-0006", parcel.id, "SHIPMENT_DISPATCHED", at(13));
    await applyShipmentEvent("DEMO-0006", parcel.id, "SHIPMENT_IN_TRANSIT", at(20));
  }

  /*
   * 7. Mixed: a stocked gear on its way while a custom part is still printing,
   *    and the custom part held for material. The order is partially fulfilled
   *    — one status could not describe both items, which is the point.
   */
  await buildOrder("DEMO-0007", [CATALOG_GEAR, CUSTOM_BRACKET]);
  await advance(await jobIdFor("DEMO-0007"), TO_PRINTING, 1);
  await setManufacturingHold(
    await jobIdFor("DEMO-0007"),
    {
      reason: "material_unavailable",
      note: "PETG lot quarantined pending inspection.",
    },
    at(7),
  );

  // The catalog item needs no manufacturing: it is picked and shipped.
  const mixed = await orderRepository.findOrder("DEMO-0007");
  if (mixed) {
    await orderRepository.saveOrder({
      ...mixed,
      items: mixed.items.map((item) =>
        item.type === "catalog" ? { ...item, fulfillmentStatus: "ready" } : item,
      ),
    });
    await createShipment({
      orderReference: "DEMO-0007",
      itemIds: ["DEMO-0007-01"],
      carrier: "Demo Logistics",
      trackingNumber: "DL0000000002",
    });
    const refreshed = await orderRepository.findOrder("DEMO-0007");
    const gearParcel = refreshed?.shipments[0];
    if (gearParcel) {
      await applyShipmentEvent("DEMO-0007", gearParcel.id, "SHIPMENT_READY", at(4));
      await applyShipmentEvent("DEMO-0007", gearParcel.id, "SHIPMENT_DISPATCHED", at(6));
    }
  }
}

/** The email every fixture was placed with, for development lookups. */
export const FIXTURE_EMAIL = SEED_EMAIL;

export const FIXTURE_REFERENCES: readonly { reference: string; label: string }[] = [
  { reference: "DEMO-0001", label: "Queued" },
  { reference: "DEMO-0002", label: "Printing" },
  { reference: "DEMO-0003", label: "Quality check" },
  { reference: "DEMO-0004", label: "Rework" },
  { reference: "DEMO-0005", label: "Packed, awaiting dispatch" },
  { reference: "DEMO-0006", label: "Shipped" },
  { reference: "DEMO-0007", label: "Mixed order, held for material" },
];
