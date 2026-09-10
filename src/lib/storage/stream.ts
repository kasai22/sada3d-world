import { createHash } from "node:crypto";

/**
 * Reading a stored object into memory, within a bound.
 *
 * The model parsers need the whole file: a 3MF is a ZIP, and a ZIP's directory
 * is at the end. So server-side analysis does hold the file in memory — once,
 * in a buffer sized to the object before the first byte arrives, never grown,
 * never copied into a second one.
 *
 * What this refuses to do is trust the provider's size for the allocation and
 * then read whatever arrives. The stream is counted as it is copied: more bytes
 * than expected stops the read at the boundary, fewer is reported as truncated,
 * and the SHA-256 is computed over exactly the bytes that were kept.
 */

export type BoundedReadFailure = "too_large" | "truncated";

export class BoundedReadError extends Error {
  readonly reason: BoundedReadFailure;

  constructor(reason: BoundedReadFailure) {
    super(
      reason === "too_large"
        ? "The object is larger than it was declared to be."
        : "The object ended before its declared length.",
    );
    this.name = "BoundedReadError";
    this.reason = reason;
  }
}

export interface BoundedRead {
  bytes: Uint8Array;
  /** Lowercase hex SHA-256 of `bytes`. */
  sha256: string;
}

export async function readBounded(
  body: AsyncIterable<Uint8Array>,
  expectedSize: number,
): Promise<BoundedRead> {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) {
    throw new BoundedReadError("too_large");
  }

  const bytes = new Uint8Array(expectedSize);
  const hash = createHash("sha256");
  let offset = 0;

  for await (const chunk of body) {
    if (offset + chunk.byteLength > expectedSize) {
      throw new BoundedReadError("too_large");
    }

    bytes.set(chunk, offset);
    hash.update(chunk);
    offset += chunk.byteLength;
  }

  if (offset !== expectedSize) throw new BoundedReadError("truncated");

  return { bytes, sha256: hash.digest("hex") };
}

/** SHA-256 of bytes already in memory, lowercase hex. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
