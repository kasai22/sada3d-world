import React from 'react';

/** THE TITANIUM ORANGE LINE — the SADA 3D signature. An uppercase label above a
 *  2px orange rule. Opens every section, panel and technical block. */
export function SectionHeading({ children, index, meta, width = 48, full = false, align = 'left', size = 'md', style }) {
  const fs = size === 'lg' ? 'var(--fs-h3)' : size === 'sm' ? 11 : 13;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: align === 'center' ? 'center' : 'stretch', ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, justifyContent: align === 'center' ? 'center' : 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 12 }}>
          {index && <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-accent)', letterSpacing: 'var(--ls-technical)' }}>{index}</span>}
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-semibold)', fontSize: fs,
            letterSpacing: size === 'lg' ? 'var(--ls-heading)' : 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{children}</span>
        </span>
        {meta && <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{meta}</span>}
      </div>
      <span aria-hidden="true" style={{ height: 2, width: full ? '100%' : width, background: 'var(--gradient-orange-line)', boxShadow: 'var(--glow-line)' }} />
    </div>
  );
}
