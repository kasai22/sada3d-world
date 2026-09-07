import React from 'react';

/** Technical breadcrumb trail — mono, uppercase, slash separators. */
export function Breadcrumbs({ items = [], style }) {
  return (
    <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      font: 'var(--type-technical-sm)', letterSpacing: 'var(--ls-technical)', textTransform: 'uppercase', ...style }}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        const label = typeof it === 'string' ? it : it.label;
        return (
          <React.Fragment key={i}>
            {last
              ? <span aria-current="page" style={{ color: 'var(--text-primary)' }}>{label}</span>
              : <a href={(typeof it === 'object' && it.href) || '#'} style={{ color: 'var(--text-muted)', borderBottom: 0 }}>{label}</a>}
            {!last && <span aria-hidden="true" style={{ color: 'var(--titanium-2)' }}>/</span>}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
