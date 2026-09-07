const { SectionHeading, ProductCard, FilterTree, Tag, Button, Select, Breadcrumbs } = window.SADA3DDesignSystem_217828;

function MarketplaceScreen({ onOpenProduct }) {
  const D = window.SADA_DATA;
  const [sel, setSel] = React.useState(['Mechanical', 'PLA']);
  const toggle = (l) => setSel((s) => (s.includes(l) ? s.filter((x) => x !== l) : [...s, l]));
  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 32px 96px', display: 'grid', gridTemplateColumns: '280px 1fr', gap: 48, alignItems: 'start' }}>
      <aside style={{ position: 'sticky', top: 96 }}>
        <SectionHeading size="sm" meta={sel.length ? sel.length + ' active' : null}>Filters</SectionHeading>
        <div style={{ marginTop: 20 }}>
          <FilterTree groups={D.filters} selected={sel} onToggle={toggle} />
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={() => setSel([])}>Clear all</Button>
          <Button variant="ghost" size="sm">Apply</Button>
        </div>
      </aside>
      <div>
        <Breadcrumbs items={['Shop', 'All parts']} />
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-h1)', textTransform: 'uppercase', letterSpacing: '-.01em' }}>All parts</h1>
            <div style={{ height: 2, width: 48, marginTop: 12, background: 'var(--gradient-orange-line)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>248 results</span>
            <Select options={['Sort: Relevance', 'Sort: Price low → high', 'Sort: Fastest lead time']} style={{ minWidth: 220 }} />
          </div>
        </div>
        {sel.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 24 }}>
            {sel.map((s) => <Tag key={s} tone="accent" onRemove={() => toggle(s)}>{s}</Tag>)}
          </div>
        )}
        <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {D.products.map((p) => <ProductCard key={p.name} {...p} onView={() => onOpenProduct(p)} />)}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MarketplaceScreen });
