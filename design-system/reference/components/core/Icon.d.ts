import * as React from 'react';
export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Lucide icon id, e.g. "box" | "ruler" | "layers" | "cpu" */
  name?: string;
  /** px */
  size?: number;
  color?: string;
  /** accessible label; omit for decorative icons */
  title?: string;
}
export declare function Icon(props: IconProps): JSX.Element;
