import * as React from 'react';
/**
 * The Titanium Orange Line — SADA 3D's signature section marker.
 * @startingPoint section="Structure" subtitle="Signature orange-rule section heading" viewport="700x160"
 */
export interface SectionHeadingProps {
  children?: React.ReactNode;
  /** technical index, e.g. "02" */
  index?: string;
  /** right-aligned metadata, e.g. "08 CATEGORIES" */
  meta?: string;
  /** rule width in px when not full-bleed */
  width?: number;
  full?: boolean;
  align?: 'left' | 'center';
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}
export declare function SectionHeading(props: SectionHeadingProps): JSX.Element;
