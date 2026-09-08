import { Box3, Mesh, Object3D, Sphere, Vector3 } from "three";

import type { AssemblyBounds, ViewerComponent } from "./types";

/**
 * Component discovery.
 *
 * An exploded view is only meaningful when the model actually declares
 * components. This module reads the structure the file already contains — it
 * never manufactures one.
 *
 * What counts as a component: a child of the assembly root that carries
 * geometry. Nothing else. Triangles are not components, geometry groups are not
 * components, and a single mesh is a single component, which is to say no
 * assembly at all.
 *
 * STL is the case that matters in practice. It is a flat triangle list with no
 * hierarchy, so an STL almost always yields one component and reports exploded
 * view as unavailable. Inferring parts from its triangles would be inventing
 * manufacturing structure that the file does not contain.
 */

/** Below two components there is nothing to explode. */
const MIN_COMPONENTS = 2;

/**
 * Above this the model is a mesh soup rather than a readable assembly, and
 * per-component transforms and labels stop being useful.
 */
const MAX_COMPONENTS = 200;

/** True when the object or any descendant carries drawable geometry. */
function hasGeometry(object: Object3D): boolean {
  let found = false;
  object.traverse((child) => {
    if (found) return;
    if (child instanceof Mesh && child.geometry) found = true;
  });
  return found;
}

/**
 * Descends through wrapper nodes to the object whose children are the parts.
 *
 * Exporters commonly nest a scene inside one or more transform-only groups. The
 * children of those wrappers are not parts, so the wrapper is skipped until a
 * node with real structure — or geometry of its own — is reached.
 */
function resolveAssemblyRoot(root: Object3D): Object3D {
  let node = root;

  while (
    !(node instanceof Mesh) &&
    node.children.length === 1 &&
    node.children[0] !== undefined
  ) {
    const only = node.children[0];
    if (only instanceof Mesh) break;
    node = only;
  }

  return node;
}

/**
 * The file's own name, made readable.
 *
 * glTF exporters replace spaces in node names with underscores, so a part
 * authored as "Sun Gear" arrives as "Sun_Gear". Putting the space back is a
 * rendering choice about the same name — no word is added, removed or guessed.
 * Hyphens are left alone because they are frequently part of a real part name.
 */
function displayName(raw: string): string {
  return raw.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

/** Lowercased, punctuation-free form of a name, for use in an identifier. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Discovers the components of a loaded model.
 *
 * Returns an empty list when the model is a single mesh or has no declared
 * structure. Callers treat that as "exploded view unavailable" rather than as
 * an error: the viewer works exactly as before.
 *
 * Identifiers are derived from scene order and the file's own names, so they
 * are stable across loads. Nothing depends on object identity or load order.
 */
export function discoverComponents(root: Object3D): ViewerComponent[] {
  const assemblyRoot = resolveAssemblyRoot(root);

  if (assemblyRoot instanceof Mesh) return [];

  const candidates = assemblyRoot.children.filter(hasGeometry);
  if (candidates.length < MIN_COMPONENTS || candidates.length > MAX_COMPONENTS) {
    return [];
  }

  // Bounds are measured in world space, then expressed in the assembly root's
  // local space — the space each component's own position lives in. Doing it
  // this way keeps the transform correct however the assembly is nested.
  assemblyRoot.updateMatrixWorld(true);
  const toLocal = assemblyRoot.matrixWorld.clone().invert();

  const components: ViewerComponent[] = [];

  candidates.forEach((object, index) => {
    const box = new Box3().setFromObject(object).applyMatrix4(toLocal);
    if (box.isEmpty()) return;

    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);

    const sphere = new Sphere();
    box.getBoundingSphere(sphere);

    const raw = object.name.trim();
    const named = raw.length > 0;
    const name = named ? displayName(raw) : `Part ${index + 1}`;

    components.push({
      id: `assembly/${index}-${slug(name) || "part"}`,
      object,
      name,
      type: object instanceof Mesh ? "mesh" : "group",
      named,
      index,
      center,
      size,
      radius: Number.isFinite(sphere.radius) ? sphere.radius : 0,
      // The transform the file gave this part. Explosion is measured from here
      // and returns to it exactly.
      rest: {
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
      },
    });
  });

  return components.length >= MIN_COMPONENTS ? components : [];
}

/**
 * Measures the assembly the components belong to, at rest.
 *
 * Used only to place the camera and to scale explosion distance. It is not a
 * dimension of the part and is never presented as one.
 */
export function measureAssembly(components: readonly ViewerComponent[]): AssemblyBounds {
  const box = new Box3();

  for (const component of components) {
    const half = component.size.clone().multiplyScalar(0.5);
    box.expandByPoint(component.center.clone().sub(half));
    box.expandByPoint(component.center.clone().add(half));
  }

  const center = new Vector3();
  box.getCenter(center);

  const sphere = new Sphere();
  box.getBoundingSphere(sphere);

  return {
    center,
    radius: Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 1,
  };
}

/**
 * Walks up from a hit object to the component that owns it.
 *
 * Ray hits land on meshes; selection is about parts.
 */
export function componentForObject(
  hit: Object3D,
  components: readonly ViewerComponent[],
): ViewerComponent | undefined {
  let node: Object3D | null = hit;

  while (node) {
    const match = components.find((component) => component.object === node);
    if (match) return match;
    node = node.parent;
  }

  return undefined;
}
