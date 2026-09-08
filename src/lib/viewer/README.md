# Viewer

One WebGL viewer, used by the product page and by the custom print workflow.
Plain three.js behind an imperative engine class; React owns mounting, teardown
and the controls, and the engine owns everything on the GPU.

```
Product page                 Custom print
    ↓                             ↓
ProductVisual                 ModelStage
    ↓                             ↓
        ── Viewer3D (client) ──
                  ↓
             ViewerEngine
```

| File | Responsibility |
| --- | --- |
| `types.ts` | Domain types. No behaviour. |
| `loaders.ts` | Format → geometry. Each loader imported on demand. |
| `components.ts` | Scene graph → components. Pure analysis, no rendering. |
| `explode.ts` | Component + amount → transform. Pure maths, no three.js scene. |
| `engine.ts` | Renderer, camera, controls, selection, disposal. |

## Supported formats

STL, OBJ, glTF/GLB.

**STEP is not supported and will not be.** It is a boundary representation, not
a mesh; rendering it needs a conversion pipeline, so the viewer says the format
cannot be shown rather than failing obscurely.

The custom print intake accepts a narrower set (`ACCEPTED_EXTENSIONS`) because
that list is about what can be manufactured, not what can be drawn. The viewer
never widens it.

## What counts as a component

A component is a child of the assembly root that carries geometry. That is the
whole rule.

Discovery descends through transform-only wrapper groups — exporters commonly
nest a scene inside one or two of them — and then takes the children of the
first node with real structure. A model needs at least two such children to have
an exploded view; more than 200 is treated as a mesh soup rather than an
assembly.

Not components: triangles, geometry groups, material groups, or anything
produced by subdividing a mesh. Splitting a mesh to manufacture an exploded
effect would be inventing structure the file does not contain, and the parts it
invented would not be parts.

### Why STL usually cannot explode

STL is a flat list of triangles with no hierarchy and no names. It carries no
assembly structure, so it yields one component — which is to say no assembly.
The viewer reports `Single mesh` and hides the control rather than offering one
that does nothing.

A multi-object OBJ (one `o` per part) and a glTF/GLB scene both carry the
structure, and both explode.

## Identifiers

`assembly/<index>-<slug of name>`, e.g. `assembly/1-sun-gear`. Derived from
scene order and the file's own names, so they are identical on every load and
across sessions. Nothing in the UI depends on object identity.

Names come from the file. glTF exporters write a space as an underscore, so
`Sun_Gear` is displayed as `Sun Gear` — the same name, made readable. A part the
file did not name is numbered `Part 3`, and numbered parts are not labelled in
the scene, because a position in a list is not a name.

## Explosion

```
position = rest.position + direction × distance × amount
```

- **direction** — radially outward from the assembly centre. A component sitting
  on the centre has no radial direction, so it falls back to a fixed axis chosen
  by its index in scene order. Two coaxial parts sharing a centre therefore
  separate along opposite axes. There is no randomness anywhere in this file.
- **distance** — `radial × 0.5 + assemblyRadius × 0.22`. The first term
  preserves the arrangement, so outer parts stay outer; the second is a floor,
  so a central shaft still separates. Both scale with the assembly, so a 4 mm
  part and a 4 m part explode identically in proportion.
- **amount** — 0 to 1, clamped. Never extrapolated.

Distances are deliberately restrained: a fully exploded assembly still fits the
frame the camera already had. The point is to read the parts, not to watch them
leave.

### Transform strategy

Components are siblings — children of one assembly root — so no component is a
descendant of another and a parent transform can never be applied twice.
Anything nested inside a component moves with it, which is what a child
transform is for.

Every update **assigns** an absolute position computed from the recorded rest
transform. Nothing accumulates, so scrubbing back and forth cannot drift, and at
amount 0 the position is exactly the transform the file gave. Rotation, scale,
geometry and material are never touched.

The rest position, quaternion and scale of every component are recorded at
discovery, before anything moves.

## Rendering

On demand. There is no permanent animation loop: a frame is drawn when something
changes and not otherwise. An idle viewer draws nothing at all.

An explode transition is a self-scheduling `requestAnimationFrame` loop that
exists only while the transition does — roughly 420 ms, cubic ease, no overshoot
— and stops requesting frames the moment it finishes. Scrubbing the slider
applies immediately instead, because direct manipulation should not lag behind
the hand.

Under `prefers-reduced-motion: reduce` the transition is skipped and the new
amount applies in one frame. The capability is not removed, only the motion.

Component labels are positioned by writing transforms onto DOM nodes React
already rendered, from the engine's after-render callback. An orbit therefore
never passes through the React scheduler.

## Selection

Selection draws a wireframe box, not a material change. Materials are frequently
shared between parts in a glTF file, so tinting one component would tint its
siblings; a box helper touches nothing and disposes cleanly.

Titanium Orange marks the selection and nothing else. Hover is drawn in the
neutral scale, because a hover is a hint, not a decision.

## Accessibility

The canvas is `aria-hidden` and not a tab stop. Everything the viewer means is
carried by DOM controls and text beside it.

- The explode amount is a native `input[type=range]`, so arrows, Home and End
  work without a keypress handler, and it carries `aria-valuetext`
  ("60 percent").
- Components are selectable from a list of buttons as well as by pointer.
  Picking a part in the scene needs a pointer, and a pointer is not available to
  everyone.
- State changes are announced through one polite live region: "Exploded view
  enabled, 60 percent. Selected component Sun Gear."
- Selection is carried by border, surface and the leading index together, so it
  survives being read without colour.
- Escape clears the selection.
- Controls are at least 44 px on a coarse pointer.

## What the viewer does not do

It does not measure. A bounding box positions the camera and scales the
explosion; it is never reported as a dimension of the part. No volume, weight,
material, tolerance, print time or part number is derived from geometry, and the
component readout shows only what the file itself declares.

## Demo assets

`scripts/generate-models.mjs` builds every committed model parametrically —
nothing is downloaded, and the assets are reproducible:

```
node scripts/generate-models.mjs public/models product
```

`planetary-carrier.glb` is the multi-component fixture: a carrier plate, a sun
gear, three pinions and a retaining cap, one named object each.
