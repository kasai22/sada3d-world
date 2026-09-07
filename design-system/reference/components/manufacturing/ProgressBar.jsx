import React from 'react';

/** Manufacturing progress. Segmented orange fill against a titanium track. */
export function ProgressBar({ value = 0, label, showValue = true, segments = 20, tone = 'active', style }) {
  const filled = Math.round((value / 100) * segments);
  const color = tone === 'paused' ? 'var(--status-warning)' : tone === 'failed' ? 'var(--status-danger)'
    : tone === 'complete' ? 'var(--status-success)' : 'var(--orange-500)';
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {(label || showValue) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-technical-sm)', textTransform: 'uppercase', letterSpacing: 'var(--ls-label)' }}>
          {label && <span style={{ color: 'var(--text-muted)' }}>{label}</span>}
          {showValue && <span style={{ color }}>{value}%</span>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: segments }).map((_, i) => (
          <span key={i} style={{ flex: 1, height: 6, background: i < filled ? color : 'var(--titanium)',
            boxShadow: i === filled - 1 ? 'var(--glow-line)' : 'none',
            transition: 'background var(--motion-medium) var(--ease-standard)' }} />
        ))}
      </div>
    </div>
  );
}
