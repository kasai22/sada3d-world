"use client";

import { Icon, Tag } from "@/components/core";
import { SpecTable } from "@/components/structure";
import type { MeasurementDto } from "@/lib/api/dto";
import type { ModelAnalysisState } from "@/lib/custom-print/analysis";

import styles from "./ModelAnalysis.module.css";

export interface ModelAnalysisProps {
  state: ModelAnalysisState;
}

/**
 * What the file says, and what that means for making it.
 *
 * ── Three categories, kept visibly apart ─────────────────────────────────
 *
 *   FILE FACTS          "82 × 41 × 16 mm"      measured from the bytes
 *   MANUFACTURING       "Not a closed mesh"    a rule applied to the facts
 *   PRICE               elsewhere on the page  neither of the above
 *
 * They are three sections with three headings for a reason. A dimension and a
 * verdict rendered in the same list read as the same kind of statement, and one
 * of them is a measurement while the other is a judgement that could change
 * when the shop floor does.
 *
 * ── No zeros ─────────────────────────────────────────────────────────────
 *
 * Every value comes from a `MeasurementDto` carrying its own state, and an
 * unavailable one renders as a phrase and a reason rather than `0`. There is no
 * code path here that can display a placeholder number.
 */
export function ModelAnalysis({ state }: ModelAnalysisProps) {
  if (state.status === "not_analyzed") return null;

  if (state.status === "analyzing") {
    return (
      <section className={styles.panel} aria-live="polite">
        <p className={styles.status}>
          <span className={styles.spinner} aria-hidden="true" />
          Measuring your model…
        </p>
      </section>
    );
  }

  if (state.status === "unsupported") {
    return (
      <section className={styles.panel}>
        <h3 className={styles.heading}>Model analysis</h3>
        <p className={styles.note}>
          <Icon name="info" size={15} />
          <span>{state.reason}</span>
        </p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className={styles.panel} role="alert">
        <h3 className={styles.heading}>Model analysis</h3>
        <p className={styles.problem}>
          <Icon name="alert" size={15} />
          <span>{state.message}</span>
        </p>
      </section>
    );
  }

  const { analysis } = state;
  const size = analysis.boundingBoxMm;

  return (
    <section className={styles.panel}>
      <h3 className={styles.heading}>Measured from your file</h3>

      <SpecTable
        caption="Measurements taken from the uploaded model"
        rows={[
          {
            label: "Bounding dimensions",
            value: (
              <span className={styles.technical}>
                {size.x.toFixed(1)} × {size.y.toFixed(1)} × {size.z.toFixed(1)} mm
              </span>
            ),
          },
          { label: "Parts", value: String(analysis.objectCount) },
          { label: "Triangles", value: <Measured value={analysis.triangleCount} /> },
          { label: "Volume", value: <Measured value={analysis.volume} /> },
          { label: "Surface area", value: <Measured value={analysis.surfaceArea} /> },
          {
            label: "Mesh",
            value: <TopologyLabel status={analysis.topology.status} />,
          },
          {
            label: "Units",
            value: analysis.unit.declared
              ? `${analysis.unit.unit} (from the file)`
              : `${analysis.unit.unit} (assumed)`,
          },
        ]}
      />

      {!analysis.unit.declared && (
        <p className={styles.note}>
          <Icon name="info" size={14} />
          <span>{analysis.unit.note}</span>
        </p>
      )}

      {analysis.objectCount > 1 && (
        <div className={styles.parts}>
          <h4 className={styles.subheading}>Parts in this file</h4>
          <ul className={styles.partList}>
            {analysis.objects.map((object, index) => (
              <li key={object.id} className={styles.part}>
                <span className={styles.partName}>
                  {object.name ?? `Part ${index + 1}`}
                </span>
                <span className={styles.partSize}>
                  {object.boundingBoxMm.x.toFixed(1)} ×{" "}
                  {object.boundingBoxMm.y.toFixed(1)} ×{" "}
                  {object.boundingBoxMm.z.toFixed(1)} mm
                </span>
                <span className={styles.partVolume}>
                  <Measured value={object.volume} compact />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* A separate heading, because a rule is not a measurement. */}
      <h3 className={styles.heading}>Manufacturing checks</h3>

      <p className={styles.verdict}>
        {analysis.manufacturability.manufacturable ? (
          <Tag tone="success">No blocking issues</Tag>
        ) : (
          <Tag tone="danger">Cannot be manufactured as supplied</Tag>
        )}
        {analysis.manufacturability.constraints === "unconfigured" && (
          <span className={styles.constraintNote}>
            Build volume and feature limits are not configured, so size has not
            been checked.
          </span>
        )}
      </p>

      {analysis.manufacturability.findings.length > 0 && (
        <ul className={styles.findings}>
          {analysis.manufacturability.findings.map((finding, index) => (
            <li
              key={`${finding.code}-${index}`}
              className={
                finding.severity === "blocking" ? styles.blocking : styles.advisory
              }
            >
              <Icon
                name={finding.severity === "blocking" ? "alert" : "info"}
                size={14}
              />
              <span>{finding.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One measurement.
 *
 * An unavailable value shows what it is and why, never a number. That is the
 * whole reason the DTO keeps its state instead of flattening to a nullable
 * number: `—` tells a customer nothing, and `0` tells them something false.
 */
function Measured({ value, compact }: { value: MeasurementDto; compact?: boolean }) {
  if (value.state === "available") {
    return (
      <span className={styles.technical}>
        {formatMeasurement(value.value, value.unit)}
      </span>
    );
  }

  return (
    <span className={styles.unavailable} title={value.reason}>
      {value.state === "invalid" ? "Invalid" : "Not available"}
      {!compact && <span className={styles.reason}>{value.reason}</span>}
    </span>
  );
}

function formatMeasurement(value: number, unit: string): string {
  if (unit === "count") return value.toLocaleString("en-IN");

  // Volumes get large fast; cm³ is the readable unit past a thousand mm³.
  if (unit === "mm3" && value >= 1000) {
    return `${(value / 1000).toFixed(2)} cm³`;
  }
  if (unit === "mm2" && value >= 10_000) {
    return `${(value / 100).toFixed(1)} cm²`;
  }

  const suffix = unit === "mm3" ? "mm³" : unit === "mm2" ? "mm²" : "mm";
  return `${value.toFixed(value < 10 ? 2 : 1)} ${suffix}`;
}

function TopologyLabel({ status }: { status: string }) {
  switch (status) {
    case "closed":
      return <span>Closed and watertight</span>;
    case "open":
      return <span className={styles.warn}>Open — the surface has holes</span>;
    case "non_manifold":
      return <span className={styles.warn}>Non-manifold</span>;
    default:
      return <span className={styles.unavailable}>Not determined</span>;
  }
}
