import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { eq } from "drizzle-orm";

import type { CartTotals, CatalogCartLine, PricedCart } from "@/lib/cart/types";
import { catalogLineKey } from "@/lib/cart/identity";
import { priceLine } from "@/lib/cart/validation";
import { launchReadyProduct } from "@/lib/catalog/fixtures.testing";
import { catalogSourceFrom, setCatalogSource } from "@/lib/catalog/source";
import type { Product } from "@/lib/catalog/types";
import { toOrderItems } from "@/lib/checkout/service";
import { getDatabase, setDatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import { orderItems } from "@/lib/db/schema";

import { aggregateOrderStatus } from "./aggregate";
import { orderRepository } from "./repository";
import type { Order, OrderItem } from "./types";

/**
 * Stage 22: every new catalog order line keeps what the catalog said the
 * product was — id, SKU, category and names — at the moment of ordering, and
 * nothing later rewrites it. Lines without those dimensions (custom prints,
 * and every line placed before Stage 22) stay without them.
 */

const PRODUCT: Product = {
  ...launchReadyProduct,
  id: "p-150",
  sku: "R3D-GEAR-24T",
  category: "gears",
  categoryLabel: "Gears",
  browseCategory: "mechanical",
  browseCategoryLabel: "Mechanical",
};

const TOTALS: CartTotals = {
  currency: "INR",
  subtotal: 0,
  shipping: { known: false, reason: "later" },
  tax: { known: false, reason: "later" },
  total: 0,
  excluded: [],
  unitCount: 0,
  provisional: false,
};

function catalogLine(quantity = 2): CatalogCartLine {
  const configuration = { material: PRODUCT.material, color: PRODUCT.color };
  return {
    type: "catalog",
    id: catalogLineKey({ productId: PRODUCT.id, configuration }),
    productId: PRODUCT.id,
    quantity,
    configuration,
    priceAtAdd: PRODUCT.price,
    addedAt: "2026-09-16T00:00:00.000Z",
  };
}

let harness: TestDatabase;

before(async () => {
  harness = await createTestDatabase();
  setDatabaseProvider(harness);
  setCatalogSource(catalogSourceFrom("sales-dimensions", async () => [PRODUCT]));
});

after(async () => {
  setCatalogSource(null);
  setDatabaseProvider(null);
  await harness.destroy();
});

async function place(items: OrderItem[], placedAt: string): Promise<Order> {
  const payment = { status: "paid" as const, provider: "razorpay" };
  const reference = await orderRepository.nextReference();
  const order: Order = {
    reference,
    cartId: `cart-${reference}`,
    status: aggregateOrderStatus({ items, payment }),
    payment,
    items,
    shipments: [],
    totals: { ...TOTALS, subtotal: 900, total: 900 },
    contact: { name: "Buyer", email: "buyer@example.com", phone: "9876543210" },
    address: { line1: "1 Road", city: "Pune", state: "MH", postalCode: "411001", country: "IN" },
    placedAt,
    updatedAt: placedAt,
    provisional: false,
  };
  await orderRepository.createOrder(order);
  return order;
}

test("pricing a catalog line resolves the product's identity from the catalog, not from the cart", async () => {
  const priced = await priceLine(catalogLine());
  assert.deepEqual(priced.product, {
    id: "p-150",
    sku: "R3D-GEAR-24T",
    categoryId: "gears",
    categoryName: "Gears",
    browseCategoryId: "mechanical",
    browseCategoryName: "Mechanical",
  });
  assert.equal(priced.unitPrice, PRODUCT.price);
});

test("a new order line snapshots product id, SKU, category, names, price and quantity", async () => {
  const placedAt = "2026-09-16T06:30:00.000Z";
  const priced: PricedCart = {
    id: "cart_dimensions",
    lines: [await priceLine(catalogLine(3))],
    totals: TOTALS,
    issues: [],
    checkoutReady: true,
  };
  const reference = await orderRepository.nextReference();
  const [line] = toOrderItems(priced, reference, new Map(), placedAt);
  assert.ok(line);
  assert.equal(line.name, PRODUCT.name, "the product-name snapshot");
  assert.equal(line.quantity, 3);
  assert.equal(line.unitPrice, PRODUCT.price);
  assert.equal(line.lineTotal, PRODUCT.price * 3);
  assert.deepEqual(line.catalog, {
    productId: "p-150",
    sku: "R3D-GEAR-24T",
    categoryId: "gears",
    categoryName: "Gears",
    browseCategoryId: "mechanical",
    browseCategoryName: "Mechanical",
    recordedAt: placedAt,
  });

  const order = await place([line], placedAt);
  const stored = await orderRepository.findOrder(order.reference);
  assert.deepEqual(stored?.items[0]?.catalog, line.catalog, "persisted and read back");
});

test("a product without a SKU is snapshotted without one — nothing is generated", async () => {
  setCatalogSource(catalogSourceFrom("no-sku", async () => [{ ...PRODUCT, sku: undefined }]));
  try {
    const priced = await priceLine(catalogLine());
    assert.equal(priced.product?.sku, undefined);
    assert.equal("sku" in (priced.product ?? {}), false);
  } finally {
    setCatalogSource(catalogSourceFrom("sales-dimensions", async () => [PRODUCT]));
  }
});

test("a custom print carries no catalog dimensions", async () => {
  const priced: PricedCart = {
    id: "cart_custom",
    lines: [
      {
        line: {
          type: "custom",
          id: "custom-1",
          quantity: 1,
          model: { modelId: "mdl_1", name: "part.stl", extension: ".stl", sizeBytes: 10, formatLabel: "STL" },
          configuration: { material: "pla", quality: "standard", finish: "standard" },
          quote: { rulesVersion: "demo-2026-01", unitPrice: 400 },
          addedAt: "2026-09-16T00:00:00.000Z",
        } as never,
        name: "part.stl",
        spec: "PLA / STANDARD",
        unitPrice: 400,
        lineTotal: 400,
        issues: [],
      },
    ],
    totals: TOTALS,
    issues: [],
    checkoutReady: true,
  };
  const [line] = toOrderItems(priced, "S3D-CUSTOM", new Map());
  assert.equal(line?.catalog, undefined);
});

test("a later save never rewrites the snapshot, and historical lines are never back-filled", async () => {
  const placedAt = "2026-09-16T07:00:00.000Z";
  const priced: PricedCart = { id: "cart_rewrite", lines: [await priceLine(catalogLine())], totals: TOTALS, issues: [], checkoutReady: true };
  const reference = await orderRepository.nextReference();
  const [line] = toOrderItems(priced, reference, new Map(), placedAt);
  const historical: OrderItem = {
    id: `${reference}-02`,
    type: "catalog",
    name: "Old part",
    spec: "PLA",
    quantity: 1,
    unitPrice: 120,
    lineTotal: 120,
    fulfillmentStatus: "pending",
  };
  const order = await place([line!, historical], placedAt);

  // A fulfilment update carries the whole item back — with a different catalog view.
  const renamed: Order = {
    ...order,
    items: order.items.map((item) =>
      item.catalog
        ? {
            ...item,
            fulfillmentStatus: "ready" as const,
            catalog: { ...item.catalog, categoryId: "spacers", categoryName: "Spacers", productId: "p-999" },
          }
        : { ...item, catalog: { productId: "p-invented", categoryId: "gears", categoryName: "Gears", browseCategoryId: "mechanical", browseCategoryName: "Mechanical", recordedAt: placedAt } },
    ),
  };
  await orderRepository.saveOrder(renamed);

  const db = await getDatabase();
  const rows = await db.select().from(orderItems).where(eq(orderItems.orderReference, order.reference));
  const current = rows.find((row) => row.id === line!.id)!;
  assert.equal(current.fulfillmentStatus, "ready", "the update itself landed");
  assert.equal(current.categoryId, "gears", "the category snapshot did not move");
  assert.equal(current.productId, "p-150");
  assert.equal(current.unitPrice, PRODUCT.price, "the historical price is preserved");

  const old = rows.find((row) => row.id === historical.id)!;
  assert.equal(old.productId, null, "no product id is invented for a line that did not record one");
  assert.equal(old.categoryId, null);
  assert.equal(old.dimensionsRecordedAt, null);
});
