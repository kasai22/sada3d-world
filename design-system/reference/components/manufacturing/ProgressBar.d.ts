import * as React from 'react';
export interface ProgressBarProps {
  /** 0–100 */
  value?: number;
  label?: string;
  showValue?: boolean;
  /** number of segments in the track */
  segments?: number;
  tone?: 'active' | 'paused' | 'failed' | 'complete';
  style?: React.CSSProperties;
}
export declare function ProgressBar(props: ProgressBarProps): JSX.Element;
