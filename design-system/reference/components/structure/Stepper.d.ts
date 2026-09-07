import * as React from 'react';
export interface StepperProps {
  steps?: Array<string | { label: string }>;
  /** zero-based index of the active step */
  current?: number;
  onSelect?: (index: number) => void;
  style?: React.CSSProperties;
}
export declare function Stepper(props: StepperProps): JSX.Element;
