import { Vector3 } from "three";

import type { AssemblyBounds } from "./types";

/**
 * Explosion transforms.
 *
 * Pure and deterministic. No React, no I/O, no randomness: the same model
 * explodes identically on every load, in every session, on every device. That
 * matters because an exploded view is a drawing of how a thing goes together,
 * and a drawing that rearranges itself between viewings is not a drawing.
 *
 * The transform is presentation only. Geometry, coordinates and material are
 * untouched; only the scene object's position moves, and it moves back exactly.
 */

/**
 * How far a component travels, relative to its own distance from the assembly
 * centre. Preserves the arrangement: outer parts stay outer.
 *
 * Both constants are deliberately restrained. A fully exploded assembly still
 * fits the frame the camera was already given, because the point is to read the
 * parts, not to watch them leave.
 */
const RADIAL_SCALE = 0.5;

/**
 * A floor, relative to the assembly radius. Without it, parts sitting on the
 * assembly centre — a shaft, a central boss — would never separate.
 */
const BASE_SPREAD = 0.22;

/** Below this fraction of the assembly radius a component counts as centred. */
const CENTRED_EPSILON = 1e-3;

/**
 * Deterministic directions for components with no usable radial direction.
 *
 * Indexed by scene order, so two coaxial parts — a bolt and its washer sharing
 * a centre — separate along different axes and do so the same way every time.
 * Order alternates sign so consecutive parts move apart rather than together.
 */
const FALLBACK_AXES: readonly Vector3[] = [
  new Vector3(0, 1, 0),
  new Vector3(0, -1, 0),
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, -1),
  new Vector3(1, 1, 1).normalize(),
  new Vector3(-1, -1, -1).normalize(),
];

/** What the transform needs to know about one component. */
export interface ExplodeComponent {
  index: number;
  /** Rest centre, in the assembly root's local space. */
  center: Vector3;
  /** Rest position of the object within its parent. */
  rest: { position: Vector3 };
}

/**
 * The direction a component travels.
 *
 * Radially outward from the assembly centre, which is the reading an engineer
 * expects. Components sitting on the centre fall back to a fixed axis chosen by
 * scene order — never a random one.
 */
export function explodeDirection(
  component: ExplodeComponent,
  assembly: AssemblyBounds,
): Vector3 {
  const radial = new Vector3().subVectors(component.center, assembly.center);
  const threshold = Math.max(assembly.radius * CENTRED_EPSILON, Number.EPSILON);

  if (radial.length() > threshold) return radial.normalize();

  const axis = FALLBACK_AXES[component.index % FALLBACK_AXES.length];
  // The table is non-empty and the index is taken modulo its length.
  return axis ? axis.clone() : new Vector3(0, 1, 0);
}

/** How far a component travels at full explosion. */
export function explodeDistance(
  component: ExplodeComponent,
  assembly: AssemblyBounds,
): number {
  const radial = new Vector3().subVectors(component.center, assembly.center).length();
  return radial * RADIAL_SCALE + assembly.radius * BASE_SPREAD;
}

/**
 * The position a component occupies at a given explode amount.
 *
 * `amount` runs 0 (assembled) to 1 (fully exploded) and is clamped. At exactly
 * 0 the returned position equals the recorded rest position, which is what
 * makes assembling again an exact restoration rather than an approximation.
 */
export function calculateExplosionTransform(
  component: ExplodeComponent,
  assembly: AssemblyBounds,
  amount: number,
): { position: Vector3 } {
  const clamped = Math.min(Math.max(amount, 0), 1);

  if (clamped === 0) return { position: component.rest.position.clone() };

  const displacement = explodeDirection(component, assembly).multiplyScalar(
    explodeDistance(component, assembly) * clamped,
  );

  return { position: component.rest.position.clone().add(displacement) };
}

/** Cubic ease. No overshoot: the motion is mechanical, not theatrical. */
export function easeInOutCubic(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/** Duration of an explode or assemble transition, in milliseconds. */
export const EXPLODE_DURATION_MS = 420;
