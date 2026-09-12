import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";

import type { DesignStorageState } from "@/lib/account/types";
import { analysisDto, type AnalysisDto } from "@/lib/api/dto";
import { getDatabase } from "@/lib/db/client";
import {
  customerDesignOrders,
  customerDesigns,
  geometryAnalyses,
  orderItems,
  orders,
} from "@/lib/db/schema";
import {
  checkManufacturability,
  configuredConstraints,
} from "@/lib/manufacturing/manufacturability";
import { isAnalyzable } from "@/lib/models";
import { isValidStoredAnalysis } from "@/lib/models/analysis-store";
import { ANALYSIS_VERSION } from "@/lib/models/identity";
import type { OrderStatus } from "@/lib/orders/types";

import type { OperatorSession } from "./operator";
import { DESIGN_PAGE_SIZE, isIdentifier, likePattern, type DesignListQuery } from "./query";
import { iso, optionalIso, toPage } from "./sql";
import type { OpsPage } from "./types";

/**
 * Customer designs, for operators.
 *
 * ── What is shown, and what is not ───────────────────────────────────────
 *
 * The file's facts (name, format, size, checksum, lifecycle) and what the
 * geometry analysis measured from the stored bytes. Never the storage key, never
 * a signed URL: an operator cannot download a customer's file from the console,
 * because there is no operator file-access path in the storage design and adding
 * one is a security decision, not an interface one.
 *
 * ── Measurements are read, not recomputed ────────────────────────────────
 *
 * The analysis is the durable row keyed by the file's hash, validated the same
 * way the design service validates it before trusting it. An invalid row is
 * reported as unreadable and left alone — deleting it is the design service's
 * job, and a page render is not the place for a write.
 *
 * Manufacturability is computed on read against today's constraints, exactly as
 * the customer's design page does, so the two cannot disagree.
 */

export type DesignAnalysisSummary =
  | {
      state: "available";
      dimensionsMm: { x: number; y: number; z: number };
      triangles: number | null;
      volumeMm3: number | null;
      topology: string;
      manufacturable: boolean;
      blocking: number;
      advisories: number;
      constraints: "configured" | "unconfigured";
    }
  /** The format is not a mesh (STEP) and is never measured. */
  | { state: "unsupported" }
  /** Not verified yet, so not measured yet. */
  | { state: "pending" }
  /** Verified and analysable, but no stored analysis exists for its bytes. */
  | { state: "missing" }
  /** A stored analysis exists and does not describe these bytes correctly. */
  | { state: "unreadable" };

export interface OpsDesignRow {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
  state: DesignStorageState;
  createdAt: string;
  verifiedAt?: string;
  failure?: { code: string; message: string };
  customer: { id: string; name: string | null };
  analysis: DesignAnalysisSummary;
  orderReferences: string[];
}

function summarise(
  design: { name: string; state: DesignStorageState; sha256: string | null },
  result: unknown,
): { summary: DesignAnalysisSummary; analysis: AnalysisDto | null } {
  if (!isAnalyzable(design.name)) return { summary: { state: "unsupported" }, analysis: null };
  if (design.state !== "verified" || !design.sha256) return { summary: { state: "pending" }, analysis: null };
  if (result === null || result === undefined) return { summary: { state: "missing" }, analysis: null };
  if (!isValidStoredAnalysis(result, design.sha256)) {
    return { summary: { state: "unreadable" }, analysis: null };
  }

  const assessment = checkManufacturability(result, configuredConstraints());
  const dto = analysisDto(result, assessment);

  return {
    analysis: dto,
    summary: {
      state: "available",
      dimensionsMm: dto.boundingBoxMm,
      triangles: dto.triangleCount.state === "available" ? dto.triangleCount.value : null,
      volumeMm3: dto.volume.state === "available" ? dto.volume.value : null,
      topology: dto.topology.status,
      manufacturable: assessment.manufacturable,
      blocking: assessment.findings.filter((finding) => finding.severity === "blocking").length,
      advisories: assessment.findings.filter((finding) => finding.severity === "advisory").length,
      constraints: assessment.constraints,
    },
  };
}

