# Paper Atlas network pages

Static, route-oriented network visualizations built from local normalized snapshots.

```bash
./scripts/serve_paper_atlas.sh
```

Pass a port as the first argument when 4174 is occupied, for example
`./scripts/serve_paper_atlas.sh 4180`.

Open `http://127.0.0.1:4174/` to choose a published route. Country author networks use the shared `country.html?country=<ISO-3166-1-alpha-2>` page (`KR`, `CN`, and `US`) and load their controls and graph payload dynamically; `world.html` remains the global institution collaboration network. These pages fetch generated public JSON, so opening their HTML directly with `file://` is intentionally unsupported.

Country author routes render the complete first-author-country cohort in one
graph. Universities, research institutes, and companies are not split into
top-level checkbox categories; normalized organizations remain visible as
institution legend entries and layout anchors.

`country.html?country=CN&view=simple` is a second China route using the same renderer and the same 1,230 selected papers. It retains only the first and last **listed** author of each paper (2,095 distinct author nodes and 1,206 coauthor links in the current snapshot). A single-author paper contributes one node; the last listed author is not necessarily the corresponding author. The full China route remains available.

Country author networks use a two-stage gravity layout. First, normalized institutions are positioned as a coarse collaboration graph, with collaboration support normalized by both institutions' author counts. Stronger inter-institution repulsion is balanced by a harmonic radial restoring force, whose inward pull grows with distance rather than acting as a hard viewport boundary. Coarse collision uses a compact institution-center proxy rather than the full author-cloud radius. Then authors are seeded around their settled institution center and refined by coauthor links plus a soft institution anchor. This avoids treating thousands of authors as one unstructured initial mass while preserving cross-institution bridges.

The coarse initialization field expands with the sum of institution author-cloud
areas: `max(1, sqrt(required_area / (0.75 * viewport_area)))`. Large country
cohorts therefore start in a wider pannable field, reserve most of each future
author cloud during coarse collision, and proportionally weaken cross-institution
pull while strengthening institution anchoring during fine layout.

Author tooltips report `Papers` (all author roles in the selected first-author-country corpus), `First-author papers`, and any `Oral papers` or `Spotlight papers`. Individual paper rows use a first-author accent and explicit `First author`, `Oral`, and `Spotlight` badges when applicable. Oral and Spotlight are official ECVA presentation categories, not inferred awards or quality scores.

The generated [ECCV 2026 edge-metric audit](EDGE_METRICS.md) documents raw support, fractional co-occurrence, directional exposure, mutuality, and asymmetry. The global overview renders recurrent edges (`N ≥ 2`); one-paper edges remain available when an institution or country is focused.
