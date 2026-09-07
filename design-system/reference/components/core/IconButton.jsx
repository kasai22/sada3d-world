import React from 'react';
import { Icon } from './Icon.jsx';

const SZ = { sm: 32, md: 40, lg: 48 };

/** Square icon-only control. Used in the 3D viewer toolbar, header utilities, table row actions. */
export function IconButton({ icon = 'box', size = 'md', label, active, variant = 'ghost', disabled, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const d = SZ[size] || SZ.md;
  const outlined = variant === 'outline';
  return (
    <button type="button" aria-label={label} aria-pressed={active} disabled={disabled} title={label}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: d, height: d, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--radius-button)',
        border: outlined ? '1px solid var(--border-default)' : '1px solid transparent',
        background: active ? 'var(--interactive-selected-surface)' : hover && !disabled ? 'var(--interactive-hover-surface)' : 'transparent',
        borderColor: active ? 'var(--border-accent)' : outlined ? 'var(--border-default)' : 'transparent',
        color: disabled ? 'var(--text-disabled)' : active ? 'var(--text-accent)' : hover ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'var(--transition-control)', ...style,
      }} {...rest}>
      <Icon name={icon} size={size === 'sm' ? 15 : size === 'lg' ? 20 : 17} />
    </button>
  );
}
