# SADA 3D — Design System

**Manufacturing, reimagined.**

SADA 3D is an online 3D printing and digital manufacturing platform. Customers browse manufactured parts, upload their own CAD models, configure material and print parameters, watch the price recalculate live, order, and then track the physical manufacturing process — not a courier timeline.

The system covers four related visual modes, all unmistakably SADA 3D:

| Mode | Character | Where |
| --- | --- | --- |
| **Commerce** | Minimal, elegant, product-first | Home, marketplace, product page, checkout |
| **Engineering** | Data-rich, technical, precise | Configurator, spec tables, geometry checks |
| **3D** | Immersive, spatial, interactive | Viewer, exploded view, hero stage |
| **Manufacturing** | Operational, status-driven | Order tracking, machine panels |

Design principle, in five lines:

> BLACK IS THE MACHINE. WHITE IS THE INFORMATION. ORANGE IS THE SIGNAL. 3D IS THE PRODUCT. PRECISION IS THE BRAND.

## Sources

- `uploads/ChatGPT Image Sep 7, 2026, 09_53_12 PM.png` — the supplied SADA 3D logo lockup (isometric ribbon "S" mark, SADA in silver / 3D in orange, rule-flanked tagline "Imagine. Design. Create."). Copied to `assets/sada3d-logo-lockup.png`.
- A written brand + product brief supplied in chat (brand personality, colour architecture, typography roles, geometry, the Titanium Orange Line motif, component inventory, screen inventory, accessibility and motion rules).

No codebase, Figma file or existing product screens were provided. Everything below is derived from the brief and the logo; where a decision was open, it is documented here rather than left implicit.

---

## Content fundamentals

**Voice.** Engineering-plain. State the fact, give the number, stop. The product is credible because the copy is specific, not because it is enthusiastic.

**Person.** Second person for actions the customer takes ("Upload a model, choose material and quality"). First person plural only where the company is the actor and it matters ("Your design. Our machines."). Never "I". No "we're excited to".

**Casing.** Three registers, used consistently:

- **Display headlines** — uppercase, with the terminal period: `MANUFACTURING, REIMAGINED.` The period is part of the brand's tone; keep it.
- **UI labels, eyebrows, buttons, table keys** — uppercase with wide tracking: `START PRINTING`, `PART CONFIGURATION`, `EST. PRINT TIME`.
- **Body copy** — sentence case, ordinary punctuation.

**Technical strings** are uppercase mono and follow fixed formats: `PART_00492`, `SADA-FDM-07`, `0.16 MM`, `80 × 40 × 20 MM`, `02:48:12`, `48.3 cm³`, `₹1,036`. Units are spaced and uppercase (`34 G`, `20%`, `±0.1 MM`). Indices are zero-padded (`01`, `02`, `07`).

**Numbers first.** Where a claim can be a number, make it one: "48h typical lead time", "±0.1 mm tolerance", "12 machines online" — not "fast turnaround" or "tight tolerances".

**Length.** Section intros are one or two sentences. Product descriptions are two. The hero has exactly one supporting line. Nothing on a page repeats what a spec table already says.

**Supporting phrases** (rotate as eyebrows and section leads; never replace the primary tagline): DIGITAL TO PHYSICAL · PRECISION MADE POSSIBLE · DESIGNED TO EXIST · FROM IDEA TO OBJECT · ENGINEERED FOR REALITY.

**No emoji. No exclamation marks. No AI framing** — SADA 3D is positioned around human engineering and digital fabrication; there is no assistant, no "AI analysis", no chat.

---

## Visual foundations

### Colour

A dark, near-monochrome metal ramp carrying exactly one chromatic signal.

`VOID #050506` → `GRAPHITE #0A0B0D` → `CARBON #121417` → `TITANIUM #262A30` (borders) → `STEEL #6C737C` (muted) → `SILVER #A9B0B9` (secondary text) → `WHITE #F4F6F8` (primary text). Brand accent: **Titanium Orange `#FF6B00`**, with a 100–900 ramp for hover (`#FF8226`), press (`#E25A00`) and glow.

Orange is rationed. On a typical screen it appears on: the primary CTA, the active nav rule, the focus ring, the in-progress status, and one or two highlighted spec values. If a screen reads as orange, it is wrong. Status hues (`#3ED598` success, `#FFC34D` warning, `#FF4D4D` danger, `#4DA3FF` info) exist only to carry state and are always accompanied by a text label.

### Type

- **Display — Saira**, 600 weight, uppercase, `-0.02em`, line-height 0.94. Headlines only.
- **Interface — Archivo**, 400/500/600. Navigation, body, form labels, buttons.
- **Technical — JetBrains Mono**, 400/500. Every dimension, spec, timestamp, machine ID, price and index.

UI labels are uppercase at `0.14em`; section eyebrows at `0.24em`. Body copy is 15/1.6 and never uppercase. Minimum type size in product UI is 11px, and only for mono metadata.

### Geometry

Sharp. Cards 4px, buttons and inputs 3px, chips 2px, technical panels 0px. 6px is the absolute ceiling and applies only to large media panels. The only round things in the system are status dots and radio marks. Buttons are never pills.

Borders are 1px hairlines: `#1C1F24` subtle, `#262A30` default, `#343941` strong. Structure comes from these hairlines and from surface-value steps, not from shadow.

### The Titanium Orange Line

The signature. A 2px orange rule (`--gradient-orange-line`, with `--glow-line`) sits under section headings, under the active nav item, along the bottom edge of a hovered product card, under the active configurator step, and as the fill of every progress bar. A 48px stub inside panels; full-bleed across page sections. It is the one decorative element the system permits, because it is never purely decorative — it always marks position, state or progress.

### Backgrounds

Four modes: **Hero** (`--gradient-hero`, a radial lift from graphite to void, with a 96px technical grid at 5.5% white), **Commerce** (flat graphite), **Engineering** (void plus a 32px grid at 3.2% white), **Viewer** (`--gradient-viewer`, a radial studio stage). The grid must be perceptible only when you look for it. No photography, no illustration, no patterned texture, no particles beyond the occasional viewer highlight.

### Elevation, shadow, glow

Shadows are black and soft (`0 4px 16px rgba(0,0,0,.55)` at level 2), paired with a 6%-white inset top edge that reads as a machined bevel. Glow is orange-only, low alpha, and reserved for: the primary button on hover, the orange line, the leading segment of a progress bar, and focus rings. There is no white glow and no coloured shadow.

### Motion

Fast and mechanical. 80ms instant, 140ms control feedback, 260ms surface transitions, 480ms spatial/3D moves, 900ms cinematic reveals. Easing is `cubic-bezier(.2,0,0,1)` for control state, `cubic-bezier(.16,1,.3,1)` for entrances, `cubic-bezier(.65,0,.35,1)` for anything mechanical (exploded view, stepper). No bounce, no overshoot, no spring. Scroll reveals travel 16px and fade. `prefers-reduced-motion` zeroes every duration via token override.

### Interaction states

- **Hover** — surfaces lighten by a 5%-white overlay; borders step up one level (`subtle → strong`); cards lift 2px; the orange line scales in from the left; the primary button brightens 8% and picks up a small glow.
- **Press** — 0.985 scale, background steps to the 9%-white overlay, no colour change on the primary button beyond the darker `#E25A00`.
- **Focus** — 2px `#FF8226` ring, 2px void offset. Always visible, never removed.
- **Selected** — orange border plus a 12%-orange surface wash, plus the orange line where one fits.
- **Disabled** — `#131519` surface, `#212429` border, `#4A4F57` text, no shadow, no glow.
- **Loading** — a 2px spinner in currentColor, or the value dimmed to 40% with an "UPDATING" mono label.

### Transparency and blur

Used in exactly two places: the sticky header (`rgba(5,5,6,.82)` + 20px backdrop blur) and floating viewer toolbars (`rgba(10,11,13,.72)` + 18px). Nothing else is glassy. Modal scrims are flat `rgba(5,5,6,.78)`.

### Cards

