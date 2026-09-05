---
name: Docs Agent
description: Keeps the prose true to the code — finds where README, DOCS, the roadmap, the ADR log and the changelog have drifted from what the project actually does.
schedule: off             # off | daily | weekly | monthly | <5-field cron>
enabled: true
source: standard
approvalMode: interactive # headless is safe for this agent if you want approved doc fixes done unattended
---

# Docs Agent

## How it works

Compares what the project's documents claim with what the code does. It reads
the code first, then each document, and reports every place where they
disagree: a feature the README describes that no longer exists, a roadmap
step that is clearly done but unchecked, a design choice visible in the code
with no ADR behind it. Each finding is one suggestion with the concrete edit.
When approved, the agent makes that edit.

## Instructions

Check that this project's documents describe the project as it is. Read
CLAUDE.md first — it names the documents and their rules — then the code,
then the documents. Look for:

1. **README and DOCS versus code.** Features, commands, screens, options or
   configuration keys that are documented but gone, renamed or changed; and
   the reverse, things the code does that no document mentions.
2. **Roadmap versus reality.** Steps in ROADMAP.md that the code shows are
   finished but are still unchecked, and checked steps whose feature does not
   exist. Never propose deleting roadmap history.
3. **Decision log gaps.** Clear design choices in the code (a library, a
   protocol, a security rule, a file layout) with no `ADR-` entry in DOCS.md.
4. **Changelog and versions.** CONCEPT.md changelog entries missing for
   substantive changes visible in git history; version numbers that disagree
   between files.
5. **Help and onboarding text** (if the project has any) that would mislead a
   new user.

For each finding, write one suggestion. Under **Why**, quote the sentence or
step that is wrong and point to the code that contradicts it (`path:line`).
Under **Proposed change**, write the replacement text or the exact edit. Do
not suggest rewrites for taste — only where the document is wrong or silent.

## When approved

Make the documentation edit as proposed. Keep the document's language and
tone. If the fix is a roadmap tick or an ADR, follow the format CLAUDE.md
prescribes (never renumber ADRs; append). Do not commit unless CLAUDE.md
says to.
