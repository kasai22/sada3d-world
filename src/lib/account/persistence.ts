/**
 * Which store answers.
 *
 * The decision itself moved to `lib/db/persistence.ts` in Phase 15, so the
 * order domain could read it without importing the account domain — orders
 * knowing about accounts would be the wrong direction, and a second copy of the
 * rule would be worse. This module keeps the import path the Phase 13 account
 * code already uses.
 */
export {
  memoize,
  persistenceMode,
  warnMemoryPersistence,
  type PersistenceMode,
} from "@/lib/db/persistence";
