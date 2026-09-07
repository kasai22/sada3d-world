import * as React from 'react';
export interface ProductMeta { label: string; value: string }
/**
 * Minimal premium product card.
 * @startingPoint section="Commerce" subtitle="Product card — default, featured, compact" viewport="700x400"
 */
export interface ProductCardProps {
  name: string;
  material?: string;
  color?: string;
  /** pre-formatted, e.g. "₹399" */
  price?: string;
  meta?: ProductMeta[];
  /** small orange corner label, e.g. "IN STOCK" */
  badge?: string;
  variant?: 'default' | 'featured' | 'compact';
  href?: string;
  onView?: () => void;
  style?: React.CSSProperties;
}
export declare function ProductCard(props: ProductCardProps): JSX.Element;
