import React from 'react';
import { Icon } from '../core/Icon.jsx';

/** Horizontal process stepper — the configurator flow (01 UPLOAD → 05 REVIEW). */
export function Stepper({ steps = [], current = 0, onSelect, style }) {
  return (
    <ol style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0, gap: 0, width: '100%', ...style }}>
      {steps.map((s, i) => {
        const done = i < current, active = i === current;
        const label = typeof s === 'string' ? s : s.label;
        return (
          <li key={i} style={{ flex: 1, minWidth: 0 }}>
            <button type="button" onClick={() => onSelect && onSelect(i)} disabled={!onSelect}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '0 16px 12px 0', cursor: onSelect ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ font: 'var(--type-technical-sm)', color: active ? 'var(--text-accent)' : done ? 'var(--text-secondary)' : 'var(--text-disabled)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase',
                  color: active ? 'var(--text-primary)' : done ? 'var(--text-secondary)' : 'var(--text-disabled)' }}>{label}</span>
                {done && <Icon name="check" size={12} color="var(--status-success)" />}
              </span>
              <span style={{ height: 2, width: '100%', background: active ? 'var(--gradient-orange-line)' : done ? 'var(--titanium-2)' : 'var(--border-subtle)',
                boxShadow: active ? 'var(--glow-line)' : 'none', transition: 'var(--transition-control)' }} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
