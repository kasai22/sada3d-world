import React from 'react';

/** Single-choice control. Circular by exception — the only round control in SADA 3D. */
export function Radio({ label, description, checked, disabled, name, onChange, style, ...rest }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 32, cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)', font: 'var(--type-body-sm)', ...style }}>
      <input type="radio" name={name} checked={!!checked} disabled={disabled} onChange={onChange}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} {...rest} />
      <span aria-hidden="true" style={{ width: 16, height: 16, marginTop: 2, flex: '0 0 auto', borderRadius: 'var(--radius-pill)',
        border: `1px solid ${checked ? 'var(--orange-500)' : 'var(--border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'var(--transition-control)' }}>
        {checked && <span style={{ width: 7, height: 7, borderRadius: 'var(--radius-pill)', background: 'var(--orange-500)' }} />}
      </span>
      <span>
        <span style={{ color: checked ? 'var(--text-primary)' : undefined }}>{label}</span>
        {description && <span style={{ display: 'block', font: 'var(--type-technical-sm)', color: 'var(--text-muted)', marginTop: 2 }}>{description}</span>}
      </span>
    </label>
  );
}
