// Shared demo data for the SADA 3D platform UI kit.
window.SADA_DATA = {
  products: [
    { name: 'Precision Gear', material: 'PLA', color: 'Black', price: '₹399', badge: 'In stock',
      meta: [{ label: 'Layer', value: '0.16 MM' }, { label: 'Weight', value: '34 G' }] },
    { name: 'Cable Bracket', material: 'PETG', color: 'Graphite', price: '₹249',
      meta: [{ label: 'Layer', value: '0.20 MM' }, { label: 'Weight', value: '21 G' }] },
    { name: 'Hex Drive Coupler', material: 'ABS', color: 'Titanium', price: '₹640', badge: 'New',
      meta: [{ label: 'Layer', value: '0.12 MM' }, { label: 'Weight', value: '58 G' }] },
    { name: 'Damping Bushing', material: 'TPU', color: 'Black', price: '₹180',
      meta: [{ label: 'Shore', value: '95A' }, { label: 'Weight', value: '12 G' }] },
    { name: 'Optical Mount', material: 'Resin', color: 'Grey', price: '₹1,240', badge: 'SLA',
      meta: [{ label: 'Layer', value: '0.05 MM' }, { label: 'Weight', value: '46 G' }] },
    { name: 'Manifold Housing', material: 'PETG', color: 'Carbon', price: '₹890',
      meta: [{ label: 'Layer', value: '0.16 MM' }, { label: 'Weight', value: '112 G' }] },
    { name: 'Planetary Carrier', material: 'PLA', color: 'Orange', price: '₹520',
      meta: [{ label: 'Layer', value: '0.16 MM' }, { label: 'Weight', value: '61 G' }] },
    { name: 'Sensor Enclosure', material: 'ABS', color: 'Black', price: '₹760',
      meta: [{ label: 'Layer', value: '0.20 MM' }, { label: 'Weight', value: '88 G' }] },
  ],
  categories: ['Mechanical', 'Automotive', 'Industrial', 'Lifestyle', 'Architecture', 'Prototyping', 'Components', 'Custom Products'],
  materials: [
    { name: 'PLA', code: 'Polylactic acid', description: 'The default. Dimensionally stable, sharp detail, matte finish.', properties: { strength: 3, flexibility: 2, heat: 2 }, colors: ['#F4F6F8', '#050506', '#FF6B00', '#6C737C'], multiplier: '1.0' },
    { name: 'PETG', code: 'Glycol-modified PET', description: 'Tougher and chemically resistant. Semi-gloss surface.', properties: { strength: 4, flexibility: 3, heat: 4 }, colors: ['#F4F6F8', '#050506', '#4DA3FF'], multiplier: '1.2' },
    { name: 'ABS', code: 'Acrylonitrile butadiene styrene', description: 'Impact resistant, machinable, vapour-smoothable.', properties: { strength: 4, flexibility: 3, heat: 5 }, colors: ['#050506', '#A9B0B9'], multiplier: '1.3' },
    { name: 'TPU', code: 'Thermoplastic polyurethane', description: 'Elastomeric. Gaskets, dampers, protective housings.', properties: { strength: 3, flexibility: 5, heat: 3 }, colors: ['#050506', '#FF6B00'], multiplier: '1.6' },
    { name: 'Resin', code: 'SLA photopolymer', description: 'Highest resolution. Fine features and smooth surfaces.', properties: { strength: 3, flexibility: 1, heat: 3 }, colors: ['#A9B0B9', '#050506'], multiplier: '2.1' },
  ],
  filters: [
    { label: 'Category', options: [
      { label: 'Functional', count: 128, defaultOpen: true, children: [
        { label: 'Mechanical', count: 64, children: [{ label: 'Gears', count: 22 }, { label: 'Brackets', count: 18 }, { label: 'Tools', count: 24 }] },
        { label: 'Fasteners', count: 31 }] },
      { label: 'Automotive', count: 38, children: [{ label: 'Interior', count: 12 }, { label: 'Exterior', count: 14 }, { label: 'Components', count: 12 }] },
      { label: 'Lifestyle', count: 51, children: [{ label: 'Home', count: 20 }, { label: 'Decor', count: 16 }, { label: 'Organization', count: 15 }] },
    ] },
    { label: 'Material', options: [{ label: 'PLA', count: 120 }, { label: 'PETG', count: 64 }, { label: 'ABS', count: 31 }, { label: 'TPU', count: 18 }, { label: 'Resin', count: 27 }] },
    { label: 'Print technology', options: [{ label: 'FDM', count: 180 }, { label: 'SLA', count: 44 }, { label: 'SLS', count: 12 }] },
    { label: 'Availability', defaultOpen: false, options: [{ label: 'In stock', count: 204 }, { label: 'Made to order', count: 32 }] },
  ],
  specs: [
    { label: 'Print technology', value: 'FDM' }, { label: 'Material', value: 'PLA' },
    { label: 'Layer height', value: '0.16 MM' }, { label: 'Infill', value: '20%' },
    { label: 'Dimensions', value: '80 × 40 × 20 MM' }, { label: 'Est. print time', value: '02:48:12' },
    { label: 'Weight', value: '34 G' },
  ],
};
