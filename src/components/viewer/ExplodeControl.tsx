"use client";

import { useEffect, useId, useRef, type ChangeEvent } from "react";
import clsx from "clsx";

import { IconButton } from "@/components/core";
import type { ViewerComponentInfo } from "@/lib/viewer/types";
import styles from "./ExplodeControl.module.css";

export interface ExplodeControlProps {
  /** 0 assembled, 1 fully exploded. */
  amount: number;
  /** `animate` distinguishes a state change from direct scrubbing. */
  onAmountChange: (amount: number, options?: { animate?: boolean }) => void;
  components: readonly ViewerComponentInfo[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onFrameAssembly: () => void;
  className?: string;
}

const percent = (amount: number) => Math.round(amount * 100);

/**
 * The exploded-view control.
 *
 * An assembled/exploded toggle and a continuous amount, sharing one value —
 * the toggle sets 0 or 1 and the slider reads the same number back, so the two
 * can never disagree.
 *
 * The component list is not decoration. Picking a part in the scene needs a
 * pointer, and a pointer is not available to everyone; this is the same action
 * reachable by keyboard, and on a phone it is the more accurate of the two.
 */
export function ExplodeControl({
  amount,
  onAmountChange,
  components,
  selected,
  onSelect,
  onFrameAssembly,
  className,
}: ExplodeControlProps) {
  const sliderId = useId();
  const value = percent(amount);
  const exploded = value > 0;
  const chosen = components.find((component) => component.id === selected);
  const listRef = useRef<HTMLUListElement>(null);

  // The chip row scrolls, so a part picked in the scene has to be brought into
  // view or the list would appear not to have responded.
  useEffect(() => {
    if (!selected) return;
    listRef.current
      ?.querySelector(`[data-component-id="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);

  const onSlide = (event: ChangeEvent<HTMLInputElement>) => {
    // Scrubbing is direct manipulation: it applies immediately rather than
    // easing towards the hand.
    onAmountChange(Number(event.target.value) / 100);
  };

  return (
    <div className={clsx(styles.panel, className)}>
      <div className={styles.row}>
        <span className={styles.heading}>Explode</span>

        <div className={styles.modes} role="group" aria-label="Assembly state">
          <button
            type="button"
            className={clsx(styles.mode, !exploded && styles.modeActive)}
            aria-pressed={!exploded}
            onClick={() => onAmountChange(0, { animate: true })}
          >
            Assembled
          </button>
          <button
            type="button"
            className={clsx(styles.mode, value === 100 && styles.modeActive)}
            aria-pressed={value === 100}
            onClick={() => onAmountChange(1, { animate: true })}
          >
            Exploded
          </button>
        </div>

        <IconButton
          icon="scan"
          label="Frame assembly"
          size="sm"
          onClick={onFrameAssembly}
        />
      </div>

      <div className={styles.row}>
        <label className="u-visually-hidden" htmlFor={sliderId}>
          Explode amount
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          aria-valuetext={`${value} percent`}
          onChange={onSlide}
          className={styles.slider}
        />
        <output htmlFor={sliderId} className={styles.value}>
          {value}%
        </output>
      </div>

      {components.length > 0 && (
        <div className={styles.components}>
          <span className={styles.heading}>Components</span>
          <ul ref={listRef} className={styles.list}>
            {components.map((component) => {
              const active = component.id === selected;
              return (
                <li key={component.id}>
                  <button
                    type="button"
                    data-component-id={component.id}
                    className={clsx(styles.component, active && styles.componentActive)}
                    aria-pressed={active}
                    onClick={() => onSelect(active ? null : component.id)}
                  >
                    <span className={styles.componentIndex}>
                      {String(component.index + 1).padStart(2, "0")}
                    </span>
                    {component.name}
                  </button>
                </li>
              );
            })}
          </ul>

          {chosen && (
            /*
             * Only what the model file actually declares. No material,
             * tolerance, weight or part number appears here, because the file
             * does not carry them and the viewer does not measure.
             */
            <dl className={styles.inspection}>
              <div className={styles.inspectionRow}>
                <dt className={styles.heading}>Component</dt>
                <dd className={styles.inspectionValue}>{chosen.name}</dd>
              </div>
              <div className={styles.inspectionRow}>
                <dt className={styles.heading}>Type</dt>
                <dd className={styles.inspectionValue}>{chosen.type}</dd>
              </div>
              <div className={styles.inspectionRow}>
                <dt className={styles.heading}>Part</dt>
                <dd className={styles.inspectionValue}>
                  {String(chosen.index + 1).padStart(2, "0")}
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
