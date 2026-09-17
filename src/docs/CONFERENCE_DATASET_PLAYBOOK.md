# Conference Dataset Playbook

This document records the repeatable Paper Atlas workflow used for the ECCV
2026 global dataset. It is a procedure, not an ECCV-specific claim: each new
conference/year must create its own source configuration, snapshot manifest,
parse adapter, decisions, and audit outputs.

The objective is a reviewable dataset of papers, authors, affiliations, canonical
organizations, and organization countries. It is **not** an author-nationality
dataset, and a paper does not have one inherent national identity.

## Core rule: snapshot first, normalize offline

Do not normalize while repeatedly querying conference pages, paper PDFs, Google,
or ROR. First acquire the smallest complete set of authoritative bulk sources,
save immutable local snapshots, and perform all routine parsing and matching
offline. This gives every derived claim a reproducible input, avoids imposing
thousands of requests on external services, and separates source changes from
normalization-code changes.

The raw `data/` directory is intentionally Git-ignored. Its manifest, checksums,
collection configuration, parsers, aliases, tests, and audit reports belong in
Git. The snapshot directory itself must also be retained in durable external
storage because a source URL may change or disappear.

## Dataset boundaries to decide before collection

Write these choices in the slice README before any request is made:

| Question | Required decision |
| --- | --- |
| Population | Main conference only, or explicitly named additional tracks? |
| Denominator | The authoritative accepted/proceedings list and its expected paper count. |
| Paper version | Accepted version, camera-ready proceedings version, or both with their relationship recorded. |
| Author data | Whether author order and raw affiliations come from the same source or separate snapshots. |
| Date/cutoff | Retrieval time, program edition, and how later corrections are handled. |
| Country metric | `organization_country`, source-level affiliation country, or another explicitly named metric. |

Workshops, demos, art galleries, supplemental-only records, and withdrawn papers
must not silently enter a main-paper denominator.

## Portable directory contract

Create one isolated slice per venue/year, such as `src/venues/cvpr26-global`, and a
matching local data root such as `data/cvpr26/`.

```text
src/venues/<venue><yy>-global/
  README.md                 # scope, denominator, commands, known limitations
  DATA_POLICY.md            # source/country/normalization semantics
  sources.json              # versioned source-manifest specification
  scripts/                  # venue adapter plus common-format generators
  aliases/                  # versioned evidence-backed decisions
  decisions/                # user-required decisions only
data/<venue><yy>/           # ignored local snapshots and derived outputs
  raw/                      # immutable source files + manifest/checksums
  parsed/                   # source-faithful tables
  normalized/               # derived entities, reports, review queues
```

Never point a new slice at `data/eccv26/`, or reuse ECCV paper-context
resolutions for another conference. Reusable organization-name or organization-
country decisions may be copied only with their evidence and provenance; they
must remain independently valid for the new source text.

## Common raw-data contract

Each venue-specific adapter should produce these source-faithful tables before
any cleanup:

| Table | Minimum fields | Meaning |
| --- | --- | --- |
| `papers_raw.csv` | `paper_uid`, source identifier, title, source URL | One row per in-scope paper. |
| `author_affiliations_raw.csv` | `paper_uid`, author position, source author ID when present, raw author name, raw affiliation | One source record per author. |
| `affiliation_segment_candidates.csv` | paper provenance, raw affiliation, raw segment, comparison key, segmentation method | Derived review input preserving source text. |
| snapshot manifest | source URL, retrieval time, status, byte count, SHA-256, ETag/Last-Modified when available | Reproducibility and change detection. |

`paper_uid` must be deterministic within a slice and stable across regeneration.
If a venue has no usable bulk author/affiliation feed, record that limitation
rather than scraping every individual paper page by default. A separate bounded
evidence phase can handle only exceptional records.

## Workflow

### 1. Discover and pin authoritative sources

Prefer one official accepted/proceedings list for the denominator and one
official metadata source for author order and raw affiliation text. Pin the ROR
release used for matching. Record every URL and its purpose in `sources.json`.

The collector makes one sequential request per missing source, stops on a
rejection, makes no automatic retries, and uses local snapshots on ordinary
reruns. An explicit `--refresh` may use conditional requests and must create a
new manifest entry rather than overwrite prior evidence.

### 2. Parse without interpretation

Derive `papers_raw.csv` and `author_affiliations_raw.csv` from snapshots.
Validate denominator coverage, unique paper IDs, author ordering, and missing
raw-affiliation counts. Treat HTML entities, punctuation, whitespace, and source
typos as source facts at this stage.

### 3. Segment affiliations conservatively

