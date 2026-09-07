import * as React from 'react';
export interface OrderItem { name: string; spec?: string; qty?: number; price?: string }
export interface TotalRow { label: string; value: string }
export interface OrderSummaryProps {
  items?: OrderItem[];
  /** subtotal / shipping / GST rows */
  totals?: TotalRow[];
  total?: string;
  cta?: string;
  onCta?: () => void;
  /** force the empty state */
  empty?: boolean;
  style?: React.CSSProperties;
}
export declare function OrderSummary(props: OrderSummaryProps): JSX.Element;
