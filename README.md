![ECCV 2026 Korea-affiliation coauthor network preview: default graph, author search, connected-component focus, and KAIST institution focus](src/venues/eccv26-korea/assets/eccv26-korea-coauthor-network-preview.gif)


# Paper Atlas

Paper Atlas is a collection of reproducible conference-paper datasets and
interactive maps of authors, institutions, and collaboration.

The first proof of concept is [`src/venues/eccv26-korea`](src/venues/eccv26-korea/): an
ECCV 2026 main-paper view filtered by first authors with a Korean-affiliated
institution. Its scope is intentionally a filter, not the project boundary.

Country author maps place every university, research institute, and company in
the selected first-author country on the same graph. They support author
search, connected coauthor-component focus, institution focus, pan, zoom, and
node dragging; the former institution-type checkbox strip is intentionally not
part of the interface.

## Planned slices

- `eccv26-korea`: Korean-affiliated first-author ECCV 2026 proof of concept.
- `eccv26-global`: all ECCV 2026 main papers.
- Future conference/year slices for ICCV, CVPR, ICLR, NeurIPS, and others.

Each slice should retain its source snapshot, classification/audit outputs,
generator, and rendered artifact so that its claims can be reviewed and
regenerated independently.

The reusable, snapshot-first collection and affiliation-normalization procedure
is documented in [the Conference Dataset Playbook](src/docs/CONFERENCE_DATASET_PLAYBOOK.md).

The first cross-country web surface is [the Paper Atlas Viewer](src/viewer/):
an ECCV 2026 global pilot with country and institution exploration, explicit
full/fractional counting semantics, URL-restorable scope, and bounded local
coauthor graphs.
