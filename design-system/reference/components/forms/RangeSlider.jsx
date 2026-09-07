import React from 'react';

/** Single-value range control — price filters, infill percentage. */
export function RangeSlider({ min = 0, max = 100, value = 50, step = 1, onChange, label, format, style, ...rest }) {
  const pct = ((value - min) / (max - min)) * 100;
  const fmt = format || ((v) => v);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--ls-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
          <span style={{ font: 'var(--type-technical)', color: 'var(--text-accent)' }}>{fmt(value)}</span>
        </div>
      )}
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange}
        style={{ appearance: 'none', width: '100%', height: 2, background: `linear-gradient(90deg,var(--orange-500) ${pct}%,var(--titanium) ${pct}%)`,
          outline: 'none', cursor: 'pointer' }} {...rest} />
      <style>{'input[type=range]::-webkit-slider-thumb{appearance:none;width:4px;height:16px;background:var(--white);border-radius:1px;cursor:pointer;box-shadow:0 0 8px rgba(255,107,0,.5)}input[type=range]::-moz-range-thumb{width:4px;height:16px;background:var(--white);border:0;border-radius:1px}'}</style>
    </div>
  );
}