Carbon surface, 1px subtle border, 4px radius, no shadow at rest. On hover: border steps to strong, 2px lift, orange line along the media edge. Product cards put the object on a viewer-style dark stage, then name (Saira, uppercase), material/colour (mono), technical metadata, and a hairline-separated footer holding price (mono) and a secondary View button.

### Layout

12 columns at 1440 max width, 48px gutters, 24px gap; 8 columns on tablet, 4 on mobile. Section rhythm is 96px desktop / 56px mobile. Sticky elements: the header (64px), the filter sidebar, and the price panel in the configurator. Tables and spec lists are label-left / value-right with hairline rows.

### Imagery

There is no photographic library. Product and hero objects are rendered on dark studio stages — cool, neutral, high-contrast, with controlled orange rim highlights. If photography is introduced later it should be cool-toned, low-key, and free of props.

---

## Iconography

**Set:** Lucide outline, pinned to `lucide-static@0.451.0`, loaded per-icon from the CDN and painted with a CSS mask so every glyph inherits `currentColor`. **This is a substitution** — the brief calls for a custom 3D technical icon system built from physical manufacturing objects (nozzle, spool, calipers, gears, material samples), and no icon assets were supplied. Lucide's 1.5px geometric outline is the closest available match to the intended stroke weight and precision. Flagged for replacement.

- **Grid & sizes:** 24px grid; rendered at 14 (inline metadata), 16 (UI default), 20 (nav, large buttons), 24–32 (feature/empty states).
- **Colour:** `--text-secondary` at rest, `--text-primary` on hover, `--text-accent` only when the element it labels is active or selected. Icons are never multi-colour.
- **Usage:** icons support a label; they rarely stand alone. `IconButton` always carries an accessible `label`.
- **Recurring glyphs:** `box` (part), `layers` (exploded view / infill), `ruler` (dimensions, measurement), `cpu` (machine), `upload` (model upload), `package` (packaging/shipping), `scan` (geometry check), `rotate-3d`, `move-3d`, `maximize`, `sun` (lighting), `thermometer` (heat resistance), `wrench`, `settings-2`.
- **No emoji anywhere.** Unicode is used only inside technical strings: `×` for dimensions and quantity, `±` for tolerance, `→` for flows, `₹` for price, `°` and `³` for units.
- **The logo** is the supplied raster lockup. No vector version was provided and none was reconstructed; where a small mark is needed, the wordmark is set in type (Saira 600, `0.16em`, SADA in white, 3D in Titanium Orange).

---

## Index

