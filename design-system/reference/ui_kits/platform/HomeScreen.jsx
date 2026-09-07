const { Button, SectionHeading, ProductCard, MaterialCard, Viewer3D, Icon } = window.SADA3DDesignSystem_217828;

function Hero({ onNavigate }) {
  return (
    <section style={{ position: 'relative', background: 'var(--gradient-hero)', borderBottom: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--bg-grid-lg)' }} />
      <div style={{ position: 'relative', maxWidth: 1440, margin: '0 auto', padding: '0 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', minHeight: 620 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, padding: '80px 0' }}>
          <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-accent)', letterSpacing: 'var(--ls-eyebrow)', textTransform: 'uppercase' }}>Digital to physical</span>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-display-2)', lineHeight: .94, letterSpacing: '-.02em', textTransform: 'uppercase' }}>
            Manufacturing,<br />Reimagined.
          </h1>
          <p style={{ margin: 0, maxWidth: 460, font: 'var(--type-body-lg)', color: 'var(--text-secondary)' }}>
            Transform digital designs into physical products through advanced on-demand 3D manufacturing.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button size="lg" onClick={() => onNavigate('Custom Print')}>Start Printing</Button>
            <Button size="lg" variant="secondary" onClick={() => onNavigate('Shop')}>Explore Designs</Button>
          </div>
          <div style={{ display: 'flex', gap: 32, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
            {[['12', 'MACHINES ONLINE'], ['48H', 'TYPICAL LEAD TIME'], ['±0.1', 'MM TOLERANCE']].map(([v, l]) => (
              <div key={l}><div style={{ font: 'var(--fw-medium) 22px/1 var(--font-technical)', color: 'var(--text-primary)', paddingTop: 16 }}>{v}</div>
                <div style={{ marginTop: 6, font: 'var(--type-technical-sm)', color: 'var(--text-disabled)', letterSpacing: '.12em' }}>{l}</div></div>
            ))}
          </div>
        </div>
        <Viewer3D height={520} toolbar={false} partId="SADA_HERO_01" components={['Housing', 'Gear', 'Base']} style={{ background: 'transparent', border: 0 }} />
      </div>
    </section>
  );
}

function Section({ index, title, meta, children, background }) {
  return (
    <section style={{ background: background || 'var(--surface-page)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '96px 32px' }}>
        <SectionHeading index={index} meta={meta} full>{title}</SectionHeading>
        <div style={{ marginTop: 40 }}>{children}</div>
      </div>
    </section>
  );
}

function HomeScreen({ onNavigate, onOpenProduct }) {
  const D = window.SADA_DATA;
  const [mat, setMat] = React.useState('PLA');
  return (
    <>
      <Hero onNavigate={onNavigate} />
      <Section index="02" title="Discover" meta="08 categories" background="var(--graphite)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'var(--border-subtle)', border: '1px solid var(--border-subtle)' }}>
          {D.categories.map((c, i) => (
            <a key={c} href="#" onClick={(e) => { e.preventDefault(); onNavigate('Shop'); }}
              style={{ borderBottom: 0, background: 'var(--surface-card)', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 40, minHeight: 160, transition: 'var(--transition-control)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-raised)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-card)'; }}>
              <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-disabled)' }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ marginTop: 'auto', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 17, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-primary)' }}>{c}</span>
            </a>
          ))}
        </div>
      </Section>
      <Section index="03" title="Custom Manufacturing" meta="STL · STEP · OBJ">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-display-3)', lineHeight: 1.02, textTransform: 'uppercase' }}>
              Your design.<br />Our machines.<br /><span style={{ color: 'var(--text-accent)' }}>Physical reality.</span>
            </h3>
            <p style={{ maxWidth: 420, font: 'var(--type-body)', color: 'var(--text-secondary)' }}>
              Upload a model, inspect it in the browser, choose material and quality, and see the manufacturing price update as you configure.
            </p>
            <Button size="lg" iconLeft="upload" onClick={() => onNavigate('Custom Print')}>Upload Design</Button>
          </div>
          <div style={{ border: '1px dashed var(--border-strong)', background: 'var(--surface-panel)', padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <Icon name="box" size={32} color="var(--text-muted)" />
            <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase' }}>Drop a model file</span>
            <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>STL · STEP · OBJ · 3MF · MAX 250 MB</span>
          </div>
        </div>
      </Section>
      <Section index="04" title="Materials" meta="05 available" background="var(--graphite)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16 }}>
          {D.materials.map((m) => <MaterialCard key={m.name} {...m} selected={mat === m.name} onSelect={() => setMat(m.name)} />)}
        </div>
      </Section>
      <Section index="05" title="Explore Products" meta="248 parts">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
          {D.products.slice(0, 4).map((p) => <ProductCard key={p.name} {...p} onView={() => onOpenProduct(p)} />)}
        </div>
      </Section>
      <Section index="06" title="How It Works" meta="04 stages" background="var(--graphite)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
          {[['Upload', 'STL, STEP or OBJ. Geometry is verified on arrival.'],
            ['Configure', 'Material, layer height, infill, finish and quantity.'],
            ['Manufacture', 'Queued to a calibrated machine and monitored end to end.'],
            ['Deliver', 'Inspected, packed and dispatched with the part report.']].map(([t, d], i) => (
            <div key={t} style={{ paddingTop: 20, borderTop: '2px solid ' + (i === 0 ? 'var(--orange-500)' : 'var(--border-default)') }}>
              <div style={{ font: 'var(--type-technical-sm)', color: 'var(--text-accent)' }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{ marginTop: 12, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t}</div>
              <p style={{ margin: '10px 0 0', font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{d}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section index="07" title="Applications" meta="industries">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {[['Automotive', 'Jigs, fixtures and interior components produced in days, not weeks.'],
            ['Industrial', 'Replacement parts and low-volume runs for machinery already in service.'],
            ['Product development', 'Iterate physical prototypes alongside the CAD model.']].map(([t, d]) => (
            <div key={t} style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', padding: 28 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t}</div>
              <div style={{ height: 2, width: 40, margin: '14px 0', background: 'var(--gradient-orange-line)' }} />
              <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{d}</p>
            </div>
          ))}
        </div>
      </Section>
      <section style={{ position: 'relative', background: 'var(--void)', overflow: 'hidden' }}>
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--bg-grid)' }} />
        <div style={{ position: 'relative', maxWidth: 1440, margin: '0 auto', padding: '128px 32px', textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-display-2)', lineHeight: .94, textTransform: 'uppercase', letterSpacing: '-.02em' }}>
            Manufacturing,<br />Reimagined.
          </h2>
          <div style={{ height: 2, width: 120, margin: '32px auto', background: 'var(--gradient-orange-line)', boxShadow: 'var(--glow-line)' }} />
          <Button size="lg" onClick={() => onNavigate('Custom Print')}>Start Printing</Button>
        </div>
      </section>
    </>
  );
}

Object.assign(window, { HomeScreen });
