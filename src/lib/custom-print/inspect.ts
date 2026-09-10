import { formatBytes } from "@/lib/bytes";

import {
  MAX_MODEL_BYTES,
  isAcceptedExtension,
  ACCEPTED_EXTENSIONS,
  type ModelFormat,
  type ModelInspection,
} from "./types";

/**
 * Model inspection, from the head of the file.
 *
 * Reads the first few hundred bytes and reports only what those bytes actually
 * say. Binary STL states its triangle count in the header and has a fixed record
 * size, so both the count and a structural check are real. Everything else is
 * limited to identifying the format.
 *
 * ── Two callers, one rule ────────────────────────────────────────────────
 *
 * The browser runs this on a selected `File` so a customer hears about a wrong
 * file before uploading 200 MB of it. The server runs the *same* functions on
 * the first bytes of the stored object during upload verification, where it is
 * a security check rather than a courtesy. `inspectModelHead` is the shared
 * core and takes plain bytes, so neither side has its own idea of what an STL
 * looks like.
 *
 * This is explicitly NOT manufacturing analysis. Volume, bounding box,
 * manifoldness and the rest belong to the geometry analyser.
 */

export class ModelFileError extends Error {}

/** Bytes read from the head of the file. Enough for every signature we check. */
export const HEAD_BYTES = 512;

/** Binary STL: 80-byte header, uint32 triangle count, then 50 bytes each. */
const STL_HEADER_BYTES = 80;
const STL_COUNT_BYTES = 4;
const STL_TRIANGLE_BYTES = 50;

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

export function formatFor(extension: string): ModelFormat | undefined {
  if (extension === ".3mf") return "3mf";
  if (extension === ".stl") return "stl";
  if (extension === ".step" || extension === ".stp") return "step";
  if (extension === ".obj") return "obj";
  return undefined;
}

/** Re-exported so the custom-print surface keeps one import path. */
export { formatBytes };

/**
 * Validates what can genuinely be determined before reading the file.
 *
 * Extension and size only. Written against a name and a size rather than a
 * `File`, so the server applies the identical rule to a declared upload.
 */
export function validateModelDescriptor(name: string, size: number): void {
  const extension = extensionOf(name);

  if (!isAcceptedExtension(extension)) {
    throw new ModelFileError(
      `This file type isn't supported. Upload an ${ACCEPTED_EXTENSIONS.map((e) => e.slice(1).toUpperCase()).join(", ")} file.`,
    );
  }

  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new ModelFileError("This file is empty.");
  }

  if (size > MAX_MODEL_BYTES) {
    throw new ModelFileError(
      `This file exceeds the current upload limit of ${formatBytes(MAX_MODEL_BYTES)}.`,
    );
  }
}

export function validateModelFile(file: File): void {
  validateModelDescriptor(file.name, file.size);
}

function looksLikeText(bytes: Uint8Array): boolean {
  // A NUL byte in the first block means this is not a text-based format.
  return !bytes.includes(0);
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function inspectStl(size: number, head: Uint8Array): ModelInspection {
  // Binary STL declares its triangle count; the file length must agree.
  if (size > STL_HEADER_BYTES + STL_COUNT_BYTES && head.byteLength >= STL_HEADER_BYTES + STL_COUNT_BYTES) {
    const view = new DataView(
      head.buffer,
      head.byteOffset + STL_HEADER_BYTES,
      STL_COUNT_BYTES,
    );
    const triangles = view.getUint32(0, true);
    const expected =
      STL_HEADER_BYTES + STL_COUNT_BYTES + triangles * STL_TRIANGLE_BYTES;

    if (expected === size) {
      return {
        format: "stl",
        formatLabel: "Binary STL",
        triangles,
        structureValid: true,
      };
    }
  }

  // Not a binary STL by length. ASCII STL opens with the "solid" keyword.
  if (decode(head.slice(0, 5)).toLowerCase() === "solid" && looksLikeText(head)) {
    return { format: "stl", formatLabel: "ASCII STL" };
  }

  throw new ModelFileError(
    "This file couldn't be read as an STL. It may be incomplete or in a different format.",
  );
}

/**
 * 3MF, from its container signature alone.
 *
 * A 3MF is a ZIP, so the first four bytes are the local-file-header magic. That
 * is all this step checks — reading the package, its model part and its
 * geometry is the analyser's job.
 */
function inspectThreeMf(head: Uint8Array): ModelInspection {
  const [a, b, c, d] = head;
  const isZip =
    a === 0x50 && b === 0x4b && (c === 0x03 || c === 0x05) && (d === 0x04 || d === 0x06);

  if (!isZip) {
    throw new ModelFileError(
      "This file couldn't be read as a 3MF. A 3MF is a ZIP package; this file is not one.",
    );
  }

  return { format: "3mf", formatLabel: "3MF", structureValid: true };
}

function inspectStep(head: Uint8Array): ModelInspection {
  // STEP part 21 files begin with the ISO-10303-21 marker.
  if (!decode(head).includes("ISO-10303-21")) {
    throw new ModelFileError(
      "This file couldn't be read as a STEP file. It may be incomplete or in a different format.",
    );
  }

  return { format: "step", formatLabel: "STEP (ISO-10303-21)", structureValid: true };
}

function inspectObj(head: Uint8Array): ModelInspection {
  if (!looksLikeText(head)) {
    throw new ModelFileError(
      "This file couldn't be read as an OBJ. OBJ files are plain text.",
    );
  }

  return { format: "obj", formatLabel: "OBJ" };
}

/**
 * Identifies a model from its name, its total size and its first bytes.
 *
 * The shared core. `head` should be the first `HEAD_BYTES` of the file, or all
 * of it when the file is shorter.
 */
export function inspectModelHead(input: {
  fileName: string;
  size: number;
  head: Uint8Array;
}): ModelInspection {
  validateModelDescriptor(input.fileName, input.size);

  const format = formatFor(extensionOf(input.fileName));
  if (!format) {
    throw new ModelFileError("This file type isn't supported.");
  }

  switch (format) {
    case "3mf":
      return inspectThreeMf(input.head);
    case "stl":
      return inspectStl(input.size, input.head);
    case "step":
      return inspectStep(input.head);
    case "obj":
      return inspectObj(input.head);
  }
}

/**
 * Identifies a selected file from its own contents, in the browser.
 *
 * Reads at most the first 512 bytes, so a 200 MB model costs nothing to check.
 */
export async function inspectModelFile(file: File): Promise<ModelInspection> {
  validateModelFile(file);

  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  } catch {
    throw new ModelFileError("The file couldn't be read. Try selecting it again.");
  }

  return inspectModelHead({ fileName: file.name, size: file.size, head });
}
