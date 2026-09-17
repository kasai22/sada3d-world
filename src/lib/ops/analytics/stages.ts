import type { ManufacturingState } from "@/lib/manufacturing/types";

/**
 * The command centre's manufacturing summary: the fifteen machine states read
 * as the five stages an owner asks about, plus dispatch.
 *
 * A view over the state machine, like the board's columns — nothing moves a job
 * between these, and every non-terminal state belongs to exactly one (tested).
 *
 * Pure and client-safe.
 */

export type ActiveStageId = "queued" | "printing" | "post_processing" | "quality" | "ready";

export interface ActiveStage {
  id: ActiveStageId;
  label: string;
  hint: string;
  states: readonly ManufacturingState[];
}

export const ACTIVE_STAGES: readonly ActiveStage[] = [
  {
    id: "queued",
    label: "Queued",
    hint: "Review, file and material preparation, scheduled",
    states: ["queued", "design_review", "file_preparation", "material_preparation", "scheduled"],
  },
  { id: "printing", label: "Printing", hint: "On a machine", states: ["printing"] },
  { id: "post_processing", label: "Post-processing", hint: "Finishing after print", states: ["post_processing"] },
  { id: "quality", label: "Quality", hint: "Inspection and rework", states: ["quality_check", "rework"] },
  { id: "ready", label: "Ready", hint: "Approved, packing, ready to dispatch", states: ["approved", "packaging", "ready_for_dispatch"] },
];

const STAGE_BY_STATE = new Map<ManufacturingState, ActiveStageId>(
  ACTIVE_STAGES.flatMap((stage) => stage.states.map((state) => [state, stage.id] as const)),
);

/** The summary stage of an active state, or null for completed, cancelled and failed. */
export function activeStageOf(state: ManufacturingState): ActiveStageId | null {
  return STAGE_BY_STATE.get(state) ?? null;
}
