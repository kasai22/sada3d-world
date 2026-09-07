const { OrderSummary, Input, Select, SectionHeading, Panel, Radio, Button, Breadcrumbs } = window.SADA3DDesignSystem_217828;

function CheckoutScreen({ cart, onComplete }) {
  const [pay, setPay] = React.useState('UPI');
  const items = cart.length ? cart : [{ name: 'Precision Gear', spec: 'PLA / Black', qty: 2, price: '₹798' }];
  const sub = items.reduce((n, i) => n + (parseInt(String(i.price).replace(/[^0-9]/g, ''), 10) || 0), 0);
  const gst = Math.round(sub * 0.18);
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 32px 96px' }}>
      <Breadcrumbs items={['Cart', 'Checkout']} />
      <div style={{ marginTop: 24 }}><SectionHeading full meta={items.length + ' items'}>Checkout</SectionHeading></div>
      <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 48, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Panel title="Delivery address">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input label="Full name" defaultValue="A. Sharma" />
              <Input label="Phone" defaultValue="+91 98450 00000" />
              <Input label="Address" defaultValue="14 Residency Road" style={{ gridColumn: '1 / -1' }} />
              <Input label="City" defaultValue="Bengaluru" />
              <Input label="PIN" technical defaultValue="560025" />
            </div>
          </Panel>
          <Panel title="Shipping">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Radio name="ship" label="Standard" description="4–6 days · ₹80" checked onChange={() => {}} />
              <Radio name="ship" label="Express" description="2 days · ₹240" onChange={() => {}} />
            </div>
          </Panel>
          <Panel title="Payment">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['UPI', 'Card', 'Net banking'].map((m) => (
                <Radio key={m} name="pay" label={m} checked={pay === m} onChange={() => setPay(m)} />
              ))}
            </div>
          </Panel>
        </div>
        <div style={{ position: 'sticky', top: 96, background: 'var(--surface-card)', border: '1px solid var(--border-default)', padding: 24 }}>
          <SectionHeading size="sm">Your order</SectionHeading>
          <OrderSummary style={{ marginTop: 20 }} items={items}
            totals={[{ label: 'Subtotal', value: '₹' + sub }, { label: 'Shipping', value: '₹80' }, { label: 'GST 18%', value: '₹' + gst }]}
            total={'₹' + (sub + 80 + gst).toLocaleString('en-IN')} onCta={onComplete} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CheckoutScreen });
