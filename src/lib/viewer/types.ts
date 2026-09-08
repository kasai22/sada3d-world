import type { Object3D, Vector3 } from "three";

/**
 * Viewer domain types.
 *
 * The viewer receives a model source and presentation settings. It never
 * resolves storage, never calculates price, and never derives manufacturing
 * facts from the geometry it draws.
 */

/**
 * Formats the browser can render as a mesh.
 *
 * STEP is deliberately absent. It is a boundary-representation format, not a
 * mesh, and cannot be rendered without a conversion pipeline. The viewer says
 * so rather than failing obscurely.
 */
export type ViewerFormat = "stl" | "obj" | "glb" | "gltf";

export const RENDERABLE_FORMATS: readonly ViewerFormat[] = ["stl", "obj", "glb", "gltf"];

export interface ViewerModelSource {
  /**
   * Where to fetch the mesh from.
   *
   * Today: a path under /models, or a blob: URL created for a file the customer
   * selected in this tab. Phase 16 supplies an authorised R2 URL. The viewer
   * treats this as opaque and never constructs it.
   */
  url: string;
  format: ViewerFormat;
  /** Names the object for assistive technology. */
  label?: string;
}

export interface ModelBounds {
  center: Vector3;
  size: Vector3;
  /** Radius of the bounding sphere, used for framing and clipping planes. */
  radius: number;
}

export interface ModelAsset {
  object: Object3D;
  /** Re-measured by the engine after the up-axis convention is applied. */
  bounds: ModelBounds;
  format: ViewerFormat;
}

export type ViewerCameraMode = "perspective" | "orthographic";

/**
 * Surface presentation.
 *
 * A visual treatment only. It carries no claim about the material a part would
 * actually be manufactured in — that lives in the configuration.
 */
export type ViewerSurface = "graphite" | "matte" | "polymer";

export interface ViewerAppearance {
  surface: ViewerSurface;
  /** Hex colour from the customer's selection, when one applies. */
  color?: string;
}

export type ViewerBackground = "void" | "graphite" | "light";

export type ViewerStatus =
  | "empty"
  | "loading"
  | "ready"
  | "error"
  /** WebGL could not be initialised on this device. */
  | "unsupported"
  /** The format cannot be rendered in a browser, such as STEP. */
  | "unrenderable";

export class ModelLoadError extends Error {}

/** Maps a file extension to a renderable format, or undefined. */
export function formatForExtension(extension: string): ViewerFormat | undefined {
  switch (extension.toLowerCase()) {
    case ".stl":
      return "stl";
    case ".obj":
      return "obj";
    case ".glb":
      return "glb";
    case ".gltf":
      return "gltf";
    default:
      return undefined;
  }
}
