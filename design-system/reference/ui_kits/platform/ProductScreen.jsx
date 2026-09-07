const { Button, Viewer3D, SpecTable, SectionHeading, Tag, QuantityStepper, Select, Breadcrumbs, Panel, ProductCard, StatusDot } = window.SADA3DDesignSystem_217828;

function ProductScreen({ product, onAddToCart, onOpenProduct }) {
  const D = window.SADA_DATA;
  const p = product || D.products[0];
  const [qty, setQty] = React.useState(1);
  const [part, setPart] = React.useState(null);
  const [added, setAdded] = React.useState(false);
  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 32px 96px' }}>
      <Breadcrumbs items={['Shop', 'Mechanical', p.name]} />
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 48, alignItems: 'start' }}>
        <div>
          <Viewer3D height={560} selected={part} onSelect={setPart} partId="PART_00492" />
          {part && (
            <Panel technical title="Component inspection" meta={part.toUpperCase()} style={{ marginTop: 16 }}>
              <SpecTable dense rows={[{ label: 'Component', value: part }, { label: 'Material', value: p.material }, { label: 'Bounding box', value: '38 × 38 × 12 MM' }]} highlightKeys={['Component']} />
            </Panel>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <Tag tone="accent">{p.material}</Tag><Tag>FDM</Tag>
            </div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-h1)', textTransform: 'uppercase', letterSpacing: '-.01em' }}>{p.name}</h1>
            <div style={{ height: 2, width: 48, margin: '16px 0', background: 'var(--gradient-orange-line)' }} />
            <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-secondary)', maxWidth: 460 }}>
              A calibrated spur gear for low-torque drive assemblies. Printed at 0.16 mm and dimensionally verified against the source model before dispatch.
            </p>
          </div>
          <div style={{ font: 'var(--fw-medium) 34px/1 var(--font-technical)' }}>{p.price}</div>
          <StatusDot status="delivered" label="In stock · ships in 48h" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Select label="Material" options={D.materials.map((m) => m.name)} defaultValue={p.material} />
            <Select label="Colour" options={['Black', 'Titanium', 'White', 'Titanium Orange']} />
            <Select label="Quality" options={['Standard · 0.20 mm', 'Fine · 0.16 mm', 'Ultra · 0.12 mm']} defaultValue="Fine · 0.16 mm" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Quantity</span>
              <QuantityStepper value={qty} onChange={setQty} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button size="lg" success={added} onClick={() => { setAdded(true); onAddToCart(p, qty); }} style={{ flex: 1 }}>
              {added ? 'Added to cart' : 'Add to cart'}
            </Button>
            <Button size="lg" variant="secondary" iconLeft="upload">Print my own</Button>
          </div>
          <div>
            <SectionHeading size="sm" meta="PART_00492">Technical specifications</SectionHeading>
            <SpecTable style={{ marginTop: 16 }} rows={D.specs} highlightKeys={['Layer height', 'Est. print time']} />
          </div>
        </div>
      </div>
      <section style={{ marginTop: 96 }}>
        <SectionHeading index="—" meta="04 parts" full>Related parts</SectionHeading>
        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
          {D.products.slice(1, 5).map((r) => <ProductCard key={r.name} {...r} onView={() => onOpenProduct(r)} />)}
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { ProductScreen });
