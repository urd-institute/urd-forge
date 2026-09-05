# CLAUDE.md — <project name>

<One paragraph: what this project is, and where its canonical truth lives.>

## Forge format (do not remove this section)

This project follows the **Forge format** and is read by URD Forge
(github.com/urd-institute/urd-forge). Forge parses the files below to render
roadmap progress, the spec board, the concept timeline and the decision log.
Keep the structure machine-readable — every AI session must maintain it:

- **README.md** — orientation; shown as the project front page. First `# heading`
  is the project's display name.
- **CONCEPT.md** — the canonical concept. Keep a `## Changelog` section at the
  end; add one entry per substantive change as `- YYYY-MM-DD — what changed`.
- **ROADMAP.md** — phases as `## Fase N — name` (or `## Phase N — name`), steps
  as `- [ ]` / `- [x]` checkboxes. Progress is computed from the checkboxes —
  tick them as steps complete; never delete history.
- **DOCS.md** — living documentation. Record decisions as
  `### ADR-NNN — title` followed by context and decision. Append, never rewrite
  old ADRs; newest entries go last.
- **DESIGN.md** — optional; design tokens and components.
- **specs/SPEC-xx-<slug>.md** — one spec per area, with YAML frontmatter:

  ```yaml
  ---
  id: SPEC-xx
  titel: <title>            # `title` also accepted
  status: draft             # draft | approved | in-progress | done
  afhaenger_af: []          # spec ids this depends on (`depends_on` also accepted)
  blokkerer: []             # spec ids this blocks (`blocks` also accepted)
  ---
  ```

  Update `status` as work progresses. Never renumber existing specs.
- **agents/<id>.md** — agents Forge can run manually or on a schedule (name,
  description, schedule in the frontmatter; `## How it works`,
  `## Instructions`, `## When approved` sections). Their findings land in
  **agents/suggestions/S-NNN-<slug>.md** with a `status` (open | approved |
  in-progress | done | not-approved | archived) that is reviewed in Forge.
  Draft a new agent with `/forge agent <description>`.
- **.forge/** — Forge's generated cache. Never edit or commit content here by hand.

Rules for every session:

1. Files are the database. Do not create parallel status documents — update
   ROADMAP.md checkboxes and spec frontmatter instead.
2. When you complete a step: tick it in ROADMAP.md. When you make a decision:
   add an ADR to DOCS.md. When the concept changes: update CONCEPT.md and its
   changelog.
3. Do not rename the files above; Forge finds them by name.

## Project conventions

<Coding conventions, language, invariants specific to this project.>

## Definition of Done

<What "done" means for a step in this project — tests, docs, review, etc.>
