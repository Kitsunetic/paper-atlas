# Prior top-tier first-author audit

> **Historical multi-source method.** This document does not govern the current
> Google Scholar-only reaudit. For the current outputs and rules, use
> `GOOGLE_SCHOLAR_FIRST_AUTHOR_METHOD.md`; do not combine this document's CV,
> institutional-profile, ORCID, proceedings, or publisher evidence with the
> Scholar-only CSVs.

This audit extends the ECCV 2026 Korean-first-affiliation PoC. It is about
prior publication records of the first-listed author, not nationality. The
source population remains the 277 ECCV 2026 papers in
`eccv_2026_korean_first_author_affiliations_reaudited.csv`.

## Fixed venue scope

The user-defined top-tier scope is CVPR, ICCV, ECCV, NeurIPS, ICLR, ICML,
SIGGRAPH, SIGGRAPH Asia, IROS, ICRA, and IEEE Robotics and Automation Letters
(RA-L). This is a study definition, not a claim that unlisted venues are not
high quality.

Only an eligible main-conference full paper or RA-L journal article is counted.
Workshops, posters, demos, abstracts, challenges, and papers whose venue or
authorship order cannot be verified are excluded.

## Time boundary

The cutoff is `2026-03-05T23:00:00+01:00`, the ECCV 2026 main-paper submission
deadline. A paper is "prior" only if its official proceedings or publication
date is on or before that instant. This prevents the ECCV 2026 paper itself and
later publications from entering the count.

## Identity and authorship rules

The primary statistic is **first-listed authorship**. Explicit equal-contribution
or co-first notes are recorded in a separate field and are not silently merged
into that statistic. A name plus ECVA affiliation is only a candidate identity;
it is not proof that two records belong to the same person.

An identity may be marked `resolved` only when the ECCV author can be linked to
the candidate record through compatible affiliation, topic, collaborator, and
time evidence. Preferred evidence order is: official personal CV, institutional
profile, ORCID, official proceedings, then publisher metadata. OpenAlex,
Semantic Scholar, Google Scholar, and search snippets may generate leads but
cannot alone prove a match or a zero count.

`is_first_eligible_top_tier_first_author` is populated as `no` as soon as one
verified earlier eligible first-listed paper exists. It is populated as `yes`
only after the identity review and prior-work evidence ledger are complete and
contain no such paper. Until then it remains blank with an explicit review
status. `minimum_confirmed_prior_eligible_top_tier_first_author_count` is a
lower bound; the exact-count column stays blank until the review is complete.

## Files

- `eccv_2026_first_author_top_tier_audit.csv`: one row per ECCV paper and its
  eventual first-paper result.
- `eccv_2026_first_author_identity_review_queue.csv`: deduplicated **candidate**
  identity queue. The key is a reproducible name-plus-ECVA-affiliation grouping,
  not an asserted author identifier.
- `eccv_2026_first_author_prior_work_evidence.csv`: one row per verified prior
  eligible paper.
- `eccv_2026_first_author_manual_identity_reviews.csv`: source-backed identity
  resolutions and their completeness state. The builder never converts an
  unresolved candidate into a result.
- `eccv_2026_first_author_openalex_identity_leads.csv`: automated discovery
  candidates only. It is intentionally kept outside the audit builder because
  its matches do not establish identity or publication counts.

Regenerate the empty audit scaffold from this directory with:

```bash
node build_top_tier_first_author_audit.mjs
```
