/**
 * Custom print domain types.
 *
 * The workflow owns model identity and configuration. Rendering belongs to the
 * viewer (Phase 9), pricing to the quote engine (Phase 8) and durable storage
 * to R2 (Phase 16) — each behind its own seam in this folder.
 */

export type ModelFormat = "stl" | "step" | "obj";

/** Accepted extensions. Nothing outside this list is offered or accepted. */
export const ACCEPTED_EXTENSIONS = [".stl", ".step", ".stp", ".obj"] as const;

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
  /** Assigned by the storage adapter. */
  id: string;
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
