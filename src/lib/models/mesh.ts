import { ModelParseError } from "@/lib/errors";
import type { AnalysisWarning, UnitResolution } from "@/lib/geometry/types";

import { modelIdentity } from "./identity";
import {
  extensionOf,
  type ModelInput,
  type ModelParser,
  type ParsedMesh,
  type ParsedModel,
} from "./types";

/**
 * STL and OBJ.
 *
 * Both are single-object mesh formats with no packaging, no units and no
 * structure beyond triangles. They are handled together because the only thing
 * that differs is how the triangles are spelled.
 *
 * ── Units: assumed, and said so ──────────────────────────────────────────
 *
 * Neither format records a unit. This project's convention is millimetres,
 * which is what every consumer-facing slicer assumes and what the quote engine
 * expects — but it is a convention, not a fact about the file, and the result
 * says `declared: false` so the interface can show that the dimensions rest on
 * an assumption.
 *
 * A model drawn in inches and read as millimetres is 25.4× wrong in every
 * dimension. That is worth a sentence on screen, and it is never worth guessing
 * from how big the numbers look.
 */

const ASSUMED_MM: UnitResolution = {
  unit: "millimeter",
  declared: false,
  scaleToMm: 1,
  note: "This format does not record a unit. Millimetres assumed — check the dimensions against your design.",
};

/* ------------------------------------------------------------------ *
 * STL
 * ------------------------------------------------------------------ */

const STL_HEADER_BYTES = 80;
const STL_COUNT_BYTES = 4;
const STL_TRIANGLE_BYTES = 50;

/**
 * Whether the bytes are a binary STL.
 *
 * By length, not by the header text. The header is 80 free-form bytes and an
 * ASCII STL may begin with "solid" while a binary one may too — the arithmetic
 * is the only reliable test: 84 + 50n must equal the file length exactly.
 */
function isBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.length < STL_HEADER_BYTES + STL_COUNT_BYTES) return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangles = view.getUint32(STL_HEADER_BYTES, true);

  return (
    bytes.length ===
    STL_HEADER_BYTES + STL_COUNT_BYTES + triangles * STL_TRIANGLE_BYTES
  );
}

function parseBinaryStl(bytes: Uint8Array): ParsedMesh {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangles = view.getUint32(STL_HEADER_BYTES, true);
  const positions = new Float64Array(triangles * 9);

  let offset = STL_HEADER_BYTES + STL_COUNT_BYTES;
  let written = 0;

  for (let t = 0; t < triangles; t += 1) {
    // Twelve bytes of normal, which is recomputed from the winding and so is
    // read past rather than trusted.
    offset += 12;

    for (let v = 0; v < 9; v += 1) {
      positions[written] = view.getFloat32(offset, true);
      written += 1;
      offset += 4;
    }

    // Two bytes of attribute count, unused by the specification.
    offset += 2;
  }

  return { positions };
}

function parseAsciiStl(text: string): ParsedMesh {
  const values: number[] = [];
  const vertex = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;

  let match: RegExpExecArray | null;
  while ((match = vertex.exec(text)) !== null) {
    values.push(
      Number.parseFloat(match[1] ?? ""),
      Number.parseFloat(match[2] ?? ""),
      Number.parseFloat(match[3] ?? ""),
    );
  }

  if (values.length === 0 || values.length % 9 !== 0) {
    throw new ModelParseError(
      "This STL could not be read. Its triangle list is incomplete.",
    );
  }

  return { positions: Float64Array.from(values) };
}

export const stlParser: ModelParser = {
  format: "stl",
  extensions: [".stl"],

  validate(input: ModelInput): void {
    if (extensionOf(input.fileName) !== ".stl") {
      throw new ModelParseError("This file is not an STL.");
    }
    if (input.bytes.length === 0) {
      throw new ModelParseError("This file is empty.");
    }
  },

  async parse(input: ModelInput): Promise<ParsedModel> {
    stlParser.validate(input);

    const mesh = isBinaryStl(input.bytes)
      ? parseBinaryStl(input.bytes)
      : parseAsciiStl(
          new TextDecoder("utf-8", { fatal: false }).decode(input.bytes),
        );

    return {
      format: "stl",
      identity: modelIdentity(input.bytes),
      unit: ASSUMED_MM,
      /*
       * One object, always. STL has no concept of separate objects — a file
       * containing four disconnected shells is still one triangle soup, and
       * splitting it by connectivity would be inventing a part count the file
       * does not state.
       */
      objects: [{ id: "stl", meshes: [mesh] }],
      metadata: { entries: {}, unsupportedNamespaces: [] },
      warnings: [],
    };
  },
};

