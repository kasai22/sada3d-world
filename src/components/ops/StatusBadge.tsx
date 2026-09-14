import type { ReactNode } from "react";
import clsx from "clsx";

import { Tag } from "@/components/core/Tag";
import type { DesignStorageState } from "@/lib/account/types";
import type { ManufacturingState } from "@/lib/manufacturing/types";
import {
  DESIGN_STORAGE_LABEL,
  DESIGN_STORAGE_TONE,
  ITEM_STATUS_TONE,
  MANUFACTURING_STATE_LABEL,
  MANUFACTURING_STATE_TONE,
  ORDER_STATUS_TONE,
  PAYMENT_STATE_LABEL,
  PAYMENT_STATE_TONE,
  SHIPMENT_STATUS_TONE,
  type OpsTone,
} from "@/lib/ops/labels";
import { SEVERITY_LABEL, type IssueSeverity } from "@/lib/ops/pipeline";
import {
  ITEM_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  SHIPMENT_STATUS_LABEL,
  type OrderItemFulfillmentStatus,
  type OrderStatus,
  type PaymentState,
  type ShipmentStatus,
} from "@/lib/orders/types";

import styles from "./StatusBadge.module.css";

/**
 * A state, as a label with a tone.
 *
 * Built on the design system's `Tag` rather than beside it. The dot is shape,
 * the label is meaning, and the tone is only ever the third signal — removing
 * colour removes nothing.
 */
export function StatusBadge({
  tone = "neutral",
  dot = true,
  title,
  className,
  children,
}: {
  tone?: OpsTone;
  dot?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag tone={tone} mono className={clsx(styles.badge, className)} title={title}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </Tag>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <StatusBadge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</StatusBadge>;
}

export function PaymentBadge({ status }: { status: PaymentState }) {
  return <StatusBadge tone={PAYMENT_STATE_TONE[status]}>{PAYMENT_STATE_LABEL[status]}</StatusBadge>;
}

export function JobStateBadge({ state, held = false }: { state: ManufacturingState; held?: boolean }) {
  return (
    <StatusBadge tone={held ? "warning" : MANUFACTURING_STATE_TONE[state]}>
      {MANUFACTURING_STATE_LABEL[state]}
      {held && " · Held"}
    </StatusBadge>
  );
}

export function ItemStatusBadge({ status }: { status: OrderItemFulfillmentStatus }) {
  return <StatusBadge tone={ITEM_STATUS_TONE[status]}>{ITEM_STATUS_LABEL[status]}</StatusBadge>;
}

export function ShipmentBadge({ status }: { status: ShipmentStatus }) {
  return <StatusBadge tone={SHIPMENT_STATUS_TONE[status]}>{SHIPMENT_STATUS_LABEL[status]}</StatusBadge>;
}

export function DesignStateBadge({ state }: { state: DesignStorageState }) {
  return <StatusBadge tone={DESIGN_STORAGE_TONE[state]}>{DESIGN_STORAGE_LABEL[state]}</StatusBadge>;
}

const SEVERITY_TONE: Record<IssueSeverity, OpsTone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  return <StatusBadge tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</StatusBadge>;
}

/** Marks a development fixture wherever one appears. */
export function DemoTag() {
  return (
    <Tag tone="info" className={styles.badge} title="Demonstration order — not a real Reality 3D order">
      Demo
    </Tag>
  );
}

export function ProvisionalTag() {
  return (
    <Tag className={styles.badge} title="Priced by provisional manufacturing rules">
      Provisional
    </Tag>
  );
}
