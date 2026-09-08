import { extensionOf, inspectModelFile } from "./inspect";
import type { UploadedModel } from "./types";

/**
 * Model storage seam.
 *
 * Phase 16 replaces the adapter below with a presigned Cloudflare R2 upload.
 * The workflow only ever sees this interface, so that swap changes no UI.
 *
 * The current adapter is local and deliberate about it: the selected file never
 * leaves the browser. Nothing is sent anywhere, no third-party service is
 * contacted, and no credentials exist in client code. It reads the first 512
 * bytes to identify the format and returns the model's identity.
 */

export interface ModelStorageAdapter {
  /** Identifier for the adapter, surfaced in diagnostics. */
  readonly name: string;
  /**
   * Prepares a selected file for the workflow.
   *
   * Rejects with a ModelFileError carrying a message intended for display.
   */
  prepare(file: File): Promise<UploadedModel>;
}

function modelId(): string {
  // Not security-sensitive: this only distinguishes models within one session.
  return `mdl_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Local adapter. Keeps the file in the browser and derives identity from it.
 *
 * A real backend must independently re-validate extension, size and contents:
 * nothing a browser reports about a file can be trusted by a server.
 */
export const localModelStorage: ModelStorageAdapter = {
  name: "local",

  async prepare(file: File): Promise<UploadedModel> {
    const inspection = await inspectModelFile(file);

    return {
      id: modelId(),
      name: file.name,
      extension: extensionOf(file.name),
      sizeBytes: file.size,
      inspection,
    };
  },
};

/** The adapter the workflow uses. Phase 16 points this at R2. */
export const modelStorage: ModelStorageAdapter = localModelStorage;

/* ------------------------------------------------------------------ *
 * Durable file availability
 * ------------------------------------------------------------------ */

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

/**
 * Whether a model's file can be reached for manufacturing.
 *
 * Today: never. The local adapter keeps the selected file in the browser and
 * sends it nowhere, which was the correct Phase 7 behaviour and is still the
 * behaviour now. Phase 16 replaces the adapter with a presigned R2 upload, and
 * this becomes a real lookup against the stored object.
 *
 * Checkout treats a false result as blocking. An order whose file cannot be
 * retrieved is an order that cannot be fulfilled, and creating one would be a
 * promise the system cannot keep.
 */
export function modelFileAvailability(_modelId: string): ModelFileAvailability {
  if (modelStorage.name === "local") {
    return {
      durable: false,
      reason:
        "Upload storage is not configured yet, so this part cannot be sent for manufacturing.",
    };
  }

  return { durable: true };
}
