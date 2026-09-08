"use client";

import dynamic from "next/dynamic";

import type { Viewer3DProps } from "./Viewer3D";
import styles from "./Viewer3D.module.css";

/**
 * Client-only entry point for the viewer.
 *
 * three.js and the loaders are pulled in on demand and never during server
 * rendering, so the initial HTML is identical with or without WebGL and the
 * 3D bundle is not part of the page payload.
 *
 * Server components render this; the real implementation arrives afterwards.
 */
const Viewer3DImpl = dynamic(
  () => import("./Viewer3D").then((module) => module.Viewer3D),
  {
    ssr: false,
    loading: () => (
      <div className={styles.viewer}>
        <span className={styles.grid} aria-hidden="true" />
        <div className={styles.overlay} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <p className={styles.overlayTitle}>Preparing model</p>
        </div>
      </div>
    ),
  },
);

export function Viewer3DLazy(props: Viewer3DProps) {
  return <Viewer3DImpl {...props} />;
}
