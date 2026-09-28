# Paper Atlas Web Service Specification

**Status:** proposed replacement architecture; no implementation follows from
this document until the specification is accepted.

## 1. Product decision

Paper Atlas is a collection of **single-purpose network explorers**, not a
dashboard. A page answers one network question at one analytical level and
keeps its controls, legend, search, tooltip, and graph in the established ECCV
Korea workbench layout. Navigation chooses a result; it does not place several
results beside one another.

The existing implementation at
`src/venues/eccv26-korea/eccv_2026_korean_first_author_coauthor_network.html`
is the behavioral and visual baseline. The replacement must extract and
parameterize that visualizer. It must not create a canvas approximation of it.

The current `src/viewer/` dashboard prototype is not the target architecture.
It must remain intact until a replacement page has passed parity checks, then
be removed rather than carried forward as a second UI.

## 2. Non-goals

- No mixed country ranking, metric-card dashboard, institution search, and
  graph on the same analysis page.
- No global author graph: author-level density is meaningful only after a
  country or organization scope is explicit.
- No country assignment based on author name, nationality, or an inferred
  research location. Country always means the verified country of a canonical
  organization.
- No automatic academic/research/company taxonomy outside a versioned,
  evidence-backed classifier. The current global tables do not supply that
  classification universally.

## 3. Site map and stable URL contract

Static HTML routes are deliberate so GitHub Pages needs no rewrite rules.

| Route | Purpose | Result shown |
| --- | --- | --- |
| `index.html` | Dataset and lens directory | Navigation only; no graph |
| `world.html?venue=eccv&year=2026` | Global institution collaboration explorer | One institution network, coloured by country |
| `countries.html?venue=eccv&year=2026` | Country finder | Navigation only; no graph |
| `country.html?venue=eccv&year=2026&country=KR&scope=first_author&view=domestic,foreign` | Country research explorer | One author network, grouped by organization |
| `institutions.html?venue=eccv&year=2026&country=KR` | Institution finder | Navigation only; no graph |
| `institution.html?venue=eccv&year=2026&organization=<stable-id>&scope=all_author` | Institution collaboration explorer | One author network around an organization |

Directory results link to a new document route. They may offer an explicit
“open in new tab” affordance, but ordinary navigation stays in the same tab.
Every graph route restores its scope, filters, selected legend item, and
selected author from its query string where applicable.

## 4. The three network lenses

### 4.1 World: institution collaboration

**Question:** Which canonical institutions appear together on ECCV papers, and how often?

- Node: one canonical organization-country record with at least one selected
  paper. Its colour is the first normalized country attached to that record;
  missing country remains an explicit `Country unavailable` category rather
  than an inferred nationality.
- Edge: an undirected institution pair that co-occurs on one or more papers.
- Node size: deduplicated selected-paper count for that institution.
- Legend: all represented countries, ordered by deduplicated paper count. It
  acts as the colour key and focuses every institution in that country.
- Tooltip: organization name, normalized country, selected-paper count,
  directly linked institutions, and a deduplicated bullet list of example
  paper titles.
- Click or search: focus the selected institution and its **direct**
  collaborators. It does not breadth-first select the full graph because a
  global institution graph has dense connected components.

All attributable organizations are shown. Labels are limited to a settled,
non-overlapping high-salience subset; search and hover expose every name.

### 4.2 Country: first-author research network

**Question:** How do authors on papers whose first author is affiliated with a
given country collaborate across its institutions and external partners?

This is the direct generalization of the ECCV Korea visualizer.

- Default scope: papers whose first author has at least one canonical
  organization in the selected country. This preserves the meaning of the
  Korea-first-affiliation explorer.
- Optional explicit scope: `all_author`, for papers with any author affiliated
  with the country. It is never silently substituted for the default.
- Node: an author, once per selected paper set.
- Edge: coauthorship on one or more selected papers; edge width reflects the
  number of shared selected papers.
- Group/color: the author’s deterministic display organization, calculated
  from canonical organizations represented in the selected scope. The tooltip
  retains all canonical organizations; grouping does not erase multi-affiliation.
- Filters: `domestic`, `foreign`, and `unattributed` affiliation relation.
  Korea additionally retains its established, versioned legacy filters
  (`university`, `research`, `company`, `foreign`) until an equivalent
  evidence-backed taxonomy exists for every country.
- Legend: every visible display organization, ordered by deduplicated selected
  paper count, then author count, then canonical name. It is collapsed to two
  rows and explicitly expandable, exactly as in the Korea visualizer.
- Node selection: breadth-first traversal of the complete undirected author
  component. The primary author has a node-color glow and persistent selected
  label; reached authors and internal edges have secondary emphasis. A bounded
  one-shot BFS wave communicates traversal order.

### 4.3 Institution: internal and partner collaboration

**Question:** Which of an organization’s ECCV authors collaborate internally,
and which outside organizations bridge its work?

- Default scope: papers with at least one author carrying the selected canonical
  organization on that paper.
- Nodes: selected-organization authors and their coauthors on those papers.
- Group/color: canonical display organization. Members of the selected
  organization are visually primary; external organizations remain visible as
  distinct bridge groups rather than being collapsed into “outside”.
- Legend, author search, tooltip, selection, pulse, drag, zoom, and blank-canvas
  clear behavior are identical to the country author-network contract.
- Tooltip and scope note state that membership is the affiliation recorded for
  selected conference papers, not a claim about current employment or a lab’s
  complete membership.

