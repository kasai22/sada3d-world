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
