import { ModelParseError } from "@/lib/errors";
import { UNIT_TO_MM, type AnalysisWarning, type ModelUnit, type UnitResolution } from "@/lib/geometry/types";

import { modelIdentity } from "./identity";
import { MODEL_LIMITS, tooComplex, type ModelLimits } from "./limits";
import { numberAttribute, scanXml, type XmlElement } from "./xml";
import { openZip } from "./zip";
import {
  extensionOf,
  type ModelInput,
  type ModelMetadata,
  type ModelParser,
  type ParsedMesh,
  type ParsedModel,
  type ParsedObject,
} from "./types";

/**
 * The 3MF parser.
 *
 * Core specification only. 3MF is a ZIP package whose primary part is an XML
 * model, and this reads exactly that: units, objects, meshes, components, the
 * build, and core metadata.
 *
 * ── What "core only" means here ──────────────────────────────────────────
 *
 * A 3MF may carry production, slice, beam-lattice or vendor extensions, and any
 * of them can change what the geometry means. This parser does not implement
 * them. It records the namespaces it saw and did not understand, and the result
 * carries that forward as a warning — so a model using an extension is reported
 * as partly understood rather than measured as though the extension were not
 * there.
 *
 * Pretending to understand an extension is the failure mode worth avoiding: it
 * produces measurements that look authoritative and are wrong.
 *
 * ── Units ────────────────────────────────────────────────────────────────
 *
 * The `unit` attribute is read and honoured. Where it is absent the
 * specification's default of millimetres applies and the result says the unit
 * was assumed rather than declared. Nothing is ever inferred from how large the
 * geometry happens to be.
 */

const RELATIONSHIPS_PART = "_rels/.rels";
const MODEL_RELATIONSHIP =
  "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel";
/** Where the specification says the model lives when relationships are absent. */
const CONVENTIONAL_MODEL_PART = "3D/3dmodel.model";

/** Namespaces this parser implements. Anything else is reported, not guessed. */
const SUPPORTED_NAMESPACES = new Set([
  "http://schemas.microsoft.com/3dmanufacturing/core/2015/02",
  "http://schemas.openxmlformats.org/package/2006/relationships",
]);

const UNITS: Readonly<Record<string, ModelUnit>> = {
  micron: "micron",
  millimeter: "millimeter",
  centimeter: "centimeter",
  inch: "inch",
  foot: "foot",
  meter: "meter",
};

/* ------------------------------------------------------------------ *
 * Transforms
 * ------------------------------------------------------------------ */

/**
 * A 3MF transform: twelve numbers, a 4×3 matrix in row-major order.
 *
 * Stored as the twelve rather than as a matrix class, because the only
 * operations needed are compose and apply.
 */
type Matrix = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
  number, number, number,
];

const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function parseMatrix(value: string | undefined): Matrix {
  if (!value) return IDENTITY;

  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 12 || parts.some((n) => !Number.isFinite(n))) {
    // A malformed transform is not a reason to refuse the model; it is a reason
    // not to apply a transform nobody can read.
    return IDENTITY;
  }

  return parts as unknown as Matrix;
}

function applyMatrix(
  m: Matrix,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const at = (index: number): number => m[index] ?? 0;

  return [
    at(0) * x + at(3) * y + at(6) * z + at(9),
    at(1) * x + at(4) * y + at(7) * z + at(10),
    at(2) * x + at(5) * y + at(8) * z + at(11),
  ];
}

/** `outer ∘ inner`: inner applied first, as component nesting requires. */
function compose(outer: Matrix, inner: Matrix): Matrix {
  const result = new Array<number>(12).fill(0);
  const value = (matrix: Matrix, index: number): number => matrix[index] ?? 0;

  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      result[column * 3 + row] =
        value(inner, column * 3) * value(outer, row) +
        value(inner, column * 3 + 1) * value(outer, 3 + row) +
        value(inner, column * 3 + 2) * value(outer, 6 + row);
    }
  }

  const [tx, ty, tz] = applyMatrix(
    outer,
    value(inner, 9),
    value(inner, 10),
    value(inner, 11),
  );
  result[9] = tx;
  result[10] = ty;
  result[11] = tz;

  return result as unknown as Matrix;
}

/* ------------------------------------------------------------------ *
 * Model document
 * ------------------------------------------------------------------ */

interface RawObject {
  id: string;
  name?: string;
  type?: string;
  vertices: number[];
  /** Triangle vertex indices, three per triangle. */
  indices: number[];
  components: { objectId: string; transform: Matrix }[];
}

