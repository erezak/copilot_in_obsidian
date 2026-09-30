# Extraction rules for source-normalizer

## Goal

Turn source material into a structured change-set proposal, not markdown.

## Required output shape

Return:
- exactly one Session proposal
- zero or more Commitment proposals
- zero or more DecisionRecord proposals
- zero or more Concept proposals

## Decision rules

### Session
Always produce one.

### Commitment
Create only if:
- an action is concrete
- an owner is explicit or strongly inferable
- the action is not purely conversational fluff

Do not create a Commitment for vague intentions.

### DecisionRecord
Create only if:
- the source shows an actual choice, not a brainstorm
- the selected outcome is explicit
- context and consequences can be summarized faithfully

Do not create a DecisionRecord for open questions.

### Concept
Create only if:
- the extracted knowledge is reusable beyond the source
- it can be stated canonically
- it is likely to matter in future retrieval

Do not create a Concept for one-off chatter.

## Filename requirement (for wiki-linking)

Every proposal in the change-set must include a `filename` field (the note's filename without
path or `.md` extension). The Session proposal must also carry a list of all child filenames
so the writer can emit `[[wiki links]]` in the body. Child proposals must carry the Session
filename so they can link back. Related siblings (e.g., blocked-by commitments, about decisions)
must be referenced by filename, not only by FQN.

This is critical because Obsidian only builds graph edges from `[[filename]]` wiki links in
note bodies — FQN strings in YAML frontmatter are invisible to the graph.

## Evidence requirement

Every proposed Commitment, DecisionRecord, and Concept must include:
- 1 to 3 short evidence snippets copied or closely paraphrased from the source
- no unsupported inference presented as fact

## Review routing hints

Mark for review when:
- ownership is ambiguous
- due date is ambiguous
- decision status is uncertain
- the concept may duplicate an existing concept
