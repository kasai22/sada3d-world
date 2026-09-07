The SADA 3D viewer surface: dark radial stage, subtle grid, minimal vertical toolbar, exploded view and per-component inspection.

```jsx
<Viewer3D partId="PART_00492" selected={part} onSelect={setPart} components={['Housing','Gear','Base']} />
```

The geometry is a CSS-3D stand-in for a real WebGL model — swap the stage contents for three.js in production, keep the chrome.
