# Bootstrap Issue Memory System

## What This Module Is For
This module defines the always-on issue-memory subsystem that generated repos should carry by default.

## Required Output
Generated or upgraded repos should include:
- `docs/assistant/ISSUE_MEMORY.md`
- `docs/assistant/ISSUE_MEMORY.json`

## Capture Rules
- Record repeatable workflow, tooling, docs-governance, or support failures.
- Prefer operational triggers first and wording triggers second.
- Do not seed fake incidents into new repos.
- Do not use issue memory as a substitute for normal roadmap history.

## Docs-Sync Rule
- Assistant Docs Sync should consult issue memory before widening touched-scope updates.
- If a current change matches a repeatable issue class, refresh issue memory before broadening docs updates.

## Bootstrap Promotion Filter
When maintaining the global bootstrap system, only promote issue-memory entries whose bootstrap relevance is:
- `possible`
- `required`

Prioritize:
- `repeat_count >= 2`
- high workflow cost
- regression after a prior accepted fix

## Reusable Issue Classes
Treat these as valid reusable issue classes that generated repos may record if they actually occur:
- stale post-merge continuity
- stale active-plan inventory
- scratch artifact Source Control noise

The cleanup/continuity family is bootstrap relevance `possible` by default unless a repo proves it is general enough to require global promotion.
