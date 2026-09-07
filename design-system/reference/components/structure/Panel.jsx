import React from 'react';

/** Carbon surface container. `technical` drops the radius to 0 and adds the corner ticks. */
export function Panel({ children, title, meta, technical, padded = true, elevated, style, ...rest }) {
  return (
    <section style={{ position: 'relative', background: 'var(--surface-card)',
      border: '1px solid var(--border-default)', borderRadius: technical ? 'var(--radius-panel-technical)' : 'var(--radius-card)',
      boxShadow: elevated ? 'var(--elevation-2)' : 'none', ...style }} {...rest}>
      {title && (
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
          padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{title}</span>
          {meta && <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{meta}</span>}
        </header>
      )}
      <div style={{ padding: padded ? 'var(--space-inset-panel)' : 0 }}>{children}</div>
      {technical && <><Tick pos={{ top: -1, left: -1 }} /><Tick pos={{ top: -1, right: -1 }} /><Tick pos={{ bottom: -1, left: -1 }} /><Tick pos={{ bottom: -1, right: -1 }} /></>}
    </section>
  );
}

function Tick({ pos }) {
  return <span aria-hidden="true" style={{ position: 'absolute', width: 6, height: 6, borderTop: '1px solid var(--orange-500)', borderLeft: '1px solid var(--orange-500)',
    transform: `rotate(${pos.top != null ? (pos.left != null ? 0 : 90) : (pos.left != null ? 270 : 180)}deg)`, ...pos }} />;
}
