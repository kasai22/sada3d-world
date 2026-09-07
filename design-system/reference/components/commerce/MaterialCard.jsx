import React from 'react';

const BARS = ['strength', 'flexibility', 'heat'];

/** Interactive material selector card — PLA / PETG / ABS / TPU / RESIN. */
export function MaterialCard({ name, code, description, properties = {}, colors = [], multiplier,
  selected, onSelect, style }) {
  const [hover, setHover] = React.useState(false);
  const on = selected;
  return (
    <button type="button" onClick={onSelect} aria-pressed={!!selected}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14, padding: 20,
        background: on ? 'var(--interactive-selected-surface)' : 'var(--surface-card)',
        border: `1px solid ${on ? 'var(--border-accent)' : hover ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-card)', cursor: 'pointer', transition: 'var(--transition-control)', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-semibold)', fontSize: 22,
          letterSpacing: '0.06em', color: on ? 'var(--text-accent)' : 'var(--text-primary)' }}>{name}</span>
        {multiplier && <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-muted)' }}>×{multiplier}</span>}
      </div>
      <span aria-hidden="true" style={{ height: 2, width: on ? '100%' : 32, background: on ? 'var(--gradient-orange-line)' : 'var(--titanium)',
        transition: 'var(--transition-line)' }} />
      {code && <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>{code}</span>}
      {description && <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{description}</p>}
      <dl style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0 }}>
        {BARS.filter((b) => properties[b] != null).map((b) => (
          <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <dt style={{ width: 76, font: 'var(--type-technical-sm)', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>{b}</dt>
            <dd style={{ margin: 0, flex: 1, display: 'flex', gap: 3 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} style={{ flex: 1, height: 3, background: i < properties[b] ? (on ? 'var(--orange-500)' : 'var(--silver)') : 'var(--titanium)' }} />
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {colors.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          {colors.map((c) => <span key={c} title={c} style={{ width: 16, height: 16, background: c, border: '1px solid var(--border-strong)' }} />)}
        </div>
      )}
    </button>
  );
}