const latestContactName = sql<string | null>`(select ${orders.contactName} from ${orders} where ${orders.customerId} = ${customerDesigns.customerId} order by ${orders.placedAt} desc limit 1)`;

/** Which orders each design was manufactured for: the account link and the order snapshot. */
async function orderReferencesFor(designIds: readonly string[]): Promise<Map<string, string[]>> {
  const references = new Map<string, Set<string>>();
  if (designIds.length === 0) return new Map();

  const db = await getDatabase();
  const [links, snapshots] = await Promise.all([
    db
      .select({ designId: customerDesignOrders.designId, reference: customerDesignOrders.orderReference })
      .from(customerDesignOrders)
      .where(inArray(customerDesignOrders.designId, [...designIds])),
    db
      .selectDistinct({ designId: orderItems.sourceDesignId, reference: orderItems.orderReference })
      .from(orderItems)
      .where(inArray(orderItems.sourceDesignId, [...designIds])),
  ]);

  for (const row of [...links, ...snapshots]) {
    if (!row.designId) continue;
    const set = references.get(row.designId) ?? new Set<string>();
    set.add(row.reference);
    references.set(row.designId, set);
  }

  return new Map([...references].map(([id, set]) => [id, [...set].sort()]));
}

export async function listOpsDesigns(
  _operator: OperatorSession,
  query: DesignListQuery,
): Promise<OpsPage<OpsDesignRow>> {
  const db = await getDatabase();
  const pattern = query.q ? likePattern(query.q) : undefined;

  const conditions: (SQL | undefined)[] = [
    query.state ? eq(customerDesigns.storageState, query.state) : ne(customerDesigns.storageState, "deleted"),
    pattern ? or(ilike(customerDesigns.name, pattern), eq(customerDesigns.id, query.q ?? "")) : undefined,
    query.format ? eq(customerDesigns.format, query.format) : undefined,
    query.customer ? eq(customerDesigns.customerId, query.customer) : undefined,
    query.analysis === "analysed" ? isNotNull(customerDesigns.analysisIdentity) : undefined,
    query.analysis === "not_analysed" ? isNull(customerDesigns.analysisIdentity) : undefined,
  ];
  const where = and(...conditions);

  const [rows, counted] = await Promise.all([
    db
      .select({
        id: customerDesigns.id,
        customerId: customerDesigns.customerId,
        name: customerDesigns.name,
        format: customerDesigns.format,
        sizeBytes: customerDesigns.sizeBytes,
        state: customerDesigns.storageState,
        sha256: customerDesigns.sha256,
        createdAt: customerDesigns.createdAt,
        verifiedAt: customerDesigns.verifiedAt,
        failureCode: customerDesigns.failureCode,
        failureMessage: customerDesigns.failureMessage,
        customerName: latestContactName,
        result: geometryAnalyses.result,
      })
      .from(customerDesigns)
      .leftJoin(
        geometryAnalyses,
        and(
          eq(geometryAnalyses.sha256, customerDesigns.sha256),
          eq(geometryAnalyses.analysisVersion, ANALYSIS_VERSION),
        ),
      )
      .where(where)
      .orderBy(desc(customerDesigns.createdAt), desc(customerDesigns.id))
      .limit(DESIGN_PAGE_SIZE)
      .offset((query.page - 1) * DESIGN_PAGE_SIZE),
    db.select({ value: count() }).from(customerDesigns).where(where),
  ]);

  const references = await orderReferencesFor(rows.map((row) => row.id));

  return toPage(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      format: row.format,
      sizeBytes: row.sizeBytes,
      state: row.state,
      createdAt: iso(row.createdAt),
      ...(row.verifiedAt ? { verifiedAt: iso(row.verifiedAt) } : {}),
      ...(row.failureCode
        ? { failure: { code: row.failureCode, message: row.failureMessage ?? "" } }
        : {}),
      customer: { id: row.customerId, name: row.customerName ?? null },
      analysis: summarise(row, row.result).summary,
      orderReferences: references.get(row.id) ?? [],
    })),
    Number(counted[0]?.value ?? 0),
    query.page,
    DESIGN_PAGE_SIZE,
  );
}

