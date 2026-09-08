import {
  EMPTY_CONFIGURATION,
  STEPS,
  STEP_IDS,
  type CustomPrintConfiguration,
  type StepId,
} from "./types";

/** Position of a step in the flow. */
export function stepIndex(id: StepId): number {
  return STEP_IDS.indexOf(id);
}

export function stepAt(index: number): StepId {
  return STEP_IDS[Math.min(Math.max(index, 0), STEP_IDS.length - 1)] ?? "upload";
}

/**
 * Why a step cannot be left, or null when it can.
 *
 * Messages are the ones shown to the customer: precise, and about the missing
 * value rather than about something having gone wrong.
 */
export function blockedReason(
  step: StepId,
  configuration: CustomPrintConfiguration,
): string | null {
  switch (step) {
    case "upload":
      return configuration.model
        ? null
        : "Upload a supported 3D model to continue.";
    case "material":
      return configuration.material ? null : "Select a material to continue.";
    case "quality":
      return configuration.quality ? null : "Select a print quality to continue.";
    case "finish":
      return configuration.finish ? null : "Select a finish to continue.";
    case "review":
      return null;
  }
}

/**
 * The furthest step the current configuration justifies reaching.
 *
 * The stepper uses this so completed steps stay navigable while steps that
 * depend on missing values do not.
 */
export function furthestReachableStep(
  configuration: CustomPrintConfiguration,
): number {
  for (let index = 0; index < STEPS.length; index += 1) {
    const step = stepAt(index);
    if (blockedReason(step, configuration)) return index;
  }
  return STEPS.length - 1;
}

export function isConfigurationComplete(
  configuration: CustomPrintConfiguration,
): boolean {
  return STEP_IDS.every((step) => blockedReason(step, configuration) === null);
}

/* ------------------------------------------------------------------ *
 * Session persistence
 *
 * Selections survive step navigation and a reload within the same tab. This is
 * not autosave: nothing is written to a server or shared across tabs, and it is
 * cleared when the tab closes.
 *
 * The File object itself is never stored — only the identity derived from it,
 * which is all the workflow needs. Phase 16 will hold the uploaded object in R2
 * and reference it by key.
 * ------------------------------------------------------------------ */

const STORAGE_KEY = "sada3d.custom-print.v1";

export function loadConfiguration(): CustomPrintConfiguration {
  if (typeof window === "undefined") return EMPTY_CONFIGURATION;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CONFIGURATION;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_CONFIGURATION;

    const candidate = parsed as CustomPrintConfiguration;

    return {
      ...EMPTY_CONFIGURATION,
      ...candidate,
      // Never trust a stored quantity: clamp it back into range.
      quantity:
        Number.isInteger(candidate.quantity) && candidate.quantity > 0
          ? candidate.quantity
          : EMPTY_CONFIGURATION.quantity,
    };
  } catch {
    return EMPTY_CONFIGURATION;
  }
}

export function saveConfiguration(configuration: CustomPrintConfiguration): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(configuration));
  } catch {
    // Storage being unavailable must not break the workflow.
  }
}

export function clearConfiguration(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to recover from.
  }
}