interface ModelDocument {
  unit: UnitResolution;
  objects: Map<string, RawObject>;
  build: { objectId: string; transform: Matrix }[];
  metadata: Record<string, string>;
  unsupportedNamespaces: string[];
  warnings: AnalysisWarning[];
}

/**
 * Reads the model part, refusing a document past the limits as it goes.
 *
 * Counted while scanning, so an oversized document is refused before its
 * vertex and index arrays have grown to the size that would do the harm.
 */
function readModelDocument(xml: string, limits: ModelLimits): ModelDocument {
  let vertexCount = 0;
  let triangleCount = 0;
  let componentCount = 0;

  const objects = new Map<string, RawObject>();
  const build: { objectId: string; transform: Matrix }[] = [];
  const metadata: Record<string, string> = {};
  const unsupported = new Set<string>();
  const warnings: AnalysisWarning[] = [];

  let unit: UnitResolution = {
    unit: "millimeter",
    declared: false,
    scaleToMm: 1,
    note: "This file does not declare a unit. Millimetres assumed, as the 3MF specification directs.",
  };

  let current: RawObject | null = null;
  let metadataName: string | null = null;

  scanXml(xml, {
    onOpen(element: XmlElement) {
      switch (element.name) {
        case "model": {
          for (const [key, value] of Object.entries(element.attributes)) {
            if (
              (key === "xmlns" || key.startsWith("xmlns:")) &&
              !SUPPORTED_NAMESPACES.has(value)
            ) {
              unsupported.add(value);
            }
          }

          const declared = element.attributes.unit;
          if (declared !== undefined) {
            const known = UNITS[declared.toLowerCase()];
            if (known) {
              unit = {
                unit: known,
                declared: true,
                scaleToMm: UNIT_TO_MM[known],
                note: `This file declares its unit as ${known}.`,
              };
            } else {
              warnings.push({
                code: "unit_assumed",
                message: `This file declares an unrecognised unit ("${declared}"). Millimetres assumed.`,
              });
            }
          }
          return;
        }

        case "metadata":
          metadataName = element.attributes.name ?? null;
          return;

        case "object": {
          const id = element.attributes.id;
          if (!id) return;

          if (objects.size >= limits.maxObjects) throw tooComplex("objects", limits.maxObjects);

          current = {
            id,
            ...(element.attributes.name ? { name: element.attributes.name } : {}),
            ...(element.attributes.type ? { type: element.attributes.type } : {}),
            vertices: [],
            indices: [],
            components: [],
          };
          objects.set(id, current);
          return;
        }

        case "vertex": {
          if (!current) return;
          vertexCount += 1;
          if (vertexCount > limits.maxVertices) throw tooComplex("vertices", limits.maxVertices);
          const x = numberAttribute(element.attributes, "x");
          const y = numberAttribute(element.attributes, "y");
          const z = numberAttribute(element.attributes, "z");
          // A vertex missing a coordinate is recorded as non-finite rather than
          // as zero, so the analyser excludes it and says so.
          current.vertices.push(x ?? NaN, y ?? NaN, z ?? NaN);
          return;
        }

        case "triangle": {
          if (!current) return;
          triangleCount += 1;
          if (triangleCount > limits.maxTriangles) throw tooComplex("triangles", limits.maxTriangles);
          const v1 = numberAttribute(element.attributes, "v1");
          const v2 = numberAttribute(element.attributes, "v2");
          const v3 = numberAttribute(element.attributes, "v3");
          if (v1 === undefined || v2 === undefined || v3 === undefined) return;
          current.indices.push(v1, v2, v3);
          return;
        }

        case "component": {
          if (!current) return;
          const objectId = element.attributes.objectid;
          if (!objectId) return;
          componentCount += 1;
          if (componentCount > limits.maxPlacements) {
            throw tooComplex("component references", limits.maxPlacements);
          }
          current.components.push({
            objectId,
            transform: parseMatrix(element.attributes.transform),
          });
          return;
        }

        case "item": {
          const objectId = element.attributes.objectid;
          if (!objectId) return;
          if (build.length >= limits.maxBuildItems) {
            throw tooComplex("build items", limits.maxBuildItems);
          }
          build.push({
            objectId,
            transform: parseMatrix(element.attributes.transform),
          });
          return;
        }

        default:
          return;
      }
    },

    onText(text) {
      if (metadataName) {
        metadata[metadataName] = text.trim();
        metadataName = null;
      }
    },

    onClose(name) {
      if (name === "object") current = null;
      if (name === "metadata") metadataName = null;
    },
  });

  return {
    unit,
    objects,
    build,
    metadata,
    unsupportedNamespaces: [...unsupported],
    warnings,
  };
}

