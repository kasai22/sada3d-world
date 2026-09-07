import * as React from 'react';
export interface FilterNode { label: string; count?: number; defaultOpen?: boolean; children?: FilterNode[] }
export interface FilterGroup { label: string; defaultOpen?: boolean; options?: FilterNode[] }
/**
 * Nested facet navigation, up to three levels.
 * @startingPoint section="Navigation" subtitle="Three-level nested filter sidebar" viewport="320x560"
 */
export interface FilterTreeProps {
  groups?: FilterGroup[];
  /** labels of currently-checked nodes */
  selected?: string[];
  onToggle?: (label: string) => void;
  style?: React.CSSProperties;
}
export declare function FilterTree(props: FilterTreeProps): JSX.Element;
