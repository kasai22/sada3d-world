/**
 * Custom print domain types.
 *
 * The workflow owns model identity and configuration. Rendering belongs to the
 * viewer (Phase 9), pricing to the quote engine (Phase 8) and durable storage
 * to R2 (Phase 16) — each behind its own seam in this folder.
 */

export type ModelFormat = "3mf" | "stl" | "step" | "obj";

/**
 * Accepted extensions, best first.
 *
 * 3MF leads because it is the only one that records its own unit and its own
 * object structure — a measurement from a 3MF rests on what the file says,
 * where STL and OBJ rest on a convention. STEP is accepted and is not
 * mesh-analysable; the interface says so rather than failing obscurely.
 */
export const ACCEPTED_EXTENSIONS = [
  ".3mf",
  ".stl",
  ".step",
  ".stp",
  ".obj",
] as const;

export type AcceptedExtension = (typeof ACCEPTED_EXTENSIONS)[number];

export function isAcceptedExtension(extension: string): extension is AcceptedExtension {
  return ACCEPTED_EXTENSIONS.includes(extension as AcceptedExtension);
}

/**
 * The content type a model is stored under, chosen by the server from the
 * extension.
 *
 * Not the browser's `File.type`: for the same `.stl` that is
 * `model/stl` on one machine, `application/vnd.ms-pki.stl` on another and an
 * empty string on a third, and in every case it is a claim made by the client.
 * These are the IANA-registered `model/*` types. The type is signed into the
 * upload URL, so an upload that declares anything else is refused by storage.
 */
export const MODEL_CONTENT_TYPES: Readonly<Record<AcceptedExtension, string>> = {
  ".3mf": "model/3mf",
  ".stl": "model/stl",
  ".step": "model/step",
  ".stp": "model/step",
  ".obj": "model/obj",
};

/** Uppercase label stored on a design, e.g. "3MF". */
export const MODEL_FORMAT_LABELS: Readonly<Record<AcceptedExtension, string>> = {
  ".3mf": "3MF",
  ".stl": "STL",
  ".step": "STEP",
  ".stp": "STEP",
  ".obj": "OBJ",
};

/** 200 MB. Beyond this a browser upload is the wrong transport. */
export const MAX_MODEL_BYTES = 200 * 1024 * 1024;

/**
 * Facts read from the file itself.
 *
 * Every field here is derived from the bytes on disk. Nothing is estimated.
 * Volume, weight, dimensions, wall thickness and print time are NOT here
 * because they cannot be computed without parsing full geometry, which is the
 * analysis layer's job, not this workflow's.
 */
export interface ModelInspection {
  format: ModelFormat;
  /** e.g. "Binary STL", "ASCII STL", "STEP (ISO-10303-21)". */
  formatLabel: string;
  /**
   * Triangle count. Only present for binary STL, where the header states it
   * and the file length confirms it.
   */
  triangles?: number;
  /**
   * Whether the declared structure matches the file length. Only meaningful
   * for binary STL; undefined where it cannot be checked.
   */
  structureValid?: boolean;
}

export type ModelStatus = "idle" | "inspecting" | "uploading" | "ready" | "error";

/** A model the customer has selected, as the workflow knows it. */
export interface UploadedModel {
  /**
   * A tab-local `mdl_…` id until the file is stored, then the design's
   * `dsn_…` id. The cart line carries whichever it is, and checkout accepts
   * only the second.
   */
  id: string;
  /**
   * True once the file is in private storage and the server has verified it.
   * A stored model survives a reload: the viewer reads it back through the
   * authorised file route.
   */
  stored?: boolean;
  name: string;
  /** Lowercase extension including the dot. */
  extension: string;
  sizeBytes: number;
  inspection: ModelInspection;
}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

export interface CustomPrintConfiguration {
  model?: UploadedModel;
  /** Material value from the catalog taxonomy. */
  material?: string;
  /** Quality option value. */
  quality?: string;
  /** Finish option value. */
  finish?: string;
  quantity: number;
}

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 500;

export const EMPTY_CONFIGURATION: CustomPrintConfiguration = {
  quantity: MIN_QUANTITY,
};

/* ------------------------------------------------------------------ *
 * Steps
 * ------------------------------------------------------------------ */

export const STEP_IDS = [
  "upload",
  "material",
  "quality",
  "finish",
  "review",
] as const;

export type StepId = (typeof STEP_IDS)[number];

export interface StepDefinition {
  id: StepId;
  /** Shown in the stepper. */
  label: string;
  /** Panel headline. */
  title: string;
  /** One supporting line, engineering-plain. */
  intro: string;
}

export const STEPS: readonly StepDefinition[] = [
  {
    id: "upload",
    label: "Upload",
    title: "Upload your design.",
    intro: "Upload a supported 3D model to begin configuration.",
  },
  {
    id: "material",
    label: "Material",
    title: "Choose a material.",
    intro: "Material determines strength, finish and how the part behaves in use.",
  },
  {
    id: "quality",
    label: "Quality",
    title: "Set the print quality.",
    intro: "Layer height trades surface detail against print time.",
  },
  {
    id: "finish",
    label: "Finish",
    title: "Choose a finish.",
    intro: "Post-processing applied after the part comes off the machine.",
  },
  {
    id: "review",
    label: "Review",
    title: "Review your configuration.",
    intro: "Check every value before requesting a manufacturing quote.",
  },
];
