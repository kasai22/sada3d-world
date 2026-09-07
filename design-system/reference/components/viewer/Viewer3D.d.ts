import * as React from 'react';
/**
 * Reusable interactive part viewer with exploded-view and inspection states.
 * @startingPoint section="3D" subtitle="Part viewer with toolbar and exploded view" viewport="700x420"
 */
export interface Viewer3DProps {
  height?: number;
  /** start in exploded state */
  exploded?: boolean;
  autoRotate?: boolean;
  /** currently inspected component name */
  selected?: string | null;
  onSelect?: (name: string | null) => void;
  /** component names, bottom-to-top */
  components?: string[];
  toolbar?: boolean;
  partId?: string;
  style?: React.CSSProperties;
}
export declare function Viewer3D(props: Viewer3DProps): JSX.Element;
