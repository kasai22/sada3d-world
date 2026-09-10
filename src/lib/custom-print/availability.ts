import { designFileAvailability } from "@/lib/account/design-files";
import { getCustomerContext } from "@/lib/account/identity";

/**
 * Durable file availability — the Stage 15 seam, now backed by storage.
 *
 * Stage 15 answered "never": the file was only ever in the browser, so
 * checkout refused every custom part. The question is unchanged and so is the
 * rule that a false answer blocks checkout. What changed is that the answer is
 * now looked up:
 *
 *   the cart line's model id
 *     → a design owned by the signed-in customer
 *     → verified: stored, size and SHA-256 confirmed, format read from the bytes
 *     → analysed, when the format is a mesh
 *     → (at checkout) the object still exists in R2
 *
 * Server-only. It lives apart from `storage.ts`, which is the browser's upload
 * client, so that the browser bundle never pulls in the database or the storage
 * SDK.
 */

export interface ModelFileAvailability {
  /**
   * True when the manufacturing file can be retrieved by fulfilment without
   * the customer's browser. Nothing else is a substitute: a part cannot be
   * made from a filename.
   */
  durable: boolean;
  /** Shown to the customer when it is not. */
  reason?: string;
}

export async function modelFileAvailability(
  modelId: string,
  options: { verifyObject?: boolean } = {},
): Promise<ModelFileAvailability> {
  const { identity } = await getCustomerContext();

  const result = await designFileAvailability(identity, modelId, {
    verifyObject: options.verifyObject ?? false,
  });

  return result.durable ? { durable: true } : { durable: false, reason: result.reason };
}
