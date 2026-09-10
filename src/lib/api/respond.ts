import { NextResponse } from "next/server";

import { DomainError, ValidationError, errorBody, statusForError } from "@/lib/errors";

/**
 * The HTTP boundary.
 *
 * Three jobs, and deliberately no fourth: shape a response, turn a domain error
 * into a status, and read a JSON body safely. There is no business logic here
 * and there must not be — a route handler calls a service, and the service is
 * what decides anything.
 *
 * ── What never reaches a client ──────────────────────────────────────────
 *
 * Stack traces, `cause` chains, SQL, driver messages, internal identifiers. An
 * unexpected failure produces one sentence and a 500; the detail goes to the
 * server log where an operator can reach it and a stranger cannot.
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

/**
 * Maps any thrown value to a response.
 *
 * A `DomainError` carries its own status and a message written for a customer.
 * Anything else is unexpected: it is logged with its detail and answered with a
 * sentence that reveals nothing.
 */
export function failure(error: unknown, context: string): NextResponse {
  if (!(error instanceof DomainError)) {
    console.error(`[api] ${context} failed:`, error);
  }

  return NextResponse.json(errorBody(error), {
    status: statusForError(error),
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Reads a JSON body, or refuses.
 *
 * A body that is not JSON is a client error, not a server one, and saying so
 * with a 400 is more useful than a 500 that looks like an outage.
 */
export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";

  if (!type.includes("application/json")) {
    throw new ValidationError("Send this request as application/json.");
  }

  try {
    return await request.json();
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

export function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ValidationError("The request body must be a JSON object.");
  }
  return value;
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
