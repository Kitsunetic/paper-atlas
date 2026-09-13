# Google Scholar-only reaudit schema

`eccv_scholar_schema.json` is the row-level JSON Schema, and
`eccv_scholar_validator.mjs` is the cross-row boundary validator for the new Scholar-only
candidate and work CSVs. It deliberately does not read or rewrite any existing
audit CSV. The caller supplies the two new tables and the immutable baseline
tables, which makes the join check usable in a build and in small fixtures.

## Candidate table

One row is required for each of the 271 immutable `candidate_identity_key`
values. The following fields are required:

`candidate_identity_key`, `eccv_first_author_name`,
`eccv_first_author_affiliation_raw`, `eccv_selected_paper_count`,
`eccv_virtual_poster_ids`, `eccv_titles`, `source_policy`, `scholar_status`,
`scholar_profile_url`, `scholar_search_url`, `scholar_identity_evidence_url`,
`unknown_reason`, `eligible_prior_work_count`,
`first_listed_unmarked_count`, `explicit_equal_contribution_first_count`, and
`contribution_marker_unknown_count`.

`source_policy` must be `google_scholar_only`. A matched row has a required
`scholar_profile_url`, empty `unknown_reason`, and integer counts (including
zero). An unknown row has an empty profile/evidence URL and all four count
fields empty, plus a non-empty `unknown_reason` and a Scholar search URL. This
distinguishes “not found” from a verified zero.

The five immutable identity/population fields must byte-for-byte match the
baseline queue: candidate key, author name, raw affiliation, selected-paper
count, poster-ID list, and title list. The validator also checks that the
selected-paper counts sum to 277 and that the baseline paper table contains 277
unique poster IDs.

## Work/evidence table

Rows are counted prior works only; excluded leads must not be emitted. Required
fields are `candidate_identity_key`, `work_id`, `title`, `venue`,
`publication_date`, `work_type`, `author_position`,
`contribution_marker_status`, `contribution_type`, `scholar_work_url`,
`scholar_marker_text`, `scholar_marker_url`, and `source_policy`.

Allowed venues are CVPR, ICCV, ECCV, NeurIPS, ICLR, ICML, SIGGRAPH, SIGGRAPH
Asia, IROS, ICRA, and RA-L. Main-conference venues require
`main_conference_full_paper`; RA-L requires `journal_article`. The publication
date must be on or before the inclusive 2026-03-05 cutoff. `author_position`
must be `first`.

The marker status is deliberately explicit:

- `explicit_equal`: Scholar visibly marks the first author as equal/contributing
  equally with a literal equality phrase in `scholar_marker_text`; this maps to
  `explicit_equal_contribution_first` and requires a Scholar `scholar_marker_url`.
- `no_marker`: a healthy Scholar index record shows first-listed order with no
  contribution marker; this maps to `first_listed_unmarked` and does not claim
  sole authorship.
- `bare_glyph`: Scholar exposes only a bare contribution glyph, without a
  literal equality phrase (preserve the glyph in `scholar_marker_text`); this
  maps to `contribution_marker_unknown`.
- `unavailable`: the Scholar surface does not expose enough marker information;
  this also maps to `contribution_marker_unknown`.

The three `contribution_type` values are mutually exclusive. Work IDs are
unique, and candidate bucket counts must equal the grouped work rows exactly.
Unknown candidates cannot have work rows. Every URL-looking value in either new
table must be an HTTPS URL on `scholar.google.com`; a CVF, publisher, personal,
institutional, OpenAlex, or other URL is rejected even if it appears only in a
marker/evidence field.

## CLI and build use

```bash
node pocs/eccv26-korea/eccv_scholar_validator.mjs \
  eccv_2026_scholar_candidates.csv \
  eccv_2026_scholar_work_evidence.csv \
  eccv_2026_first_author_identity_review_queue.csv \
  eccv_2026_korean_first_author_affiliations_reaudited.csv
```

The validator exits non-zero and prints structured issues on failure. Use
`classifyScholarWork` while building the work table to reject WACV, workshop,
non-first-listed, and post-cutoff leads before serialization.
