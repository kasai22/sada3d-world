import * as React from 'react';
export interface SelectOption { value: string; label: string }
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'style'> {
  label?: string;
  options?: Array<string | SelectOption>;
  hint?: string;
  error?: string;
  style?: React.CSSProperties;
}
export declare function Select(props: SelectProps): JSX.Element;
