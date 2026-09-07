import React from 'react';
import { Icon } from '../core/Icon.jsx';

/** Text / numeric field. 3px corners, hairline titanium border, orange focus rule. */
export function Input({ label, hint, error, icon, suffix, size = 'md', disabled, technical, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const h = size === 'sm' ? 'var(--control-height-sm)' : size === 'lg' ? 'var(--control-height-lg)' : 'var(--control-height-md)';
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {label && <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>}
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: h, padding: '0 12px',
        background: disabled ? 'var(--interactive-disabled-surface)' : 'var(--surface-panel)',
        border: `1px solid ${error ? 'var(--status-danger)' : focus ? 'var(--border-focus)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-input)', transition: 'var(--transition-control)',
        boxShadow: focus && !error ? 'var(--glow-orange-xs)' : 'none' }}>
        {icon && <Icon name={icon} size={15} color="var(--text-muted)" />}
        <input disabled={disabled} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
            font: technical ? 'var(--type-technical)' : 'var(--type-body)', letterSpacing: technical ? 'var(--ls-technical)' : 'var(--ls-body)' }} {...rest} />
        {suffix && <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{suffix}</span>}
      </span>
      {(hint || error) && <span style={{ font: 'var(--type-body-sm)', color: error ? 'var(--status-danger)' : 'var(--text-muted)' }}>{error || hint}</span>}
    </label>
  );
}
