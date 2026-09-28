# Paper Atlas Viewer

The static viewer is a reusable surface for normalized conference datasets.
Its first payload is ECCV 2026 global affiliation data, but the UI contract is
venue/year aware rather than Korea-specific.

## Build and run

The source snapshots and normalized tables remain local under `data/eccv26/`.
Generate the tracked browser payload from those local inputs, then serve the
static directory:

```sh
node src/viewer/scripts/build_eccv26_atlas.mjs
python3 -m http.server 4173 --directory src/viewer/public
```

Open `http://127.0.0.1:4173/`. The generated payload is
`public/data/eccv26.json`; it contains canonical organization-country data,
paper memberships, and author IDs needed for bounded local graph views, but no
raw snapshots.

## Query state

- `counting=full|fractional` selects whether every represented country receives
  a paper credit or each paper is divided over its attributable country set.
- `country=KR` selects a country.
- `organization=org-…` selects a canonical organization; it also restores the
  organization country.

The overview graph is a country collaboration network. Selecting a country or
institution changes it to a local coauthor graph for the selected paper scope.
The full scope count remains visible even when the rendered author graph is
bounded for readability.

Country is the verified country of the canonical organization, not author
nationality or an inferred author research site. See
[the viewer methods](public/methods.html) and the venue-specific
[data policy](../venues/eccv26-global/DATA_POLICY.md).
