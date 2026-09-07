import React from 'react';
import { Icon } from './Icon.jsx';

const TONE = {
  neutral: { color: 'var(--text-secondary)', border: 'var(--border-default)', bg: 'transparent' },
  accent: { color: 'var(--text-accent)', border: 'var(--border-accent)', bg: 'var(--surface-accent-soft)' },
  success: { color: 'var(--status-success)', border: 'rgba(62,213,152,.4)', bg: 'var(--status-success-surface)' },
  warning: { color: 'var(--status-warning)', border: 'rgba(255,195,77,.4)', bg: 'var(--status-warning-surface)' },
  danger: { color: 'var(--status-danger)', border: 'rgba(255,77,77,.4)', bg: 'var(--status-danger-surface)' },
  info: { color: 'var(--status-info)', border: 'rgba(77,163,255,.4)', bg: 'var(--status-info-surface)' },
};

/** Technical label chip. Also the filter chip when `onRemove` is supplied. */
export function Tag({ children, tone = 'neutral', mono = true, onRemove, icon, style, ...rest }) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 8px',
      borderRadius: 'var(--radius-chip)', border: `1px solid ${t.border}`, background: t.bg, color: t.color,
      fontFamily: mono ? 'var(--font-technical)' : 'var(--font-interface)', fontSize: 11,
      letterSpacing: 'var(--ls-technical)', textTransform: 'uppercase', ...style }} {...rest}>
      {icon && <Icon name={icon} size={12} />}
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove filter"
          style={{ background: 'none', border: 0, padding: 0, marginLeft: 2, display: 'flex', color: 'inherit', cursor: 'pointer', opacity: .7 }}>
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}
