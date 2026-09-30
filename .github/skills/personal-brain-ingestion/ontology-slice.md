# Ontology slice for personal-brain-ingestion

## Core shape

The personal ontology is centered on:

**Session -> DecisionRecord / Commitment / Concept / Project**

with:
- `Area` and `Objective` above
- `Identity` around
- `Playbook` and `Asset` as optional extensions

## Operational rules

- Preserve the narrative via `Session`.
- Preserve durable knowledge via atomic notes.
- Never treat the raw source file as the durable knowledge record.
- Confidence and provenance are mandatory.
- Validation lives in code, not only in prompt instructions.

## Threshold posture

Recommended auto-create thresholds:
- Session: 0.70+
- Commitment: 0.85+
- DecisionRecord: 0.90+
- Concept: 0.80+
