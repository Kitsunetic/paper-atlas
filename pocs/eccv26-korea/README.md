# ECCV 2026 Korea-affiliated first-author PoC

This proof of concept collects ECCV 2026 main-conference papers whose
first-listed author has a Korean-affiliated institution. It is an affiliation
criterion, not an author-nationality criterion.

## Contents

- `eccv_2026_first_author_affiliation_full_census.csv`: full ECVA poster-data
  census captured by the re-audit.
- `eccv_2026_korean_first_author_affiliations_reaudited.csv`: selected,
  classified Korean-affiliation records.
- `eccv_2026_korean_first_author_reaudit_diff.csv`: re-audit comparison.
- `eccv_coauthor_network_builder.mjs`: builds the interactive coauthor map and
  normalized institution directory.
- `eccv_2026_korean_first_author_coauthor_network.html`: generated interactive
  map.
- `eccv_2026_coauthor_institution_directory.csv`: normalized institution
  directory behind the map filters and legend.
- `eccv_2026_korea_first_affiliation_audit.md` and
  `eccv_2026_korean_first_author_affiliations_complete.md`: research/audit
  records, including the earlier first-pass evidence.

`DESIGN.md` records the map's interaction and accessibility contract.

## Regenerate

Run from this directory with Node.js 18 or newer. Both scripts fetch the
official ECVA virtual-program JSON; results can therefore change if ECVA
updates its source data.

```bash
node eccv_reaudit_csv_builder.mjs
node eccv_coauthor_network_builder.mjs
```

The second command rewrites the interactive HTML and institution-directory
CSV from the re-audited selection.