Keep `affiliation_raw` immutable. Produce an auditable segment-candidate table
for matching. The ECCV adapter splits explicit semicolon lists but preserves
slashes, commas, ampersands, hyphens, and semicolons inside HTML entities. A new
venue adapter needs regression tests for its own delimiters and markup.

Do not split a multi-affiliation string solely because a model, similarity score,
or token list suggests two institutions.

### 4. Normalize organizations from local references

Build an offline organization-name index from the pinned ROR release. Automatic
normalization is limited to deterministic matches, such as one exact ROR name or
a carefully tested registered-name variant. Every other result enters one of
these review paths:

- Versioned global alias: typo, abbreviation, or language variant supported by
  primary organization evidence.
- Paper-context decision: an ambiguous label whose meaning is proven only for a
  particular paper occurrence.
- Composite decision: a source segment explicitly names multiple organizations;
  emit one normalized entity per component.
- Identity undetermined: retain the raw label without inventing a canonical
  organization, ROR, or country.

Candidate similarity is for sorting a review queue, never for automatic identity
assignment.

### 5. Treat country as a separate claim

Store at least two distinct fields:

- `country_*`: country justified by the resolved source-level entity or ROR
  record, when available.
- `organization_country_*`: country of the canonical organization itself,
  supported by an official organization, legal, or press source.

This prevents treating a Google, NVIDIA, or university name as evidence for an
author's office location or nationality. Corporate parent country does not
establish a research-site country. Any country statistic must state which field
it uses.

### 6. Recover malformed author records at author scope

Strings such as `N/A`, `Independent Researcher`, a postal code, a bare country,
or a department without its university cannot safely be repaired in a
paper-segment table. Use a separate author-context ledger with:

```text
paper_uid, author_name_raw, source_segment_raw, decision_status,
canonical_organizations, canonical_ror_ids, country_codes, country_names,
evidence_kind, evidence_url, evidence_note
```

This permits genuine multi-affiliations and distinguishes direct confirmation,
explicit contextual inference, confirmed independent researchers, undisclosed
organizations/parser artifacts, and `needs_more_evidence`.

Coauthor affiliations are supporting context only. They do not identify another
author by themselves. If the primary paper does not contain the claimed author,
keep the record unassigned rather than borrowing the coauthors' institution.

### 7. Produce reviewable outputs

The normalized entity table retains raw affiliation, raw segment, comparison key,
normalization status, canonical organization, optional ROR, parent organization,
country fields, evidence URL, and evidence note. Write small reports for row
counts by status and a separate user-decision queue only for genuine unresolved
factual or policy choices.

### 8. Regenerate and gate the slice

Before publishing a statistic or visualization:

1. Run parser and normalization tests.
2. Regenerate derived tables from local snapshots.
3. Confirm the denominator equals the authoritative in-scope paper count.
4. Check manual aliases have evidence, ROR IDs exist in the pinned release, and
   composite results retain every component.
5. Confirm remaining unassigned rows are intentional and categorized.
6. Record report counts and snapshot-manifest hashes in the slice README or a
   dated run record.

## ECCV 2026 implementation record

The first global slice is `src/venues/eccv26-global/`. It used three source snapshots:
the official accepted-paper denominator, official ECVA virtual-program metadata,
and a pinned ROR release. Its latest local build contains 2,834 in-scope papers,
11,618 affiliation segment candidates, 11,970 normalized entity rows, and 42
author-context repairs. These values are dataset-specific; reports under
`data/eccv26/normalized/` are the source of truth for a particular run.

Key ECCV-specific commands are:

```sh
node src/venues/eccv26-global/scripts/collect_snapshots.mjs
node src/venues/eccv26-global/scripts/parse_ecva_snapshot.mjs
node src/venues/eccv26-global/scripts/build_normalization_inputs.mjs
node src/venues/eccv26-global/scripts/build_ror_name_index.mjs
node src/venues/eccv26-global/scripts/build_exact_matches.mjs
node src/venues/eccv26-global/scripts/build_author_affiliation_contextual_inferences.mjs
node --test src/venues/eccv26-global/scripts/*.test.mjs
```

CVPR/ICCV, SIGGRAPH/SIGGRAPH Asia, ICML/ICLR, and NeurIPS require different
source adapters and inclusion rules because their proceedings platforms,
metadata schemas, and affiliation availability differ. They should nevertheless
converge on the common raw-data contract and normalization/audit rules above.

## Start checklist for the next venue

1. Create the isolated slice and `data/<venue><yy>/` root.
2. Write population, denominator, source URL, and country-metric decisions.
3. Implement only the source adapter necessary to emit common raw tables.
4. Collect one local snapshot set and validate counts before normalizing.
5. Reuse only evidence-backed, source-compatible organization decisions.
6. Run the full gate and save a dated metrics record before building any map or
   publishing country statistics.
