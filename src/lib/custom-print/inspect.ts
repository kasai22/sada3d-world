import {
  ACCEPTED_EXTENSIONS,
  MAX_MODEL_BYTES,
  type ModelFormat,
  type ModelInspection,
} from "./types";

/**
 * Local model inspection.
 *
 * Reads the first few hundred bytes of the selected file and reports only what
 * those bytes actually say. Binary STL states its triangle count in the header
 * and has a fixed record size, so both the count and a structural check are
 * real. Everything else is limited to identifying the format.
 *
 * This is explicitly NOT manufacturing analysis. Volume, weight, bounding box,
 * wall thickness, overhangs, manifoldness and print time all require parsing
 * the full geometry and belong to the analysis layer, not to file selection.
 * Nothing here estimates them.
 */

export class ModelFileError extends Error {}

/** Bytes read from the head of the file. Enough for every signature we check. */
const HEAD_BYTES = 512;

/** Binary STL: 80-byte header, uint32 triangle count, then 50 bytes each. */
const STL_HEADER_BYTES = 80;
const STL_COUNT_BYTES = 4;
const STL_TRIANGLE_BYTES = 50;

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

function formatFor(extension: string): ModelFormat | undefined {
  if (extension === ".stl") return "stl";
  if (extension === ".step" || extension === ".stp") return "step";
  if (extension === ".obj") return "obj";
  return undefined;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validates what can genuinely be determined before reading the file.
 *
 * Extension and size only. A browser cannot tell whether a model is printable,
 * and this does not pretend otherwise.
 */
export function validateModelFile(file: File): void {
  const extension = extensionOf(file.name);

  if (!ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
    throw new ModelFileError(
      `This file type isn't supported. Upload an ${ACCEPTED_EXTENSIONS.map((e) => e.slice(1).toUpperCase()).join(", ")} file.`,
    );
  }

  if (file.size === 0) {
    throw new ModelFileError("This file is empty.");
  }

  if (file.size > MAX_MODEL_BYTES) {
    throw new ModelFileError(
      `This file exceeds the current upload limit of ${formatBytes(MAX_MODEL_BYTES)}.`,
    );
  }
}

function looksLikeText(bytes: Uint8Array): boolean {
  // A NUL byte in the first block means this is not a text-based format.
  return !bytes.includes(0);
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function inspectStl(file: File, head: Uint8Array): Promise<ModelInspection> {
  // Binary STL declares its triangle count; the file length must agree.
  if (file.size > STL_HEADER_BYTES + STL_COUNT_BYTES) {
    const view = new DataView(
      head.buffer,
      head.byteOffset + STL_HEADER_BYTES,
      STL_COUNT_BYTES,
    );
    const triangles = view.getUint32(0, true);
    const expected =
      STL_HEADER_BYTES + STL_COUNT_BYTES + triangles * STL_TRIANGLE_BYTES;

    if (expected === file.size) {
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
 * Identifies the file from its own contents.
 *
 * Reads at most the first 512 bytes, so a 200 MB model costs nothing to check.
 */
export async function inspectModelFile(file: File): Promise<ModelInspection> {
  validateModelFile(file);

  const format = formatFor(extensionOf(file.name));
  if (!format) {
    throw new ModelFileError("This file type isn't supported.");
  }

  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  } catch {
    throw new ModelFileError("The file couldn't be read. Try selecting it again.");
  }

  switch (format) {
    case "stl":
      return inspectStl(file, head);
    case "step":
      return inspectStep(head);
    case "obj":
      return inspectObj(head);
  }
}