/* ------------------------------------------------------------------ *
 * OBJ
 * ------------------------------------------------------------------ */

/**
 * OBJ, reduced to triangles.
 *
 * Vertices, faces and object groups. Materials, textures, normals, smoothing
 * and parametric surfaces are ignored — none of them affects a measurement.
 *
 * Faces with more than three vertices are triangulated by a fan, which is exact
 * for the convex polygons OBJ faces almost always are and is the standard
 * reading. A concave polygon would fan incorrectly; that is noted rather than
 * silently accepted.
 */
export const objParser: ModelParser = {
  format: "obj",
  extensions: [".obj"],

  validate(input: ModelInput): void {
    if (extensionOf(input.fileName) !== ".obj") {
      throw new ModelParseError("This file is not an OBJ.");
    }
    if (input.bytes.length === 0) {
      throw new ModelParseError("This file is empty.");
    }
    if (input.bytes.includes(0)) {
      throw new ModelParseError("This file is not a valid OBJ. OBJ files are text.");
    }
  },

  async parse(input: ModelInput): Promise<ParsedModel> {
    objParser.validate(input);

    const text = new TextDecoder("utf-8", { fatal: false }).decode(input.bytes);
    const warnings: AnalysisWarning[] = [];

    const vertices: number[] = [];
    const groups: { name?: string; values: number[] }[] = [];
    let currentGroup: { name?: string; values: number[] } = { values: [] };
    groups.push(currentGroup);

    let fannedPolygons = 0;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("#")) continue;

      if (line.startsWith("v ")) {
        const parts = line.slice(2).trim().split(/\s+/);
        vertices.push(
          Number.parseFloat(parts[0] ?? ""),
          Number.parseFloat(parts[1] ?? ""),
          Number.parseFloat(parts[2] ?? ""),
        );
        continue;
      }

      if (line.startsWith("o ") || line.startsWith("g ")) {
        const name = line.slice(2).trim();
        currentGroup = { ...(name ? { name } : {}), values: [] };
        groups.push(currentGroup);
        continue;
      }

      if (line.startsWith("f ")) {
        const parts = line.slice(2).trim().split(/\s+/);
        // "v", "v/vt", "v//vn" and "v/vt/vn" all start with the vertex index.
        const indices = parts.map((part) => Number.parseInt(part.split("/")[0] ?? "", 10));

        if (indices.length < 3 || indices.some((index) => !Number.isInteger(index))) {
          continue;
        }

        if (indices.length > 3) fannedPolygons += 1;

        const vertexCount = Math.floor(vertices.length / 3);
        const resolve = (index: number): number =>
          // OBJ indices are 1-based, and negative indices count back from the end.
          index < 0 ? vertexCount + index : index - 1;

        for (let corner = 1; corner + 1 < indices.length; corner += 1) {
          const triangle = [
            resolve(indices[0] as number),
            resolve(indices[corner] as number),
            resolve(indices[corner + 1] as number),
          ];

          if (triangle.some((index) => index < 0 || index >= vertexCount)) continue;

          for (const index of triangle) {
            currentGroup.values.push(
              vertices[index * 3] as number,
              vertices[index * 3 + 1] as number,
              vertices[index * 3 + 2] as number,
            );
          }
        }
      }
    }

    const meshes: ParsedMesh[] = groups
      .filter((group) => group.values.length > 0)
      .map((group) => ({
        ...(group.name ? { name: group.name } : {}),
        positions: Float64Array.from(group.values),
      }));

    if (meshes.length === 0) {
      throw new ModelParseError("This OBJ contains no faces.");
    }

    if (fannedPolygons > 0) {
      warnings.push({
        code: "truncated_analysis",
        message: `${fannedPolygons} face(s) with more than three corners were triangulated. Measurements assume they are convex.`,
      });
    }

    return {
      format: "obj",
      identity: modelIdentity(input.bytes),
      unit: ASSUMED_MM,
      /*
       * OBJ groups are named regions of one model, not separately manufactured
       * objects. They are kept as separate meshes inside one object rather than
       * reported as a part count the format does not actually assert.
       */
      objects: [{ id: "obj", meshes }],
      metadata: { entries: {}, unsupportedNamespaces: [] },
      warnings,
    };
  },
};