## 5. Shared visualizer contract

The implementation must start by extracting the Korea visualizer’s real
DOM/SVG, CSS tokens, and D3 behavior into reusable modules. It must preserve:

1. system light/dark theme tokens and spectral categorical colors;
2. a full-viewport graph workbench with only a compact title, scope controls,
   search, legend, graph frame, tooltip, and status text;
3. SVG `viewBox="0 0 1180 720"` with `preserveAspectRatio="xMidYMid meet"`;
4. D3 zoom/pan, node drag that retains the dropped position, and responsive
   uniform scaling without re-running a size-dependent layout;
5. organization hubs that attract their own authors, hub-only repulsion, and
   weaker tethering for cross-organization bridge authors;
6. collapsed/expanded legend behavior, stable legend order, and blank-canvas
   clearing without moving a selected legend item to the front;
7. native author combobox/listbox search, keyboard selection, hover tooltip,
   semantic bulleted title list, and a tooltip that remains available while a
   graph selection is active;
8. principal-node glow rather than a contrasting ring, secondary selection
   emphasis for reached nodes, and reduced-motion suppression of the pulse;
9. no whole-graph fade solely because the pointer hovers one node.

The global institution network uses the same shell, SVG controls, legend,
tooltip, zoom/pan, theme, and highlight mechanics. It replaces only the
author-specific force/hub and BFS semantics where those would be misleading
for a dense institution graph.

## 6. Page anatomy

Every graph page follows this vertical order and occupies the viewport:

1. concise title: venue, year, lens, and exact scope;
2. only controls relevant to that lens;
3. legend and its disclosure;
4. graph viewport;
5. hover/selection tooltip and small accessible status region.

Counts, source boundaries, and methodological explanation live in a small
`About this view` popover or a dedicated methods page, not in a competing grid
of dashboard cards. The graph and its navigation controls remain the primary
surface.

## 7. Data products

Raw ECVA snapshots remain under ignored `data/<venue-year>/raw`. Browser data
contains only normalized, publication-scoped graph data and provenance fields.

```text
public/data/
  catalog.json
  eccv-2026/
    world.json
    countries/index.json
    countries/KR.json
    institutions/index.json
    institutions/<stable-organization-id>.json
```

- `catalog.json` lists available venue/year snapshots and their build metadata.
- `world.json` contains canonical institution nodes, institution-pair edges,
  their normalized country colour key, paper-title samples, and coverage-gap
  count.
- each country and institution payload contains only the graph nodes, links,
  display groups, filter relations, exact scope semantics, tooltip paper titles,
  and provenance needed by that single route.
- canonical organization IDs are stable, URL-safe identifiers derived from
  canonical organization plus verified organization country.
- source affiliations, all canonical affiliations, resolution method, ROR ID,
  and evidence URL remain available in tooltips/details where appropriate;
  raw affiliation text is never used as a display-group key.
- unknown or unassigned organizations stay explicit coverage gaps. They do not
  acquire guessed country, type, or organization labels.

Payloads are generated offline from immutable snapshots and normalization
outputs. Opening any route performs no ECVA, Google Scholar, ROR, or other
upstream request.

## 8. Extraction and migration sequence

1. Freeze the current dashboard prototype; do not modify its appearance while
   the replacement is designed.
2. Extract the Korea generator’s visualizer template into a reusable network
   engine without changing its output behavior.
3. Prove parity on the Korea first-author graph: same selected paper population,
   author/node/link data, categories, URL filters, search selection, tooltip
   content, legend order, and interaction states.
4. Add the country payload builder and render a second country with the generic
   `first_author` scope. This establishes that Korea is not a special hardcoded
   page.
5. Add the world country-collaboration adapter using the shared shell.
6. Add the institution payload adapter and route.
7. Replace the prototype only after every target page has passed visual and
   functional parity checks; then remove obsolete prototype code in a separate,
   reviewable change.

## 9. Acceptance criteria

### Korea parity gate

For `country=KR&scope=first_author`, the new graph must match the established
Korea visualizer’s data population and behavior. Differences require an
explicitly documented data correction, not a silent redesign.

### Functional gate

- Each finder opens one graph route; graph routes never embed a dashboard.
- URL state survives reload and direct linking.
- Legend selection, node selection, hover tooltip, search selection, blank
  clear, zoom/pan, drag retention, filters, and light/dark mode work on all
  author graph routes.
- Global-institution click focuses direct collaborators; country-legend click
  focuses every institution in that country.
- No selected filter produces a blank graph canvas rather than an invented
  empty-category visualization.

### Data gate

- Paper scope, counting method, group key, attribution rule, and coverage gaps
  are displayed or linked from every route.
- No graph payload contains an unverified inferred country or silently drops an
  unresolved affiliation from the coverage record.

### Visual gate

Manual visual QA covers each route and its key states at 1280, 768, and 375px:
tooltip bounds, legend disclosure, long names, URL restore, theme parity, node
drag retention, no aspect-ratio distortion, and no edge-aligned accumulation.

## 10. Decisions to retain unless changed explicitly

1. Country pages default to `first_author`; this is the only default that
   preserves the Korea visualizer’s original question.
2. “Organization member” means an author carrying that organization on the
   selected conference paper. It is not a current-personnel claim.
3. Generic organization type categories are deferred until their classifier is
   evidence-backed; relation-to-selected-country filters are safe now.
