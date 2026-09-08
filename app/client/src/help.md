# Using URD Forge

URD Forge is the **reader** for spec-driven projects. It watches the files in
your project folders, renders them as progress, boards and logs — and gives
every project a command window for Claude Code. Forge never writes to your
files: **the files are the database**, and you edit them in your editor or
through an AI session.

> New here? Open the **demo-coffee-log** project in the sidebar and click around —
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
    ├── specs/         # one spec per area
    └── agents/        # agents (installed by Forge) and their suggestions/
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
  status: draft           # draft | approved | in-progress | done | superseded
  afhaenger_af: [SPEC-00] # or: depends_on
  blokkerer: []           # or: blocks
  topics: [auth, ui]      # optional — filter chips on the spec board
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
  file activity and the concept timeline. This is also where you **pin**,
  **export** or **archive** a project (see below).
- **Roadmap** — phases with progress bars; every step links to ROADMAP.md.
- **Specs** — the spec board: columns per status, cards with dependencies.
  Click a card to read the rendered spec. **Import spec** takes a spec written
  elsewhere (e.g. drafted with Claude), assigns the next free SPEC number,
  normalises the frontmatter and files it — optionally handing it straight to
  Claude Code in the terminal to integrate into the roadmap.

  The **filter field** narrows the board: type one or more words and only
  specs containing *all* of them — in the id, title, topics, dependencies
  or the spec's content — stay visible. Content hits show a short snippet
  with the match highlighted; column headers show *shown/total*. `#word`
  matches topics only. Every `topics` value in the project appears as a
  **chip** under the header — click chips to show specs with any of those
  topics (combined with the words). The filter is part of the URL
  (`…/specs?q=export&topic=auth`), so a reload or a shared link keeps it.
  Press `/` to jump to the field.

  The rightmost column, **Superseded**, is for specs replaced by a newer
  one: set `status: superseded` and keep the file — it is history, and
  it no longer counts as open work.
- **Decisions** — the ADR log from DOCS.md, newest first.
- **Agents** — the project's agents and the suggestions they made (§6).
  The badge on the menu entry counts open suggestions.
- **Terminal** — the command window (next section).
- **Search** (sidebar) — free text across every file in every project.
  Results link straight to the file.
- **Settings** (sidebar, the ⚙ gear) — color theme (dark by default; light,
  or follow the system), the **color scheme** (seven palettes, each with a light and a
  dark variant) and the terminal font size. Preferences are stored in the
  browser, so each browser keeps its own.

### A color scheme per project

Every project's **Overview** has a *Color scheme* card. Pick a palette there
and Forge switches to it whenever you are inside that project — handy for
telling projects apart at a glance. *Default* follows the scheme chosen on
the Settings screen. The choice is stored in this browser, like the other
preferences; it is not written to the project's files.

### Archiving a project

Done with a project for now? Click **Archive project** on its Overview screen.
An archived project disappears from the sidebar and the home screen, but its
files in `projects/` are untouched and still show up in search. An **Archive**
link appears at the bottom of the project list whenever something is archived —
open it to see the archived projects and **Restore** any of them.

The archive is remembered per installation (in `forge.state.json` next to
`forge.config.yaml`), not per browser — and it survives updating Forge from the
Updates screen: an archived project stays archived after an update.

### Pinning a project

The projects you work on most can sit at the top of the list: click **Pin
project** on a project's Overview screen. Pinned projects (marked ★) are
listed first in the sidebar and on the home screen, above a thin divider, in
alphabetical order; the rest follow alphabetically as before. **Unpin** on the
same card puts it back. Like the archive, pins are remembered per
installation in `forge.state.json`, so they survive updates.

### Exporting and importing a project

To move a project to another Forge installation — a fresh copy of Forge on a
new machine, say — click **Export project (.zip)** on its Overview screen. The
download contains the whole project folder: documents, specs, `.claude/`
commands and the git history (`.git/`). `node_modules` and Forge's `.forge/`
cache are left out; run `npm install` again after importing if the project
has one.

On the other installation, open **New project** and use **…or import an
existing project** at the bottom: choose the zip, check the folder name
(pre-filled from the file name) and click **Import project**. Forge unpacks
the zip into a new folder under `projects/` and opens the project. An
existing folder is never overwritten — pick another name instead. Any zip of
a project folder works, not only Forge's own exports; a single top-level
folder inside the zip is stripped automatically.

