import * as React from 'react';
export interface SpecRow { label: string; value: React.ReactNode }
export interface SpecTableProps {
  rows?: SpecRow[];
  dense?: boolean;
  /** labels whose value renders in Titanium Orange */
  highlightKeys?: string[];
  style?: React.CSSProperties;
}
export declare function SpecTable(props: SpecTableProps): JSX.Element;