/* ------------------------------------------------------------------ *
 * Flattening
 * ------------------------------------------------------------------ */

/**
 * Turns one object's mesh into triangles, in the given placement.
 *
 * Indices are resolved here so everything downstream sees plain triangles. An
 * index outside the vertex list is skipped and counted — a damaged triangle is
 * not a reason to discard a whole model, but it is a reason not to measure it.
 */
function meshOf(
  object: RawObject,
  transform: Matrix,
  warnings: AnalysisWarning[],
): ParsedMesh | null {
  const triangles = Math.floor(object.indices.length / 3);
  if (triangles === 0) return null;

  const vertexCount = Math.floor(object.vertices.length / 3);
  const positions = new Float64Array(triangles * 9);

  let written = 0;
  let skipped = 0;

  for (let t = 0; t < triangles; t += 1) {
    const indices = [
      object.indices[t * 3],
      object.indices[t * 3 + 1],
      object.indices[t * 3 + 2],
    ];

    if (
      indices.some(
        (index) => index === undefined || index < 0 || index >= vertexCount,
      )
    ) {
      skipped += 1;
      continue;
    }

    for (const index of indices) {
      const base = (index as number) * 3;
      const [x, y, z] = applyMatrix(
        transform,
        object.vertices[base] as number,
        object.vertices[base + 1] as number,
        object.vertices[base + 2] as number,
      );
      positions[written] = x;
      positions[written + 1] = y;
      positions[written + 2] = z;
      written += 3;
    }
  }

  if (skipped > 0) {
    warnings.push({
      code: "truncated_analysis",
      message: `${skipped} ${skipped === 1 ? "triangle references" : "triangles reference"} vertices that do not exist and ${skipped === 1 ? "was" : "were"} excluded.`,
      objectId: object.id,
    });
  }

  return {
    ...(object.name ? { name: object.name } : {}),
    positions: written === positions.length ? positions : positions.slice(0, written),
  };
}

/**
 * How much expansion one model has used.
 *
 * The cycle check stops a component graph that refers back to itself. It does
 * not stop one that fans out — sixteen levels of an object placing its child
 * twice is 65,536 copies of the child, each copied into its own triangle array
 * — nor a build list placing one large object thousands of times. Every
 * placement and every triangle it would copy is counted here, before the copy
 * is made.
 */
interface ExpansionBudget {
  limits: ModelLimits;
  placements: number;
  triangles: number;
}

/**
 * Collects every mesh an object resolves to, following components.
 *
 * Depth-bounded, cycle-aware and budgeted: a component graph that refers back
 * to an ancestor would otherwise recurse forever, one that fans out would
 * multiply its triangles without limit, and a malicious package is exactly
 * where either would be arranged deliberately.
 */
function collectMeshes(
  document: ModelDocument,
  objectId: string,
  transform: Matrix,
  depth: number,
  visiting: Set<string>,
  warnings: AnalysisWarning[],
  into: ParsedMesh[],
  budget: ExpansionBudget,
): void {
  if (depth > budget.limits.maxComponentDepth) {
    warnings.push({
      code: "truncated_analysis",
      message: "This model nests components more deeply than can be read.",
      objectId,
    });
    return;
  }

  if (visiting.has(objectId)) {
    warnings.push({
      code: "truncated_analysis",
      message: "This model contains a component that refers back to itself.",
      objectId,
    });
    return;
  }

  const object = document.objects.get(objectId);
  if (!object) {
    warnings.push({
      code: "truncated_analysis",
      message: `This model refers to object ${objectId}, which it does not contain.`,
      objectId,
    });
    return;
  }

  budget.placements += 1;
  if (budget.placements > budget.limits.maxPlacements) {
    throw tooComplex("placed parts", budget.limits.maxPlacements);
  }

  budget.triangles += Math.floor(object.indices.length / 3);
  if (budget.triangles > budget.limits.maxTriangles) {
    throw tooComplex("triangles once its parts are placed", budget.limits.maxTriangles);
  }

  visiting.add(objectId);

  const mesh = meshOf(object, transform, warnings);
  if (mesh) into.push(mesh);

  for (const component of object.components) {
    collectMeshes(
      document,
      component.objectId,
      compose(transform, component.transform),
      depth + 1,
      visiting,
      warnings,
      into,
      budget,
    );
  }

  visiting.delete(objectId);
}

/* ------------------------------------------------------------------ *
 * The parser
 * ------------------------------------------------------------------ */

