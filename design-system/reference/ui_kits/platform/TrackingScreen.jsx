const { ManufacturingTimeline, Panel, SpecTable, SectionHeading, Tag, StatusDot, Button, Breadcrumbs } = window.SADA3DDesignSystem_217828;

function TrackingScreen() {
  const [t, setT] = React.useState(68);
  React.useEffect(() => { const id = setInterval(() => setT((v) => (v >= 99 ? 68 : v + 1)), 2600); return () => clearInterval(id); }, []);
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 32px 96px' }}>
      <Breadcrumbs items={['Account', 'Orders', 'SD-24081']} />
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}>
        <SectionHeading meta="ORDER SD-24081">Manufacturing status</SectionHeading>
        <StatusDot status="printing" pulse label="Printing" />
      </div>
      <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48, alignItems: 'start' }}>
        <ManufacturingTimeline stages={[
          { label: 'Design verified', state: 'complete', meta: '09:02' },
          { label: 'File processed', state: 'complete', meta: '09:14' },
          { label: 'Material prepared', state: 'complete', meta: '09:31' },
          { label: 'Printing', state: 'active', progress: t, meta: 'SADA-FDM-07' },
          { label: 'Quality check' }, { label: 'Packaging' }, { label: 'Shipping' },
        ]} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 96 }}>
          <Panel technical title="Machine" meta="ONLINE">
            <SpecTable dense rows={[{ label: 'Printer', value: 'SADA-FDM-07' }, { label: 'Material', value: 'PLA / BLACK' }, { label: 'Nozzle', value: '0.4 MM' }, { label: 'Layer', value: '0.16 MM' }, { label: 'Est. completion', value: '01:42:18' }]} highlightKeys={['Est. completion']} />
          </Panel>
          <Panel title="Part" meta="PART_00492">
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}><Tag tone="accent">PLA</Tag><Tag>FDM</Tag><Tag tone="success">Verified</Tag></div>
            <SpecTable dense rows={[{ label: 'Quantity', value: '02' }, { label: 'Dimensions', value: '80 × 40 × 20 MM' }, { label: 'Weight', value: '34 G EACH' }]} />
            <Button variant="secondary" size="sm" fullWidth style={{ marginTop: 20 }}>Download part report</Button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TrackingScreen });
