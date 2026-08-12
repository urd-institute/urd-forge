# Using URD Forge

URD Forge is the **reader** for spec-driven projects. It watches the files in
your project folders, renders them as progress, boards and logs — and gives
every project a command window for Claude Code. Forge never writes to your
files: **the files are the database**, and you edit them in your editor or
through an AI session.

> New here? Open the **demo-kaffelog** project in the sidebar and click around —
> it is a complete example of everything described below.

## 1. Create a project

The fastest way: click **+ New project** in the sidebar, give the project a
name and describe the idea. Forge scaffolds the document structure and opens
the project's command window, where a Claude Code session automatically drafts
the concept, roadmap and first specs from your description — you review and
refine in the terminal conversation.

You can also create a project by hand: every folder under `projects/` is a
project. Copy the `_template` project to start:

```
projects/
└── my-project/
    ├── README.md      # shown as the project front page
    ├── CLAUDE.md      # instructions for AI sessions (keep the Forge section)
    ├── CONCEPT.md     # the canonical concept + "## Changelog"
    ├── ROADMAP.md     # phases and steps → progress
    ├── DOCS.md        # living docs + decision log
    ├── DESIGN.md      # optional: design tokens
    └── specs/         # one spec per area
```

Forge discovers the folder immediately — no restart, no registration.

## 2. How progress works

Forge computes everything from the files, live:

- **ROADMAP.md** — write phases as `## Fase 1 — Name` (or `## Phase 1 — Name`)
  and steps as checkboxes:

  ```markdown
  ## Fase 1 — Foundation
  - [x] Decide the stack
  - [ ] Build the first screen
  ```

  Ticking a box updates the progress bars everywhere, instantly.

