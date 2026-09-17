# Organization Registry

This directory is for versioned, evidence-backed organization knowledge that is
safe to reuse across conference slices: canonical organization names, durable
name variants, and organization-country decisions.

Do not put paper-specific collision decisions here. A label such as
`Northeastern University` can resolve differently by paper context; those
decisions belong under `src/venues/<venue><year>-global/aliases/` with the
relevant source evidence.

The registry starts intentionally empty. Promote a venue decision here only when
the identity is globally reusable, its evidence survives independent review, and
the raw variant can safely mean the same organization outside its original
conference.
