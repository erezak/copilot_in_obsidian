# Ontology slice for source-normalizer

This skill needs only the extraction-relevant slice of the ontology.

## Allowed output entities in v1

- `Session`
- `Commitment`
- `DecisionRecord`
- `Concept`

## Extraction posture

- Always create exactly one `Session` proposal for each imported source.
- Propose `Commitment` only when there is a concrete action, follow-up, or waiting-on item.
- Propose `DecisionRecord` only when the source clearly indicates that a choice was made
  or explicitly affirmed.
- Propose `Concept` only when the knowledge is reusable outside the original session.

## Confidence hints

- Clean meeting summary:
  - Session: 0.80–0.95
  - Commitment: 0.85–0.95 if owner/action is explicit
  - DecisionRecord: 0.90–0.98 if the decision is explicit
  - Concept: 0.80–0.92 if durable and reusable
- Noisy email thread or loose notes:
  - lower confidence by default

## Provenance rules

Every proposed durable node must include:
- `source_refs`, pointing to the source Session FQN
- at least one evidence snippet
- clear traceability back to the imported source

## FQN rules

- Session: `session::<session_type>::<date>::<slug>`
- Commitment: `commitment::<date>::<slug>`
- DecisionRecord: `decision::<date>::<slug>`
- Concept: `concept::<scope>::<slug>`
