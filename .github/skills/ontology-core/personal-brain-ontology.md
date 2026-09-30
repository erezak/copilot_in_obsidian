# Personal Brain Ontology

This ontology adapts the uploaded **Context Service** pilot ontology into a personal,
Session-first second-brain model for Obsidian.

## Design principles

1. **Knowledge-level, not file-level**. Raw source material is input, not durable knowledge.
2. **Session first**. Imported material first becomes a `Session`.
3. **Atomic durable notes**. Extract durable `DecisionRecord`, `Commitment`, `Concept`,
   and optionally `Project`, `Objective`, `Playbook`, and `Asset`.
4. **Common Node Schema (CNS)** across all entity types.
5. **Confidence and provenance** on every node.
6. **Projection at query time**. Dashboards and views are assembled from atoms.

---

## Common Node Schema (CNS)

Every node shares these fields:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Stable unique identifier |
| `fqn` | string | Canonical identity |
| `type` | string | Entity type label |
| `name` | string | Human-readable display name |
| `status` | string | Node-specific lifecycle state |
| `tags` | string[] | Freeform tags |
| `aliases` | string[] | Optional aliases |
| `created_at` | ISO 8601 | First creation time |
| `updated_at` | ISO 8601 | Last update time |
| `sources` | string[] | Source systems or source kinds |
| `source_urls` | string[] | External source URIs |
| `source_refs` | string[] | Internal source note references |
| `confidence` | float | Confidence score |
| `review_after` | ISO 8601 date | Suggested review date |
| `realization_status` | enum | `ACTIVE`, `DEPRECATED`, `SUPERSEDED`, `ARCHIVED` |

---

## FQN convention

Use:

```text
<type>::<scope>::<slug>
```

or, for time-bound entities:

```text
<type>::<date>::<slug>
```

Examples:

```text
session::meeting::2026-04-18::vault-agent-brainstorm
decision::2026-04-18::use-obsidian-api-for-writes
commitment::2026-04-18::review-ontology-schema
concept::vault::meeting-ingestion-pipeline
project::work::context-service-agent
area::work::ai-strategy
objective::2026::improve-second-brain-ingestion
identity::person::sapir
playbook::vault::meeting-ingestion-v1
asset::repo::draglass
```

---

## Entity types

### Session

A meaningful interaction or capture event: meeting, email thread, call, chat, or note capture.

Fields:
- `session_type`: `MEETING`, `EMAIL_THREAD`, `CALL`, `CHAT`, `NOTE_CAPTURE`
- `date`
- `participants[]`
- `topics[]`
- `raw_source_path`
- `summary`
- `extraction_status`

### Commitment

A durable action, follow-up, or waiting-on item created from a session or manual capture.

