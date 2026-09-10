import type { GeometryAnalysisResult, Measurement } from "@/lib/geometry/types";
import type { ManufacturabilityAssessment } from "@/lib/manufacturing/manufacturability";
import type { CustomerManufacturingTracking } from "@/lib/manufacturing";
import type { ManufacturingQuote } from "@/lib/pricing/types";
import type { Order } from "@/lib/orders/types";
import type { CustomerOrderSummary } from "@/lib/account/types";

/**
 * API response shapes.
 *
 * Explicit projections, built field by field. **No database row, domain entity
 * or Payload document is ever serialised directly.**
 *
 * That rule is not stylistic. `Order` carries a payment session id and the
 * customer's contact details; `ManufacturingJob` carries operator notes, actor
 * names and a machine identifier. Returning either and trimming afterwards puts
 * one forgotten line between an internal field and the public internet — and
 * the forgetting happens later, when someone adds a column.
 *
 * Building the response from named fields means a new internal field is invisible
 * to the API until somebody writes it in here on purpose.
 */

/* ------------------------------------------------------------------ *
 * Measurements
 * ------------------------------------------------------------------ */

/**
 * A measurement, as JSON.
 *
 * The state is preserved rather than flattened to a number-or-null. A client
 * that receives `{ state: "unavailable", reason }` can say why there is no
 * volume; one that receives `null` can only render a blank, and one that
 * receives `0` will render a lie.
 */
export type MeasurementDto =
  | { state: "available"; value: number; unit: string }
  | { state: "unavailable" | "invalid"; unit: string; reason: string };

export function measurementDto(measurement: Measurement): MeasurementDto {
  return measurement.state === "available"
    ? { state: "available", value: measurement.value, unit: measurement.unit }
    : {
        state: measurement.state,
        unit: measurement.unit,
        reason: measurement.reason,
      };
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export interface OrderSummaryDto {
  reference: string;
  placedAt: string;
  status: string;
  itemCount: number;
  unitCount: number;
  total: number;
  currency: string;
  summary: string;
  provisional: boolean;
  demo: boolean;
}

export function orderSummaryDto(order: CustomerOrderSummary): OrderSummaryDto {
  return {
    reference: order.reference,
    placedAt: order.placedAt,
    status: order.status,
    itemCount: order.lineCount,
    unitCount: order.unitCount,
    total: order.total,
    currency: order.currency,
    summary: order.summary,
    provisional: order.provisional,
    demo: order.demo,
  };
}

export interface OrderItemDto {
  id: string;
  type: "catalog" | "custom";
  name: string;
  spec: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  fulfillmentStatus: string;
}

export interface OrderDetailDto {
  reference: string;
  placedAt: string;
  updatedAt: string;
  status: string;
  /** Whether it is settled. Never the provider's session identifier. */
  paid: boolean;
  items: readonly OrderItemDto[];
  totals: {
    currency: string;
    subtotal: number;
    total: number;
    excluded: readonly string[];
    provisional: boolean;
  };
  delivery: {
    /** The town and country only. The full address is not an API response. */
    city: string;
    state: string;
    country: string;
  };
  shipments: readonly {
    id: string;
    status: string;
    carrier?: string;
    trackingNumber?: string;
    shippedAt?: string;
    deliveredAt?: string;
  }[];
  demo: boolean;
}

/**
 * One order, for its owner.
 *
 * Note what is left out: `cartId`, `customerId`, `payment.sessionId`,
 * `payment.provider`, the manufacturing job ids, and the street address. None
 * of them is something a client needs, and each is something an API should not
 * be handing back.
 */
export function orderDetailDto(order: Order): OrderDetailDto {
  return {
    reference: order.reference,
    placedAt: order.placedAt,
    updatedAt: order.updatedAt,
    status: order.status,
    paid: order.payment.status === "paid",
    items: order.items.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      spec: item.spec,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      fulfillmentStatus: item.fulfillmentStatus,
    })),
    totals: {
      currency: order.totals.currency,
      subtotal: order.totals.subtotal,
      total: order.totals.total,
      excluded: [...order.totals.excluded],
      provisional: order.totals.provisional,
    },
    delivery: {
      city: order.address.city,
      state: order.address.state,
      country: order.address.country,
    },
    shipments: order.shipments.map((shipment) => ({
      id: shipment.id,
      status: shipment.status,
      ...(shipment.carrier ? { carrier: shipment.carrier } : {}),
      ...(shipment.trackingNumber ? { trackingNumber: shipment.trackingNumber } : {}),
      ...(shipment.shippedAt ? { shippedAt: shipment.shippedAt } : {}),
      ...(shipment.deliveredAt ? { deliveredAt: shipment.deliveredAt } : {}),
    })),
    demo: order.demo === true,
  };
}

