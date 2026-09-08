"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

import { Button, Icon, IconButton } from "@/components/core";
import { ViewerEngine, isWebGLAvailable } from "@/lib/viewer/engine";
import type {
  ViewerAppearance,
  ViewerBackground,
  ViewerCameraMode,
  ViewerModelSource,
  ViewerStatus,
} from "@/lib/viewer/types";
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

/**
 * The SADA 3D viewer.
 *
 * A thin React boundary over the engine: this component owns mounting,
 * teardown and the surrounding controls, and the engine owns everything on the
 * GPU. It renders nothing on the server and starts no WebGL context until a
 * model actually exists.
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
  const engineRef = useRef<ViewerEngine | null>(null);

  const [status, setStatus] = useState<ViewerStatus>(source ? "loading" : "empty");
  const [cameraMode, setCameraMode] = useState<ViewerCameraMode>("perspective");
  const [fullscreen, setFullscreen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const canFullscreen =
    typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

  // Primitives, so appearance changes re-apply on value rather than identity.
  const surface = appearance?.surface;
  const color = appearance?.color;

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

    let cancelled = false;
    setStatus("loading");

    void engine
      .attachControls()
      .then(() => engine.setModel(source))
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      // Releases geometries, materials, textures, controls, the resize
      // observer, the pending frame and the WebGL context.
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

  const interactive = status === "ready";

  return (
    <div ref={containerRef} className={clsx(styles.viewer, className)}>
      {/* Accessible equivalent of the canvas. */}
      <p className="u-visually-hidden">{description}</p>

      <div ref={canvasRef} className={styles.canvas} />

      {!interactive && <span className={styles.grid} aria-hidden="true" />}

      <span className={clsx(styles.tick, styles.tickTL)} aria-hidden="true" />
      <span className={clsx(styles.tick, styles.tickTR)} aria-hidden="true" />
      <span className={clsx(styles.tick, styles.tickBR)} aria-hidden="true" />
      <span className={clsx(styles.tick, styles.tickBL)} aria-hidden="true" />

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
