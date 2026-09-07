import React from 'react';
import { Icon } from '../core/Icon.jsx';

/** Quantity control for product and configurator pages. */
export function QuantityStepper({ value = 1, min = 1, max = 999, onChange, style }) {
  const set = (v) => onChange && onChange(Math.min(max, Math.max(min, v)));
  const btn = {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 0, color: 'var(--text-secondary)', cursor: 'pointer', transition: 'var(--transition-control)',
  };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-input)',
      background: 'var(--surface-panel)', ...style }}>
      <button type="button" aria-label="Decrease quantity" onClick={() => set(value - 1)} style={btn}><Icon name="minus" size={14} /></button>
      <span style={{ minWidth: 40, textAlign: 'center', font: 'var(--type-technical)', color: 'var(--text-primary)' }}>{String(value).padStart(2, '0')}</span>
      <button type="button" aria-label="Increase quantity" onClick={() => set(value + 1)} style={btn}><Icon name="plus" size={14} /></button>
    </div>
  );
}
