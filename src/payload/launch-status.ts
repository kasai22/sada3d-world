import type { Field, FieldHook, PayloadRequest } from "payload";

import { adminFieldOnly } from "./access";

/**
 * Read-only launch status fields for the Products admin (Stage 19.7).
 *
 * Virtual: computed on read, never stored, never written, visible to operators
 * only. The computation is `lib/content/launch-admin.ts`, loaded lazily — this
 * module is reachable from payload.config.ts, which the Payload CLI loads without
 * path aliases, so nothing with an "@/" import may be imported statically here.
 *
 * One computation per document per request, shared by all the fields.
 */

type StatusKey = "launch" | "technical" | "price" | "media" | "manufacturing" | "commercial" | "reasons" | "stage" | "panel" | "readiness";

async function statusFor(req: PayloadRequest, id: number) {
  const cache = req.context as Record<string, unknown>;
  const key = `launchStatus:${id}`;
  if (!cache[key]) {
    cache[key] = import("../lib/content/launch-admin").then(({ computeLaunchStatus }) =>
      computeLaunchStatus(req.payload, id),
    );
  }
  return cache[key] as ReturnType<typeof import("../lib/content/launch-admin").computeLaunchStatus>;
}

function hook(key: StatusKey): FieldHook {
  return async ({ data, originalDoc, req, context }) => {
    // Public reads never compute this, and the nested read that computes it must not recurse.
    if (!req.user || (context as Record<string, unknown> | undefined)?.launchStatusNested) return undefined;
    const id = (data?.id ?? originalDoc?.id) as number | undefined;
    if (typeof id !== "number") return undefined;

    try {
      return (await statusFor(req, id))[key];
    } catch (error) {
      return key === "reasons" ? `• Launch status could not be computed: ${(error as Error).message}` : "UNKNOWN";
    }
  };
}

const statusField = (name: string, key: StatusKey, label: string, description: string): Field => ({
  name,
  label,
  type: "text",
  virtual: true,
  access: { read: adminFieldOnly, create: () => false, update: () => false },
  admin: { readOnly: true, description },
  hooks: { afterRead: [hook(key)] },
});

export const LAUNCH_STATUS_FIELDS: Field[] = [
  statusField(
    "launchStage",
    "stage",
    "Launch stage",
    "NOT READY → READY FOR REVIEW (every prerequisite passes; approve it) → APPROVED (publish it) → LAUNCH READY. Derived on the server; no checkbox moves it.",
  ),
  {
    name: "readinessPanel",
    label: "Readiness",
    type: "textarea",
    virtual: true,
    access: { read: adminFieldOnly, create: () => false, update: () => false },
    admin: {
      readOnly: true,
      rows: 26,
      description: "Each section passes (✓) or lists what blocks it (✕), with where to fix it. The same assessment as content:verify -- --require-launch.",
    },
    hooks: { afterRead: [hook("panel")] },
  },
  statusField("readiness", "readiness", "Readiness summary", "Compact form of the panel above, shown in the product list."),
  statusField(
    "launchStatus",
    "launch",
    "Launch status",
    "READY only when every line below passes. Computed by the same assessment as `npm run content:verify -- --require-launch`.",
  ),
  statusField("technicalStatus", "technical", "Technical status", "PASS or BLOCKING: record validity, approval evidence, unsupported combinations."),
  statusField("priceStatusLabel", "price", "Price status", "APPROVED requires a price approval in effect whose amount equals the price."),
  statusField("mediaStatus", "media", "Media status", "MISSING (no image) → PROPOSED (image set, media approval not recorded) → APPROVED (photo or approved render of the actual product, approved)."),
  statusField("manufacturingStatus", "manufacturing", "Manufacturing status", "The material on its process must be approved capability (src/content/catalog/manufacturing.ts)."),
  statusField("commercialStatus", "commercial", "Commercial decisions", "SKU, class, pricing model, customer, use case, copy and visual requirement must be APPROVED."),
  {
    name: "launchReasons",
    label: "Every blocking reason (plain list)",
    type: "textarea",
    virtual: true,
    access: { read: adminFieldOnly, create: () => false, update: () => false },
    admin: { readOnly: true, description: "Every blocking reason, each one actionable." },
    hooks: { afterRead: [hook("reasons")] },
  },
];
