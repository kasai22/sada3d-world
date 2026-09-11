/**
 * Domain errors.
 *
 * One vocabulary for "what went wrong", shared by the services and mapped to
 * HTTP once, at the API boundary. Two things this is for:
 *
 *   · a service can say *which* kind of failure happened without knowing it is
 *     being called over HTTP. The same service answers a server action and a
 *     route handler, and neither should teach it about status codes.
 *
 *   · the message a customer sees and the detail an operator needs are
 *     different strings. `message` is written for a customer and is safe to
 *     render; anything else stays server-side.
 *
 * Not an excuse to turn every failure into "Something went wrong". A caller
 * that cannot tell a validation failure from an infrastructure outage cannot
 * retry correctly, and a customer told the wrong one is told a lie.
 */

export type DomainErrorKind =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid_state_transition"
  | "idempotency_conflict"
  | "model_parse"
  | "model_analysis"
  | "manufacturability"
  | "upload_rejected"
  | "payload_too_large"
  | "rate_limited"
  | "infrastructure";

export interface FieldIssue {
  /** Dotted path, e.g. "configuration.material". */
  field: string;
  message: string;
}

export class DomainError extends Error {
  readonly kind: DomainErrorKind;
  /** Field-addressed detail, where the failure is about a request's shape. */
  readonly issues: readonly FieldIssue[];

  constructor(
    kind: DomainErrorKind,
    message: string,
    issues: readonly FieldIssue[] = [],
  ) {
    super(message);
    this.name = new.target.name;
    this.kind = kind;
    this.issues = issues;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, issues: readonly FieldIssue[] = []) {
    super("validation", message, issues);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Sign in to continue.") {
    super("unauthorized", message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have access to this.") {
    super("forbidden", message);
  }
}

/**
 * Something was not found, **or** was not yours.
 *
 * Deliberately one error for both. Distinguishing them over HTTP is what turns
 * an order URL into a way of discovering which references exist — the Phase 12
 * rule, carried into the API.
 */
export class NotFoundError extends DomainError {
  constructor(message = "That could not be found.") {
    super("not_found", message);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super("conflict", message);
  }
}

/** The state machine refused. The reason comes from the machine, not from here. */
export class InvalidStateTransitionError extends DomainError {
  constructor(message: string) {
    super("invalid_state_transition", message);
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(message = "This request is already being processed.") {
    super("idempotency_conflict", message);
  }
}

export class ModelParseError extends DomainError {
  constructor(message: string) {
    super("model_parse", message);
  }
}

export class ModelAnalysisError extends DomainError {
  constructor(message: string) {
    super("model_analysis", message);
  }
}

/**
 * A model beyond what analysis will attempt: too many triangles, vertices,
 * objects or placements. Refused before the work, never answered with a partial
 * measurement.
 */
export class ModelTooComplexError extends DomainError {
  constructor(message: string) {
    super("model_analysis", message);
  }
}

export class ManufacturabilityError extends DomainError {
  constructor(message: string) {
    super("manufacturability", message);
  }
}

/**
 * A stored upload that verification refused.
 *
 * `reason` is a stable code — `checksum_mismatch`, `size_mismatch`,
 * `format_invalid`, `model_unreadable` — for logs and for a client that wants
 * to branch on it. `message` says what was wrong in the customer's terms.
 * Repeating the request repeats the same answer: the verdict is recorded.
 */
export class UploadRejectedError extends DomainError {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super("upload_rejected", message);
    this.reason = reason;
  }
}

/** A request body larger than the route accepts. Refused before it is buffered. */
export class PayloadTooLargeError extends DomainError {
  constructor(message = "This request is too large.") {
    super("payload_too_large", message);
  }
}

/**
 * Too many requests of this kind, from this caller, in this window.
 *
 * Carries when to try again, so the response can say so in `Retry-After`
 * rather than leaving a client to guess and hammer.
 */
export class RateLimitedError extends DomainError {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super("rate_limited", message);
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

/** A dependency was unreachable. Never the customer's fault and never their detail. */
export class InfrastructureError extends DomainError {
  constructor(message = "This is temporarily unavailable. Try again shortly.") {
    super("infrastructure", message);
  }
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

const STATUS: Record<DomainErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  idempotency_conflict: 409,
  invalid_state_transition: 409,
  /*
   * 422, not 400. The request was well-formed and was understood; the model or
   * the manufacturing input it described cannot be worked with. A client that
   * retries a 400 unchanged is wrong, and one that retries these is equally
   * wrong — but the reason it must show the customer is different.
   */
  model_parse: 422,
  model_analysis: 422,
  manufacturability: 422,
  upload_rejected: 422,
  payload_too_large: 413,
  rate_limited: 429,
  infrastructure: 503,
};

export function statusForError(error: unknown): number {
  return error instanceof DomainError ? STATUS[error.kind] : 500;
}

/**
 * The body of an error response.
 *
 * `code` is stable and machine-readable. `message` is written for a person and
 * is safe to show. There is no stack, no cause, no SQL and no internal
 * identifier — an unexpected failure says only that it was unexpected.
 */
export interface ErrorBody {
  error: {
    code: DomainErrorKind | "internal";
    message: string;
    issues?: readonly FieldIssue[];
  };
}

export function errorBody(error: unknown): ErrorBody {
  if (error instanceof DomainError) {
    return {
      error: {
        code: error.kind,
        message: error.message,
        ...(error.issues.length > 0 ? { issues: error.issues } : {}),
      },
    };
  }

  return {
    error: {
      code: "internal",
      message: "Something went wrong on our side. Try again shortly.",
    },
  };
}