Fields:
- `commitment_type`: `TASK`, `FOLLOWUP`, `WAITING_ON`, `REMINDER`
- `owner`
- `due`
- `source_session`
- `about[]`
- `blocked_by[]`
- `priority`
- `status`: `OPEN`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELED`

### DecisionRecord

A point-in-time decision with context, options, outcome, and consequences.

Fields:
- `date`
- `source_session`
- `about[]`
- `supersedes`
- `options_considered[]`
- `status`: `PROPOSED`, `ACCEPTED`, `REJECTED`, `SUPERSEDED`

### Concept

A reusable knowledge atom.

Fields:
- `concept_type`: `PATTERN`, `PRINCIPLE`, `BUSINESS_TERM`, `TECHNOLOGY`, `WORKFLOW`,
  `CONSTRAINT`, `REQUIREMENT`, `INSIGHT`
- `about[]`
- `related[]`
- durable body fields like canonical statement and explanation

### Project

A time-bounded effort with a defined outcome.

Fields:
- `description`
- `status`: `PROPOSED`, `ACTIVE`, `PAUSED`, `DONE`, `DROPPED`
- `start_date`
- `target_date`
- `owner`
- `area`
- `objectives[]`
- `success_criteria[]`

### Area

An ongoing responsibility without a natural finish line.

Fields:
- `horizon`: `PERSONAL`, `FAMILY`, `WORK`, `HEALTH`, `LEARNING`, `FINANCE`
- `owner`
- `review_cadence`
- `standards[]`

### Objective

A goal or target.

Fields:
- `objective_level`: `STRATEGIC`, `TACTICAL`, `OPERATIONAL`
- `owner`
- `target_metric`
- `target_value`
- `deadline`
- `parent`

### Identity

A person, team, organization, or service relevant to the vault.

Fields:
- `kind`: `HUMAN`, `TEAM`, `ORG`, `SERVICE`
- `display_name`
- `email`
- `relationship`

### Playbook

A reusable operating pattern, checklist, or workflow.

Fields:
- `playbook_type`: `WORKFLOW`, `CHECKLIST`, `RUNBOOK`, `TEMPLATE`, `SKILL`
- `version`
- `domain[]`
- `status`
- `steps`

### Asset

A durable thing like a repository, app, device, vault, or service.

Fields:
- `asset_type`: `REPOSITORY`, `APP`, `DEVICE`, `VAULT`, `SERVICE`, `DOCUMENT_SET`
- `url`
- `owner`
- `description`

---

## Core relationships

| Edge | From → To | Meaning |
|---|---|---|
| `BELONGS_TO` | Project → Area | project lives in area |
| `SUPPORTS` | Project / Concept / Playbook / Commitment → Objective | contributes to objective |
| `INVOLVES` | Session → Identity | participant |
| `DISCUSSES` | Session → Concept / Project | topic discussed |
| `DECIDES` | Session → DecisionRecord | session produced decision |
| `CREATES` | Session → Commitment | session created commitment |
| `ABOUT` | Commitment / DecisionRecord / Concept → Project / Area | main context |
| `USES` | Playbook → Concept / Asset | uses knowledge/tool |
| `SUPERSEDES` | DecisionRecord / Playbook → same type | replacement |
| `DERIVED_FROM` | Concept / DecisionRecord / Commitment → Session | provenance |
| `RELATES_TO` | Concept ↔ Concept | semantic relation |
| `BLOCKED_BY` | Commitment → Commitment / DecisionRecord | dependency |

---

## Recommended folder layout

```text
_inbox/
  sources/
  proposals/
  review/

sessions/
projects/
areas/
objectives/
concepts/
decisions/
commitments/
identities/
playbooks/
assets/

_templates/
_system/
```

---

## Confidence rules

| Source | Confidence |
|---|---:|
| Explicitly curated by user | 1.0 |
| Explicit decision or commitment authored by user | 0.95 |
| AI extraction from clean meeting summary | 0.80 |
| AI extraction from noisy email thread | 0.75 |
| AI inference across notes | 0.60 |
| Weak transcript / vague recall | 0.40 |

Curated knowledge beats inferred knowledge. If two nodes share the same `fqn`, higher confidence wins.
If confidence is equal, the newer curated update wins.

---

## Suggested freshness / review cadence

| Type | Suggested review |
|---|---|
| Session | 30 days, then archival |
| Commitment | Until closed |
| DecisionRecord | Infinite |
| Concept | 180 days |
| Project | 7–14 days |
| Objective | 30–90 days |
| Playbook | 30 days |
| Area | 90 days |
| Asset | 180 days |

---

## Ingestion gates

### Creation gate
Create a node only when:
- `fqn` does not already exist, and
- confidence is above the threshold for that node type.

### Update gate
Update only when:
- incoming confidence is greater than or equal to existing confidence, or
- the existing note is stale, or
- the user explicitly curated the update.

### Review gate
Send to review when:
- confidence is below threshold
- duplicate resolution is ambiguous
- a field conflicts with existing durable knowledge
- the model proposes a new Project, Objective, or Area from weak evidence

---

## Recommended v1 slice

First workflow to implement:

**Meeting summary -> Session + Commitment + DecisionRecord + Concept**

Delay automatic creation of:
- Objective
- Area
- Playbook
- Asset
- Project, unless evidence is very strong
