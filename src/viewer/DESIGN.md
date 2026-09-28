# Paper Atlas Viewer Design System

## 0. Research Log

- Existing reference: extended the system-aware, neutral research-map contract in `src/venues/eccv26-korea/DESIGN.md`; retained its categorical-data restraint and accessibility baseline.
- Embedded references: shortlisted Linear, Sentry, and ClickHouse; picked the operational precision of Linear with the data-density principles of Sentry/ClickHouse, without adopting their branding.
- Lazyweb: ran `research analytics dashboard`, `collaboration network explorer`, and `data visualization country ranking`; viewed Deepnote, Mapbox, and Cloudflare screens. Adopted their persistent orientation, analytical canvas, and country-ranking pattern, not their layouts or assets.
- UI/UX database: selected the data-dense dashboard recommendation for an accessible, system-theme analytical surface.
- Imagen drafts: skipped because this is an extension of an established, data-first application surface; the existing Korea viewer and the inspected product screens are the visual contract.

## 1. Atmosphere & Identity

An evidence-aware research atlas: calm enough for reading, dense enough for
comparison. The signature is a pale geographic field behind precise ranked data:
country colour establishes orientation while every factual claim is grounded in
visible counting semantics and source provenance. It must feel like a workbench,
not a marketing dashboard.

## 2. Color

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Canvas | `--atlas-canvas` | `#f7f8fc` | `#101217` | Page and graph background |
| Surface | `--atlas-surface` | `#ffffff` | `#181b22` | Cards and controls |
| Surface raised | `--atlas-raised` | `#ffffff` | `#222631` | Tooltip and selected card |
| Foreground | `--atlas-foreground` | `#1a1d27` | `#f3f5fa` | Main text |
| Muted | `--atlas-muted` | `#5d6475` | `#b7becc` | Labels and metadata |
| Border | `--atlas-border` | `#d7dce7` | `#343a49` | Structural separation |
| Accent | `--atlas-accent` | `#304fc7` | `#96aaff` | Active controls and focus |
| Accent soft | `--atlas-accent-soft` | `#e8edff` | `#26365c` | Selected background |
| Country 1–8 | `--atlas-country-*` | `#d1495b`, `#e77c32`, `#c9a227`, `#268c71`, `#3778c2`, `#6a5acd`, `#a54ba5`, `#657083` | same | Categorical country marks only |

Country colour never conveys rank, metric, or affiliation confidence alone;
text labels and accessible counts are always co-present.

## 3. Typography

- Primary: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Mono: `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`.
- Display: `clamp(1.75rem, 3vw, 2.75rem)`, 650, 1.05, -0.03em.
- Section heading: 1.125rem, 650, 1.25.
- Body: 0.9375rem, 400, 1.55.
- Label: 0.75rem, 650, 0.08em, uppercase.
- Numeric metrics use tabular figures.

## 4. Spacing & Layout

Base unit is 4px. Use `--space-1` through `--space-12` for 4–48px intent
steps. The main shell has a fixed header and one document scroll owner. A
responsive intrinsic grid (`minmax(min(15rem, 100%), 1fr)`) holds metric cards;
the country table and graph panels stack below 900px. Primary content never
requires horizontal scrolling at 375px.

## 5. Components

### Scope controls
- **Structure:** native select, segmented buttons, and labelled search input.
- **States:** default, hover, focus-visible, selected, empty selection.
- **Accessibility:** visible labels; query state is shareable in the URL.
- **Motion:** shared-background-inspired 160ms colour/transform transition; reduced motion is immediate.

### Metric card
- **Structure:** label, value, context line.
- **Variants:** default and selected-context.
- **Accessibility:** card is text first; colour is supplemental.

### Ranking row
- **Structure:** native button containing rank, country/institution name, bar, and exact metric.
- **States:** default, hover, active, selected, focus-visible.
- **Accessibility:** full name and metric remain in the button label; long names wrap.

### Atlas graph
- **Structure:** labelled canvas with adjacent textual description and keyboard-reachable scope controls.
- **Variants:** country collaboration overview, limited author subgraph, and empty state.
- **Accessibility:** graph never contains unique information unavailable in the accompanying rankings/details.
- **Motion:** canvas redraws only for a state or direct-manipulation change; no decorative simulation or de-emphasis fade.

### Provenance note
- **Structure:** semantic `aside` naming the source snapshot, country semantics, coverage, and policy link.
- **Accessibility:** no hover-only definitions; ambiguous/unknown records are explicit.

## 6. Motion & Interaction

Selection uses a restrained 160ms colour/transform transition, inspired by a
shared tab indicator without adding a motion dependency. Pointer pan and wheel
zoom are direct-manipulation actions, not animation. All non-essential
transitions are removed under `prefers-reduced-motion: reduce`.

## 7. Depth & Surface

Strategy: borders plus restrained tonal shift. Cards use a 1px border and a
small shadow only when raised (tooltips and selected inspector); no blur or
decorative glass. The geographic canvas uses a subtle radial field to separate
data marks from the neutral background.

## 8. Accessibility Constraints & Accepted Debt

Target WCAG 2.2 AA: 4.5:1 body contrast, visible focus, 44px touch targets,
keyboard-operable filters, semantic tables, URL-restorable state, and reduced
motion support. The canvas graph is an enhancement; its metrics and scope are
duplicated in text. Accepted debt: a future dataset may require localization
and a fuller screen-reader graph summary; this first version exposes only
ECCV 2026 English source labels.
