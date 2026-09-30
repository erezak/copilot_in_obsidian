# Ontology slice for obsidian-writer

This skill needs only the writing-relevant slice of the ontology.

## v1 writable entities

- `Session` -> folder `sessions/`
- `Commitment` -> folder `commitments/`
- `DecisionRecord` -> folder `decisions/`
- `Concept` -> folder `concepts/`

## Frontmatter requirements

All notes require:
- `id`
- `fqn`
- `type`
- `name`
- `status`
- `tags`
- `created_at`
- `updated_at`
- `sources`
- `source_refs`
- `confidence`
- `review_after`
- `realization_status`

## Path rules

- Derive paths from entity type, never from arbitrary model output.
- Derive filenames from `name`, not from raw source text.
- Keep `fqn` stable even if the filename changes.

## Wiki-link rule (no island nodes)

Obsidian builds its graph exclusively from `[[filename]]` wiki links in the **body** of a note.
FQN strings in YAML frontmatter are invisible to the graph. Therefore:

- Every note **must** contain a `# Linked notes` or `# Related notes` section at the end of its body.
- That section must list `[[filename]]` links (without folder path, without `.md` extension) to every note it references.
- The **Session** note must link to all Commitments, DecisionRecords, and Concepts extracted from it.
- Every **child** note (Commitment, DecisionRecord, Concept) must link back to its source Session and to any sibling notes it logically relates to (blocked-by, about, related, supersedes, etc.).
- After writing all notes for one ingestion, verify that every note in the batch has at least one inbound and one outbound `[[link]]`. Zero-link (island) nodes are a skill failure.

## Provenance rule

All durable notes written from imported material must include the Session reference in `source_refs`.