/* ------------------------------------------------------------------ *
 * Tracking
 * ------------------------------------------------------------------ */

export interface TrackingItemDto {
  itemId: string;
  name: string;
  fulfillmentStatus: string;
  manufacturing?: {
    /** One of the six customer stages, or null for a failed job. */
    stage: string | null;
    lastUpdatedAt: string;
    estimatedCompletionAt?: string;
    held?: { reason: string; since: string };
    history: readonly { id: string; stage: string; occurredAt: string; message: string }[];
  };
}

/**
 * Tracking, from the Phase 12 customer projection.
 *
 * Built from `CustomerManufacturingTracking`, which is already the safe view —
 * and then narrowed further. The projection includes the internal
 * `ManufacturingState` because Phase 12 needed support and the customer stage
 * to agree; an HTTP client does not, so it does not cross this line.
 */
export function trackingItemDto(
  itemId: string,
  name: string,
  fulfillmentStatus: string,
  tracking?: CustomerManufacturingTracking,
): TrackingItemDto {
  return {
    itemId,
    name,
    fulfillmentStatus,
    ...(tracking
      ? {
          manufacturing: {
            stage: tracking.stage,
            lastUpdatedAt: tracking.lastUpdatedAt,
            ...(tracking.estimatedCompletionAt
              ? { estimatedCompletionAt: tracking.estimatedCompletionAt }
              : {}),
            ...(tracking.hold
              ? {
                  held: {
                    reason: tracking.hold.reason,
                    since: tracking.hold.since,
                  },
                }
              : {}),
            history: tracking.history.map((event) => ({
              id: event.id,
              stage: event.stage,
              occurredAt: event.occurredAt,
              message: event.message,
            })),
          },
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Quotes
 * ------------------------------------------------------------------ */

export interface QuoteDto {
  currency: string;
  basis: string;
  quantity: number;
  lines: readonly { id: string; label: string; amount: number; detail?: string }[];
  total: number;
  excluded: readonly string[];
  provisional: boolean;
  geometry: { state: string; reason?: string };
}

/**
 * A quote.
 *
 * `rulesVersion` is deliberately absent: it names an internal rule set, and a
 * client has no use for it. `provisional` is present and must be, because it is
 * the flag that says the figure is not approved commercial pricing.
 */
export function quoteDto(quote: ManufacturingQuote): QuoteDto {
  return {
    currency: quote.currency,
    basis: quote.basis,
    quantity: quote.quantity,
    lines: quote.lines.map((line) => ({
      id: line.id,
      label: line.label,
      amount: line.amount,
      ...(line.detail ? { detail: line.detail } : {}),
    })),
    total: quote.total,
    excluded: [...quote.excluded],
    provisional: quote.provisional,
    geometry:
      quote.geometry.state === "absent"
        ? { state: "absent" }
        : { state: quote.geometry.state, reason: quote.geometry.reason },
  };
}

/* ------------------------------------------------------------------ *
 * Designs
 * ------------------------------------------------------------------ */

/**
 * A stored design, for its owner.
 *
 * Absent by construction: the storage key, the customer id, the content type
 * the server chose, the checksum, and every maintenance timestamp. A client
 * needs to name the design, show its state and explain a refusal — nothing
 * here lets it address storage.
 */
export interface DesignDto {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
  state: "pending" | "verified" | "failed";
  createdAt: string;
  verifiedAt?: string;
  /** Why verification refused the file. Written for the customer. */
  failure?: { code: string; message: string };
}

export function designDto(design: {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
  storageState: string;
  createdAt: string;
  verifiedAt?: string;
  failure?: { code: string; message: string };
}): DesignDto {
  const state: DesignDto["state"] =
    design.storageState === "verified"
      ? "verified"
      : design.storageState === "pending"
        ? "pending"
        : "failed";

  return {
    id: design.id,
    name: design.name,
    format: design.format,
    sizeBytes: design.sizeBytes,
    state,
    createdAt: design.createdAt,
    ...(design.verifiedAt ? { verifiedAt: design.verifiedAt } : {}),
    ...(state === "failed" && design.failure
      ? { failure: { code: design.failure.code, message: design.failure.message } }
      : {}),
  };
}

/**
 * Where and how to send the bytes.
 *
 * The URL is a short-lived credential for one PUT of one object. It is returned
 * to the design's owner on a `no-store` response and is never logged, never
 * stored and never returned again — a retry gets a fresh one. Its path contains
 * the object key, as any URL addressing an object must; nothing accepts that
 * key back, and it authorises nothing beyond this one upload.
 */
export interface UploadTargetDto {
  method: "PUT";
  url: string;
  /** Send exactly these; they are covered by the signature. */
  headers: Readonly<Record<string, string>>;
  expiresAt: string;
}

export interface UploadIntentDto {
  design: DesignDto;
  /** Null when the same file is already stored and verified: nothing to send. */
  upload: UploadTargetDto | null;
}

export interface DesignDetailDto {
  design: DesignDto;
  analysis: AnalysisDto | null;
  /**
   *   available    measured from the stored bytes
   *   unsupported  the format is not a mesh (STEP) and is never measured
   *   unavailable  not measured yet: the design is not verified
   */
  analysisState: "available" | "unsupported" | "unavailable";
}

/* ------------------------------------------------------------------ *
 * Analysis
 * ------------------------------------------------------------------ */

export interface AnalysisDto {
  identity: string;
  format: string;
  unit: { unit: string; declared: boolean; note: string };
  objectCount: number;
  meshCount: number;
  triangleCount: MeasurementDto;
  boundingBoxMm: { x: number; y: number; z: number };
  volume: MeasurementDto;
  surfaceArea: MeasurementDto;
  topology: {
    status: string;
    boundaryEdges: number;
    nonManifoldEdges: number;
    degenerateTriangles: number;
  };
  objects: readonly {
    id: string;
    name?: string;
    triangleCount: MeasurementDto;
    boundingBoxMm: { x: number; y: number; z: number };
    volume: MeasurementDto;
    surfaceArea: MeasurementDto;
  }[];
  warnings: readonly { code: string; message: string }[];
  manufacturability: {
    manufacturable: boolean;
    constraints: string;
    findings: readonly { code: string; severity: string; message: string }[];
  };
}

export function analysisDto(
  analysis: GeometryAnalysisResult,
  assessment: ManufacturabilityAssessment,
): AnalysisDto {
  return {
    identity: analysis.identity,
    format: analysis.format,
    unit: {
      unit: analysis.unit.unit,
      declared: analysis.unit.declared,
      note: analysis.unit.note,
    },
    objectCount: analysis.objectCount,
    meshCount: analysis.meshCount,
    triangleCount: measurementDto(analysis.triangleCount),
    boundingBoxMm: { ...analysis.boundingBox.size },
    volume: measurementDto(analysis.volume),
    surfaceArea: measurementDto(analysis.surfaceArea),
    topology: {
      status: analysis.topology.topology,
      boundaryEdges: analysis.topology.boundaryEdges,
      nonManifoldEdges: analysis.topology.nonManifoldEdges,
      degenerateTriangles: analysis.topology.degenerateTriangles,
    },
    objects: analysis.objects.map((object) => ({
      id: object.id,
      ...(object.name ? { name: object.name } : {}),
      triangleCount: measurementDto(object.triangleCount),
      boundingBoxMm: { ...object.boundingBox.size },
      volume: measurementDto(object.volume),
      surfaceArea: measurementDto(object.surfaceArea),
    })),
    warnings: analysis.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
    })),
    manufacturability: {
      manufacturable: assessment.manufacturable,
      constraints: assessment.constraints,
      findings: assessment.findings.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
      })),
    },
  };
}
