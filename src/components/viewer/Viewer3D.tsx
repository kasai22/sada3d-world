"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import clsx from "clsx";

import { Button, Icon, IconButton } from "@/components/core";
import { ViewerEngine, isWebGLAvailable } from "@/lib/viewer/engine";
import type {
  ViewerAppearance,
  ViewerBackground,
  ViewerCameraMode,
  ViewerComponentInfo,
  ViewerModelSource,
  ViewerStatus,
} from "@/lib/viewer/types";
import { ExplodeControl } from "./ExplodeControl";
import styles from "./Viewer3D.module.css";

export interface Viewer3DProps {
  /** Null shows the empty state rather than starting a WebGL context. */
  source: ViewerModelSource | null;
  /**
   * What the viewer is showing, for assistive technology. The canvas itself is
   * aria-hidden, so this is the accessible equivalent.
   */
  description: string;
  /** Replaces the generic empty text, e.g. why a STEP file cannot be shown. */
  notice?: string;
  appearance?: ViewerAppearance;
  background?: ViewerBackground;
  /** Technical readout along the bottom edge. */
  footer?: ReactNode;
  className?: string;
}

/** Beyond this, labels stop helping and start covering the model. */
const MAX_LABELS = 8;
/** Pointer travel above which a press was an orbit, not a selection. */
const TAP_SLOP = 6;
/** Space two labels need before they read as two labels. */
const LABEL_CLEARANCE_X = 110;
const LABEL_CLEARANCE_Y = 22;

/**
 * The Reality 3D viewer.
 *
 * A thin React boundary over the engine: this component owns mounting,
 * teardown and the surrounding controls, and the engine owns everything on the
 * GPU. It renders nothing on the server and starts no WebGL context until a
 * model actually exists.
 *
 * The exploded view is a capability of this viewer, not a second viewer. When
 * the loaded model declares components the controls appear; when it does not,
 * they are absent rather than present and dead.
 */
