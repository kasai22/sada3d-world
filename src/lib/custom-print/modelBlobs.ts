/**
 * In-memory model registry.
 *
 * The viewer needs the actual bytes of the uploaded file; the workflow
 * deliberately persists only the model's identity. This bridges the two
 * without changing the persistence model.
 *
 * Nothing here is serialised. Binary data never goes into sessionStorage, and
 * the registry does not survive a reload — which is correct, because the File
 * object does not either. When it is gone the viewer says so and asks for the
 * model again rather than inventing one.
 *
 * Only the current model is retained. Replacing it revokes the previous object
 * URL immediately, so no URL is ever left dangling.
 */

interface RegisteredModel {
  id: string;
  url: string;
}

let current: RegisteredModel | null = null;

/** Registers a file for viewing and returns its object URL. */
export function rememberModelFile(id: string, file: File): string {
  if (typeof window === "undefined") return "";

  // One model at a time: releasing here is what keeps this leak-free.
  forgetModelFile();

  const url = URL.createObjectURL(file);
  current = { id, url };
  return url;
}

/** The object URL for a model id, or undefined once it is gone. */
export function modelObjectUrl(id: string): string | undefined {
  return current?.id === id ? current.url : undefined;
}

/** Revokes the current object URL, if any. */
export function forgetModelFile(): void {
  if (typeof window === "undefined" || !current) return;
  URL.revokeObjectURL(current.url);
  current = null;
}
