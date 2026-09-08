import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Camera,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { loadModel, measureBounds } from "./loaders";
import type {
  ModelAsset,
  ViewerAppearance,
  ViewerBackground,
  ViewerCameraMode,
  ViewerModelSource,
} from "./types";

/**
 * The SADA 3D viewer engine.
 *
 * Plain three.js behind an imperative class rather than a React reconciler.
 * The reason is teardown: a viewer that is mounted and unmounted repeatedly as
 * a customer moves between products must release every GPU resource it took,
 * and owning the renderer directly makes that verifiable rather than implied.
 *
 * Rendering is on demand. There is no permanent animation loop — a frame is
 * drawn when something changes and not otherwise, which keeps an idle viewer at
 * zero GPU cost and leaves nothing running after unmount.
 */

const FOV = 35;
/** Breathing room around the framed model. */
const FRAME_PADDING = 1.35;

const BACKGROUND_COLOR: Record<ViewerBackground, number> = {
  void: 0x050506,
  graphite: 0x0a0b0d,
  light: 0xd7dbe0,
};

export interface ViewerEngineOptions {
  background?: ViewerBackground;
  appearance?: ViewerAppearance;
  cameraMode?: ViewerCameraMode;
  /** Honoured by disabling damping, so no motion continues after input stops. */
  reducedMotion?: boolean;
}

