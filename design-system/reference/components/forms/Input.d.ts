import * as React from 'react';
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'style'> {
  label?: string;
  hint?: string;
  /** error message; replaces hint and turns the field red */
  error?: string;
  /** Lucide icon id shown at the field start */
  icon?: string;
  /** trailing unit, e.g. "MM" */
  suffix?: string;
  size?: 'sm' | 'md' | 'lg';
  /** render the value in the technical mono face */
  technical?: boolean;
  style?: React.CSSProperties;
}
export declare function Input(props: InputProps): JSX.Element;
