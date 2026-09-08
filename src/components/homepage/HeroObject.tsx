"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

import styles from "./HeroObject.module.css";

/**
 * Layer profile, bottom to top, as a percentage of the object's footprint.
 *
 * A base flange tapering to a boss. The profile only ever narrows: a
 * wide-narrow-wide silhouette makes the stack read as separate floating plates
 * rather than as one machined part.
 */
const PROFILE = [
  100, 100, 100, 98, 94, 90, 86, 83, 80, 78, 76, 75, 74, 73,
  72, 71, 70, 68, 66, 63, 60, 56, 52, 48, 44, 40, 36, 32,
] as const;

/** Layers below this index are printed; the rest are still only data. */
const PRINTED = 17;

/**
 * Layer pitch. Kept below the apparent thickness of a layer so the printed
 * section reads as solid material instead of a stack with gaps between it.
 */
const LAYER_HEIGHT = 6;

export function HeroObject() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Pointer parallax is a desktop refinement. Coarse pointers and anyone who
    // asked for reduced motion get the static composition.
    const fine = window.matchMedia("(pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || still.matches) return;

    let frame = 0;

    function onPointerMove(event: PointerEvent) {
      if (frame) return;

      frame = requestAnimationFrame(() => {
        frame = 0;
        const element = sceneRef.current;
        if (!element) return;

        const box = element.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;

        // Deliberately shallow. The object should acknowledge the cursor, not
        // follow it.
        element.style.setProperty("--tilt-x", `${(-y * 8).toFixed(2)}deg`);
        element.style.setProperty("--tilt-z", `${(x * 10).toFixed(2)}deg`);
      });
    }

    function onPointerLeave() {
      const element = sceneRef.current;
      if (!element) return;
      element.style.setProperty("--tilt-x", "0deg");
      element.style.setProperty("--tilt-z", "0deg");
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div className={styles.scene} ref={sceneRef}>
      {/* The object is decorative; this is what it represents. */}
      <p className="u-visually-hidden">
        An illustration of a part being manufactured: the lower half is printed
        solid metal, the upper half is still unprinted geometry shown as orange
        outlines, and a bright plane marks the current print height.
      </p>

      <div className={styles.stage} aria-hidden="true">
        <div className={styles.spin}>
          <div className={styles.plate} />

          {PROFILE.map((width, index) => {
            const printed = index < PRINTED;
            const head = index === PRINTED;
            const crown = index === PRINTED - 1;

            // Unprinted layers fade out with height.
            const ghostAlpha =
              0.55 - ((index - PRINTED) / (PROFILE.length - PRINTED)) * 0.4;

            return (
              <div
                key={index}
                className={clsx(
                  styles.layer,
                  printed && styles.solid,
                  crown && styles.crown,
                  head && styles.head,
                  !printed && !head && styles.ghost,
                )}
                style={
                  {
                    "--w": `${width}%`,
                    "--z": `${index * LAYER_HEIGHT}px`,
                    "--ghost-alpha": ghostAlpha.toFixed(2),
                  } as React.CSSProperties
                }
              />
            );
          })}
        </div>
      </div>

      <span className={clsx(styles.annotation, styles.digital)} aria-hidden="true">
        Digital
        <span className={styles.annotationRule} />
      </span>

      <span className={clsx(styles.annotation, styles.physical)} aria-hidden="true">
        <span className={styles.annotationRule} />
        Physical
      </span>
    </div>
  );
}
