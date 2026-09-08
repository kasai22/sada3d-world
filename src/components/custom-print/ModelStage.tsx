import type { CSSProperties } from "react";
import clsx from "clsx";

import { Button, Icon } from "@/components/core";
import { SpecTable, type SpecRow } from "@/components/structure";
import { formatBytes } from "@/lib/custom-print/inspect";
import type { UploadedModel } from "@/lib/custom-print/types";
import styles from "./ModelStage.module.css";

export interface ModelStageProps {
  model: UploadedModel;
  /** Replace the current model with a different file. */
  onReplace?: () => void;
  onRemove?: () => void;
  className?: string;
}

/**
 * The model stage — the Phase 9 seam.
 *
 * The workflow hands this an UploadedModel and gets back a stage. Phase 9
 * replaces what is drawn inside without touching the workflow, because nothing
 * outside this component knows how the model is rendered.
 *
 * The summary below the stage reports only facts read from the file itself.
 * Volume, weight, bounding box and print time are absent because they cannot be
 * derived without parsing full geometry, and inventing them would misrepresent
 * a manufacturing specification.
 */
export function ModelStage({
  model,
  onReplace,
  onRemove,
  className,
}: ModelStageProps) {
  const { inspection } = model;

  const rows: SpecRow[] = [
    { label: "Format", value: inspection.formatLabel },
    { label: "Size", value: formatBytes(model.sizeBytes) },
  ];

  // Only binary STL states a triangle count that the file length can confirm.
  if (inspection.triangles !== undefined) {
    rows.push({
      label: "Triangles",
      value: inspection.triangles.toLocaleString("en-IN"),
    });
  }

  if (inspection.structureValid !== undefined) {
    rows.push({
      label: "File structure",
      value: inspection.structureValid ? "Consistent" : "Mismatched",
    });
  }

  return (
    <div className={className}>
      <div className={styles.stage}>
        <span className={styles.grid} aria-hidden="true" />

        <span className={styles.object} aria-hidden="true">
          {[0, 6, 12, 18, 24, 30].map((z, index, all) => (
            <span
              key={z}
              className={clsx(styles.face, index === all.length - 1 && styles.faceTop)}
              style={{ "--z": `${z}px` } as CSSProperties}
            />
          ))}
        </span>

        <span className={clsx(styles.tick, styles.tickTL)} aria-hidden="true" />
        <span className={clsx(styles.tick, styles.tickTR)} aria-hidden="true" />
        <span className={clsx(styles.tick, styles.tickBR)} aria-hidden="true" />
        <span className={clsx(styles.tick, styles.tickBL)} aria-hidden="true" />

        <div className={styles.meta}>
          <span className={styles.modelId}>{model.id.toUpperCase()}</span>
          {/* Stated plainly so the placeholder is never mistaken for a render
              of the customer's own geometry. */}
          <span className={styles.pending}>Model view in preparation</span>
        </div>
      </div>

      <div className={styles.summary}>
        <div className={styles.fileRow}>
          <Icon name="box" size={24} />
          <span className={styles.fileMeta}>
            <span className={styles.fileName} title={model.name}>
              {model.name}
            </span>
            <span className={styles.fileSize}>
              {model.extension.slice(1).toUpperCase()} · {formatBytes(model.sizeBytes)}
            </span>
          </span>

          <span className={styles.actions}>
            {onReplace && (
              <Button variant="ghost" size="sm" onClick={onReplace}>
                Replace
              </Button>
            )}
            {onRemove && (
              <Button variant="ghost" size="sm" onClick={onRemove}>
                Remove
              </Button>
            )}
          </span>
        </div>

        <SpecTable rows={rows} dense caption="Model file details" />
      </div>
    </div>
  );
}
