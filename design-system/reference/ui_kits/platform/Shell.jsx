const { Header } = window.SADA3DDesignSystem_217828;

function Footer() {
  const cols = [
    ['Shop', ['Mechanical', 'Automotive', 'Industrial', 'Lifestyle']],
    ['Manufacture', ['Custom print', 'Materials', 'Tolerances', 'File formats']],
    ['Company', ['About', 'Facilities', 'Careers', 'Contact']],
  ];
  return (
    <footer style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--void)', padding: '56px 32px 40px' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.4fr repeat(3,1fr)', gap: 40 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, letterSpacing: '.16em', textTransform: 'uppercase' }}>
            <span>SADA</span><span style={{ color: 'var(--text-accent)' }}>3D</span>
          </div>
          <div style={{ height: 2, width: 48, margin: '14px 0', background: 'var(--gradient-orange-line)' }} />
          <p style={{ margin: 0, font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.14em' }}>Manufacturing, reimagined.</p>
        </div>
        {cols.map(([t, items]) => (
          <div key={t}>
            <div style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{t}</div>
            <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((i) => <li key={i}><a href="#" style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)', borderBottom: 0 }}>{i}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1440, margin: '48px auto 0', paddingTop: 20, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between',
        font: 'var(--type-technical-sm)', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>
        <span>© 2026 SADA 3D MANUFACTURING</span><span>BENGALURU · IN</span>
      </div>
    </footer>
  );
}

function Shell({ view, onNavigate, cartCount, children }) {
  return (
    <div style={{ minHeight: '100%', background: 'var(--surface-page)' }}>
      <Header active={view} cartCount={cartCount} onNavigate={onNavigate} />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

Object.assign(window, { Shell, Footer });
