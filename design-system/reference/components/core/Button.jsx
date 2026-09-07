import React from 'react';
import { Icon } from './Icon.jsx';

const SIZES = {
  sm: { height: 'var(--control-height-sm)', padding: '0 14px', font: '11px', ls: '0.12em', icon: 14 },
  md: { height: 'var(--control-height-md)', padding: '0 20px', font: '12px', ls: '0.12em', icon: 16 },
  lg: { height: 'var(--control-height-lg)', padding: '0 28px', font: '13px', ls: '0.14em', icon: 18 },
};

function skin(variant, state) {
  const map = {
    primary: { background: 'var(--gradient-orange)', color: 'var(--text-on-accent)', border: '1px solid var(--orange-600)' },
    secondary: { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' },
    tertiary: { background: 'var(--surface-raised)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' },
    technical: { background: 'transparent', color: 'var(--text-accent)', border: '1px solid var(--border-accent)' },
    destructive: { background: 'transparent', color: 'var(--status-danger)', border: '1px solid rgba(255,77,77,.45)' },
  };
  const hover = {
    primary: { filter: 'brightness(1.08)', boxShadow: 'var(--glow-orange-sm)' },
    secondary: { borderColor: 'var(--white)', background: 'var(--interactive-hover-surface)' },
    tertiary: { background: 'var(--carbon-2)', borderColor: 'var(--border-default)' },
    ghost: { color: 'var(--text-primary)', background: 'var(--interactive-hover-surface)' },
    technical: { background: 'var(--surface-accent-soft)' },
    destructive: { background: 'var(--status-danger-surface)' },
  };
  return { ...map[variant], ...(state === 'hover' ? hover[variant] : null) };
}

/** SADA 3D action. Sharp corners, uppercase technical label, no pills. */
export function Button({ variant = 'primary', size = 'md', children, iconLeft, iconRight, loading, success,
  disabled, fullWidth, selected, style, onMouseEnter, onMouseLeave, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const inert = disabled || loading;
  const base = skin(variant, hover && !inert ? 'hover' : 'default');
  return (
    <button type="button" disabled={inert} data-selected={selected || undefined}
      onMouseEnter={(e) => { setHover(true); onMouseEnter && onMouseEnter(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave && onMouseLeave(e); }}
      style={{
        display: fullWidth ? 'flex' : 'inline-flex', width: fullWidth ? '100%' : undefined,
        alignItems: 'center', justifyContent: 'center', gap: 10,
        height: s.height, padding: s.padding, borderRadius: 'var(--radius-button)',
        fontFamily: 'var(--font-interface)', fontSize: s.font, fontWeight: 'var(--fw-semibold)',
        letterSpacing: s.ls, textTransform: 'uppercase', whiteSpace: 'nowrap',
        cursor: inert ? 'not-allowed' : 'pointer', transition: 'var(--transition-control), filter var(--motion-fast) var(--ease-standard)',
        transform: 'translateZ(0)',
        ...base,
        ...(success ? { borderColor: 'var(--status-success)', color: 'var(--status-success)', background: 'var(--status-success-surface)', filter: 'none', boxShadow: 'none' } : null),
        ...(inert ? { background: 'var(--interactive-disabled-surface)', color: 'var(--text-disabled)', border: '1px solid var(--interactive-disabled-border)', filter: 'none', boxShadow: 'none' } : null),
        ...style,
      }} {...rest}>
      {loading && <span style={{ width: s.icon, height: s.icon, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'sada-spin 700ms linear infinite' }} />}
      {!loading && success && <Icon name="check" size={s.icon} />}
      {!loading && !success && iconLeft && <Icon name={iconLeft} size={s.icon} />}
      <span>{children}</span>
      {!loading && iconRight && <Icon name={iconRight} size={s.icon} />}
      <style>{'@keyframes sada-spin{to{transform:rotate(360deg)}}'}</style>
    </button>
  );
}
