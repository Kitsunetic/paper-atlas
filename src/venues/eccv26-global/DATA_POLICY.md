# ECCV 2026 Global Data Policy

## Source boundary

The first collection run is limited to the three HTTPS URLs in `sources.json`:
the official ECVA accepted-paper page, official ECVA virtual-program JSON, and
one pinned ROR v2 data release. The collector makes one sequential request per
missing source, has no automatic retry, and stops immediately on a rejected
request. A normal rerun is offline; `--refresh` is an explicit conditional-GET
operation.

`data/` is intentionally ignored. Each local raw manifest records source URL,
retrieval time, HTTP status, ETag, Last-Modified, byte size, and SHA-256.

## Affiliation and country semantics

Raw ECVA author affiliations are immutable source text. Derived organization
records retain a canonical organization, optional ROR ID, parent organization,
resolution method, confidence, and evidence separately. The normalized entity
table distinguishes two different geographic claims:

- `organization_country_*`: the country assigned to the canonical organization
  itself. For a generic parent-company affiliation this is the representative
  home country of that company; an explicitly national subsidiary or lab keeps
  its own country. ROR-backed institutions use their recorded country unless a
  more specific audited organization-country decision applies.
- `country_*`: the legacy source-level resolved-entity country. It remains
  available for audit and is not overwritten by the broader parent-company
  country. This dataset does not infer a separate author research-site country
  when a raw affiliation does not name one.

Country measures must declare which field they use. The organization-country
measure describes the normalized institution, not author nationality, an
individual employee's office, or a paper's intrinsic nationality. A future
research-site measure may remain blank while the organization country is known.

## Normalization rule

Only exact ROR matches and versioned, manually verified aliases are automatic.
Primary-source-backed parent-company decisions may normalize a globally stated
company identity. A separate versioned organization-country decision assigns the
canonical organization's country only when an official organization, legal, or
press source supports it. Fuzzy matches create review candidates, never
canonical assignments. Every manual decision must retain a primary evidence URL
and be reusable for the same raw affiliation string.

An explicitly verified multi-organization affiliation is represented as 1:N
normalized entities. It is never reduced to the first recognizable institution;
event-specific decompositions remain separate from reusable global aliases.

## Author-scoped recovery of missing or malformed text

`aliases/eccv26_author_context_resolutions.csv` and the derived
`normalized/author_affiliation_contextual_inferences.csv` are a separate,
author-scoped layer for source entries such as `N/A`, `Independent Researcher`,
a department without its university, a country literal, or a parser fragment.
They do not mutate the immutable ECVA raw affiliation, nor do they force a
single organization into the paper-level entity table when one author has
multiple recovered affiliations.

Each affected author-record is covered exactly once. A named organization needs
a cited primary paper/project/author source; `paper_context_inferred` remains
explicitly distinct from direct proof. Actual independent researchers,
undisclosed startups, empty separators, and parser artifacts remain unassigned
by design. Coauthor institutions are evidence only when they establish the
specific author-record; otherwise the row remains `needs_more_evidence`.