/* ------------------------------------------------------------------ *
 * One design
 * ------------------------------------------------------------------ */

export interface OpsDesignDetail extends OpsDesignRow {
  contentType?: string;
  /** Shortened content digest. The full value is not needed to tell files apart. */
  checksum?: string;
  updatedAt: string;
  uploadExpiresAt?: string;
  deletedAt?: string;
  objectRemovedAt?: string;
  analysisDetail: AnalysisDto | null;
  orders: { reference: string; status: OrderStatus; placedAt: string; demo: boolean }[];
}

export async function getOpsDesign(
  _operator: OperatorSession,
  id: string,
): Promise<OpsDesignDetail | undefined> {
  if (!isIdentifier(id)) return undefined;
  const db = await getDatabase();

  const rows = await db
    .select({
      id: customerDesigns.id,
      customerId: customerDesigns.customerId,
      name: customerDesigns.name,
      format: customerDesigns.format,
      sizeBytes: customerDesigns.sizeBytes,
      state: customerDesigns.storageState,
      contentType: customerDesigns.contentType,
      sha256: customerDesigns.sha256,
      createdAt: customerDesigns.createdAt,
      updatedAt: customerDesigns.updatedAt,
      verifiedAt: customerDesigns.verifiedAt,
      uploadExpiresAt: customerDesigns.uploadExpiresAt,
      deletedAt: customerDesigns.deletedAt,
      objectRemovedAt: customerDesigns.objectRemovedAt,
      failureCode: customerDesigns.failureCode,
      failureMessage: customerDesigns.failureMessage,
      customerName: latestContactName,
      result: geometryAnalyses.result,
    })
    .from(customerDesigns)
    .leftJoin(
      geometryAnalyses,
      and(
        eq(geometryAnalyses.sha256, customerDesigns.sha256),
        eq(geometryAnalyses.analysisVersion, ANALYSIS_VERSION),
      ),
    )
    .where(eq(customerDesigns.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;

  const references = (await orderReferencesFor([row.id])).get(row.id) ?? [];
  const orderRows =
    references.length === 0
      ? []
      : await db
          .select({
            reference: orders.reference,
            status: orders.status,
            placedAt: orders.placedAt,
            demo: orders.demo,
          })
          .from(orders)
          .where(inArray(orders.reference, references))
          .orderBy(desc(orders.placedAt));

  const { summary, analysis } = summarise(row, row.result);

  return {
    id: row.id,
    name: row.name,
    format: row.format,
    sizeBytes: row.sizeBytes,
    state: row.state,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    ...(row.verifiedAt ? { verifiedAt: iso(row.verifiedAt) } : {}),
    ...(row.failureCode ? { failure: { code: row.failureCode, message: row.failureMessage ?? "" } } : {}),
    ...(row.contentType ? { contentType: row.contentType } : {}),
    ...(row.sha256 ? { checksum: row.sha256.slice(0, 16) } : {}),
    ...(row.uploadExpiresAt ? { uploadExpiresAt: optionalIso(row.uploadExpiresAt) } : {}),
    ...(row.deletedAt ? { deletedAt: optionalIso(row.deletedAt) } : {}),
    ...(row.objectRemovedAt ? { objectRemovedAt: optionalIso(row.objectRemovedAt) } : {}),
    customer: { id: row.customerId, name: row.customerName ?? null },
    analysis: summary,
    analysisDetail: analysis,
    orderReferences: references,
    orders: orderRows.map((order) => ({
      reference: order.reference,
      status: order.status,
      placedAt: iso(order.placedAt),
      demo: order.demo,
    })),
  };
}
