import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { ProgressBar } from './ProgressBar.jsx';

/** Seven-stage manufacturing tracker — replaces the generic shipment timeline. */
export function ManufacturingTimeline({ stages = [], style }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {stages.map((s, i) => {
        const done = s.state === 'complete';
        const active = s.state === 'active';
        const failed = s.state === 'failed';
        const color = failed ? 'var(--status-danger)' : done ? 'var(--status-success)' : active ? 'var(--orange-500)' : 'var(--text-disabled)';
        return (
          <li key={s.label} style={{ display: 'flex', gap: 16, ...style }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
              <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${done || active || failed ? color : 'var(--border-default)'}`,
                background: active ? 'var(--surface-accent-soft)' : 'transparent' }}>
                {done && <Icon name="check" size={12} color={color} />}
                {active && <span style={{ width: 6, height: 6, background: color, animation: 'sada-pulse 1.6s var(--ease-standard) infinite' }} />}
                {failed && <Icon name="x" size={12} color={color} />}
              </span>
              {i < stages.length - 1 && <span style={{ flex: 1, width: 1, minHeight: 28, background: done ? 'var(--status-success)' : 'var(--border-subtle)' }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <span style={{ display: 'inline-flex', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-disabled)' }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase',
                    color: done || active ? 'var(--text-primary)' : 'var(--text-muted)' }}>{s.label}</span>
                </span>
                {s.meta && <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.meta}</span>}
              </div>
              {active && s.progress != null && <ProgressBar value={s.progress} showValue label={null} style={{ marginTop: 12, maxWidth: 320 }} />}
            </div>
            <style>{'@keyframes sada-pulse{0%,100%{opacity:1}50%{opacity:.4}}'}</style>
          </li>
        );
      })}
    </ol>
  );
}
