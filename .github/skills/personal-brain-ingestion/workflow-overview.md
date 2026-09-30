# Workflow overview for personal-brain-ingestion

## Goal

Ingest a source note into a personal, Session-first second brain.

## Flow

1. Receive source material.
2. Save raw material to `_inbox/sources/`.
3. Propose exactly one `Session`.
4. Extract durable `Commitment`, `DecisionRecord`, and `Concept` proposals.
5. Assign a `filename` to every proposal; populate cross-reference filename lists so Session links to all children and each child links back to Session and its siblings.
6. Validate schema, confidence, duplicate handling, and conflicts in plugin code.
7. Write accepted markdown notes — every note body must contain `[[filename]]` wiki links (not just FQN strings in frontmatter). Verify zero island nodes.
8. Route uncertain items to `_inbox/review/`.

## v1 scope

Automatic creation allowed:
- `Session`
- `Commitment`
- `DecisionRecord`
- `Concept`

Manual or review-first:
- `Project`
- `Area`
- `Objective`
- `Playbook`
- `Asset`

## Output contract

The agent should return a structured change-set, not direct markdown.
