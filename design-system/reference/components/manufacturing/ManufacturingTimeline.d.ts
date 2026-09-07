import * as React from 'react';
export interface ManufacturingStage {
  label: string;
  state?: 'pending' | 'active' | 'complete' | 'failed';
  /** right-aligned timestamp or machine note */
  meta?: string;
  /** 0–100, rendered only on the active stage */
  progress?: number;
}
/**
 * Seven-stage manufacturing tracker.
 * @startingPoint section="Manufacturing" subtitle="Manufacturing status timeline" viewport="700x520"
 */
export interface ManufacturingTimelineProps {
  stages?: ManufacturingStage[];
  style?: React.CSSProperties;
}
export declare function ManufacturingTimeline(props: ManufacturingTimelineProps): JSX.Element;
