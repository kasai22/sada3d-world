import { Box3, Mesh, Object3D, Sphere, Vector3 } from "three";

import {
  ModelLoadError,
  type ModelAsset,
  type ModelBounds,
  type ViewerFormat,
  type ViewerModelSource,
} from "./types";

/**
 * Model loading.
 *
 * Each loader is imported on demand, so a page that never shows a model never
 * pays for the loader, and a page showing an STL never downloads the glTF
 * parser.
 *
 * Loaders parse geometry only. Nothing here evaluates a model's manufacturing
 * properties, and no value produced here is a measurement of the part.
 */

export interface ModelLoader {
  canLoad(format: ViewerFormat): boolean;
  load(source: ViewerModelSource): Promise<Object3D>;
}

const stlLoader: ModelLoader = {
  canLoad: (format) => format === "stl",
  async load(source) {
    const [{ STLLoader }, { MeshStandardMaterial }] = await Promise.all([
      import("three/examples/jsm/loaders/STLLoader.js"),
      import("three"),
    ]);

    const geometry = await new STLLoader().loadAsync(source.url);
    // STL carries no material, and normals are often absent or unreliable.
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    return new Mesh(geometry, new MeshStandardMaterial());
  },
};

/**
 * 3MF, for display.
 *
 * three's loader resolves the package, its objects and their build transforms
 * into a scene graph — which is what the exploded view then reads, so a
 * multi-object 3MF gets component separation for free from the file's own
 * structure rather than from anything inferred.
 *
 * Loaded on demand: a page showing an STL never downloads the ZIP and XML
 * machinery this needs.
 */
const threeMfLoader: ModelLoader = {
  canLoad: (format) => format === "3mf",
  async load(source) {
    const { ThreeMFLoader } = await import(
      "three/examples/jsm/loaders/3MFLoader.js"
    );
    return new ThreeMFLoader().loadAsync(source.url);
  },
};

const objLoader: ModelLoader = {
  canLoad: (format) => format === "obj",
  async load(source) {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    return new OBJLoader().loadAsync(source.url);
  },
};

const gltfLoader: ModelLoader = {
  canLoad: (format) => format === "glb" || format === "gltf",
  async load(source) {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(source.url);
    return gltf.scene;
  },
};

const LOADERS: readonly ModelLoader[] = [
  threeMfLoader,
  stlLoader,
  objLoader,
  gltfLoader,
];

/** Bounding box and sphere, in the model's own space. */
export function measureBounds(object: Object3D): ModelBounds {
  const box = new Box3().setFromObject(object);

  if (box.isEmpty()) {
    throw new ModelLoadError("This model contains no geometry.");
  }

  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  const sphere = new Sphere();
  box.getBoundingSphere(sphere);

  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) {
    throw new ModelLoadError("This model could not be measured.");
  }

  return { center, size, radius: sphere.radius };
}

/**
 * Loads a model and measures it for framing.
 *
 * The measurement is presentation-only: it positions the camera. It is never
 * surfaced as a dimension of the part, because a bounding box in unknown units
 * is not a manufacturing specification.
 */
export async function loadModel(source: ViewerModelSource): Promise<ModelAsset> {
  const loader = LOADERS.find((candidate) => candidate.canLoad(source.format));

  if (!loader) {
    throw new ModelLoadError("This model format cannot be displayed.");
  }

  let object: Object3D;
  try {
    object = await loader.load(source);
  } catch {
    // Loader internals and network detail are not customer-facing.
    throw new ModelLoadError("The model could not be read.");
  }

  const bounds = measureBounds(object);
  return { object, bounds, format: source.format };
}
