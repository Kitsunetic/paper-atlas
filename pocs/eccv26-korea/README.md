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
- `eccv_2026_first_author_top_tier_audit.csv`: paper-level audit scaffold for
  prior first-listed papers in the user-defined top-tier venue set.
- `eccv_2026_first_author_identity_review_queue.csv`: deduplicated candidate
  identity queue for that audit.
- `eccv_2026_first_author_prior_work_evidence.csv` and
  `eccv_2026_first_author_manual_identity_reviews.csv`: source-backed reviewed
  evidence and identity resolutions.
- `TOP_TIER_FIRST_AUTHOR_METHOD.md`: venue scope, cutoff, and evidence policy
  for the prior-paper audit.
- `eccv_2026_first_author_openalex_identity_leads.csv`: unverified discovery
  leads for the manual identity-review queue.
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
node build_top_tier_first_author_audit.mjs
node build_openalex_identity_discovery_leads.mjs
```

The second command rewrites the interactive HTML and institution-directory
CSV from the re-audited selection.

The third command rebuilds the paper-level audit and review queue from the
source CSV plus the manually verified evidence CSVs. It does not infer an
identity or a zero prior-paper count from a name match alone.

The fourth command queries OpenAlex for up to five candidate author records
per queue entry. It is a discovery aid, not audit evidence.
