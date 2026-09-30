# Note templates for obsidian-writer

## Session template

```md
---
id: {{id}}
fqn: {{fqn}}
type: Session
name: {{name}}
status: {{status}}
tags: {{tags}}
created_at: {{created_at}}
updated_at: {{updated_at}}
sources: {{sources}}
source_refs: {{source_refs}}
confidence: {{confidence}}
review_after: {{review_after}}
realization_status: ACTIVE
session_type: {{session_type}}
date: {{date}}
participants: {{participants}}
topics: {{topics}}
raw_source_path: {{raw_source_path}}
summary: {{summary}}
extraction_status: {{extraction_status}}
---

# Summary

{{summary}}

# Key moments

# Extracted proposals

# Open questions

# Linked notes

## Commitments
{{#each commitments}}
- [[{{this.filename}}]]
{{/each}}

## Decisions
{{#each decisions}}
- [[{{this.filename}}]]
{{/each}}

## Concepts
{{#each concepts}}
- [[{{this.filename}}]]
{{/each}}
```

## Commitment template

```md
---
id: {{id}}
fqn: {{fqn}}
type: Commitment
name: {{name}}
status: {{status}}
tags: {{tags}}
created_at: {{created_at}}
updated_at: {{updated_at}}
sources: {{sources}}
source_refs: {{source_refs}}
confidence: {{confidence}}
review_after: {{review_after}}
realization_status: ACTIVE
commitment_type: {{commitment_type}}
owner: {{owner}}
due: {{due}}
source_session: {{source_session}}
about: {{about}}
blocked_by: {{blocked_by}}
priority: {{priority}}
---

# Commitment

{{description}}

# Why this exists

{{why}}

# Completion criteria

{{completion_criteria}}

# Notes

# Related notes

- [[{{source_session_filename}}]]
{{#each related_filenames}}
- [[{{this}}]]
{{/each}}
```

## DecisionRecord template

```md
---
id: {{id}}
fqn: {{fqn}}
type: DecisionRecord
name: {{name}}
status: {{status}}
tags: {{tags}}
created_at: {{created_at}}
updated_at: {{updated_at}}
sources: {{sources}}
source_refs: {{source_refs}}
confidence: {{confidence}}
review_after: {{review_after}}
realization_status: ACTIVE
date: {{date}}
source_session: {{source_session}}
about: {{about}}
supersedes: {{supersedes}}
options_considered: {{options_considered}}
---

# Context

{{context}}

# Options considered

{{options_block}}

# Outcome

{{outcome}}

# Consequences

{{consequences}}

# Related notes

- [[{{source_session_filename}}]]
{{#each related_filenames}}
- [[{{this}}]]
{{/each}}
```

## Concept template

```md
---
id: {{id}}
fqn: {{fqn}}
type: Concept
name: {{name}}
status: {{status}}
tags: {{tags}}
created_at: {{created_at}}
updated_at: {{updated_at}}
sources: {{sources}}
source_refs: {{source_refs}}
confidence: {{confidence}}
review_after: {{review_after}}
realization_status: ACTIVE
concept_type: {{concept_type}}
about: {{about}}
related: {{related}}
---

# Canonical statement

{{canonical_statement}}

# Explanation

{{description}}

# Related notes

- [[{{source_session_filename}}]]
{{#each related_filenames}}
- [[{{this}}]]
{{/each}}
```
