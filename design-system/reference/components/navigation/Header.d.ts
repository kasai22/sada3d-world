import * as React from 'react';
/**
 * Sticky platform header.
 * @startingPoint section="Navigation" subtitle="Sticky platform header with orange active rule" viewport="1280x120"
 */
export interface HeaderProps {
  active?: string;
  links?: string[];
  cartCount?: number;
  onNavigate?: (target: string) => void;
  sticky?: boolean;
  style?: React.CSSProperties;
}
export declare function Header(props: HeaderProps): JSX.Element;
