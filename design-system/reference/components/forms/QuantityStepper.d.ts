import * as React from 'react';
export interface QuantityStepperProps {
  value?: number; min?: number; max?: number;
  onChange?: (value: number) => void;
  style?: React.CSSProperties;
}
export declare function QuantityStepper(props: QuantityStepperProps): JSX.Element;
