---
name: source-normalizer
description: Normalize meetings, emails, chats, and captured notes into a structured Session-first change-set proposal for a personal Obsidian second brain.
---

# source-normalizer

Use this skill when converting raw material such as meeting summaries, email threads, or notes
into structured proposed entities.

## Instructions

1. Start by proposing exactly one `Session`.
2. Extract only the v1 entity types allowed by this skill.
3. Return a structured change-set, not markdown.
4. Include evidence snippets and provenance for every durable node.
5. Use confidence conservatively when the source is noisy or ambiguous.

## Local references

- `ontology-slice.md`: the extraction-relevant ontology slice.
- `extraction-rules.md`: specific extraction, evidence, and review rules.
