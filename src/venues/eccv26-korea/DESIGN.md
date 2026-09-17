# ECCV Coauthor Network Design System

## 1. Atmosphere & Identity

A compact research-map workbench: the graph is the primary surface, while
controls and the institution legend remain quiet, high-contrast navigation.
The signature is categorical colour on a neutral system-aware canvas, so the
network remains legible in either system theme.

## 2. Color

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Foreground | `--network-foreground` | `#17191d` | `#f3f4f6` | Text and controls |
| Background | `--network-background` | `#ffffff` | `#121212` | Graph canvas |
| Muted | `--network-muted` | `#4b5563` | `#c2c7d0` | Metadata and edges |
| Border | `--network-border` | `#d2d6dc` | `#363b43` | Frame separation |
| Card | `--network-card` | `#ffffff` | `#17191d` | Control/legend surface |
| Popover | `--network-popover` | `#ffffff` | `#23262c` | Author tooltip |

Institution colours use the existing 12 `--network-c*` spectral tokens only;
muted selections use foreground colour-mixing rather than a new colour.

## 3. Typography

- Primary: `var(--font-sans, system-ui, sans-serif)`.
- Heading: 1.1rem, semibold visual weight through inherited font.
- Body controls: .82rem; legend labels: .73rem; metadata: .76rem.
- Long institution labels truncate in the collapsed legend rather than growing
  its two-row footprint.

## 4. Spacing & Layout

Base unit is 4px. The network occupies the viewport. The legend is a responsive
grid with a 13rem minimum desktop track and a single mobile track at 640px.
Its collapsed state has exactly two 1.55rem rows; its expanded state owns a
bounded internal scroll region, leaving the graph viewport as the main canvas.

## 5. Components

### Institution legend

- **Structure:** institution button grid and disclosure button; each institution shows its deduplicated selected-paper count. Institutions are ordered by selected-paper count descending, then author count and official name for stable ties; blank graph canvas clears an active highlight.
- **Variants:** collapsed (two rows) and expanded (bounded scroll); selection preserves the established institution order and current scroll position.
- **States:** default, selected, muted due to another selection, keyboard focus, expanded/collapsed.
- **Accessibility:** every institution is a native button with `aria-pressed`; disclosure has `aria-controls` and `aria-expanded`; names retain a full accessible label even when visually truncated.
- **Motion:** none. State changes are immediate to avoid disorienting graph-layout movement.

### Affiliation view filters

- **Structure:** four native English-labeled checkboxes for Korean universities/graduate schools/science institutes, Korean research institutes, Korean companies, and foreign institutions.
- **States:** any combination, including no selection. The default is Korean universities/graduate schools/science institutes only; no selection produces a blank graph canvas and hides the empty institution legend controls.
- **Accessibility:** each checkbox has a visible English label and its active combination, including an empty `view` value, is retained in the URL query.

### Author search

- **Structure:** a native search input with an attached, bounded author-result list. Each result shows the author name and canonical normalized institution.
- **States:** empty, matching (up to 10 ordered candidates), no matches, active keyboard candidate, and selected author.
- **Accessibility:** the input follows the combobox/listbox pattern with visible click targets; Arrow keys move the active candidate, Enter selects it, and Escape closes the list. Selecting a candidate invokes the same toggle as clicking that author's node: it breadth-first traverses the undirected coauthor graph, focuses every reachable author and internal collaboration link, adds a node-colour glow to the author, hides the tooltip, and leaves institution-legend selection independent; selecting the same candidate again clears the focus.

### Graph node

- **States:** neutral, hover detail, institution-focused through the legend, graph-component-focused through a node click, and dimmed by another focus. Clicking a node breadth-first traverses each reachable coauthor without revisiting authors, focusing its full connected component. The principal selected author receives a static, node-colour SVG glow and a persistent `Selected · name` graph label without an added contrasting ring; its reachable collaborators retain only the lighter secondary ring. Graph focus and hover detail are independent: while a node or component is selected, hovering any node still opens, positions, and dismisses its tooltip without changing the selected emphasis.
- **Accessibility:** SVG remains labelled; tooltip presents the canonical normalized institution name. A thin divider separates author metrics from a semantic bulleted paper-title list without a redundant section label; the popover is bounded to 360px while respecting the canvas edge.

## 6. Motion & Interaction

Disclosure is an explicit click or keyboard action, never hover-driven. It has
no height animation; this avoids accidental opening during graph exploration
and respects reduced-motion preferences by default. Selecting an author emits
one short BFS wave: a node-colour solid flash briefly marks that author's
BFS-tree edges in hop order, and a small ring acknowledges each reached node.
Only one or two hop bands overlap, so the wave remains a frontier rather than
a routing overlay. The wave ends after propagation rather than looping, because
coauthorship is undirected and a continuous flow would imply a false direction. Reduced-motion
preferences suppress the wave while preserving the final selected state.
Clicking only the blank SVG canvas clears a highlight; node and legend actions
do not bubble into that gesture. Native focus indication and text-decoration
feedback communicate button affordance. Dragging a graph node retains its dropped position for the
current graph session, so manual spatial exploration is never undone by the
force simulation. Each institution has an invisible hub: its authors are drawn
toward that hub, while only the hubs repel one another and are softly held within
the map. A directly cross-institutional author uses a deliberately weaker hub tether
and the compact collaboration distance, so it can remain a bridge rather than
being pulled fully into either cluster. Each hub has a fixed home locus in the
canonical 1180×720 graph coordinate system, which avoids a rigid grid without
making viewport dimensions part of the simulation. At every viewport size, SVG
uses `preserveAspectRatio="xMidYMid meet"` to scale the canonical graph
uniformly. A resize never changes node coordinates, forces, graph bounds, or
hub repulsion; unused container space is letterboxed instead of distorting the
network.

## 7. Depth & Surface

Strategy: borders plus restrained popover shadow. The graph frame and legend
header use `--network-border`; only the tooltip is elevated with a soft shadow.

## 8. Accessibility Constraints & Accepted Debt

WCAG target: 2.2 AA. Native buttons, visible focus, keyboard disclosure,
system light/dark colors, and no hover-only behavior are required. Accepted
debt: SVG node keyboard navigation is not yet supplied; the graph has a
descriptive accessible label but node-level access needs a separate,
larger interaction design.