function findModelPart(zip: ReturnType<typeof openZip>): Uint8Array {
  // The relationships part names the primary model. It is the correct route.
  const relationships = zip.find(RELATIONSHIPS_PART);

  if (relationships) {
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(
      zip.read(relationships),
    );

    let target: string | undefined;
    scanXml(xml, {
      onOpen(element) {
        if (
          element.name === "Relationship" &&
          element.attributes.Type === MODEL_RELATIONSHIP &&
          !target
        ) {
          target = element.attributes.Target;
        }
      },
    });

    if (target) {
      const entry = zip.find(target);
      if (entry) return zip.read(entry);
    }
  }

  // No usable relationship. The conventional location is the documented
  // fallback, not a guess.
  const conventional = zip.find(CONVENTIONAL_MODEL_PART);
  if (conventional) return zip.read(conventional);

  throw new ModelParseError(
    "This 3MF package does not contain a 3D model part.",
  );
}

export const threeMfParser: ModelParser = {
  format: "3mf",
  extensions: [".3mf"],

  validate(input: ModelInput): void {
    if (extensionOf(input.fileName) !== ".3mf") {
      throw new ModelParseError("This file is not a 3MF.");
    }

    if (input.bytes.length === 0) {
      throw new ModelParseError("This file is empty.");
    }

    /*
     * The local-file-header signature. A ZIP always begins with it, so this
     * rejects a renamed STL before any of the container machinery runs.
     */
    const [a, b, c, d] = input.bytes;
    if (a !== 0x50 || b !== 0x4b || (c !== 0x03 && c !== 0x05) || (d !== 0x04 && d !== 0x06)) {
      throw new ModelParseError(
        "This file is not a valid 3MF package. A 3MF is a ZIP container.",
      );
    }
  },

  async parse(input: ModelInput): Promise<ParsedModel> {
    threeMfParser.validate(input);

    const zip = openZip(input.bytes);
    const modelBytes = findModelPart(zip);
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(modelBytes);

    const limits = input.limits ?? MODEL_LIMITS;
    const document = readModelDocument(xml, limits);
    const warnings: AnalysisWarning[] = [...document.warnings];

    if (document.unsupportedNamespaces.length > 0) {
      warnings.push({
        code: "unsupported_metadata",
        message: `This model uses ${document.unsupportedNamespaces.length} extension namespace(s) this analysis does not implement. Only core geometry has been measured.`,
      });
    }

    /*
     * The build is what says which objects are actually manufactured. An object
     * that exists only as a component of another is not a separate part, and
     * counting it as one would report a two-part assembly as three parts.
     */
    const placements =
      document.build.length > 0
        ? document.build
        : /*
           * No build section. Every object with geometry is treated as a part,
           * which is the only reading available and is recorded as an
           * assumption rather than presented as the file's own statement.
           */
          [...document.objects.values()]
            .filter((object) => object.indices.length > 0)
            .map((object) => ({ objectId: object.id, transform: IDENTITY }));

    if (document.build.length === 0 && placements.length > 0) {
      warnings.push({
        code: "truncated_analysis",
        message:
          "This model has no build section, so every object containing geometry has been treated as a separate part.",
      });
    }

    const objects: ParsedObject[] = [];
    const budget: ExpansionBudget = { limits, placements: 0, triangles: 0 };

    for (const [index, placement] of placements.entries()) {
      const meshes: ParsedMesh[] = [];
      collectMeshes(
        document,
        placement.objectId,
        placement.transform,
        0,
        new Set(),
        warnings,
        meshes,
        budget,
      );

      const source = document.objects.get(placement.objectId);

      objects.push({
        id: `${placement.objectId}#${index}`,
        ...(source?.name ? { name: source.name } : {}),
        meshes,
      });
    }

    /*
     * No meshes anywhere is the real emptiness test. A build that places an
     * object which resolves to nothing — a component cycle, a missing
     * reference — produces objects with no meshes, and reporting that as a
     * model with parts in it would be reporting parts that do not exist.
     */
    const hasGeometry = objects.some((object) =>
      object.meshes.some((mesh) => mesh.positions.length > 0),
    );

    if (!hasGeometry) {
      throw new ModelParseError("This 3MF contains no printable geometry.");
    }

    const metadata: ModelMetadata = {
      entries: document.metadata,
      unsupportedNamespaces: document.unsupportedNamespaces,
    };

    return {
      format: "3mf",
      identity: modelIdentity(input.bytes),
      unit: document.unit,
      objects,
      metadata,
      warnings,
    };
  },
};
