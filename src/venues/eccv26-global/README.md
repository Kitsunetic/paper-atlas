# ECCV 2026 Global

This proof of concept collects a small, reproducible local source snapshot
before any global affiliation normalization. Raw data lives outside Git at
`data/eccv26/`; policy and code are tracked here.

## First collection

```sh
node src/venues/eccv26-global/scripts/collect_snapshots.mjs
node src/venues/eccv26-global/scripts/parse_ecva_snapshot.mjs
```

The first command makes at most three sequential logical source acquisitions.
Later runs use `data/eccv26/raw/manifest.json` and make no requests. Use
`--refresh` only when intentionally checking the three configured sources.

## PoC checks

```sh
node --test src/venues/eccv26-global/scripts/*.test.mjs
```

The parser report at `data/eccv26/parsed/ecva-program-poc-report.json` confirms
the raw JSON shape, poster UID coverage, and raw first-author-affiliation
coverage before normalization begins.

## Offline normalization baseline

After the snapshot exists, the following commands make no network requests.

```sh
node src/venues/eccv26-global/scripts/build_normalization_inputs.mjs
node src/venues/eccv26-global/scripts/build_ror_name_index.mjs
node src/venues/eccv26-global/scripts/build_exact_matches.mjs
node src/venues/eccv26-global/scripts/build_author_affiliation_contextual_inferences.mjs
```

The first command writes immutable ECVA source fields to
`parsed/papers_raw.csv` and `parsed/author_affiliations_raw.csv`, then creates
two derived review inputs: `affiliation_variants.csv` and the paper-provenanced
`affiliation_segment_candidates.csv`. Only explicit semicolon-separated lists
are segmented; slashes, commas, ampersands, and hyphens remain source text.

The ROR command creates `normalized/ror_name_index.csv` from the pinned local
ROR release. The matching command writes
`normalized/affiliation_exact_match_candidates.csv` with exactly one of:

- `exact_ror`: one ROR organization for the comparison key;
- `ror_article_variant`: one unique ROR organization after removing only a leading `The` from a non-composite source segment;
- `ror_contained_name`: one complete registered ROR name occurs inside a non-composite department/address-heavy source segment;
- `ror_multi_contained_name`: multiple complete registered ROR names occur in one source segment and are emitted as separate normalized entities;
- `ror_high_confidence_variant`: a separately versioned spelling or language variant anchored to the registered ROR name and its ROR-recorded website;
- `canonical_parent_country_undetermined`: a primary-source-backed corporate identity whose legacy source-level country is blank; its independently audited `organization_country_*` fields may nevertheless identify the canonical organization's country; and
- `paper_context_verified_eccv26`: a paper-specific, primary-source-backed decision for an otherwise ambiguous exact key;
- `paper_context_source_literal_eccv26`: a paper-specific named organization preserved verbatim when the snapshot supplies a label but no reliable global identity, ROR record, or research-site country;
- `paper_context_identity_undetermined_eccv26`: a paper-specific source label that is non-unique, incomplete, or contradicted by current primary evidence; it is retained without assigning an entity, ROR, or country;
- `context_decomposed_eccv26`: an ECCV-scoped, explicitly multi-institution source segment, retained as multiple normalized entities rather than collapsed to one organization;
- `manual_verified_alias`: a versioned, primary-source-backed alias decision with a ROR ID;
- `manual_verified_no_ror`: a versioned, primary-source-backed organization absent from the pinned ROR release;
- `source_missing_affiliation`: a source placeholder such as `N/A`, retained without inferring an organization;
- `exact_ambiguous`: multiple ROR organizations share the key; or
- `unresolved`: no ROR name or alias has that key.

No fuzzy result is automatically accepted. `ror_high_confidence_variant` is
kept separate from `manual_verified_alias`: the former is a transparent
registered-name variant, whereas the latter requires a primary source specific
to the organization. The raw affiliation and the
comparison key are both retained in every review row, so future aliases and
manual decisions remain auditable.

