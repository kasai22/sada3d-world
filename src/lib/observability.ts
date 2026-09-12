/**
 * Structured logging.
 *
 * A seam, not a logging framework. It exists so the events worth watching —
 * an order created, a state transition, a model analysed — are emitted in one
 * shape from one place, and so that connecting a real sink later is a change to
 * this file rather than to thirty call sites.
 *
 * ── What must never be logged ────────────────────────────────────────────
 *
 * Enforced by construction rather than by discipline: `LogFields` accepts only
 * strings, numbers and booleans, so an object cannot be spread into a log line
 * and carry something unexpected with it. The fields below are the ones each
 * event is allowed to name.
 *
 *   never   uploaded model bytes, file contents, secrets, auth tokens,
 *           payment session identifiers, private storage keys, signed URLs
 *           (their query string is a credential), storage access keys,
 *           customer filenames, names, emails, phone numbers or addresses
 *   fine    order references, job ids, model identities, durations, counts,
 *           formats, states, error kinds
 *
 * The rule of thumb: a log line should let an operator find the record, not
 * read it. `S3D-000184` is an identifier; the address it ships to is not.
 *
 * ── Customer identifiers ─────────────────────────────────────────────────
 *
 * A customer id is an opaque identifier and is loggable; anything that would
 * identify the person behind it is not. That distinction is why there is a
 * `customerId` field here and no `email` field anywhere.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Scalars only. An object cannot be smuggled in as a field value. */
export type LogFields = Record<string, string | number | boolean | undefined>;

export interface LogRecord {
  level: LogLevel;
  /** Dotted and stable, e.g. "order.created". Grep-able across deployments. */
  event: string;
  fields: LogFields;
}

export interface LogSink {
  readonly name: string;
  write(record: LogRecord): void;
}

/**
 * The default sink: one JSON line per event on the console.
 *
 * Structured rather than prose, because the destination for these is a log
 * aggregator and a sentence is not queryable. Vercel, CloudWatch and every
 * hosted collector parse JSON on stdout without configuration, which is why
 * this is enough until there is a reason for more.
 */
export const consoleSink: LogSink = {
  name: "console",

  write(record: LogRecord): void {
    const line = JSON.stringify({
      event: record.event,
      ...Object.fromEntries(
        Object.entries(record.fields).filter(([, value]) => value !== undefined),
      ),
    });

    if (record.level === "error") console.error(line);
    else if (record.level === "warn") console.warn(line);
    else console.log(line);
  },
};

let sink: LogSink = consoleSink;

/** Replaces the sink. For tests, and for a real collector later. */
export function setLogSink(next: LogSink | null): void {
  sink = next ?? consoleSink;
}

function emit(level: LogLevel, event: string, fields: LogFields): void {
  try {
    sink.write({ level, event, fields });
  } catch {
    // Logging must never be the reason a request fails.
  }
}

export const log = {
  debug: (event: string, fields: LogFields = {}) => emit("debug", event, fields),
  info: (event: string, fields: LogFields = {}) => emit("info", event, fields),
  warn: (event: string, fields: LogFields = {}) => emit("warn", event, fields),
  error: (event: string, fields: LogFields = {}) => emit("error", event, fields),
};

/* ------------------------------------------------------------------ *
 * The events this system emits
 * ------------------------------------------------------------------ */

/**
 * Named rather than passed as free strings, so the set is enumerable and a
 * typo becomes a compile error instead of a log line nobody ever finds.
 */
export const EVENTS = {
  orderCreated: "order.created",
  orderStateTransition: "order.transition",
  orderEventPersisted: "order.event.persisted",
  orderEventRefused: "order.event.refused",
  quoteCalculated: "quote.calculated",
  modelAnalyzed: "model.analyzed",
  modelAnalysisFailed: "model.analysis.failed",

  /*
   * Stage 16 — durable design storage. Every one of these names a design id,
   * never a storage key: the id finds the row, and the row holds the key for
   * whoever is entitled to it.
   */
  designUploadIntentCreated: "design.upload.intent_created",
  designUploadFinalized: "design.upload.finalized",
  designObjectVerified: "design.object.verified",
  designObjectRejected: "design.object.rejected",
  designObjectMissing: "design.object.missing",
  designAnalysisStarted: "design.analysis.started",
  designAnalysisCompleted: "design.analysis.completed",
  designDownloadGranted: "design.download.granted",
  designDownloadDenied: "design.download.denied",
  designDeleted: "design.deleted",
  designObjectDeleteFailed: "design.object.delete_failed",
  storageCleanupRequired: "storage.cleanup.required",
  storageCleanupCompleted: "storage.cleanup.completed",
  storageUnavailable: "storage.unavailable",
  storageNotConfigured: "storage.not_configured",
  requestRateLimited: "api.rate_limited",
  requestCrossOriginRefused: "api.cross_origin_refused",
  /*
   * Stage 18 — request hardening. `requestFailed` is the one line an unexpected
   * or dependency failure produces: error name, code and classification, never
   * the error's message or its SQL.
   */
  requestFailed: "api.request.failed",
  requestTooLarge: "api.request.too_large",
  rateLimiterSaturated: "api.rate_limiter.saturated",
  readinessFailed: "app.readiness.failed",
  analysisCacheRejected: "model.analysis.cache_rejected",
  checkoutFailed: "checkout.failed",

  /*
   * Stage 17 — authentication. Customer ids and provider error codes only:
   * never an email, a password, a token, a code or a provider message.
   */
  authSignedIn: "auth.signed_in",
  authSignInRefused: "auth.sign_in.refused",
  authSignedUp: "auth.signed_up",
  authSignedOut: "auth.signed_out",
  authPasswordResetRequested: "auth.password_reset.requested",
  authPasswordUpdated: "auth.password.updated",
  authLinkConfirmed: "auth.link.confirmed",
  authLinkRejected: "auth.link.rejected",
  authSessionExpired: "auth.session.expired",
  authProviderUnavailable: "auth.provider.unavailable",
  authNotConfigured: "auth.not_configured",
  cartMerged: "cart.merged",

  /*
   * Operations console. The operator's Payload user id, the action and the
   * record identifiers — never a customer's name, email or address, and never
   * the operator's free-text note.
   */
  opsActionApplied: "ops.action.applied",
  opsActionRefused: "ops.action.refused",
} as const;
