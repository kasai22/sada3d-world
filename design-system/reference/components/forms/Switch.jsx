import React from 'react';

/** Binary toggle for viewer / configurator options. Rectangular track, sharp knob. */
export function Switch({ checked, onChange, label, disabled, style, ...rest }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 12, cursor: disabled ? 'not-allowed' : 'pointer',
      font: 'var(--type-body-sm)', color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)', ...style }}>
      <input type="checkbox" role="switch" checked={!!checked} disabled={disabled} onChange={onChange}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} {...rest} />
      <span aria-hidden="true" style={{ width: 38, height: 20, padding: 2, borderRadius: 'var(--radius-xs)',
        background: checked ? 'var(--orange-500)' : 'var(--carbon-2)',
        border: `1px solid ${checked ? 'var(--orange-600)' : 'var(--border-default)'}`,
        display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start', transition: 'var(--transition-control)' }}>
        <span style={{ width: 14, height: 14, background: checked ? 'var(--void)' : 'var(--steel)', borderRadius: '1px',
          transition: 'var(--transition-control)' }} />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