export function Viewer3D({
  source,
  description,
  notice,
  appearance,
  background = "void",
  footer,
  className,
}: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ViewerEngine | null>(null);

  const [status, setStatus] = useState<ViewerStatus>(source ? "loading" : "empty");
  const [cameraMode, setCameraMode] = useState<ViewerCameraMode>("perspective");
  const [fullscreen, setFullscreen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [components, setComponents] = useState<readonly ViewerComponentInfo[]>([]);
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const canFullscreen =
    typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

  // Primitives, so appearance changes re-apply on value rather than identity.
  const surface = appearance?.surface;
  const color = appearance?.color;

  const explodable = components.length > 0;

  /**
   * Moves the labels to follow the model.
   *
   * Called by the engine after each frame it draws, so it runs during an orbit
   * or an explode transition and not at all while the viewer is idle. It writes
   * transforms on nodes React already rendered rather than re-rendering, which
   * keeps a 60fps orbit out of the React scheduler entirely.
   */
  const syncLabels = useCallback(() => {
    const layer = labelLayerRef.current;
    const engine = engineRef.current;
    if (!layer || !engine) return;

    const positions = engine.projectComponents();
    /*
     * Parts that sit behind one another project to nearly the same point, and
     * two labels on the same pixel are worse than one. Later labels are pushed
     * down until they clear the ones already placed — in scene order, so the
     * arrangement is the same every time rather than depending on which frame
     * happened to run first.
     */
    const placed: Array<{ x: number; y: number }> = [];

    for (const node of layer.querySelectorAll<HTMLElement>("[data-component]")) {
      const found = positions.find((entry) => entry.id === node.dataset.component);
      if (!found || !found.visible) {
        node.style.opacity = "0";
        continue;
      }

      let y = found.y;
      while (
        placed.some(
          (other) =>
            Math.abs(other.x - found.x) < LABEL_CLEARANCE_X &&
            Math.abs(other.y - y) < LABEL_CLEARANCE_Y,
        )
      ) {
        y += LABEL_CLEARANCE_Y;
      }
      placed.push({ x: found.x, y });

      node.style.opacity = "1";
      node.style.transform = `translate(${found.x}px, ${y}px) translate(-50%, -50%)`;
    }
  }, []);

  /*
   * The engine is created once a model exists and destroyed when it does not.
   * An empty viewer therefore holds no WebGL context at all, which matters on
   * pages showing several placeholders.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- status mirrors the
     engine's lifecycle, which is an external system; there is no render-time
     value to derive it from. */
  useEffect(() => {
    const host = canvasRef.current;

    // A new model inherits nothing from the last one.
    setComponents([]);
    setExplodeAmount(0);
    setSelected(null);
    setPanelOpen(false);

    if (!host || !source) {
      setStatus("empty");
      return;
    }

    if (!isWebGLAvailable()) {
      setStatus("unsupported");
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const engine = new ViewerEngine(host, {
      background,
      appearance,
      reducedMotion,
    });
    engineRef.current = engine;
    engine.onAfterRender = syncLabels;

    let cancelled = false;
    setStatus("loading");

    void engine
      .attachControls()
      .then(() => engine.setModel(source))
      .then(() => {
        if (cancelled) return;
        // Discovery happens once, when the model loads. Nothing re-traverses
        // the scene per frame.
        setComponents(engine.capabilities.explode ? engine.componentInfo : []);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      // Releases geometries, materials, textures, controls, the resize
      // observer, the pending frame, any explode transition and the WebGL
      // context.
      engine.dispose();
      engineRef.current = null;
    };
    // `attempt` re-runs the whole setup for the retry action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.url, source?.format, attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Presentation changes do not rebuild the scene.
  useEffect(() => {
    if (surface) engineRef.current?.setAppearance({ surface, color });
  }, [surface, color]);

  useEffect(() => {
    engineRef.current?.setBackground(background);
  }, [background]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const onReset = useCallback(() => engineRef.current?.reset(), []);

  const onToggleCamera = useCallback(() => {
    const next = cameraMode === "perspective" ? "orthographic" : "perspective";
    engineRef.current?.setCameraMode(next);
    setCameraMode(next);
  }, [cameraMode]);

  const onToggleFullscreen = useCallback(async () => {
    const element = containerRef.current;
    if (!element) return;

    try {
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else await element.requestFullscreen();
    } catch {
      // A browser refusing fullscreen is not an error worth surfacing.
    }
  }, []);

  /* ---- exploded view ---- */

  const onAmountChange = useCallback(
    (amount: number, options?: { animate?: boolean }) => {
      engineRef.current?.setExplodeAmount(amount, options);
      setExplodeAmount(amount);
    },
    [],
  );

  const onSelect = useCallback((id: string | null) => {
    engineRef.current?.selectComponent(id);
    setSelected(id);
  }, []);

  const onFrameAssembly = useCallback(() => engineRef.current?.frameAssembly(), []);

  /**
   * Closing the controls returns the model to assembled.
   *
   * Leaving a separated assembly on screen with no visible way to put it back
   * would be a trap; the state and the control appear and disappear together.
   */
  const onToggleExplodePanel = useCallback(() => {
    setPanelOpen((open) => {
      if (open) {
        engineRef.current?.setExplodeAmount(0, { animate: true });
        engineRef.current?.selectComponent(null);
        setExplodeAmount(0);
        setSelected(null);
      }
      return !open;
    });
  }, []);

  /* ---- picking ---- */

  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const hoverFrame = useRef(0);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pressRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const press = pressRef.current;
      pressRef.current = null;
      if (!press || !panelOpen) return;

      // An orbit ends in a pointerup too. Only a press that stayed put is a
      // selection.
      const travel = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (travel > TAP_SLOP) return;

      const hit = engineRef.current?.componentAt(event.clientX, event.clientY) ?? null;
      onSelect(hit);
    },
    [panelOpen, onSelect],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const engine = engineRef.current;
      if (!engine || !panelOpen || hoverFrame.current) return;
      // Hover is a hint. One raycast per frame at most, and none on touch,
      // where there is no hover to speak of.
      if (event.pointerType !== "mouse") return;

      const { clientX, clientY } = event;
      hoverFrame.current = requestAnimationFrame(() => {
        hoverFrame.current = 0;
        engineRef.current?.hoverComponent(
          engineRef.current.componentAt(clientX, clientY),
        );
      });
    },
    [panelOpen],
  );

  const onPointerLeave = useCallback(() => {
    engineRef.current?.hoverComponent(null);
  }, []);

  useEffect(
    () => () => {
      if (hoverFrame.current) cancelAnimationFrame(hoverFrame.current);
    },
    [],
  );

  /** Escape steps back out of a selection before anything else handles it. */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && selected) {
        event.stopPropagation();
        onSelect(null);
      }
    },
    [selected, onSelect],
  );

  /* ---- labels ---- */

  const labels = useMemo(() => {
    if (explodeAmount <= 0) return [];
    // Only names the file actually carries. A generated "Part 3" is a position
    // in a list, not a name, and labelling the model with it teaches nothing.
    return components.filter((component) => component.named).slice(0, MAX_LABELS);
  }, [components, explodeAmount]);

  // Labels that have just appeared have no position yet.
  useEffect(() => {
    if (labels.length > 0) syncLabels();
  }, [labels, syncLabels]);

  const interactive = status === "ready";
  const percent = Math.round(explodeAmount * 100);
  const selectedName = components.find((entry) => entry.id === selected)?.name;

  return (
    <div
      ref={containerRef}
      className={clsx(styles.viewer, panelOpen && styles.withPanel, className)}
      onKeyDown={onKeyDown}
    >
      {/* Accessible equivalent of the canvas. */}
      <p className="u-visually-hidden">{description}</p>

      <div
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      />

      {!interactive && <span className={styles.grid} aria-hidden="true" />}

      <span className={clsx(styles.tick, styles.tickTL)} aria-hidden="true" />
      <span className={clsx(styles.tick, styles.tickTR)} aria-hidden="true" />
      <span className={clsx(styles.tick, styles.tickBR)} aria-hidden="true" />
      <span className={clsx(styles.tick, styles.tickBL)} aria-hidden="true" />

      {/* Positions are written imperatively after each frame. */}
      <div ref={labelLayerRef} className={styles.labels} aria-hidden="true">
        {labels.map((component) => (
          <span
            key={component.id}
            data-component={component.id}
            className={clsx(
              styles.label,
              component.id === selected && styles.labelSelected,
            )}
          >
            {component.name}
          </span>
        ))}
      </div>

      {interactive && (
        <div className={styles.toolbar}>
          <span className={styles.mode}>
            {cameraMode === "perspective" ? "Persp" : "Ortho"}
          </span>
          <IconButton
            icon="reset"
            label="Reset 3D view"
            size="sm"
            onClick={onReset}
          />
          <IconButton
            icon="crosshair"
            label={
              cameraMode === "perspective"
                ? "Switch to orthographic camera"
                : "Switch to perspective camera"
            }
            size="sm"
            active={cameraMode === "orthographic"}
            onClick={onToggleCamera}
          />
          {explodable && (
            <IconButton
              icon="layers"
              label={panelOpen ? "Hide exploded view" : "Show exploded view"}
              size="sm"
              active={panelOpen}
              onClick={onToggleExplodePanel}
            />
          )}
          {canFullscreen && (
            <IconButton
              icon={fullscreen ? "x" : "maximize"}
              label={fullscreen ? "Exit fullscreen" : "View fullscreen"}
              size="sm"
              onClick={onToggleFullscreen}
            />
          )}
        </div>
      )}

      {interactive && !explodable && (
        /*
         * Stated rather than implied. A model with one mesh has no components
         * to separate, and saying so is more use than an inert button.
         */
        <span className={styles.capability}>
          Single mesh
          <span className="u-visually-hidden">
            . Exploded view unavailable: this model does not contain multiple
            components.
          </span>
        </span>
      )}

      {interactive && explodable && panelOpen && (
        <ExplodeControl
          amount={explodeAmount}
          onAmountChange={onAmountChange}
          components={components}
          selected={selected}
          onSelect={onSelect}
          onFrameAssembly={onFrameAssembly}
        />
      )}

      {explodable && (
        <p className="u-visually-hidden" role="status" aria-live="polite">
          {panelOpen
            ? `Exploded view ${percent === 0 ? "assembled" : `enabled, ${percent} percent`}.${
                selectedName ? ` Selected component ${selectedName}.` : ""
              }`
            : "Exploded view available."}
        </p>
      )}

      {status === "loading" && (
        <div className={styles.overlay} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <p className={styles.overlayTitle}>Preparing model</p>
        </div>
      )}

      {status === "empty" && (
        <div className={styles.overlay}>
          <span className={styles.overlayGlyph} aria-hidden="true">
            <Icon name="box" size={28} />
          </span>
          <p className={styles.overlayTitle}>Model view</p>
          <p className={styles.overlayBody}>
            {notice ?? "3D model not available."}
          </p>
        </div>
      )}

      {status === "unsupported" && (
        <div className={styles.overlay}>
          <span className={styles.overlayGlyph} aria-hidden="true">
            <Icon name="alert" size={28} />
          </span>
          <p className={styles.overlayTitle}>3D view unavailable</p>
          <p className={styles.overlayBody}>
            This device could not start a 3D view.
          </p>
        </div>
      )}

      {status === "error" && (
        <div className={clsx(styles.overlay, styles.overlayInteractive)} role="alert">
          <span className={styles.overlayGlyph} aria-hidden="true">
            <Icon name="error" size={28} />
          </span>
          <p className={styles.overlayTitle}>Model could not be displayed</p>
          <p className={styles.overlayBody}>
            Check the model file or try again.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      )}

      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
