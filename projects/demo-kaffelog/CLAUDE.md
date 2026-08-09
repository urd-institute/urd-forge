# CLAUDE.md — AI development instructions (Kaffelog)

You are working in a URD Forge project. Keep the file structure intact and
up to date at all times.

## The Forge format

- `CONCEPT.md` is the canonical product description. If a decision changes the
  concept, update it and add a line to its `## Changelog`.
- `ROADMAP.md` contains phases (`## Phase N — name`) and steps as checkboxes.
  Mark a step `- [x]` only when its Definition of Done is met. Never delete
  history; add steps instead of rewriting them.
- Each work area has a spec in `specs/SPEC-xx-<slug>.md` with YAML frontmatter:
  `id`, `title`, `status` (draft/approved/in-progress/done), `depends_on`, `blocks`.
  Update `status` as work progresses.
- Record every significant technical decision as an ADR in `DOCS.md`
  (`### ADR-xxx — title`), including alternatives considered.
- Never edit anything under `.forge/` — it is generated.

## Invariants (never break)

1. No feature work without an approved spec.
2. A brew log entry is immutable once saved; corrections create a new entry.
3. All data stays local (no accounts, no server) — see ADR-001.

## Definition of Done

Code implements the spec, the spec status is updated, ROADMAP checkbox is
ticked, and any decision made is logged as an ADR.