## 4. The terminal panel

The terminal is a **panel docked at the bottom** of every screen, so Claude
Code can work in it while you read the spec board, the roadmap or the
decision log above. Each tab is a shell started in the project's folder —
run anything you would run in a terminal, most importantly `claude` to start
a Claude Code session that reads the project's CLAUDE.md and works
spec-driven from there.

- **Open and close**: click the *▲ Terminal* bar at the bottom, or press
  **Ctrl+J** (Ctrl+` also works). Closing the panel never stops anything —
  the sessions keep running, and the bar shows their names and a dot when
  new output arrived. The panel opens at **half the window height** by
  default, so the screen behind it stays readable (**Terminal** in the
  project menu opens it the same way). **Drag the top edge** to resize;
  **⤢** maximizes the panel over the whole content area, **⤡** restores it.
  Size and open/closed state are remembered in this browser; a maximized
  panel comes back at its normal height after a reload.
- **Tabs**: a project can have several sessions at once — Claude Code in one
  tab, `npm run dev` in another. **+** opens a new tab with an empty shell
  at once; the **▾** next to it opens a new tab that starts with a preset.
  In the panel, **Alt+N** opens an empty tab and
  **Alt+1…9** switches. Tabs are named after the preset that started them
  (or *Terminal N*); programs that set a window title (Claude Code does)
  rename the tab, and **double-click** gives it a name of your own that
  sticks. Tabs survive a reload and are shared between browser windows.
  **×** on a tab ends its session — click twice to confirm while something
  is running. The limit is 6 tabs per project (`terminal.maxTabs` in
  `forge.config.yaml`).
- **Presets** sit in one row of menus above the terminal, grouped by topic
  — *Status* (project status, outstanding work), *Tasks* (next task,
  implement a spec), *Documents* (new spec, consistency check, log a
  decision) and *Claude Code* (start a session; `/model` and `/forge` for a
  session that is already running). A preset types its command into the
  **active tab**; *+ tab* next to it (or Shift+click) runs it in a **new
  tab** instead. Most presets start a Claude Code session with a ready-made
  instruction that uses the project's own files. They come from
  `forge.config.yaml` (built-in defaults if not configured) and are validated
  server-side.
- Every project gets the **/forge** command automatically (see §5). Only if
  Forge could not create it does a note in the panel offer to **install** it
  by hand — one click creates `.claude/commands/forge.md` in the project;
  nothing else is touched.
- **Stop session** ends the shell in the active tab and everything running
  in it — click twice to confirm. The tab stays, with **Restart in this
  tab** for a fresh shell. To interrupt just the running program, use Ctrl+C
  in the terminal instead. All sessions die with the app.
- **Scrolling back**: each tab keeps 10,000 lines of scrollback, and the
  scrollbar on its right edge is always visible. Scroll with the mouse wheel
  or drag the bar; typing jumps back to the bottom. Programs that take over
  the whole screen (`less`, `vim`) have no scrollback of their own — leave
  them to get it back. Forge keeps the terminal fitted to the panel, so no
  lines are ever cut off below the visible area.
- The terminal's **font size** can be changed on the Settings screen (⚙ in
  the sidebar). The new size applies to tabs opened from then on, and to all
  tabs after a reload — running sessions are untouched, and the scrollback
  is replayed at the new size.
- Claude Code requires a global install (`npm install -g
  @anthropic-ai/claude-code`) and an Anthropic subscription or API key.
  Without it the terminal is still a normal shell. Forge checks for the
  `claude` command when it starts: the startup line in the console shows
  where it was found, and the terminal panel shows a note with the install
  command when it is missing. Install it in a separate window, then **stop
  Forge with Ctrl+C and start it again** — the terminal inherits the PATH
  Forge was started with, and the Restart button in the UI keeps the old one.

### Scrolling, and Claude Code's full-screen view

A plain shell keeps 10,000 lines of scrollback: scroll with the wheel or
the scrollbar, and resizing the panel keeps every line. **Claude Code takes
over the whole terminal** while it runs — like in Windows Terminal or iTerm —
and scrolls its own transcript: the mouse wheel scrolls inside Claude Code,
and the shell output from before it started comes back when it exits. Its
boxes (diffs, permission prompts, the status line) redraw correctly when you
resize or maximize the panel.

On Windows this relies on the modern ConPTY that Forge bundles (via
node-pty). The one built into Windows 10 hides the terminal's capabilities
from Claude Code and repaints the screen on every resize, losing scrollback
lines and garbling Claude Code's boxes — the startup line `terminal: ready
(bundled ConPTY)` confirms the bundled one is in use.

### Dev servers

The home screen shows a **dev servers** panel whenever Forge knows about a
development server: any `http://localhost:…` URL printed in one of a project's
terminal tabs is picked up automatically, probed, and listed with its
project, the tab it runs in (click it to jump there) and an up/down state — so
you can see at a glance what is running and where. Servers started outside Forge's terminals can be declared in
`forge.config.yaml` (see Configuration) and are probed the same way.

## 5. Working with AI sessions

`CLAUDE.md` is the contract between your project and any AI tool. Keep the
**Forge format** section (see `templates/CLAUDE.md` in the installation) — it
instructs every session to tick roadmap boxes, log ADRs and update spec
statuses instead of inventing parallel documents. A well-kept CLAUDE.md means
a fresh AI session maintains the structure with no manual instructions.

### The /forge command

Every project in Forge has a Claude Code slash command,
`.claude/commands/forge.md` (source: `templates/commands/forge.md` in the
installation). Forge creates it in any project that lacks it when it scans
`projects/` — at startup and whenever a project changes — and never
overwrites it. In a running Claude Code session, type

```
/forge <what the spec should cover>
```

and Claude drafts a new spec in `specs/`: it reads the concept, roadmap and
existing specs, takes the next free SPEC number, writes the frontmatter
(`status: draft`, dependencies, topics) and the standard sections, and adds an
unchecked step to `ROADMAP.md`. `/forge` on its own asks a few questions
first. The spec is always a draft — approve it before anything is built from
it.

**Questions always come with suggestions.** Whenever the command asks you
something — while drafting, or in the spec's *Open questions* section — it
attaches 1–3 numbered suggested answers, the recommended one first, so you
can answer with a number.

**Answer the open questions one by one:**

```
/forge q SPEC-03
```

walks through that spec's *Open questions* one at a time (each with its
suggestions), records every answer in the spec's *Decisions* section as you
go, removes the answered question, and at the end offers to set the status
to `approved` if nothing is left open. Say *skip* to leave a question open,
*stop* to finish early.

