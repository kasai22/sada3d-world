# Reality 3D Admin — UX audit (Stage 22.6)

Date: 2026-09-17 · Branch: `reality3d/stage-22-6-admin-ux-inventory`

## Executive summary

**How the audit was done.** The whole admin (`/admin/**`), its shared components (`src/components/ops`, `src/components/forms`, `src/components/structure`), the design tokens (`src/styles/tokens`) and `/cms` were reviewed in source and CSS. Contrast was measured, not estimated. The pages a signed-out visitor can reach were rendered in headless Edge at 1440 and 768.

**Blocked:** no signed-in page was seen. An operator account exists in the CMS (one was used on 2026-09-16), but no credentials were available to this work, and none were created. Every finding about signed-in pages comes from the source, not from a screenshot. See [Unresolved issues](#unresolved-issues).

**Verdict.** The admin already had a coherent visual language: graphite surfaces, hairline borders, technical figures and a restrained orange. Its problems were consistency and density. Four stand out:
- small muted text below AA contrast;
- two different field styles;
- spacing chosen page by page;
- an inventory page that put an entire domain in one scroll.

No issue blocked use (no P0). The significant ones (P1) are fixed; the remaining polish items are listed below.

| Priority | Found | Fixed | Open |
| --- | --- | --- | --- |
| P0 — blocks use | 0 | 0 | 0 |
| P1 — significant | 10 | 10 | 0 |
| P2 — consistency | 7 | 7 | 0 |
| P3 — refinement | 5 | 0 | 5 |

## P0 issues

None found. Every page has a gated route, a title, a primary action where one applies, and empty, loading and error states: `(console)/loading.tsx`, `(console)/error.tsx`, and `EmptyState` with a `problem` tone.

## P1 issues

| ID | Screen | Problem | Why it matters | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| A-01 | All admin pages | Muted text (`--text-muted`, steel `#6C737C`) is 3.85:1 on a card and 3.56:1 on a raised surface. | It is used for every secondary line, table caption and helper text, all small; AA requires 4.5:1. | The admin shell redefines `--text-muted` as `#8A919B` (5.8:1 on a card, 5.37:1 raised, 6.4:1 on the page). The storefront is unchanged. | Fixed |
| A-02 | All admin pages | Technical captions (`--type-technical-sm`) are 11px. | Row sub-lines, source notes and figure meta were hard to read at 1440. | The shell redefines the caption at the 12px label size. | Fixed |
| D-01 | `/admin` | Seven KPI cards in one row: about 150px each at 1440 once the sidebar is taken. | Values like "₹1,23,456" crowd their card, and the row reads as noise. | Six figures, as the brief lists them (Average order value moved into the Revenue card's detail). Two rows of three; one row of six only from 1680px. | Fixed |
| F-01 | `/admin/inventory` | Inventory forms used native fields: 34px high, sunken background, 11px mono text, outline focus. Every other form uses the design-system `Input`: 32/40px, panel surface, orange focus glow. | Two visual languages for the same control. | Inventory fields restyled to the `Input` tokens: `--control-height-sm`, panel surface, default border, body-sm type, focus border plus glow, hover border. | Fixed |
| I-01 | `/admin/inventory` | One page held 7 KPIs, a view filter, the item ledger, three item tables, movements, purchases, suppliers and definitions. | Nothing could be found without scrolling, and the page answered no single question. | URL tabs: Overview · Raw materials · Finished products · Consumables · Movements · Purchases · Suppliers. The Overview answers "what needs action" with four figures, a needs-action table, recent movements and pending receipts. | Fixed |
| I-02 | `/admin/inventory` | Adding an item sat under *Definitions → Add another item* at the bottom. It had free-text units, all six internal types and no category. | The main new workflow (consumables) was nearly invisible, and it accepted inconsistent data. | A primary *Add …* action on every tab opens `/admin/inventory/new`. That page asks only what the chosen kind needs (see Inventory UX rules), offers fixed units and categories, and never asks for a quantity. | Fixed |
| I-03 | Inventory domain | Unit cost was whole rupees. | "10 labels × ₹0.50" could not be recorded; consumable costing was impossible. | Migration 0006 widens `unit_cost` to `numeric(12,2)` on items, movements and purchases (lossless; the tables were empty). Costs are parsed to the paisa and valued in paise. | Fixed |
| I-04 | Inventory item panel | Material usage needed a production job id typed by hand. | Error-prone, and a wrong id was only caught on submit. | A select of the jobs that have started printing (`listUsableJobs`). It is required for raw material and optional for consumables. | Fixed |
| D-02 | `/cms` (Advanced CMS) | A product was published with a **retired** id (`SKU001`) and a malformed, retired slug (`payload_test`). Payload skips field validation on those saves, and the workflow guard did not check identity. `content:verify` fails because of it. | A retired id can resolve a stale cart line to a different part; a malformed slug is a broken URL. | The workflow guard (`checkProductWrite`) refuses retired ids, retired slugs and malformed slugs when a product is **created or published**. Unpublishing or archiving a bad record stays possible. `/admin/products/create` already avoided both (ids are assigned; slugs are validated). The existing record (CMS id 64) was **not** modified — it is the owner's to withdraw. | Fixed (guard); record left for the owner |
| P-01 | `/admin/products/[id]` | The launch panel listed seven checks with equal weight. | "Can I sell it, and what do I do next?" took reading the whole list. | A verdict ("5 of 7 checks pass"), a segmented progress bar and one **Next step** box (the first failing check and where to fix it) above the list. | Fixed |

## P2 issues

| ID | Screen | Problem | Fix | Status |
| --- | --- | --- | --- | --- |
| A-03 | All pages | Vertical spacing came from per-page `.section` margins. Some sequences had none: on `/admin/products` the KPI row touched the filter chips. | One rhythm rule in the shell, `:where(.main > * + *) { margin-top: 20px }`. It has zero specificity, so components that tuck in (the tabs) still win. | Fixed |
| T-01 | All tables | Table headers used a hard-coded 11px with 0.1em tracking, while panel titles use the label token (12px, 0.14em). | Headers use `--type-label` and `--ls-label`. | Fixed |
| C-01 | Filter chips | Chips used `--radius-pill`, which the design system reserves for status dots and avatars. | `--radius-chip` (2px). | Fixed |
| C-02 | Code | `components/ops/layout.module.css` was imported nowhere: a second copy of the KPI grid. | Deleted. | Fixed |
| P-02 | Product create and edit | No sign of unsaved edits. | A "● Unsaved changes" status, and a browser prompt when leaving with unsaved edits. | Fixed |
| I-05 | Action centre | Inventory lines were global ("Out of stock") and linked to one long page. | Lines per kind (a raw material outage is high severity, a consumable one medium), each linked to its tab and status filter. | Fixed |
| T-02 | Inventory tables | Unknown stock, missing cost and empty values were written three different ways. | Shared helpers (`display.ts`): "Not tracked", "Missing", "—", and costs with paise only when present. | Fixed |

## P3 issues

| ID | Screen | Problem | Recommendation | Status |
| --- | --- | --- | --- | --- |
| R-01 | Product form | Its tab strip reimplements the `SectionTabs` styles (it is a client-side tablist, not links). | Extract a shared tab-strip style. | Open |
| R-02 | `/admin/products` | Eleven columns; below 1280 several hide. | Revisit with a real catalog; consider a density toggle. | Open |
| R-03 | Inventory forms | Visually matched to `Input` but still native elements inside `ActionForm`. | Move to `Input`/`Select` when those forms need client-side validation. | Open |
| R-04 | Finished-product sale or return | The order reference is typed. | Offer recent orders that contain the product. | Open |
| R-05 | `/cms` | Payload's own "Payload Settings" label remains in its gear menu. | Needs a Payload translation override; low value. | Open |

## Before/after design decisions

- **Inventory:** from one page for everything to one workspace with URL tabs. Tab counts come from real item counts; nothing is shown for an empty kind beyond its empty state.
- **Overview:** from seven headline figures to six (Revenue, Orders, Open production, Inventory value, Low stock, Pending approvals). Average order value moved into the Revenue card's detail, and stays on Sales.
- **Launch status:** from a flat list to a verdict, progress and one next step.
- **Admin text:** the storefront's muted text and 11px captions are kept for the storefront only; the admin uses AA-passing text at 12px.
- **Adding stock:** from a hidden generic form to a dedicated page per kind. Stock never enters through it; it only enters through the ledger.

## Spacing system

The existing 4px scale (`--spacing-*`) is used; no parallel scale was introduced.

| Relationship | Value |
| --- | --- |
| Page header → first block | 24px (the header's own margin; collapses with the rhythm) |
| Block → block on a page | 20px (`--spacing-5`, the shell rhythm) |
| Tabs under a header | 16px (tabs pull up 8px) |
| Panel header padding | 14px × 20px |
| Panel body inset | 20px (`--space-inset-panel`) |
| Form: label → field | 6px |
| Form: field → field | 16px (`--spacing-4`) |
| Form: section → footer | 16px with a hairline |
| Table cell padding | 8px × 12px, row 50px, header 36px |
| Filters → table | 20px (rhythm) |

## Typography decisions

- **Page title:** display face, 24px, uppercase — one per page.
- **Panel titles, table headers, form labels and figure labels:** `--type-label` (12px, medium, 0.14em, uppercase).
- **Body and table text:** `--type-body-sm` (13px).
- **Figures, quantities and money:** `--font-technical` with tabular numerals, right-aligned.
- **Secondary lines:** 12px technical in the admin's muted colour.
- No text below 12px in the admin; small-caption badges are 22px high.

## Component consistency

| Component | Rule |
| --- | --- |
| Buttons | One primary per header (Add product / Add consumable); secondary for related navigation; ghost for Advanced CMS. |
| Tabs | `SectionTabs` for navigation between URLs (Analytics, Catalog, Product workspace, Inventory). Chips are filters, never navigation. |
| Status badges | `StatusBadge` everywhere, always with text; the tone only reinforces it. |
| Empty states | `EmptyState` with an icon, a one-line title, one sentence of what will appear, and an action when there is one. The `problem` tone is used for failures, with an actionable sentence. |
| KPI cards | Label, meta (what period), value, one detail line. A figure that is unknown says so ("Not tracked", "Unavailable") in muted type. |

## Table rules

- **Structure:** real `<table>` with a caption; `<th scope>` headers; the first column is the row link (a stretched link, with the focus ring on the row).
- **Alignment:** numbers, quantities and money right-aligned in technical type; statuses as badges; text left-aligned.
- **Responsive columns:** hidden by priority (`hide="lg" | "md" | "sm"`), never truncated mid-value.
- **Unknown values:** "Not tracked" or "Missing", in muted type, never `0`.
- **Pagination:** under the table, in the same panel.

## Form rules

- **Labels:** visible and persistent; required fields marked with `*` and "required" for screen readers.
- **Controls:** 32px (small) or 40px (default) high; panel surface; default border, strong on hover; orange focus border plus glow.
- **Messages:** helper text under the field in body-sm muted. An error replaces the helper, is announced (`role="alert"`) and names the fix.
- **Section errors:** a tab with an error shows a count, and the first failing tab opens on submit.
- **Saving:** a refused form keeps what was typed. A save state is announced in a status region; unsaved edits are marked.
- **Approval:** approval, publishing and price approval are never form fields in the admin; they stay in their audited flows.

## Responsive rules

Targets: 1440, 1280, 1024 and 768 (usable).
- **Sidebar:** 240px; collapsible to a 64px rail from 1024; a drawer below 1024.
- **KPI rows:** 6 → 3 → 2 → 1 columns. Two-column page layouts stack below 1024.
- **Item panel figures:** 4 → 2 → 1.
- **Product workspace:** the launch panel moves above the form below 1024.
- **Tables:** scroll horizontally inside their frame only, never the page, and drop low-priority columns first.
- **Top bar:** below 768 the breadcrumb group label and the keyboard hint hide.

## Accessibility rules

- **Skip link:** "Skip to content" jumps to the main content region.
- **Navigation:** every group is labelled, and the current page is marked with `aria-current`.
- **Focus:** global `:focus-visible` ring; inputs show focus on their shell (the inner ring was removed to avoid a double ring).
- **Contrast:** secondary text meets AA on every admin surface (A-01).
- **Status:** never colour alone. Badges carry words; movement quantities carry their sign; the launch panel's marks have hidden "passes"/"blocking" text.
- **Forms:** every control is inside a `<label>` or has one; radio groups are fieldsets with a legend; results are announced in live regions.
- **Search:** Ctrl/⌘K opens it from anywhere; Escape closes menus and returns focus to what opened them.

## Inventory UX rules

- **Three kinds, one ledger.** Raw material (filament by material × colour), finished product (a catalog product) and consumable (packaging, adhesive, nozzles, cleaning, workshop). Packaging, spare part and other remain valid types, shown with consumables.
- **Unknown is not zero.** No item is created with stock. "Not tracked" until an opening count or a received purchase. Never healthy, never out of stock, never valued.
- **Healthy means something.** Known stock without a reorder level is "No reorder level", not healthy.
- **Add by kind:**
  - Raw material: an approved material and colour (Coming Soon materials are shown but disabled), unit, thresholds, cost, supplier.
  - Finished product: a catalog product without an item (name and SKU come from the catalog), unit, thresholds, cost.
  - Consumable: name, category, SKU, unit, thresholds, cost, supplier, notes.
- **Units** are chosen per item from pcs, g, kg, ml, L, m, pack and box. Costs are per that unit and kept to the paisa.
- **Movements.** Usage of raw material requires a job that has started printing. Usage of a consumable without a job requires a reason. Adjustments and waste always require a reason. Negative stock is refused. Stock is never edited directly.
- **Prioritised layout.** Stock health, then what needs action, then recent movements and pending receipts, then value. No more than four figures on the overview.
- **Privacy.** Costs, suppliers and value are operator data. Only the admin imports `lib/inventory` (enforced by `console-guard.test.ts`).

## Unresolved issues

1. **Signed-in visual verification is blocked.** No operator credentials exist on this machine and none were created. Spacing, overflow and chart rendering on signed-in pages are verified in source only. The next step is to sign in and check `/admin`, `/admin/products`, `/admin/products/create`, `/admin/inventory` (every tab), `/admin/orders`, `/admin/manufacturing` and `/admin/analytics` at 1440, 1280, 1024 and 768.
2. P3 items R-01 to R-05 above.
3. No real inventory data exists in the development database, so the data-filled states of the inventory tables were not seen; their empty states were not seen either.
4. The development CMS holds a published test product (id 64, `SKU001` / `payload_test`, created 2026-09-16 18:53 UTC through Advanced CMS). It fails the launch assessment and makes `content:verify` exit non-zero. Withdraw it (unpublish, then archive) in Advanced CMS; it was not changed here.
