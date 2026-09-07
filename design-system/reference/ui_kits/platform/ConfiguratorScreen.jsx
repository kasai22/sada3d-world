const { Stepper, Panel, Viewer3D, MaterialCard, Radio, RangeSlider, Select, QuantityStepper, PriceSummary, Button, SectionHeading, SpecTable, Icon } = window.SADA3DDesignSystem_217828;

const STEPS = ['Upload', 'Material', 'Quality', 'Finish', 'Review'];

function ConfiguratorScreen({ onCheckout }) {
  const D = window.SADA_DATA;
  const [step, setStep] = React.useState(1);
  const [mat, setMat] = React.useState('PLA');
  const [quality, setQuality] = React.useState('Fine');
  const [infill, setInfill] = React.useState(20);
  const [qty, setQty] = React.useState(1);
  const [calc, setCalc] = React.useState(false);
  const bump = (fn) => (v) => { fn(v); setCalc(true); setTimeout(() => setCalc(false), 700); };

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 32px 96px' }}>
      <SectionHeading index="01" meta="PART_00492 · BRACKET_V3.STL" full>Custom print</SectionHeading>
      <div style={{ marginTop: 32 }}><Stepper steps={STEPS} current={step} onSelect={setStep} /></div>
      <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1.3fr 1fr 380px', gap: 24, alignItems: 'start' }}>
        <Viewer3D height={520} partId="BRACKET_V3" components={['Cap', 'Body', 'Flange']} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {step === 0 && (
            <Panel technical title="Upload">
              <div style={{ border: '1px dashed var(--border-strong)', padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
                <Icon name="upload" size={28} color="var(--text-muted)" />
                <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase' }}>Drop model file</span>
                <span style={{ font: 'var(--type-technical-sm)', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>STL · STEP · OBJ · 3MF</span>
                <Button size="sm" variant="secondary" onClick={() => setStep(1)}>Browse files</Button>
              </div>
            </Panel>
          )}
          {step === 1 && (
            <Panel technical title="Material" meta={mat}>
              <div style={{ display: 'grid', gap: 12 }}>
                {D.materials.slice(0, 3).map((m) => (
                  <MaterialCard key={m.name} {...m} selected={mat === m.name} onSelect={() => bump(setMat)(m.name)} />
                ))}
              </div>
            </Panel>
          )}
          {step >= 2 && (
            <Panel technical title="Quality" meta={quality}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[['Draft', '0.28 mm · fastest'], ['Standard', '0.20 mm · balanced'], ['Fine', '0.16 mm · recommended'], ['Ultra', '0.12 mm · finest detail']].map(([l, d]) => (
                  <Radio key={l} name="quality" label={l} description={d} checked={quality === l} onChange={() => bump(setQuality)(l)} />
                ))}
              </div>
              <div style={{ marginTop: 20 }}>
                <RangeSlider label="Infill" min={10} max={100} step={5} value={infill} format={(v) => v + '%'} onChange={(e) => bump(setInfill)(+e.target.value)} />
              </div>
            </Panel>
          )}
          <Panel technical title="Options">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Select label="Finish" options={['As printed', 'Sanded', 'Vapour smoothed', 'Painted']} />
              <Select label="Colour" options={['Black', 'Titanium', 'White', 'Titanium Orange']} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Quantity</span>
                <QuantityStepper value={qty} onChange={bump(setQty)} />
              </div>
            </div>
          </Panel>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 96 }}>
          <PriceSummary
            state={calc ? 'updating' : 'valid'}
            price={'₹' + (387 * qty)}
            analysis={[{ label: 'Volume', value: '48.3 cm³' }, { label: 'Weight', value: '42.6 g' }, { label: 'Print time', value: '3h 24m' }, { label: 'Material', value: mat }, { label: 'Infill', value: infill + '%' }]}
            note="Price excl. GST · min order ₹150"
            cta="Add to cart" onCta={onCheckout} />
          <Panel technical title="Geometry check" meta="PASSED">
            <SpecTable dense rows={[{ label: 'Watertight', value: 'YES' }, { label: 'Wall thickness', value: '2.4 MM MIN' }, { label: 'Overhangs', value: '3 · SUPPORTED' }, { label: 'Bounding box', value: '80 × 40 × 20 MM' }]} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ConfiguratorScreen });
