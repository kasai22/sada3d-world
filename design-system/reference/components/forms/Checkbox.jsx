import React from 'react';
import { Icon } from '../core/Icon.jsx';

/** Square 16px checkbox — the filter-tree primitive. */
export function Checkbox({ label, count, checked, indeterminate, disabled, onChange, style, ...rest }) {
  const on = checked || indeterminate;
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32, cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)', font: 'var(--type-body-sm)', ...style }}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={onChange}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} {...rest} />
      <span aria-hidden="true" style={{ width: 16, height: 16, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--radius-xs)', border: `1px solid ${on ? 'var(--orange-500)' : 'var(--border-strong)'}`,
        background: on ? 'var(--orange-500)' : 'transparent', transition: 'var(--transition-control)' }}>
        {checked && <Icon name="check" size={12} color="var(--text-on-accent)" />}
        {!checked && indeterminate && <span style={{ width: 8, height: 2, background: 'var(--text-on-accent)' }} />}
      </span>
      <span style={{ flex: 1, color: checked ? 'var(--text-primary)' : undefined }}>{label}</span>
      {count != null && <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-muted)' }}>{count}</span>}
    </label>
  );
}