**Draft an agent:**

```
/forge agent <what it should look for>
/forge agent from SPEC-03
```

writes a new agent file in `agents/` (see §6). With a description, Claude
drafts an agent that looks for that one kind of thing and asks two short
questions first if the description is empty: what to look for, and what to
do when a suggestion is approved. With `from SPEC-XX`, the agent's job is to
guard that spec — it checks the spec's Definition of Done and Decisions
against the code and suggests where they have drifted (the **+ agent**
button on a spec card runs this form for you). The file gets an id ending in
`-agent`, `schedule: off` and `enabled: true`, so nothing runs until you
switch the schedule on or press **Run now** on the Agents screen. An
existing agent file is never overwritten without asking.

The command is an ordinary markdown file you may edit to taste — your edits
are kept. (`_template` is the one folder Forge leaves without it.) If the file
could not be created, the terminal panel shows an **Install /forge** note.

## 6. Agents and suggestions

An **agent** is a small role Claude Code can play on its own initiative: it
reads the project, looks for one kind of thing (security risks, documentation
drift, code that strays from the specs) and comes back with **suggestions**.
Nothing is changed until you approve one. The **Agents** screen in the project
menu has two tabs.

**Agents.** One card per agent file in `agents/`: its description, schedule,
last run, and the controls.

- **Run now** opens a terminal tab and runs the agent headless (`claude -p`):
  it may read the project and run a few read-only commands, but the only
  files it can write are suggestion files — Forge passes Claude Code the
  matching permission rules. **Run interactively** starts a normal Claude
  Code session with the same instructions, for agents that need questions
  answered. Either way the run is a tab in the panel: watch it, or stop it
  like any session.