`aliases/parent_entity_aliases.csv` handles global companies separately. Its
legacy `country_*` fields retain source-level entity information and may remain
blank. Versioned files under `aliases/organization_country_batches/` instead
record auditable `organization_country_*` decisions for the canonical
organization. For example, a bare `Google` organization is U.S.-based even if
the paper does not state whether its author worked in the U.S., U.K., or India.
This preserves the distinction rather than leaving an obvious organization
country artificially blank.

`normalized/author_affiliation_contextual_inferences.csv` is a deliberately
separate author-level recovery table for malformed, incomplete, or missing ECVA
affiliation text. It is generated from the versioned
`aliases/eccv26_author_context_resolutions.csv` ledger, checks that every such
author-record is covered exactly once, and retains the raw source affiliation,
the affected source segment, decision status, all recovered organizations, ROR
IDs where available, countries, and source URL. This avoids the false choice of
collapsing a recovered multi-affiliation author to one paper-level entity.

`aliases/eccv26_context_resolutions.csv` is reserved for exact-name collisions
whose meaning can be proven for this ECCV snapshot but is not globally safe.
It is intentionally empty until a paper-context investigator provides primary
evidence; those rows are tagged `context_verified_eccv26` and are never reused
as cross-conference aliases.

`aliases/eccv26_paper_context_resolutions.csv` resolves a key only for the
named `paper_uid`. It exists for genuine collisions such as institutions with
the same English name in different countries; the paper provenance prevents a
correct decision for one paper from overwriting another paper's affiliation.
Rows marked `paper_context_source_literal_eccv26` are intentionally not global
normalizations: they preserve an explicit source label and remain excluded from
country-based analysis until primary evidence identifies the entity and site.
The stricter `paper_context_identity_undetermined_eccv26` is used only when a
source label cannot identify one entity at all. Those rows remain in the
user-required-decision packet rather than being silently assigned to a likely
institution.

`aliases/eccv26_composite_resolutions.csv` records only verified, explicit
multi-organization source segments. The base candidate file keeps the original
segment for audit, while `normalized/affiliation_normalized_entities.csv`
contains one row per normalized organization (`normalized_entity_index`). This
is the authoritative table for country-set and collaboration calculations.

## Resolution triage

```sh
node src/venues/eccv26-global/scripts/build_resolution_triage.mjs
```

This offline step writes `normalized/resolution_triage.csv`. It groups all
unresolved and exact-collision keys by frequency, presents up to three local
ROR candidates, and routes them to `alias_review`,
`context_or_evidence_review`, `paper_pdf_review`,
`not_institution_review`, or `source_missing_affiliation`. Candidate similarity
only prioritizes review; it never writes a canonical organization decision.

## Manual decision packet

```sh
node src/venues/eccv26-global/scripts/build_decision_review_queue.mjs --limit 25
```

This writes a small, priority-ordered `normalized/manual_decision_review_queue.csv`
for review. Alias candidates carry a proposed canonical organization and ROR ID;
exact-name collisions deliberately retain every candidate and no proposal. Every
row starts with `pending_primary_source`, so a ROR string candidate cannot be
mistaken for evidence that the source affiliation should be mapped there. In a
multi-affiliation raw string, `target_affiliation_segment` identifies exactly
which segment the proposal concerns.

## User-required decisions

`decisions/user_required_decisions.csv` is deliberately separate from the
investigator's manual-review queue. It receives a row only when primary sources
and paper context cannot determine the mapping, or when the remaining choice is
a research-policy choice rather than a factual affiliation question. A header-only
file means there is currently no decision that needs the user's judgment; routine
typos and aliases are researched and resolved without escalation.

## Verified aliases

`aliases/manual_aliases.csv` is the versioned decision dictionary. Each row
contains the comparison key, canonical organization and country, resolution
method, and a primary evidence URL. A ROR ID is recorded when the organization
is in the pinned release; otherwise the entry is explicitly marked
`manual_verified_no_ror`. `build_exact_matches.mjs` retains the evidence
alongside each resolved row.
