import React from 'react';
import { Icon } from '../core/Icon.jsx';

/** Native select styled to the SADA 3D field spec. */
export function Select({ label, options = [], hint, error, disabled, style, ...rest }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {label && <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <select disabled={disabled} style={{ appearance: 'none', width: '100%', height: 'var(--control-height-md)', padding: '0 36px 0 12px',
          background: disabled ? 'var(--interactive-disabled-surface)' : 'var(--surface-panel)',
          border: `1px solid ${error ? 'var(--status-danger)' : 'var(--border-default)'}`, borderRadius: 'var(--radius-input)',
          color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)', font: 'var(--type-body)', cursor: disabled ? 'not-allowed' : 'pointer' }} {...rest}>
          {options.map((o) => {
            const v = typeof o === 'string' ? o : o.value;
            const l = typeof o === 'string' ? o : o.label;
            return <option key={v} value={v} style={{ background: 'var(--carbon)' }}>{l}</option>;
          })}
        </select>
        <Icon name="chevron-down" size={15} color="var(--text-muted)" style={{ position: 'absolute', right: 12, pointerEvents: 'none' }} />
      </span>
      {(hint || error) && <span style={{ font: 'var(--type-body-sm)', color: error ? 'var(--status-danger)' : 'var(--text-muted)' }}>{error || hint}</span>}
    </label>
  );
}
