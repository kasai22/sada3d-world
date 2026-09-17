import type { Payload } from "payload";

/**
 * The Payload client and the request's headers, for the admin's catalog
 * services. Returns clients only — no data — so this is not an operator-gated
 * read; every service that uses it takes an `OperatorSession`.
 *
 * Tests replace both with `setPayloadClientForTests`, the same seam the
 * application database has (`setDatabaseProvider`).
 */

interface Client {
  payload: () => Promise<Payload>;
  headers: () => Promise<Headers>;
}

let override: Client | null = null;

export function setPayloadClientForTests(client: Client | null): void {
  override = client;
}

export async function payloadInstance(): Promise<Payload> {
  if (override) return override.payload();
  const [{ getPayload }, { default: config }] = await Promise.all([import("payload"), import("@payload-config")]);
  return getPayload({ config });
}

export async function requestHeaders(): Promise<Headers> {
  if (override) return override.headers();
  const { headers } = await import("next/headers");
  return headers();
}
