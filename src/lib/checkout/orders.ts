import type { Order, OrderStatus } from "./types";

/**
 * Order storage.
 *
 * ── The current implementation ────────────────────────────────────────────
 *
 * PROVISIONAL. Orders live in the server process and do not survive a restart.
 * Postgres is not provisioned — Phase 14 brings Payload and the schema — and
 * this is the smallest store that lets checkout be built and exercised without
 * pretending a database exists.
 *
 * It is held on globalThis so that a development reload does not lose orders
 * placed a moment earlier. That is a convenience, not durability, and nothing
 * about it should be read as persistence.
 *
 * ── The relational model this maps onto ───────────────────────────────────
 *
 *   orders        id · reference (unique) · cart_id · user_id nullable
 *                 · status · currency · subtotal · shipping · tax · total
 *                 · contact_name · contact_email · contact_phone
 *                 · address_* · payment_provider · payment_session_id
 *                 · placed_at
 *   order_items   id · order_id · item_type · name · spec · quantity
 *                 · unit_price · line_total · quote_rules_version nullable
 *
 * Money is integer whole rupees, as everywhere else in the system.
 *
 * Creating an order and its items is one write here. In Postgres it is one
 * transaction: an order without its items is not a partial order, it is a
 * corrupt one, and there must be no state in which it exists.
 */

interface OrderStore {
  orders: Map<string, Order>;
  sequence: number;
}

const GLOBAL_KEY = "__sada3d_orders__";

function store(): OrderStore {
  const globals = globalThis as unknown as Record<string, OrderStore | undefined>;
  const existing = globals[GLOBAL_KEY];
  if (existing) return existing;

  const created: OrderStore = { orders: new Map(), sequence: 0 };
  globals[GLOBAL_KEY] = created;
  return created;
}

export interface OrderRepository {
  readonly name: string;
  /** Allocates the next customer-facing reference. */
  nextReference(): Promise<string>;
  create(order: Order): Promise<Order>;
  find(reference: string): Promise<Order | undefined>;
  setStatus(reference: string, status: OrderStatus): Promise<Order | undefined>;
}

export const memoryOrderRepository: OrderRepository = {
  name: "memory",

  async nextReference(): Promise<string> {
    const state = store();
    state.sequence += 1;
    // Sequential and generated, not decorative. Nothing here is a fixed string
    // chosen to look like a real order number.
    return `S3D-${String(state.sequence).padStart(6, "0")}`;
  },

  async create(order: Order): Promise<Order> {
    store().orders.set(order.reference, order);
    return order;
  },

  async find(reference: string): Promise<Order | undefined> {
    return store().orders.get(reference);
  },

  async setStatus(reference: string, status: OrderStatus): Promise<Order | undefined> {
    const state = store();
    const order = state.orders.get(reference);
    if (!order) return undefined;

    const next: Order = { ...order, status };
    state.orders.set(reference, next);
    return next;
  },
};

export const orderRepository: OrderRepository = memoryOrderRepository;
