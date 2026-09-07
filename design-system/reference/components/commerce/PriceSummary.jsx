import React from 'react';
import { Button } from '../core/Button.jsx';

/** Live manufacturing price panel — part analysis + estimated price with all calc states. */
export function PriceSummary({ analysis = [], price, state = 'valid', message, cta = 'Configure Print',
  onCta, note, style }) {
  const invalid = state === 'invalid' || state === 'error';
  const busy = state === 'calculating' || state === 'updating';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-card)',
      border: `1px solid ${invalid ? 'var(--status-danger)' : 'var(--border-default)'}`, borderRadius: 'var(--radius-panel-technical)', ...style }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-primary)' }}>Part analysis</span>
      </div>
      <dl style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0, padding: 20 }}>
        {analysis.map((a) => (
          <div key={a.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <dt style={{ font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{a.label}</dt>
            <dd style={{ margin: 0, font: 'var(--type-technical)', color: 'var(--text-primary)',
              opacity: busy ? .4 : 1, transition: 'opacity var(--motion-fast) var(--ease-standard)' }}>{a.value}</dd>
          </div>
        ))}
      </dl>
      <div style={{ padding: 20, borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-panel)' }}>
        <span style={{ display: 'block', font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--ls-label)' }}>
          Estimated price
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
          <span style={{ fontFamily: 'var(--font-technical)', fontWeight: 'var(--fw-medium)', fontSize: 40, lineHeight: 1,
            color: invalid ? 'var(--text-disabled)' : 'var(--text-primary)' }}>
            {busy ? '—' : invalid ? '—' : price}
          </span>
          {busy && <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-accent)', textTransform: 'uppercase' }}>
            {state === 'calculating' ? 'Calculating' : 'Updating'}
          </span>}
        </span>
        <span aria-hidden="true" style={{ display: 'block', height: 2, marginTop: 14,
          background: invalid ? 'var(--status-danger)' : 'var(--gradient-orange-line)',
          boxShadow: invalid ? 'none' : 'var(--glow-line)' }} />
        {message && <p style={{ margin: '14px 0 0', font: 'var(--type-body-sm)', color: invalid ? 'var(--status-danger)' : 'var(--text-muted)' }}>{message}</p>}
        <Button variant={invalid ? 'secondary' : 'primary'} fullWidth disabled={invalid} loading={busy}
          onClick={onCta} style={{ marginTop: 16 }}>{cta}</Button>
        {note && <p style={{ margin: '12px 0 0', font: 'var(--type-technical-sm)', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>{note}</p>}
      </div>
    </div>
  );
}
