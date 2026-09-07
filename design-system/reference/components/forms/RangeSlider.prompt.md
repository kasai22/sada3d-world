Range control with a 2px titanium track that fills orange; thin rectangular thumb.

```jsx
<RangeSlider label="Infill" min={10} max={100} step={5} value={infill} format={(v) => v + '%'} onChange={e => setInfill(+e.target.value)} />
```
