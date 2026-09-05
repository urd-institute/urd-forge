# CLAUDE.md — AI development instructions

You are working in a URD Forge project. Keep the file structure intact and up to
date at all times.

## The Forge format

- `CONCEPT.md` is the canonical product description. If a decision changes the
  concept, update it and add a line to its `## Changelog`.
- `ROADMAP.md` contains phases (`## Phase N — name`) and steps as checkboxes.
  Mark a step `- [x]` only when its Definition of Done is met. Never delete
  history; add steps instead of rewriting them.
- Each work area has a spec in `specs/SPEC-xx-<slug>.md` with YAML frontmatter:
  `id`, `title`, `status` (draft/approved/in-progress/done/superseded), `depends_on`,
  `blocks` and optionally `topics` (short filter words). Update `status` as
  work progresses. No feature work without an approved spec. The `/forge
  <description>` command (`.claude/commands/forge.md`) drafts a new spec;
  `/forge q SPEC-xx` walks through a spec's open questions one by one.
- Agents live in `agents/<id>.md` (frontmatter `name`, `description`,
  `schedule`, `enabled`; sections `## How it works`, `## Instructions`,
  `## When approved`). Forge runs them and they write findings to
  `agents/suggestions/S-NNN-<slug>.md` with a `status` (open / approved /
  in-progress / done / not-approved / archived). `/forge agent <description>`
  drafts a new agent; `/forge agent from SPEC-xx` drafts one that guards a spec.
- Every question you put to the user — in a spec's "Open questions" or in
  conversation — comes with 1-3 numbered suggested answers, the recommended
  one first, so the user can answer with a number.
- Record every significant technical decision as an ADR in `DOCS.md`
  (`### ADR-xxx — title`), including alternatives considered.
- Never edit anything under `.forge/` — it is generated.

## Invariants (never break)

<!-- FORGE TEMPLATE: List the 3-7 rules that must never be broken in this
project. Business rules, not style preferences. Example:
1. User data never leaves the device.
-->

1. …

## Definition of Done

Code implements the spec, the spec status is updated, the ROADMAP checkbox is
ticked, and any decision made is logged as an ADR.
