import { NextResponse } from "next/server";

import { DatabaseUnavailableError } from "@/lib/db/client";
import {
  DomainError,
  ForbiddenError,
  InfrastructureError,
  PayloadTooLargeError,
  RateLimitedError,
  ValidationError,
  errorBody,
  statusForError,
} from "@/lib/errors";
import { EVENTS, log } from "@/lib/observability";
import { StorageError } from "@/lib/storage/types";

/**
 * The HTTP boundary.
 *
 * Shape a response, turn an error into a status, and read a request body
 * safely. There is no business logic here and there must not be — a route
 * handler calls a service, and the service is what decides anything.
 *
 * ── What never reaches a client ──────────────────────────────────────────
 *
 * Stack traces, `cause` chains, SQL, driver messages, internal identifiers. An
 * unexpected failure produces one sentence; a failure of a dependency — the
 * database, storage — produces a 503 rather than a 500, because a client that
 * retries later is doing the right thing.
 *
 * ── What never reaches a log ─────────────────────────────────────────────
 *
 * The raw error. A Drizzle query error carries the SQL *and its parameters*,
 * which include customers' emails and addresses; a driver error can carry a
 * host. Only the error's name, its code and a classification are logged.
 */

export interface ApiMeta {
  /** Set on responses that must never be cached by a shared cache. */
  private?: boolean;
}

export function ok<T>(data: T, meta: ApiMeta = {}): NextResponse {
  return NextResponse.json(data, {
    status: 200,
    headers: headersFor(meta),
  });
}

export function created<T>(data: T, meta: ApiMeta = {}): NextResponse {
  return NextResponse.json(data, {
    status: 201,
    headers: headersFor(meta),
  });
}

function headersFor(meta: ApiMeta): Record<string, string> {
  return meta.private
    ? {
        /*
         * Customer data. `private` keeps it out of shared caches and `no-store`
         * keeps it off disk — an order sitting in a CDN is an order served to
         * the next person behind the same URL.
         */
        "Cache-Control": "private, no-store",
      }
    : {};
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/** Node and PostgreSQL codes that mean "the database could not be reached or answered". */
const CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
]);

/**
 * Whether an unexpected error is a dependency failing, and which.
 *
 * Follows `cause`, because Drizzle wraps the driver's error in its own. Depth is
 * bounded so a cyclic cause chain cannot loop.
 */
export function infrastructureCause(error: unknown, depth = 0): string | null {
  if (depth > 4 || typeof error !== "object" || error === null) return null;

  if (error instanceof StorageError) return `storage_${error.kind}`;
  if (error instanceof DatabaseUnavailableError) return "database_unavailable";

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") {
    // 08: connection exception · 57P0x: operator intervention / shutdown · 53: insufficient resources
    if (/^(08|57P0|53)/.test(code) || CONNECTION_CODES.has(code)) return `database_${code}`;
  }

  const message = error instanceof Error ? error.message : "";
  if (
    /timeout exceeded when trying to connect|Connection terminated|Query read timeout|Client has encountered a connection error/i.test(
      message,
    )
  ) {
    return "database_connection";
  }

  return infrastructureCause((error as { cause?: unknown }).cause, depth + 1);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name.slice(0, 64) : typeof error;
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.length <= 32 ? code : undefined;
}

/**
 * Maps any thrown value to a response.
 *
 * A `DomainError` carries its own status and a message written for a customer.
 * Anything else is logged by name and code only, and answered with either a
 * 503 (a dependency failed) or a 500 (something unexpected).
 */
export function failure(error: unknown, context: string): NextResponse {
  let answered: unknown = error;

  if (!(error instanceof DomainError)) {
    const cause = infrastructureCause(error);

    log.error(EVENTS.requestFailed, {
      context,
      error: errorName(error),
      code: errorCode(error),
      cause: cause ?? "unexpected",
    });

    if (cause) answered = new InfrastructureError();
  }

  return NextResponse.json(errorBody(answered), {
    status: statusForError(answered),
    headers: {
      "Cache-Control": "private, no-store",
      ...(answered instanceof RateLimitedError
        ? { "Retry-After": String(answered.retryAfterSeconds) }
        : {}),
    },
  });
}

/* ------------------------------------------------------------------ *
 * Origin
 * ------------------------------------------------------------------ */

/**
 * Refuses a state-changing request made from another site.
 *
 * The customer's session is a cookie, and a browser attaches cookies to a
 * request whatever page started it. SameSite=Lax already keeps the session off
 * a cross-site POST in every current browser; this is the second, explicit
 * layer for the API routes that change something, matching what Next.js does
 * for server actions:
 *
 *   Sec-Fetch-Site: cross-site     refused
 *   Origin present, host differs   refused
 *   no Origin                      allowed — not a browser page, so no ambient
 *                                  session was sent on its behalf
 */
