import * as React from 'react';
export interface AnalysisRow { label: string; value: string }
/**
 * Live manufacturing price calculator panel.
 * @startingPoint section="Commerce" subtitle="Live price panel with part analysis" viewport="380x460"
 */
export interface PriceSummaryProps {
  analysis?: AnalysisRow[];
  /** pre-formatted price, e.g. "₹387" */
  price?: string;
  state?: 'valid' | 'calculating' | 'updating' | 'invalid' | 'error';
  /** explanatory or error copy under the price */
  message?: string;
  cta?: string;
  onCta?: () => void;
  /** small uppercase footnote, e.g. "PRICE EXCL. GST" */
  note?: string;
  style?: React.CSSProperties;
}
export declare function PriceSummary(props: PriceSummaryProps): JSX.Element;
