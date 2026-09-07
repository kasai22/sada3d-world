import * as React from 'react';
export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  /** Lucide icon id */
  icon?: string;
  size?: 'sm' | 'md' | 'lg';
  /** required accessible label */
  label: string;
  active?: boolean;
  variant?: 'ghost' | 'outline';
  style?: React.CSSProperties;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
