import React from 'react';
import { Button } from '../core/Button.jsx';

/** Minimal premium product card. Sharp corners, generous whitespace, technical metadata. */
export function ProductCard({ name, material = 'PLA', color = 'Black', price, meta = [], badge,
  variant = 'default', href = '#', onView, style }) {
  const [hover, setHover] = React.useState(false);
  const compact = variant === 'compact';
  const featured = variant === 'featured';
  return (
    <article onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-card)',
        border: `1px solid ${hover ? 'var(--border-strong)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-card)',
        transform: hover ? 'translateY(var(--hover-lift))' : 'none', transition: 'var(--transition-surface), border-color var(--motion-fast) var(--ease-standard)',
        overflow: 'hidden', ...style }}>
      <div style={{ position: 'relative', aspectRatio: featured ? '16 / 10' : '4 / 3', background: 'var(--gradient-viewer)', overflow: 'hidden' }}>
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--bg-grid)' }} />
        <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', width: featured ? 132 : 96, height: featured ? 132 : 96,
          transform: `translate(-50%,-50%) rotateX(-20deg) rotateY(${hover ? 42 : 28}deg)`, transformStyle: 'preserve-3d',
          background: 'var(--gradient-metal)', border: '1px solid var(--titanium-2)',
          boxShadow: hover ? 'var(--glow-orange-sm), inset 0 0 40px rgba(0,0,0,.6)' : 'inset 0 0 40px rgba(0,0,0,.6)',
          transition: 'transform var(--motion-slow) var(--ease-out), box-shadow var(--motion-medium) var(--ease-standard)' }} />
        {badge && <span style={{ position: 'absolute', top: 12, left: 12, padding: '3px 8px', background: 'var(--surface-accent-soft)',
          border: '1px solid var(--border-accent)', color: 'var(--text-accent)', font: 'var(--type-technical-sm)',
          textTransform: 'uppercase', letterSpacing: 'var(--ls-technical)' }}>{badge}</span>}
        <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2,
          background: 'var(--gradient-orange-line)', transform: hover ? 'scaleX(1)' : 'scaleX(0)', transformOrigin: 'left',
          transition: 'var(--transition-line)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12, padding: compact ? 16 : 20, flex: 1 }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-medium)', fontSize: compact ? 15 : 17,
          letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{name}</h3>
        <p style={{ margin: 0, font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--ls-technical)' }}>
          {material} / {color}
        </p>
        {!compact && meta.length > 0 && (
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: 0 }}>
            {meta.map((m) => (
              <React.Fragment key={m.label}>
                <dt style={{ font: 'var(--type-technical-sm)', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>{m.label}</dt>
                <dd style={{ margin: 0, textAlign: 'right', font: 'var(--type-technical-sm)', color: 'var(--text-secondary)' }}>{m.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ font: 'var(--fw-medium) 17px/1 var(--font-technical)', color: 'var(--text-primary)' }}>{price}</span>
          <Button variant="secondary" size="sm" onClick={onView}>View</Button>
        </div>
      </div>
    </article>
  );
}
