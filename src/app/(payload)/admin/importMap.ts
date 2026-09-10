/**
 * Payload's custom-component map.
 *
 * Payload resolves any component an operator's config points at through this
 * map. SADA 3D adds none — the admin is Payload's own UI and the storefront's
 * design system stays out of it — so it is empty.
 *
 * Committed rather than generated, so a build needs no Payload CLI step. If a
 * custom admin component is ever added, `payload generate:importmap` rewrites
 * this file.
 */
export const importMap = {};
