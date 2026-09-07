import * as React from 'react';
/**
 * SADA 3D primary action control.
 * @startingPoint section="Core" subtitle="Buttons across all seven variants and states" viewport="700x300"
 */
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'technical' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  /** Lucide icon id rendered before the label */
  iconLeft?: string;
  /** Lucide icon id rendered after the label */
  iconRight?: string;
  loading?: boolean;
  success?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  selected?: boolean;
  style?: React.CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;
