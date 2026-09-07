import React from 'react';
import { Button } from '../core/Button.jsx';

/** Cart / checkout totals block. */
export function OrderSummary({ items = [], totals = [], total, cta = 'Complete Order', onCta, empty, style }) {
  if (empty || items.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', ...style }}>
        <p style={{ margin: 0, font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--ls-label)' }}>Your order is empty</p>
        <Button variant="secondary" size="sm" style={{ marginTop: 20 }}>Explore designs</Button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, ...style }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-medium)', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)' }}>{it.name}</span>
              <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{it.spec}</span>
              <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-disabled)' }}>× {it.qty}</span>
            </div>
            <span style={{ font: 'var(--type-technical)', color: 'var(--text-primary)' }}>{it.price}</span>
          </div>
        ))}
      </div>
      <dl style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0 }}>
        {totals.map((t) => (
          <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <dt style={{ font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--ls-label)' }}>{t.label}</dt>
            <dd style={{ margin: 0, font: 'var(--type-technical)', color: 'var(--text-secondary)' }}>{t.value}</dd>
          </div>
        ))}
      </dl>
      <div style={{ borderTop: '2px solid var(--border-accent)', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-primary)' }}>Total</span>
        <span style={{ fontFamily: 'var(--font-technical)', fontWeight: 'var(--fw-medium)', fontSize: 26, color: 'var(--text-primary)' }}>{total}</span>
      </div>
      <Button variant="primary" size="lg" fullWidth onClick={onCta}>{cta}</Button>
    </div>
  );
}
