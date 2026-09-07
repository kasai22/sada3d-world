import * as React from 'react';
export interface MaterialProperties { strength?: number; flexibility?: number; heat?: number }
/**
 * Material selector card.
 * @startingPoint section="Commerce" subtitle="Material cards with property bars" viewport="700x340"
 */
export interface MaterialCardProps {
  name: string;
  /** technical sub-code, e.g. "POLYLACTIC ACID" */
  code?: string;
  description?: string;
  /** each rated 1–5 */
  properties?: MaterialProperties;
  /** CSS colours available in this material */
  colors?: string[];
  /** price multiplier, e.g. "1.4" */
  multiplier?: string;
  selected?: boolean;
  onSelect?: () => void;
  style?: React.CSSProperties;
}
export declare function MaterialCard(props: MaterialCardProps): JSX.Element;
