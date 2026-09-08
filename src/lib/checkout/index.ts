export { checkoutIdempotencyKey, idempotencyStore } from "./idempotency";
export { orderRepository } from "./orders";
export type { OrderRepository } from "./orders";
export { checkDestination, isSupportedCountry, shippingPolicy, taxPolicy } from "./policies";
export { findOrder, placeOrder, reviewCheckout } from "./service";
export {
  normaliseAddress,
  normaliseContact,
  validateAddress,
  validateCheckoutInput,
  validateContact,
} from "./validation";
export {
  EMPTY_ADDRESS,
  EMPTY_CONTACT,
  INDIA_STATES,
  SUPPORTED_COUNTRIES,
} from "./types";
export type {
  CheckoutInput,
  CheckoutResult,
  Contact,
  FieldError,
  Order,
  OrderLine,
  OrderStatus,
  ShippingAddress,
} from "./types";
