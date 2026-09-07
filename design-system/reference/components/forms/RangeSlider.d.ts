import * as React from 'react';
export interface RangeSliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'style' | 'type' | 'value'> {
  min?: number; max?: number; value?: number; step?: number;
  label?: string;
  /** value formatter, e.g. v => `₹${v}` */
  format?: (v: number) => React.ReactNode;
  style?: React.CSSProperties;
}
export declare function RangeSlider(props: RangeSliderProps): JSX.Element;