- **Schedule**: daily (09:00), weekly (Monday 09:00), monthly (the 1st) or a
  5-field cron expression. Forge runs due agents itself, in a tab named
  *"<agent> (scheduled)"*, while it is running; an agent that missed its
  time while Forge was off runs once at the next start. Standard agents are
  installed **unscheduled** — nothing runs until you switch it on. **enabled**
  off pauses an agent without losing its schedule.
- **Open** shows the agent's three sections as written in its file — *How it
  works*, *Instructions* (the prompt it gets), *When approved* (what it does
  with an approved suggestion) — and its run history (`.forge/agents/`).
- **Add an agent**: describe what it should look for and Claude Code drafts
  the file with `/forge agent <description>`; or pick a spec and get an agent
  that guards that spec (`/forge agent from SPEC-NN` — also available as
  **+ agent** on a spec card). Agent files are ordinary markdown you can edit.

**Standard agents** come with Forge (`templates/agents/`) and are installed
into every project that lacks them — never overwritten, so your edits stay,
and `agents.disabled` in `forge.config.yaml` keeps one from coming back if
you delete it: the **Security Agent** (secrets, unsafe defaults, injection
paths, vulnerable dependencies), the **Docs Agent** (prose that no longer
matches the code) and the **Spec Drift Agent** (code that no longer matches
the specs).

**Suggestions.** Each suggestion is a file in `agents/suggestions/`
(`S-NNN-<slug>.md`) with a *What*, a *Why* with evidence, and a *Proposed
change*. The tab lists them by status — *Open* by default — and each has
actions:

- **Approve** marks it approved and opens a terminal tab where the agent that
  made it carries it out (an interactive Claude Code session, so its edits go
  through the usual permission prompts; an agent can opt into unattended
  approval runs with `approvalMode: headless`). The agent sets the status to
  *in-progress* and then *done*, and appends a *Result* section to the file.
- **Draft spec** opens a tab with `/forge` and the suggestion as its brief —
  for suggestions too big to just do. The resulting spec is linked from the
  suggestion (`spec:` in its frontmatter).
- **Not approved** is a decision the agent remembers: it will not propose the
  same thing again. **Archive** just tidies a suggestion away. **Reopen**
  brings any of them back.

The home screen shows an open-suggestion count on each project card. A
suggestion run writes at most five suggestions (`agents.maxSuggestionsPerRun`).

## 7. Configuration

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
agents:
  maxSuggestionsPerRun: 5   # per agent run
  disabled: [docs-agent]    # standard agents never (re)installed — or per slug:
  # disabled:
  #   my-project: [security-agent]
```

Everything has defaults; the file may be empty.

## 8. Troubleshooting

- **"Could not be parsed"** — the file deviates from the format above. The
  most common causes: a spec without frontmatter, or a roadmap without
  checkboxes. Fix the file; Forge re-reads it on save.
- **Output disappears from the terminal after resizing, or Claude Code's
  boxes look torn** (Windows) — the startup line says `terminal: ready`
  without `(bundled ConPTY)`: the `node-pty` package did not install and
  Forge fell back to the ConPTY built into Windows. Run `npm install` again
  and check for errors. `FORGE_CONPTY=inbox` in the environment forces the
  built-in one, for comparison.
- **Terminal shows "unavailable"** — node-pty (a native module) did not
  install. Forge still works fully as an overview. On Windows, install
  Git for Windows; on a bare machine, Visual Studio Build Tools or Xcode
  Command Line Tools may be needed. Then run `npm install` again.
- **A project does not appear** — it must be a folder directly under
  `projects/` containing at least one file. Folders named `.forge`,
  `node_modules` and `.git` are ignored.
- **Nothing updates** — the file watcher follows the `projects/` folder of
  the running installation. Check that you are editing files inside it.
- **"Forge only answers its own page on localhost"** — Forge refuses
  requests whose `Host` or `Origin` is not this machine, so that no other
  web page (or a hostname pointing at 127.0.0.1) can talk to it. Open it as
  `http://localhost:<port>` or `http://127.0.0.1:<port>`, not through another
  hostname or a proxy.

## 9. Updating Forge

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

## 10. Principles worth keeping

1. Files are the database — no status lives anywhere else.
2. Forge reads, you (and your AI sessions) write.
3. One spec per area; statuses tell the story; ADRs remember the decisions.
4. Localhost only — a hosted, shareable edition is a separate future project.
