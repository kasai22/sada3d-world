import * as React from 'react';
export interface TagProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style'> {
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  /** technical mono face (default) vs interface face */
  mono?: boolean;
  /** renders a dismiss affordance — turns the Tag into a filter chip */
  onRemove?: () => void;
  /** Lucide icon id */
  icon?: string;
  style?: React.CSSProperties;
}
export declare function Tag(props: TagProps): JSX.Element;
