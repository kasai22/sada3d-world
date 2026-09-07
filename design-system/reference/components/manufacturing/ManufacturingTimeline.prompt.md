Order tracking as a manufacturing process, not a courier timeline.

```jsx
<ManufacturingTimeline stages={[
  {label:'Design verified',state:'complete',meta:'09:02'},
  {label:'Printing',state:'active',progress:68,meta:'SADA-FDM-07'},
  {label:'Quality check'},
]} />
```

Stage states: pending, active (orange, with progress), complete (green tick), failed.
