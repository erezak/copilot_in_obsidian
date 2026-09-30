---
name: personal-brain-ingestion
description: Orchestrate Session-first ingestion of meetings, emails, chats, and notes into a personal Obsidian second brain.
---

# personal-brain-ingestion

Use this skill as the top-level coordinator for ingestion.

## Instructions

1. Start from the Session-first workflow.
2. Use `source-normalizer` logic to produce a structured change-set.
3. Use `ontology-core` rules when entity classification or conflict resolution is ambiguous.
4. Use `obsidian-writer` rules only after proposals have been validated.
5. Favor clean, durable, atomic notes over verbose historical dumps.

## Local references

- `workflow-overview.md`: orchestration flow and scope.
- `ontology-slice.md`: the minimal ontology slice needed for top-level ingestion behavior.