| Path | What |
| --- | --- |
| `styles.css` | Global entry point — `@import`s every token file. Consumers link this one file. |
| `tokens/` | `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `geometry.css`, `effects.css`, `motion.css`, `layout.css`, `base.css` |
| `components/` | React primitives, grouped by concern (below) |
| `ui_kits/platform/` | Interactive recreation of the SADA 3D platform — see its `README.md` |
| `guidelines/` | Foundation specimen cards rendered in the Design System tab |
| `assets/` | `sada3d-logo-lockup.png` |
| `thumbnail.html` | Homepage tile |
| `SKILL.md` | Agent Skills entry point |

### Components

**core** — `Button`, `IconButton`, `Icon`, `Tag`, `StatusDot`
**forms** — `Input`, `Select`, `Checkbox`, `Radio`, `Switch`, `RangeSlider`, `QuantityStepper`
**structure** — `SectionHeading`, `Panel`, `SpecTable`, `Stepper`, `Breadcrumbs`
**navigation** — `Header`, `FilterTree`
**viewer** — `Viewer3D`
**commerce** — `ProductCard`, `MaterialCard`, `PriceSummary`, `OrderSummary`
**manufacturing** — `ProgressBar`, `ManufacturingTimeline`

Each component directory holds `<Name>.jsx`, `<Name>.d.ts` (props contract), `<Name>.prompt.md` (what & when, usage, variants) and one `@dsCard` HTML showing its states.

**Intentional additions** (not named in the brief, added because the system needs them): `Icon` — a wrapper that makes the glyph set consistent and recolourable; `StatusDot` — extracted so manufacturing state never depends on colour alone; `QuantityStepper` — required by both the product page and configurator; `OrderSummary` — the checkout totals block the brief describes but does not name.

### UI kit screens

`ui_kits/platform/` — Home, Marketplace (nested filters), Product page (3D viewer + specs), Custom print configurator (5 steps + live price), Checkout, Manufacturing tracking. All click-through from `index.html`.

---

## Responsive rules

| | Mobile <768 | Tablet 768–1023 | Laptop 1024–1439 | Desktop ≥1440 |
| --- | --- | --- | --- | --- |
| Grid / gutter | 4 col / 16px | 8 col / 24px | 12 col / 32px | 12 col / 48px |
| Display 1 | 56px | 72px | 96px | 112px |
| Navigation | Hamburger → full-screen drawer | Hamburger | Full inline | Full inline |
| Product grid | 1 up | 2 up | 3 up | 4 up |
| Filters | Bottom drawer + "Filters (3)" trigger | Bottom drawer | Sticky sidebar 280px | Sticky sidebar 280px |
| Product page | Viewer above info, stacked | Stacked | Side by side 1.25 : 1 | Side by side 1.25 : 1 |
| 3D viewer | 320px tall, toolbar collapses to 3 controls | 400px | 480px | 560px |
| Configurator | One step per screen, sticky price bar at bottom | One step per screen | 2 columns + price rail | 3 columns |
| Checkout | Single column, summary collapses to a total bar | Single column | 1.3 : 1 | 1.3 : 1 |
| Spec tables | Label above value, 2-line rows | Label / value | Label / value | Label / value |
| Timeline | Full width, progress under the active stage | Full width | 1.4 : 1 with machine panel | 1.4 : 1 |

## Accessibility

- **Contrast** — body text (`#A9B0B9` on `#121417`) is 7.1:1; primary text is 15:1. Titanium Orange on void is 5.6:1 and is used for text at 13px and above; on the orange CTA the label is near-black `#140800` (9.8:1). `--text-disabled` is used only on genuinely inert controls.
- **Colour independence** — every status carries a text label and a shape (tick, dot, cross); progress carries a numeric percentage. Removing colour never removes meaning.
- **Focus** — 2px `#FF8226` ring with a 2px void offset on every interactive element; never suppressed. Tab order follows visual order; the filter tree is fully keyboard-operable (arrow keys within a group, Enter to toggle).
- **Touch targets** — 44px minimum on touch; the 32px small control is desktop-pointer only.
- **Reduced motion** — `prefers-reduced-motion` zeroes all duration tokens; the 3D viewer stops auto-rotating and the exploded view snaps instead of animating.
- **Forms** — every field has a visible persistent label (never placeholder-only); errors are text plus red border plus an icon, announced via `aria-describedby`.
- **Screen readers** — icon-only buttons require `label`; the viewer exposes a text summary of the part and its components; the manufacturing timeline is an ordered list with `aria-current` on the active stage.

## Figma naming

Mirror the code structure: `Button / Primary / Large`, `Product Card / Default | Featured | Compact`, `Filter / Nested / Level 1–3`, `3D Viewer / Default | Exploded | Measurement`, `Timeline / Stage / Active`. Library pages: 01 Foundations · 02 Colors · 03 Typography · 04 Grid · 05 Spacing · 06 Icons · 07 Effects · 08 Motion · 09 Navigation · 10 Buttons · 11 Forms · 12 Cards · 13 Filters · 14 Ecommerce · 15 Manufacturing · 16 3D · 17 Feedback · 18 Patterns · 23 Templates.

## Known gaps

- **Fonts are Google Fonts substitutions.** No licensed binaries were supplied; Saira / Archivo / JetBrains Mono are loaded from the Google CDN. Supply the real families and they can be swapped in `tokens/fonts.css` alone.
- **Icons are Lucide, not the custom 3D technical set** described in the brief.
- **The logo exists only as raster.** A vector lockup is needed for small sizes and print.
- **The 3D viewer geometry is a CSS-3D stand-in.** The chrome, toolbar, exploded view and inspection states are production-shaped; the mesh is not. Swap in three.js and keep the surrounding UI.
