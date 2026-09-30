---
name: obsidian-writer
description: Render validated change-set proposals into deterministic Obsidian markdown notes for the personal brain vault.
---

# obsidian-writer

Use this skill when converting already validated entity proposals into markdown notes.

## Instructions

1. Assume validation is handled by plugin code before writing.
2. Do not invent filesystem paths or arbitrary frontmatter keys.
3. Use the folder mapping and templates in this skill folder.
4. Preserve stable `fqn` values.
5. Include provenance, confidence, and review metadata.

## Local references

- `ontology-slice.md`: writing-relevant ontology slice.
- `note-templates.md`: canonical markdown templates for v1 entities.
