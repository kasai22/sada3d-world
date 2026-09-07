import * as React from 'react';
export interface StatusDotProps {
  status?: 'queued' | 'processing' | 'printing' | 'quality' | 'packaging' | 'shipped' | 'delivered' | 'paused' | 'failed' | 'complete' | 'idle';
  /** slow opacity pulse — use only for in-progress states */
  pulse?: boolean;
  size?: number;
  label?: string;
  style?: React.CSSProperties;
}
export declare function StatusDot(props: StatusDotProps): JSX.Element;
