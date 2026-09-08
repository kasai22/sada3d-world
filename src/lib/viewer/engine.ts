import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Box3Helper,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  LineBasicMaterial,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  ShadowMaterial,
  Sphere,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Camera,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { componentForObject, discoverComponents, measureAssembly } from "./components";
import {
  EXPLODE_DURATION_MS,
  calculateExplosionTransform,
  easeInOutCubic,
} from "./explode";
import { loadModel, measureBounds } from "./loaders";
import type {
  AssemblyBounds,
  ModelAsset,
  ViewerAppearance,
  ViewerBackground,
  ViewerCameraMode,
  ViewerCapabilities,
  ViewerComponent,
  ViewerComponentInfo,
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

/** Titanium Orange, rationed to one thing at a time: the selected component. */
const SELECTION_COLOR = 0xff6b00;
/** Hover is a hint, not a decision, so it reads in the neutral scale. */
const HOVER_COLOR = 0x8a929c;

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

  /** Radius the camera was last framed against — rest bounds, or exploded. */
  private frameRadius = 1;

  private frameHandle = 0;
  private disposed = false;
  /** Guards against a slow load resolving after the engine is torn down. */
  private loadToken = 0;

  /* ---- exploded view ---- */

  private components: ViewerComponent[] = [];
  private assembly: AssemblyBounds | null = null;
  private explodeAmountValue = 0;
  private explodeAnimation = 0;
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private selectionHelper: Box3Helper | null = null;
  private hoverHelper: Box3Helper | null = null;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();

  /**
   * Called after every frame the engine draws.
   *
   * The label layer uses this to follow the model. It fires only when a frame
   * is actually rendered, so an idle viewer calls nothing.
   */
  onAfterRender: (() => void) | null = null;

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

    this.discoverAssembly();
    this.applyAppearance();
    this.addGround(asset);
    this.frameModel();
    this.requestRender();
  }

  private clearModel(): void {
    // Component state belongs to one model. Nothing survives a replacement:
    // no transforms, no selection, no explode amount, no pending animation.
    this.cancelExplodeAnimation();
    this.components = [];
    this.assembly = null;
    this.explodeAmountValue = 0;
    this.selectedId = null;
    this.hoveredId = null;
    this.removeHelper("selection");
    this.removeHelper("hover");

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
   * Exploded view
   *
   * Transform strategy
   * ------------------
   * Components are the children of the assembly root, so no component is a
   * descendant of another. A parent transform can therefore never be applied
   * twice: each component's position is written once from its own recorded
   * rest position, and anything nested inside a component moves with it
   * because that is what a child transform does.
   *
   * Nothing is accumulated. Every update assigns an absolute position derived
   * from the rest transform and the current amount, so scrubbing back and
   * forth cannot drift, and amount 0 restores the file's own transform exactly.
   * ---------------------------------------------------------------- */

  /**
   * Reads the structure of the loaded model.
   *
   * A failure here is not a viewer failure. If the scene cannot be analysed the
   * model still displays; only the exploded view goes away.
   */
  private discoverAssembly(): void {
    const asset = this.asset;
    if (!asset) return;

    try {
      const components = discoverComponents(asset.object);
      if (components.length === 0) return;

      this.components = components;
      this.assembly = measureAssembly(components);
    } catch {
      this.components = [];
      this.assembly = null;
    }
  }

  get capabilities(): ViewerCapabilities {
    return { explode: this.components.length > 0 && this.assembly !== null };
  }

  /** The components as the UI names them — no three.js objects cross this line. */
  get componentInfo(): ViewerComponentInfo[] {
    return this.components.map(({ id, name, type, named, index }) => ({
      id,
      name,
      type,
      named,
      index,
    }));
  }

  get explodeAmount(): number {
    return this.explodeAmountValue;
  }

  /**
   * Moves the assembly to an explode amount between 0 and 1.
   *
   * Scrubbing applies immediately — direct manipulation should not lag behind
   * the hand. The assembled/exploded toggle animates, unless the viewer is in
   * reduced motion, in which case it also applies immediately.
   */
  setExplodeAmount(amount: number, options: { animate?: boolean } = {}): void {
    if (!this.capabilities.explode) return;

    const target = Math.min(Math.max(amount, 0), 1);
    this.cancelExplodeAnimation();

    if (!options.animate || this.reducedMotion) {
      this.applyExplode(target);
      this.requestRender();
      return;
    }

    const from = this.explodeAmountValue;
    if (from === target) return;

    const start = performance.now();

    // A self-scheduling loop that exists only while the transition does. When
    // it ends nothing keeps requesting frames, so the on-demand model holds.
    const step = (now: number): void => {
      if (this.disposed) return;
      const t = Math.min((now - start) / EXPLODE_DURATION_MS, 1);
      this.applyExplode(from + (target - from) * easeInOutCubic(t));
      this.renderNow();

      if (t < 1) this.explodeAnimation = requestAnimationFrame(step);
      else this.explodeAnimation = 0;
    };

    this.explodeAnimation = requestAnimationFrame(step);
  }

  private cancelExplodeAnimation(): void {
    if (this.explodeAnimation) cancelAnimationFrame(this.explodeAnimation);
    this.explodeAnimation = 0;
  }

  /** Writes every component's position for the given amount. */
  private applyExplode(amount: number): void {
    const assembly = this.assembly;
    if (!assembly) return;

    this.explodeAmountValue = amount;

    for (const component of this.components) {
      const { position } = calculateExplosionTransform(component, assembly, amount);
      component.object.position.copy(position);
    }

    // The build plate is a reference for the assembled part. Once the parts
    // leave it, it is no longer telling the truth about anything, so it goes.
    const grounded = amount === 0;
    if (this.ground) this.ground.visible = grounded;
    if (this.grid) this.grid.visible = grounded;

    this.updateHelpers();
  }

  /* ---- selection ---- */

  get selectedComponent(): string | null {
    return this.selectedId;
  }

  selectComponent(id: string | null): void {
    if (id !== null && !this.components.some((c) => c.id === id)) return;
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.updateHelpers();
    this.requestRender();
  }

  hoverComponent(id: string | null): void {
    if (this.hoveredId === id) return;
    this.hoveredId = id;
    this.updateHelpers();
    this.requestRender();
  }

  /**
   * The component under a pointer, or null.
   *
   * Returns an identifier rather than an object: the UI works in identifiers,
   * which stay valid across re-renders and never leak the scene graph.
   */
  componentAt(clientX: number, clientY: number): string | null {
    if (!this.modelRoot || this.components.length === 0) return null;

    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera as Camera);

    const hit = this.raycaster.intersectObject(this.modelRoot, true)[0];
    if (!hit) return null;

    return componentForObject(hit.object, this.components)?.id ?? null;
  }

  /**
   * Draws the selection and hover outlines.
   *
   * Outlines rather than material changes: materials are frequently shared
   * between parts in a glTF file, so tinting one component would tint its
   * siblings. A wireframe box touches nothing and disposes cleanly.
   */
  private updateHelpers(): void {
    for (const [kind, id] of [
      ["selection", this.selectedId],
      ["hover", this.hoveredId === this.selectedId ? null : this.hoveredId],
    ] as const) {
      const component = id
        ? this.components.find((candidate) => candidate.id === id)
        : undefined;

      if (!component) {
        this.removeHelper(kind);
        continue;
      }

      const box = new Box3().setFromObject(component.object);
      const existing = kind === "selection" ? this.selectionHelper : this.hoverHelper;

      if (existing) {
        existing.box.copy(box);
        existing.updateMatrixWorld(true);
        continue;
      }

      const helper = new Box3Helper(
        box,
        new Color(kind === "selection" ? SELECTION_COLOR : HOVER_COLOR),
      );
      // Drawn over the part so the outline stays readable from any angle.
      const material = helper.material as LineBasicMaterial;
      material.depthTest = false;
      material.transparent = true;
      material.opacity = kind === "selection" ? 0.95 : 0.45;
      helper.renderOrder = 2;

      this.scene.add(helper);
      if (kind === "selection") this.selectionHelper = helper;
      else this.hoverHelper = helper;
    }
  }

  private removeHelper(kind: "selection" | "hover"): void {
    const helper = kind === "selection" ? this.selectionHelper : this.hoverHelper;
    if (!helper) return;

    this.scene.remove(helper);
    helper.geometry.dispose();
    disposeMaterial(helper.material);

    if (kind === "selection") this.selectionHelper = null;
    else this.hoverHelper = null;
  }

  /**
   * Screen positions for component labels.
   *
   * Projected in the viewer's own pixel space so the label layer can place DOM
   * elements over the canvas. Components behind the camera are reported as not
   * visible rather than wrapped around to the far edge.
   */
  projectComponents(): Array<{ id: string; x: number; y: number; visible: boolean }> {
    const { width, height } = this.size();
    const camera = this.camera;
    const center = new Vector3();
    const box = new Box3();

    return this.components.map((component) => {
      box.setFromObject(component.object);
      box.getCenter(center);
      const projected = center.clone().project(camera);
      const visible =
        projected.z < 1 &&
        projected.x >= -1 &&
        projected.x <= 1 &&
        projected.y >= -1 &&
        projected.y <= 1;

      return {
        id: component.id,
        x: ((projected.x + 1) / 2) * width,
        y: ((1 - projected.y) / 2) * height,
        visible,
      };
    });
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

    this.frameRadius = radius;
    this.updateProjection();
  }

  /**
   * Frames everything currently on screen, including separated components.
   *
   * The rest bounding box is deliberately not reused: once parts have moved it
   * no longer contains them, and framing from it would clip the assembly.
   */
  frameAssembly(): void {
    const root = this.modelRoot;
    if (!root) {
      this.frameModel();
      return;
    }

    const box = new Box3().setFromObject(root);
    if (box.isEmpty()) return;

    const center = new Vector3();
    box.getCenter(center);
    const sphere = new Sphere();
    box.getBoundingSphere(sphere);

    const radius = Number.isFinite(sphere.radius) && sphere.radius > 0
      ? sphere.radius
      : (this.asset?.bounds.radius ?? 1);
    const distance = (radius / Math.sin((FOV * Math.PI) / 360)) * FRAME_PADDING;

    const direction = new Vector3(1, 0.75, 1).normalize();
    const position = direction.multiplyScalar(distance).add(center);

    for (const camera of [this.perspective, this.orthographic]) {
      camera.position.copy(position);
      camera.near = Math.max(radius / 1000, 0.001);
      camera.far = distance + radius * 10;
      camera.lookAt(center);
    }

    if (this.controls) {
      this.controls.target.copy(center);
      this.controls.minDistance = radius * 0.4;
      this.controls.maxDistance = distance * 6;
      this.controls.update();
    }

    this.frameRadius = radius;
    this.updateProjection();
    this.requestRender();
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

    const half = this.frameRadius * FRAME_PADDING;
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
      this.renderNow();
    });
  };

  /**
   * Draws immediately.
   *
   * Used by the explode transition, which is already inside a frame callback
   * and would otherwise wait a further frame to appear.
   */
  private renderNow(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera as Camera);
    this.onAfterRender?.();
  }

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
    // An explode transition in flight would otherwise keep asking for frames.
    this.cancelExplodeAnimation();
    this.onAfterRender = null;

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
