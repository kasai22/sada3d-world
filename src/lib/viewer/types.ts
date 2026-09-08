import type { Object3D, Quaternion, Vector3 } from "three";

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

/* ------------------------------------------------------------------ *
 * Exploded view
 * ------------------------------------------------------------------ */

/** What a component is in the file: a single mesh, or a group of meshes. */
export type ViewerComponentType = "mesh" | "group";

/**
 * A component of an assembly.
 *
 * A component is a named part the model file itself declares — a child of the
 * assembly root. It is never a fragment invented by subdividing a mesh.
 */
export interface ViewerComponent {
  /** Stable for a given model: derived from scene order and the file's name. */
  id: string;
  object: Object3D;
  name: string;
  /** What the file declares this part to be. */
  type: ViewerComponentType;
  /** True when the name came from the file rather than being generated. */
  named: boolean;
  /** Position in scene order, from zero. */
  index: number;
  /** Rest centre, in the assembly root's local space. */
  center: Vector3;
  /** Rest extent, in the assembly root's local space. */
  size: Vector3;
  radius: number;
  /**
   * The transform the file gave this component, recorded at discovery so the
   * exploded state is exactly reversible.
   */
  rest: {
    position: Vector3;
    quaternion: Quaternion;
    scale: Vector3;
  };
}

/** The measured extent of the whole assembly at rest. */
export interface AssemblyBounds {
  /** Centre, in the assembly root's local space. */
  center: Vector3;
  radius: number;
}

/**
 * What the loaded model supports.
 *
 * The consuming UI reads this rather than inspecting the scene graph itself.
 */
export interface ViewerCapabilities {
  explode: boolean;
}

/**
 * A component as the React layer sees it.
 *
 * Deliberately free of three.js objects: the UI names and selects components,
 * it does not touch the scene.
 */
export interface ViewerComponentInfo {
  id: string;
  name: string;
  type: ViewerComponentType;
  named: boolean;
  index: number;
}
