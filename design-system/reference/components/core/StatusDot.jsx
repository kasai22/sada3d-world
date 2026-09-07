import React from 'react';

const COLORS = {
  queued: 'var(--status-idle)', processing: 'var(--status-info)', printing: 'var(--status-active)',
  quality: 'var(--status-info)', packaging: 'var(--status-info)', shipped: 'var(--status-success)',
  delivered: 'var(--status-success)', paused: 'var(--status-warning)', failed: 'var(--status-danger)',
  complete: 'var(--status-success)', idle: 'var(--status-idle)',
};

/** Manufacturing status indicator. Never relies on colour alone — always pair with a text label. */
export function StatusDot({ status = 'idle', pulse = false, size = 8, label, style }) {
  const c = COLORS[status] || COLORS.idle;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
      <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 'var(--radius-pill)', background: c,
        boxShadow: pulse ? `0 0 0 3px color-mix(in srgb, ${c} 22%, transparent)` : 'none',
        animation: pulse ? 'sada-pulse 1.6s var(--ease-standard) infinite' : 'none' }} />
      {label && <span style={{ font: 'var(--type-technical-sm)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{label}</span>}
      <style>{'@keyframes sada-pulse{0%,100%{opacity:1}50%{opacity:.45}}'}</style>
    </span>
  );
}