/** Detects WebGL without leaving a context behind. */
export function isWebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    if (!context) return false;
    // Release the probe context immediately.
    const lose = (context as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export class ViewerEngine {
  private readonly container: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly perspective: PerspectiveCamera;
  private readonly orthographic: OrthographicCamera;
  private controls: OrbitControls | null = null;
  private resizeObserver: ResizeObserver | null = null;

  /** Wraps the loaded model so centring never mutates the customer's geometry. */
  private modelRoot: Group | null = null;
  private asset: ModelAsset | null = null;

  private grid: GridHelper | null = null;
  private ground: Mesh | null = null;

  private cameraMode: ViewerCameraMode;
  private appearance: ViewerAppearance;
  private reducedMotion: boolean;

  private frameHandle = 0;
  private disposed = false;
  /** Guards against a slow load resolving after the engine is torn down. */
  private loadToken = 0;

  constructor(container: HTMLElement, options: ViewerEngineOptions = {}) {
    this.container = container;
    this.cameraMode = options.cameraMode ?? "perspective";
    this.appearance = options.appearance ?? { surface: "graphite" };
    this.reducedMotion = options.reducedMotion ?? false;

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    // Capped: beyond 2x the cost outruns the visible gain on dense meshes.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    // Decorative surface: the accessible description lives in the DOM around it.
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.setBackground(options.background ?? "void");

    this.perspective = new PerspectiveCamera(FOV, 1, 0.1, 1000);
    this.orthographic = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);

    this.addLighting();
    this.observeResize();
  }

  /* ---------------------------------------------------------------- *
   * Scene setup
   * ---------------------------------------------------------------- */

  private addLighting(): void {
    // Restrained three-point setup. The rim carries a trace of Titanium Orange
    // as a highlight, never as a wash across the object.
    const key = new DirectionalLight(0xffffff, 2.6);
    key.position.set(1, 1.6, 1);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const fill = new DirectionalLight(0xa9b0b9, 0.7);
    fill.position.set(-1.4, 0.4, 0.9);
    this.scene.add(fill);

    const rim = new DirectionalLight(0xff6b00, 1.1);
    rim.position.set(-0.6, 0.5, -1.4);
    this.scene.add(rim);

    this.scene.add(new AmbientLight(0xffffff, 0.35));
  }

  setBackground(background: ViewerBackground): void {
    this.scene.background = new Color(BACKGROUND_COLOR[background]);
    this.requestRender();
  }

  /* ---------------------------------------------------------------- *
   * Model
   * ---------------------------------------------------------------- */

  /**
   * Loads and frames a model, releasing whatever was shown before.
   *
   * Resolves once the model is on screen. A load that finishes after the
   * engine is disposed, or after a newer load started, is discarded and its
   * resources released rather than attached to a dead scene.
   */
  async setModel(source: ViewerModelSource): Promise<void> {
    const token = ++this.loadToken;
    const asset = await loadModel(source);

    if (this.disposed || token !== this.loadToken) {
      disposeObject(asset.object);
      return;
    }

    this.clearModel();

    /*
     * Up-axis convention.
     *
     * STL is Z-up by convention across CAD; three.js is Y-up. Without this a
     * part that lies flat on a build plate appears standing on its edge. glTF
     * is defined Y-up and OBJ is conventionally Y-up, so neither is touched.
     *
     * This is a display transform on the object in the scene. The file, its
     * geometry and its coordinates are unchanged, and nothing about how the
     * part would be oriented for manufacturing is implied by it.
     */
    if (asset.format === "stl") {
      asset.object.rotation.x = -Math.PI / 2;
      asset.object.updateMatrixWorld(true);
    }

    // Re-measured after orientation so framing and the ground plane use the
    // bounds actually on screen.
    const bounds = measureBounds(asset.object);
    asset.bounds = bounds;

    // Centring happens on a wrapper. The loaded geometry is untouched, so this
    // is presentation only and implies no transformation of the real part.
    const root = new Group();
    root.position.copy(bounds.center).multiplyScalar(-1);
    root.add(asset.object);

    asset.object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.modelRoot = root;
    this.asset = asset;
    this.scene.add(root);

    this.applyAppearance();
    this.addGround(asset);
    this.frameModel();
    this.requestRender();
  }

  private clearModel(): void {
    if (this.modelRoot) {
      this.scene.remove(this.modelRoot);
      disposeObject(this.modelRoot);
      this.modelRoot = null;
    }
    this.asset = null;
    this.removeGround();
  }

  private addGround(asset: ModelAsset): void {
    this.removeGround();

    const span = Math.max(asset.bounds.size.x, asset.bounds.size.z, asset.bounds.radius);
    const floor = -asset.bounds.size.y / 2;

    // Shadow-only plane: the part reads as resting on something without a
    // visible platform competing with it.
    const ground = new Mesh(
      new PlaneGeometry(span * 8, span * 8),
      new ShadowMaterial({ opacity: 0.55 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = floor;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    // Sized to sit under the part rather than fill the frame, and quiet enough
    // that it never competes with the model.
    const grid = new GridHelper(span * 4, 16, 0x262a30, 0x1c1f24);
    grid.position.y = floor;
    this.scene.add(grid);
    this.grid = grid;
  }

  private removeGround(): void {
    if (this.ground) {
      this.scene.remove(this.ground);
      disposeObject(this.ground);
      this.ground = null;
    }
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      disposeMaterial(this.grid.material);
      this.grid = null;
    }
  }

  /* ---------------------------------------------------------------- *
   * Appearance
   * ---------------------------------------------------------------- */

  setAppearance(appearance: ViewerAppearance): void {
    this.appearance = appearance;
    this.applyAppearance();
    this.requestRender();
  }

  private applyAppearance(): void {
    const root = this.modelRoot;
    if (!root) return;

    const { surface, color } = this.appearance;

    // Deliberately conservative: a viewer finish is a presentation choice and
    // must not imply a property of the manufactured part.
    const settings =
      surface === "matte"
        ? { metalness: 0.0, roughness: 0.85 }
        : surface === "polymer"
          ? { metalness: 0.05, roughness: 0.45 }
          : { metalness: 0.65, roughness: 0.35 };

    const base = new Color(color ?? "#8A929C");

    root.traverse((child) => {
      if (!(child instanceof Mesh)) return;

      const material = child.material;
      if (Array.isArray(material)) return;

      if (material instanceof MeshStandardMaterial) {
        material.color.copy(base);
        material.metalness = settings.metalness;
        material.roughness = settings.roughness;
        material.needsUpdate = true;
      }
    });
  }

  /* ---------------------------------------------------------------- *
   * Camera
   * ---------------------------------------------------------------- */

  setCameraMode(mode: ViewerCameraMode): void {
    if (mode === this.cameraMode) return;

    const previous = this.camera;
    this.cameraMode = mode;
    const next = this.camera;

    // Carry the current viewpoint across so switching does not disorient.
    next.position.copy(previous.position);
    next.up.copy(previous.up);

    if (this.controls) {
      this.controls.object = next;
      this.controls.update();
    }

    this.updateProjection();
    this.requestRender();
  }

  get camera(): PerspectiveCamera | OrthographicCamera {
    return this.cameraMode === "perspective" ? this.perspective : this.orthographic;
  }

  /**
   * Frames the model from its measured bounds.
   *
   * Distance derives from the bounding sphere and the field of view, so a
   * 0.4 mm part and an 8 m part both fill the frame identically. Clipping
   * planes scale with the model rather than being fixed.
   */
  frameModel(): void {
    const asset = this.asset;
    if (!asset) return;

    const radius = asset.bounds.radius;
    const distance = (radius / Math.sin((FOV * Math.PI) / 360)) * FRAME_PADDING;

    // A three-quarter view reads as an object rather than an elevation.
    const direction = new Vector3(1, 0.75, 1).normalize();
    const position = direction.multiplyScalar(distance);

    for (const camera of [this.perspective, this.orthographic]) {
      camera.position.copy(position);
      camera.near = Math.max(radius / 1000, 0.001);
      camera.far = distance + radius * 10;
      camera.lookAt(0, 0, 0);
    }

    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      // Keep the model reachable but stop the camera passing through it.
      this.controls.minDistance = radius * 0.4;
      this.controls.maxDistance = distance * 6;
      this.controls.update();
    }

    this.updateProjection();
  }

  /** Restores the camera only. Manufacturing selections are untouched. */
  reset(): void {
    this.frameModel();
    this.requestRender();
  }

  private updateProjection(): void {
    const { width, height } = this.size();
    const aspect = width / Math.max(height, 1);

    this.perspective.aspect = aspect;
    this.perspective.updateProjectionMatrix();

    const radius = this.asset?.bounds.radius ?? 1;
    const half = radius * FRAME_PADDING;
    this.orthographic.left = -half * aspect;
    this.orthographic.right = half * aspect;
    this.orthographic.top = half;
    this.orthographic.bottom = -half;
    this.orthographic.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------------- *
   * Controls
   * ---------------------------------------------------------------- */

  async attachControls(): Promise<void> {
    if (this.disposed || this.controls) return;

    const { OrbitControls } = await import(
      "three/examples/jsm/controls/OrbitControls.js"
    );
    if (this.disposed) return;

    const controls = new OrbitControls(this.camera, this.renderer.domElement);
    // No damping: inertia reads as imprecision on an inspection tool, and it
    // also means no frames are drawn once input stops.
    controls.enableDamping = false;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.8;
    controls.screenSpacePanning = true;
    controls.addEventListener("change", this.requestRender);

    this.controls = controls;
    this.frameModel();
    this.requestRender();
  }

  /* ---------------------------------------------------------------- *
   * Rendering
   * ---------------------------------------------------------------- */

  private size(): { width: number; height: number } {
    const rect = this.container.getBoundingClientRect();
    return {
      width: Math.max(Math.floor(rect.width), 1),
      height: Math.max(Math.floor(rect.height), 1),
    };
  }

  /** Schedules exactly one frame. Repeated calls in a tick coalesce. */
  requestRender = (): void => {
    if (this.disposed || this.frameHandle) return;
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = 0;
      if (this.disposed) return;
      this.renderer.render(this.scene, this.camera as Camera);
    });
  };

  resize(): void {
    if (this.disposed) return;
    const { width, height } = this.size();
    this.renderer.setSize(width, height, false);
    this.updateProjection();
    this.requestRender();
  }

  private observeResize(): void {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  get prefersReducedMotion(): boolean {
    return this.reducedMotion;
  }

  /* ---------------------------------------------------------------- *
   * Teardown
   * ---------------------------------------------------------------- */

  /**
   * Releases everything this engine allocated.
   *
   * Geometries, materials, the shadow map, the resize observer, the pending
   * frame, the controls and the WebGL context itself. After this the canvas is
   * detached and no GPU resource or callback survives.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.controls) {
      this.controls.removeEventListener("change", this.requestRender);
      this.controls.dispose();
      this.controls = null;
    }

    this.clearModel();
    disposeObject(this.scene);

    this.renderer.dispose();
    // Frees the underlying context rather than waiting for collection.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

/* ------------------------------------------------------------------ *
 * Disposal helpers
 * ------------------------------------------------------------------ */

function disposeMaterial(material: Material | Material[]): void {
  const list = Array.isArray(material) ? material : [material];

  for (const entry of list) {
    // Release any texture the material holds before the material itself.
    for (const value of Object.values(entry)) {
      if (value && typeof value === "object" && "isTexture" in value) {
        (value as { dispose: () => void }).dispose();
      }
    }
    entry.dispose();
  }
}

/** Recursively releases geometries, materials and textures under an object. */
export function disposeObject(root: Object3D): void {
  root.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry?.dispose();
      if (child.material) disposeMaterial(child.material);
    }
  });

  root.clear();
}

/** Exposed for the framing tests. */
export function boundingBoxOf(object: Object3D): Box3 {
  return new Box3().setFromObject(object);
}
