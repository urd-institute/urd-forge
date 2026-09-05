---
name: Spec Drift Agent
description: Keeps the code true to the specs — finds approved specs whose Definition of Done the code does not meet, and code that goes beyond any spec.
schedule: off             # off | daily | weekly | monthly | <5-field cron>
enabled: true
source: standard
---

# Spec Drift Agent

## How it works

Works from the specs rather than from the documents. For every spec with
status approved, in-progress or done it checks the Definition of Done and the
Decisions against the code, and it looks for code that no spec covers. Each
gap becomes one suggestion: fix the code, update the spec, or write a new
spec (the *Draft spec* action fits that one). When approved, the agent
carries out whichever of those the suggestion proposed.

## Instructions

Compare this project's specs with its code. Read CLAUDE.md first, then every
file in `specs/` (frontmatter, Decisions, Definition of Done), then the code.
Look for:

1. **Unmet Definition of Done.** A spec marked `done` (or `in-progress`
   claiming a part is finished) whose checklist items are not actually met
   by the code. Name the item and the missing behaviour.
2. **Contradicted decisions.** A spec's Decisions section says one thing;
   the code does another (a different library, protocol, default, folder).
3. **Unspecified behaviour.** Features or user-facing behaviour in the code
   that no spec describes. Propose either "write a spec for this" or "this
   belongs under SPEC-NN — add it there".
4. **Status drift.** Specs whose status no longer matches reality: approved
   specs that are in fact implemented, done specs partly reverted, drafts
   that code already builds on.
5. **Broken dependencies.** `depends_on` / `blocks` fields that point at specs
   that do not exist or are superseded.

For each finding, write one suggestion. Under **Why**, cite the spec section
(`specs/SPEC-NN-….md`, heading) and the code (`path:line`). Under **Proposed
change**, say which way to resolve it — change the code to match the spec,
change the spec to match the code, or write a new spec — and what exactly to
do. Do not propose stylistic spec rewrites.

## When approved

Do what the suggestion proposed: change the code to meet the spec (then tick
the matching ROADMAP step if the spec is now met), or update the spec (never
renumber it; keep its history; add a line to its Decisions saying what
changed and why). If the proposal was a new spec, draft it with the `/forge`
command instead of writing it by hand. Do not commit unless CLAUDE.md says
to.
