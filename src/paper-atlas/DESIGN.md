# Paper Atlas network pages

## 0. Reference log

- **Concrete reference:** `src/venues/eccv26-korea/eccv_2026_korean_first_author_coauthor_network.html` and its `DESIGN.md`. This work extracts its real SVG/D3 workbench contract; it is not a new dashboard design.
- **Redesign constraint:** the earlier `src/viewer/` prototype remains outside this surface. Its dashboard layout and canvas renderer are deliberately not reused.
- **Personas:** a research visitor wants to locate an author or institution quickly; a visually sensitive reader needs categorical colours with system light/dark contrast; a keyboard user needs controls that do not depend on SVG pointer access.

## 1. Atmosphere & identity

A compact research-map workbench. One route presents one network result. The graph remains the primary surface; the title, filters, search, and legend are quiet navigation around it. There are no summary cards, dashboard chrome, or a second analytical result competing with the canvas.

## 2. Tokens

The network uses the Korea reference's system-aware tokens: foreground `#17191d/#f3f4f6`, background `#ffffff/#121212`, muted `#4b5563/#c2c7d0`, border `#d2d6dc/#363b43`, card `#ffffff/#17191d`, and popover `#ffffff/#23262c`. Twelve reserved spectral categorical tokens run red through violet and brown. The base spacing unit is 4px.

## 3. Typography & layout

System sans-serif is used throughout. The heading is 1.1rem, controls .82rem, legend labels .73rem, and metadata .76rem. A route fills the visual viewport through a `grid` workbench. SVG uses a fixed 1180 by 720 coordinate system with `preserveAspectRatio="xMidYMid meet"`; viewport changes letterbox rather than rerun the layout or distort circles.

## 4. Primitives

- **Network heading:** route title, native filter fieldset, and searchable combobox.
- **Legend:** country author routes use normalized-institution buttons; global routes use country buttons. Both expose selected or muted state, selected-paper count, stable count ordering, two-row collapsed footprint, and explicit disclosure. On the global route, country entries operate as a colour-key and select every institution in that country.
- **Global country palette:** countries receive deterministic, high-separation hues around the colour wheel; the unavailable-country category stays muted. This keeps many countries distinguishable without assigning a misleading institution type.
- **Network frame:** bordered canvas with zoom/pan SVG and a bounded tooltip.
- **Graph node:** categorical circle with size based on papers and collaboration degree. In author views, an invisible organization hub attracts its members; hubs repel one another while a cross-organization author remains weakly tethered as a bridge.
- **Scale-aware initialization:** author-country routes derive a pannable coarse field from the total future author-cloud area. This prevents a large cohort from beginning as a fixed-size central disk; collision reserve, cross-institution link pull, author repulsion range, and institution anchoring scale with that field.
- **Shared interaction primitive:** `assets/network-interactions.js` owns escaped tooltip copy, pointer-relative tooltip placement, the accessible searchable combobox, primary-selection glow and marker, breadth-first wave traversal, accelerated/inertial viewport pan and zoom, and reduced-motion behaviour. Renderers supply only graph adjacency, search labels/details/sort order, node presentation functions, and an appropriate traversal depth.

## 5. States and interaction

- Country author view renders the complete selected first-author-country cohort: it has no university/research/company checkbox strip. It preserves institution focus, full connected-component BFS author selection, glow on the primary author, secondary rings, one-shot BFS pulse, hover tooltip during active selection, retained node drag position, and accelerated/inertial viewport motion. Arrow keys pan in camera direction with acceleration and decay; wheel or trackpad zoom is smoothed through the same frame loop; blank-canvas pan carries recent drag velocity after release. Text fields and controls retain their native keyboard behaviour.
- China (simple) is an additional country route, not a different renderer or a replacement for China. It keeps the same first-author-country paper cohort and the same controls, but includes only the first and last listed author of each paper as nodes. An edge means those two listed authors appear on the same paper; a single-author paper contributes one node and no self-edge. The route explicitly says "last listed author", never "corresponding author".
- The global view uses canonical institutions as nodes and paper-level institution co-occurrence as links. A node receives the country of its first normalized organization-country record as its categorical colour; unavailable country is an explicit, non-inferred category. A country legend focuses all of its institutions, while an institution node or search result focuses its direct collaborating neighbourhood. The global wave intentionally stops at one hop: a full traversal would illuminate its giant component and erase the selected institution's visual priority.
- Global edges retain separate support, fractional co-occurrence weight, directional exposure, mutuality, and asymmetry values. The overview renders only recurrent relationships (`N ≥ 2` papers); one-paper relationships remain in the payload and are revealed for a focused institution or country. This uses recurrence as the evidence gate because one-paper pairs can otherwise have spuriously perfect mutuality.
- The global layout does not let one-paper co-occurrences pull institutions into the dense core: they remain visible evidence but exert zero layout attraction. Repeat-supported mutuality alone determines link attraction; finite-range charge and collision padding preserve readable separation without hard viewport boundaries. Institutions form loose, dynamically separated country clusters: a country centroid softly attracts its own institutions while nearby country centroids repel, without pinning countries to fixed map coordinates.
- Blank SVG canvas and Escape clear focus. When the search suggestion list is open, Escape first closes that list without clearing the current focus. Legend and node actions never bubble into the canvas gesture. Search result selection invokes the same state transition as a node click.
- Motion serves selection feedback only. A wave launches at the primary node: a node-colour line flash briefly marks breadth-first tree edges in hop order, and a receiving node rings after its incoming edge. Same-depth branches run concurrently. This deliberately follows the Korea reference rather than implying a directional data flow. The author pulse is disabled under `prefers-reduced-motion: reduce`; disclosure is immediate.

## 6. Depth & responsive behaviour

Borders separate the frame and legend. Only the tooltip uses a restrained shadow. The legend collapses to two 1.55rem rows and expands into a bounded internal scroll region. At 640px the controls and legend stack into one column; controls stay native and text wraps rather than clipping.

## 7. Accessibility constraints

Target WCAG 2.2 AA: native fieldsets, buttons, and combobox/listbox controls; visible focus; `aria-pressed`; system color scheme; reduced-motion behaviour; semantic bulleted paper lists; and descriptive SVG labels. SVG nodes are pointer-first; author search remains the keyboard-accessible path to author selection.

## 8. Accepted debt & handoff

The first implementation ships two route families: Korea-parity country and global institution collaboration. Country author routes expose the complete cohort for the selected first-author country, without splitting university/company/research categories. The Korea source currently encodes the existing 277-paper graph population even though a later audit correction is known; updating that population is a data-reconciliation task, not a visualizer change.