export function assertSameOrigin(request: Request): void {
  const refuse = (reason: string): never => {
    log.warn(EVENTS.requestCrossOriginRefused, { reason });
    throw new ForbiddenError("This request was refused.");
  };

  if (request.headers.get("sec-fetch-site") === "cross-site") refuse("sec_fetch_site");

  const origin = request.headers.get("origin");
  if (!origin) return;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return refuse("malformed_origin");
  }

  if (!host || originHost !== host) refuse("origin_mismatch");
}

/* ------------------------------------------------------------------ *
 * Bodies
 * ------------------------------------------------------------------ */

/**
 * The largest JSON body any route here accepts by default.
 *
 * Every JSON body in this API is a handful of short fields — a checkout's
 * contact and address, an upload intent's name, size and checksum. 32 KB is
 * hundreds of times what any of them needs, and small enough that a flood of
 * large bodies cannot be used to exhaust a function's memory.
 */
export const DEFAULT_JSON_LIMIT_BYTES = 32 * 1024;

/**
 * Reads a request body, stopping at `maxBytes`.
 *
 * Refuses with 413 as soon as the running total passes the limit, so an
 * oversized body is never held in memory in full — which `request.json()` and
 * `request.formData()` would both do before anything could measure it.
 */
export async function readBoundedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) {
    log.warn(EVENTS.requestTooLarge, { declaredBytes: Number(declared), maxBytes });
    throw new PayloadTooLargeError();
  }

  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new ValidationError("The request body could not be read.");
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

/**
 * Reads a JSON body, or refuses.
 *
 * Size is checked twice: against the declared `Content-Length` before reading,
 * and against the bytes actually read, because a declared length is a claim
 * and a chunked body declares none. Reading stops at the limit rather than
 * buffering the whole body and measuring it afterwards.
 */
export async function readJson(
  request: Request,
  { maxBytes = DEFAULT_JSON_LIMIT_BYTES }: { maxBytes?: number } = {},
): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";

  if (!type.includes("application/json")) {
    throw new ValidationError("Send this request as application/json.");
  }

  const bytes = await readBoundedBytes(request, maxBytes);

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ValidationError("The request body is not valid UTF-8.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("The request body is not valid JSON.");
  }
}

/* ------------------------------------------------------------------ *
 * Small typed readers
 * ------------------------------------------------------------------ */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown, field?: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ValidationError(
      field ? "This request contains a value of the wrong type." : "The request body must be a JSON object.",
      field ? [{ field, message: "This value must be an object." }] : [],
    );
  }
  return value;
}

/**
 * Refuses fields a request is not allowed to send.
 *
 * Refused by name rather than ignored: a client sending `customerId` or a
 * price is either broken or probing, and should hear that those are not inputs.
 * At most five names are echoed, each truncated.
 */
export function rejectUnknownFields(
  source: Record<string, unknown>,
  allowed: readonly string[],
  prefix = "",
): void {
  const unexpected = Object.keys(source).filter((key) => !allowed.includes(key));
  if (unexpected.length === 0) return;

  throw new ValidationError(
    "This request contains fields that are not accepted.",
    unexpected.slice(0, 5).map((key) => ({
      field: `${prefix}${key.slice(0, 64)}`,
      message: "This field is not accepted.",
    })),
  );
}

export function readString(
  source: Record<string, unknown>,
  field: string,
  { required = true, max = 512 }: { required?: boolean; max?: number } = {},
): string | undefined {
  const value = source[field];

  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new ValidationError("This request is missing a required value.", [
        { field, message: "This value is required." },
      ]);
    }
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ValidationError("This request contains a value of the wrong type.", [
      { field, message: "This value must be text." },
    ]);
  }

  if (value.length > max) {
    throw new ValidationError("This request contains a value that is too long.", [
      { field, message: `This value must be ${max} characters or fewer.` },
    ]);
  }

  return value;
}

/**
 * A whole number in range.
 *
 * `typeof` plus `Number.isInteger` refuses NaN, Infinity, fractions, numeric
 * strings and booleans; the bounds refuse negative and absurd values. Nothing
 * is coerced.
 */
export function readInteger(
  source: Record<string, unknown>,
  field: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const value = source[field];

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ValidationError("This request contains a value of the wrong type.", [
      { field, message: "This value must be a whole number." },
    ]);
  }

  if (value < min || value > max) {
    throw new ValidationError("This request contains a value out of range.", [
      { field, message: `This value must be between ${min} and ${max}.` },
    ]);
  }

  return value;
}
