Three-level nested filter sidebar with expand/collapse, checkboxes and result counts.

```jsx
<FilterTree groups={[{label:'Category',options:[{label:'Mechanical',count:64,children:[{label:'Gears',count:22}]}]}]} selected={sel} onToggle={toggle} />
```

Pair with `Tag onRemove` chips above the results grid for the applied-filter summary.
