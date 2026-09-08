"use client";

import { Button, Icon } from "@/components/core";
import { SpecTable, type SpecRow } from "@/components/structure";
import { Viewer3DLazy } from "@/components/viewer";
import { formatBytes } from "@/lib/custom-print/inspect";
import { modelObjectUrl } from "@/lib/custom-print/modelBlobs";
import type { UploadedModel } from "@/lib/custom-print/types";
import { formatForExtension } from "@/lib/viewer/types";
import styles from "./ModelStage.module.css";

export interface ModelStageProps {
  model: UploadedModel;
  /** Replace the current model with a different file. */
  onReplace?: () => void;
  onRemove?: () => void;
  className?: string;
}

/**
 * The model stage.
 *
 * Renders the customer's own uploaded geometry through the shared viewer. The
 * bytes come from the in-memory registry, so nothing binary is persisted and
 * the workflow's model of identity is unchanged.
 *
 * The summary below reports only facts read from the file. Loading a model is
 * not analysis: volume, weight and print time are still absent, because
 * displaying geometry does not measure it.
 */
export function ModelStage({
  model,
  onReplace,
  onRemove,
  className,
}: ModelStageProps) {
  const { inspection } = model;

  const format = formatForExtension(model.extension);
  const url = modelObjectUrl(model.id);

  // Three distinct reasons the viewer may have nothing to draw, each stated
  // plainly rather than collapsed into one silent empty box.
  const notice = !format
    ? `A 3D preview isn't available for ${model.extension.slice(1).toUpperCase()} files. The file is uploaded and will be prepared for manufacturing.`
    : !url
      ? "Model view unavailable after refresh. Re-upload the model to continue."
      : undefined;

  const rows: SpecRow[] = [
    { label: "Format", value: inspection.formatLabel },
    { label: "Size", value: formatBytes(model.sizeBytes) },
  ];

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
      <Viewer3DLazy
        className={styles.stage}
        source={format && url ? { url, format, label: model.name } : null}
        notice={notice}
        description={`Interactive 3D view of ${model.name}. Drag to rotate, scroll to zoom.`}
        appearance={{ surface: "graphite" }}
        footer={
          <>
            <span className={styles.modelId}>{model.id.toUpperCase()}</span>
            <span className={styles.pending}>{inspection.formatLabel}</span>
          </>
        }
      />

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
