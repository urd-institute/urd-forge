---
description: Draft a new spec (/forge spec <description>) or walk through a spec's open questions (/forge q SPEC-XX)
argument-hint: spec <what the spec should cover> | q <SPEC-XX>
---

You are working in a URD Forge project that follows the Forge format
described in CLAUDE.md — keep it intact. This command has two modes, chosen
by the first word of the arguments: `spec` drafts a new spec, `q` walks
through an existing spec's open questions.

Arguments: $ARGUMENTS

## Rule for every question you ask

Whenever you put a question to me — while drafting a spec, in the "Open
questions" section of a spec, or in question mode below — always attach
**1-3 concrete suggestions** for the answer, numbered, with the one you
recommend first and a few words on why. I should be able to answer with a
number. Never ask an open question without suggestions.

## Mode 1 — `/forge q <SPEC-XX>`: walk through a spec's open questions

If the arguments start with `q` (or `question`/`questions`) followed by a
spec id (e.g. `q SPEC-03`; the number alone, `q 3`, is also fine):

1. Open that spec in `specs/`. If it does not exist, list the specs that do
   and stop. Read its **Open questions** section (and any questions you find
   elsewhere in the spec, such as "TBD" or "?"-marked items).
2. Ask the questions **one at a time**, in order: state the question, give
   your 1-3 numbered suggestions, and wait for my answer before moving on. If
   I answer "skip", leave that question open and continue; if I answer
   "stop", finish early.
3. After each answer, update the spec: record the decision in the
   **Decisions** section (what was chosen and why, in one or two lines) and
   remove the question from **Open questions** (or reword it if only part
   was answered). Save after every answer, so nothing is lost if we stop.
4. When all questions are handled, tell me how many were decided and how many
   remain, and — if none remain and the status is `draft` — ask whether to
   set `status: approved` (suggestion: yes, if the Definition of Done is also
   complete). Do not change the status without my answer.
5. If a decision is significant for the project as a whole, offer to log it
   as the next ADR in `DOCS.md`; do not do it unasked.

## Mode 2 — `/forge spec <description>`: draft a new spec

If the arguments start with `spec`, create a new spec from the rest of the
arguments. If the description is empty, ask me 2-3 short questions first (the
area, the goal, and any known dependencies on existing specs — each with
suggestions), then continue.

1. Read `CONCEPT.md`, `ROADMAP.md` and the YAML frontmatter of every file in
   `specs/` so the new spec fits the project and its existing specs.
2. Pick the next free spec number: the highest `SPEC-NN` found in `specs/`
   (filenames and `id` fields) plus one, zero-padded to two digits. Never
   reuse or renumber an existing spec.
3. Write `specs/SPEC-NN-<slug>.md` (slug: 2-4 lowercase words from the
   title, hyphenated) with this structure:

   ```markdown
   ---
   id: SPEC-NN
   title: <short title>
   status: draft
   depends_on: [<ids of existing specs this builds on, or empty>]
   blocks: []
   topics: [<1-4 short lowercase words, used as filter chips in Forge>]
   ---

   # SPEC-NN — <title>

   ## Purpose
   What this area must achieve, in 2-4 sentences.

   ## Decisions
   The hard choices made explicit: what was considered, what was chosen, why.
   Write "None yet." if the description does not settle any.

   ## Open questions
   What must be answered before or during implementation. Each question is
   followed by 1-3 numbered suggestions (recommended first):
   - Q1: <question>
     1. <recommended answer — why>
     2. <alternative>

   ## Definition of Done
   The checkable list that allows the ROADMAP box to be ticked.
   ```

   Write the spec in the same language as the description. Status is always
   `draft` — nothing is built from a draft until it is approved.
4. Add one unchecked step to `ROADMAP.md` that mentions the spec id, under
   the phase it belongs to (or the last phase that still has open steps).
   Never delete, reorder or rewrite existing steps.
5. Do not touch `.forge/`, do not change the status of other specs, and do
   not log an ADR — nothing has been decided yet.
6. Reply briefly: the file path, the id, the dependencies and topics you
   chose, and the open questions with their suggestions — and remind me that
   the spec is a draft, and that `/forge q SPEC-NN` walks through the
   questions one by one.

## Anything else: show the two forms

If the arguments are empty or start with any other word, do not guess. Reply
with the two forms — `/forge spec <what the spec should cover>` and
`/forge q <SPEC-XX>` — and ask which I meant, with suggestions: (1) draft a
spec from the text I typed, (2) answer a spec's open questions. Continue in
that mode once I answer.
