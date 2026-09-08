"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import clsx from "clsx";

import { Icon, IconButton } from "@/components/core";
import styles from "./FileUpload.module.css";

/**
 * Model upload target.
 *
 * An addition to the design system: the brief requires CAD upload but the
 * package ships no upload component. Built from the same tokens and the same
 * field states as the rest of the forms group, and flagged here so it can be
 * folded back into the system.
 */

export const MODEL_FORMATS = [".stl", ".step", ".stp", ".obj", ".3mf"] as const;

/** 200 MB. Anything larger is a print farm job, not a browser upload. */
export const MAX_MODEL_BYTES = 200 * 1024 * 1024;

export interface FileUploadProps {
  /** Accepted extensions, lowercase and dot-prefixed. */
  accept?: readonly string[];
  maxBytes?: number;
  file?: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  /** Server-side error to display beneath the zone. */
  error?: string;
  /**
   * Makes the drop zone fill its container instead of using its natural
   * height. Used where the zone occupies a model stage.
   */
  fill?: boolean;
  className?: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({
  accept = MODEL_FORMATS,
  maxBytes = MAX_MODEL_BYTES,
  file,
  onFileChange,
  disabled,
  error,
  fill = false,
  className,
}: FileUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const message = error ?? localError;
  const formats = accept.map((ext) => ext.slice(1).toUpperCase()).join(" · ");

  function validate(candidate: File): string | null {
    const name = candidate.name.toLowerCase();
    if (!accept.some((ext) => name.endsWith(ext))) {
      return `Unsupported file type. Accepted formats: ${formats}.`;
    }
    if (candidate.size > maxBytes) {
      return `File exceeds the ${formatBytes(maxBytes)} limit.`;
    }
    return null;
  }

  function receive(candidate: File | undefined) {
    if (!candidate) return;
    const problem = validate(candidate);
    setLocalError(problem);
    onFileChange(problem ? null : candidate);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    receive(event.dataTransfer.files[0]);
  }

  if (file) {
    return (
      <div className={className}>
        <div className={styles.file}>
          <Icon name="box" size={24} />
          <span className={styles.fileMeta}>
            <span className={styles.fileName}>{file.name}</span>
            <span className={styles.fileSize}>{formatBytes(file.size)}</span>
          </span>
          <IconButton
            icon="trash"
            label={`Remove ${file.name}`}
            disabled={disabled}
            onClick={() => {
              setLocalError(null);
              onFileChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        </div>
        {message && (
          <p className={styles.error} role="alert">
            <Icon name="error" size={14} />
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className={clsx(
          styles.zone,
          fill && styles.zoneFill,
          dragging && styles.dragging,
          message && styles.invalid,
          disabled && styles.disabled,
        )}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept.join(",")}
          disabled={disabled}
          className={styles.input}
          aria-describedby={`${inputId}-formats`}
          aria-invalid={message ? true : undefined}
          onChange={(event) => receive(event.target.files?.[0])}
        />
        <span className={styles.glyph}>
          <Icon name="upload" size={32} />
        </span>
        <span className={styles.headline}>Drop a model, or browse</span>
        <span className={styles.formats} id={`${inputId}-formats`}>
          {formats} · Max {formatBytes(maxBytes)}
        </span>
      </label>

      {message && (
        <p className={styles.error} role="alert">
          <Icon name="error" size={14} />
          {message}
        </p>
      )}
    </div>
  );
}