- **specs/*.md** — start each spec with YAML frontmatter. `status` drives the
  spec board; dependencies are shown on the cards:

  ```yaml
  ---
  id: SPEC-01
  titel: Search           # or: title
  status: draft           # draft | approved | in-progress | done
  afhaenger_af: [SPEC-00] # or: depends_on
  blokkerer: []           # or: blocks
  ---
  ```

- **CONCEPT.md** — entries under `## Changelog` become the concept timeline.
  Write them as `- 2026-08-09 — what changed`.

- **DOCS.md** — headings like `### ADR-001 — Title` become the decision log,
  newest shown first. Append new decisions at the bottom; never rewrite old ones.

Parsing is tolerant: a file that deviates is shown as *"could not be parsed"*
instead of breaking anything. Fix the format and it reappears.

## 3. The screens

- **Overview** — README as front page, overall progress, open specs, recent
  file activity and the concept timeline. This is also where you **archive** a
  project (see below).
- **Roadmap** — phases with progress bars; every step links to ROADMAP.md.
- **Specs** — the spec board: columns per status, cards with dependencies.
  Click a card to read the rendered spec. **Import spec** takes a spec written
  elsewhere (e.g. drafted with Claude), assigns the next free SPEC number,
  normalises the frontmatter and files it — optionally handing it straight to
  Claude Code in the terminal to integrate into the roadmap.
- **Decisions** — the ADR log from DOCS.md, newest first.
- **Terminal** — the command window (next section).
- **Search** (sidebar) — free text across every file in every project.
  Results link straight to the file.
- **Settings** (sidebar, the ⚙ gear) — color theme (light / dark / follow
  system) and the terminal font size. Preferences are stored in the browser,
  so each browser keeps its own.

### Archiving a project

Done with a project for now? Click **Archive project** on its Overview screen.
An archived project disappears from the sidebar and the home screen, but its
files in `projects/` are untouched and still show up in search. An **Archive**
link appears at the bottom of the project list whenever something is archived —
open it to see the archived projects and **Restore** any of them.

The archive is remembered per installation (in `forge.state.json` next to
`forge.config.yaml`), not per browser — and it survives updating Forge from the
Updates screen: an archived project stays archived after an update.

## 4. The command window

Each project gets one terminal session, started in the project's folder. Open
**Terminal** and run anything you would run in a shell — most importantly
`claude` to start a Claude Code session that reads the project's CLAUDE.md and
works spec-driven from there.

- The session **keeps running** while Forge runs — leave the view and come
  back, and your scrollback is replayed. All sessions die with the app.
- **Preset buttons** above the terminal are grouped by topic — *Status*
  (project status, outstanding work), *Tasks* (next task, implement a spec),
  *Documents* (new spec, consistency check, log a decision) and *Claude Code*.
  Most of them start a Claude Code session with a ready-made instruction that
  uses the project's own files. They come from `forge.config.yaml` (built-in
  defaults if not configured) and are validated server-side.
- **Stop session** (under the presets) ends the shell and everything running
  in it — click twice to confirm, then use **Start a new session** to get a
  fresh shell. To interrupt just the running program, use Ctrl+C in the
  terminal instead.
- The terminal's **font size** can be changed on the Settings screen (⚙ in
  the sidebar). The new size applies when a terminal view is opened — the
  running session is untouched, and the scrollback is replayed at the new
  size.
- Claude Code requires a global install (`npm install -g
  @anthropic-ai/claude-code`) and an Anthropic subscription or API key.
  Without it the terminal is still a normal shell.

### Dev servers

The home screen shows a **dev servers** panel whenever Forge knows about a
development server: any `http://localhost:…` URL printed in a project's
terminal session is picked up automatically, probed, and listed with its
project and an up/down state — so you can see at a glance what is running and
where. Servers started outside Forge's terminals can be declared in
`forge.config.yaml` (see Configuration) and are probed the same way.

## 5. Working with AI sessions

`CLAUDE.md` is the contract between your project and any AI tool. Keep the
**Forge format** section (see `templates/CLAUDE.md` in the installation) — it
instructs every session to tick roadmap boxes, log ADRs and update spec
statuses instead of inventing parallel documents. A well-kept CLAUDE.md means
a fresh AI session maintains the structure with no manual instructions.

## 6. Configuration

`forge.config.yaml` in the installation root:

```yaml
port: 4400          # UI port (localhost only)
projectsDir: projects
presets:
  default:          # buttons for every project…
    - label: Claude Code
      command: claude
  my-project:       # …or per project slug
    - label: Run tests
      command: npm test
servers:            # dev servers started outside Forge's terminals
  my-project:
    - http://localhost:3000
    - label: API    # optional label
      url: http://localhost:8080
```

Everything has defaults; the file may be empty.

## 7. Troubleshooting

- **"Could not be parsed"** — the file deviates from the format above. The
  most common causes: a spec without frontmatter, or a roadmap without
  checkboxes. Fix the file; Forge re-reads it on save.
- **Terminal shows "unavailable"** — node-pty (a native module) did not
  install. Forge still works fully as an overview. On Windows, install
  Git for Windows; on a bare machine, Visual Studio Build Tools or Xcode
  Command Line Tools may be needed. Then run `npm install` again.
- **A project does not appear** — it must be a folder directly under
  `projects/` containing at least one file. Folders named `.forge`,
  `node_modules` and `.git` are ignored.
- **Nothing updates** — the file watcher follows the `projects/` folder of
  the running installation. Check that you are editing files inside it.

## 8. Updating Forge

**Updates** in the sidebar checks the official repository
(github.com/urd-institute/urd-forge) for new versions. An update only installs
when it applies cleanly: if you have local commits or changed files that the
update would touch, Forge refuses, lists the files and changes nothing. Your
projects in `projects/` are never part of an update. After installing, press
**Restart Forge now** — Forge starts itself again and the page reloads when it
is back. The Updates screen also has a general **Restart or stop Forge** card;
both actions end every terminal session first. Self-restart works when Forge
was started with `npm run forge` (the normal way); started any other way, only
stop is available. Development copies can opt out of updates entirely with
`updates: false` in `forge.config.yaml`.

## 9. Principles worth keeping

1. Files are the database — no status lives anywhere else.
2. Forge reads, you (and your AI sessions) write.
3. One spec per area; statuses tell the story; ADRs remember the decisions.
4. Localhost only — a hosted, shareable edition is a separate future project.
