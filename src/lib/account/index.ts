export {
  MAX_ADDRESSES,
  createCustomerAddress,
  customerAddressRepository,
  deleteCustomerAddress,
  listCustomerAddresses,
  normaliseCustomerAddress,
  setDefaultCustomerAddress,
  toAddressView,
  updateCustomerAddress,
  validateCustomerAddress,
  withSingleDefault,
} from "./addresses";
export type { AddressMutation, CustomerAddressRepository } from "./addresses";

export {
  DEVELOPMENT_CUSTOMER_EMAIL,
  DEVELOPMENT_CUSTOMER_ID,
  DEVELOPMENT_CUSTOMER_NAME,
  developmentIdentityEnabled,
} from "./development";

export {
  customerDesignRepository,
  getCustomerDesign,
  listCustomerDesigns,
  toDesignView,
  unavailableDesignRepository,
} from "./designs";
export type {
  CustomerDesignRepository,
  DesignStorageAvailability,
} from "./designs";

export {
  developmentCustomerAuth,
  getCustomerContext,
  noCustomerAuth,
  requireCustomerContext,
  resolveCustomerAuthAdapter,
} from "./identity";
export type {
  CustomerAuthAdapter,
  CustomerGate,
  CustomerSession,
} from "./identity";

export {
  ACCOUNT_ROOT,
  ACCOUNT_SECTIONS,
  activeSection,
  isSectionActive,
} from "./navigation";
export type { AccountSection } from "./navigation";

export {
  ORDER_FILTERS,
  countCustomerOrders,
  getCustomerOrder,
  listActiveManufacturing,
  listCustomerOrders,
  matchesOrderFilter,
  ownsOrder,
  parseOrderFilter,
} from "./orders";
export type { CustomerOrderFilter, ListCustomerOrdersOptions } from "./orders";

export { RETURN_PARAM, SIGN_IN_PATH, safeReturnPath, signInHref } from "./routes";

export {
  MAX_SAVED_ITEMS,
  isProductSaved,
  listSavedProducts,
  removeSavedProduct,
  saveProduct,
  savedItemRepository,
} from "./saved";
export type { SavedItemMutation, SavedItemRepository } from "./saved";

export { getCustomerSettings } from "./settings";

export type {
  AuthenticatedCustomerContext,
  CollectionResult,
  CustomerAddress,
  CustomerAddressInput,
  CustomerAddressView,
  CustomerContext,
  CustomerDesign,
  CustomerDesignView,
  CustomerIdentity,
  CustomerManufacturingItem,
  CustomerOrderManufacturing,
  CustomerOrderSummary,
  CustomerProfile,
  CustomerSettings,
  SavedItem,
  SavedProductView,
} from "./types";
