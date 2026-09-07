import * as React from 'react';
export interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title' | 'style'> {
  title?: string;
  /** right-aligned header metadata */
  meta?: string;
  /** 0px radius + orange corner ticks — engineering surfaces */
  technical?: boolean;
  padded?: boolean;
  elevated?: boolean;
  style?: React.CSSProperties;
}
export declare function Panel(props: PanelProps): JSX.Element;
