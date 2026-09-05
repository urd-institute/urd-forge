/*
 * Agents (SPEC-04): file-defined roles a project can run manually or on a
 * schedule. An agent is `agents/<id>.md`; what it produces are suggestions,
 * `agents/suggestions/S-NNN-<slug>.md`. Every run is a Claude Code session in
 * a terminal tab — Forge writes the prompt to `.forge/agents/runs/` and types
 * one short command into the pty. The command is always built here from the
 * files on disk; the browser only names an agent or a suggestion id, so the
 * "no command execution over HTTP" rule (SPEC-00 §6) stays intact.
 *
 * Derived state (run history) lives in `.forge/agents/`; the agent and
 * suggestion files are the project's own, tracked like specs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter, firstParagraph } from '@urd/reader-core';
import { spawnSession, writeCommand, onSessionExit, terminalAvailable } from './terminal.js';

export const SUGGESTION_STATUSES = ['open', 'approved', 'in-progress', 'done', 'not-approved', 'archived'];
const NAMED_SCHEDULES = ['off', 'daily', 'weekly', 'monthly'];
const RUN_HISTORY = 20;
const SCHEDULE_HOUR = 9; // local time for daily/weekly/monthly
const ID_RE = /^[a-z0-9][a-z0-9-]{0,49}$/;
const SUGGESTION_ID_RE = /^S-\d{1,5}$/;
const FILE_RE = /^[A-Za-z0-9._-]+\.md$/;
// One permission rule for Claude Code's --allowedTools: `Tool` or `Tool(pattern)`.
const RULE_RE = /^[A-Za-z]+(\([^()"\r\n]{1,200}\))?$/;
// What a suggestion run may do: read the project, run a few read-only
// commands, and write only under agents/suggestions/ (Decisions Q3).
const SUGGEST_RULES = [
  'Read',
  'Glob',
  'Grep',
  'LS',
  // Edit rules cover every file-editing tool (Write included).
  'Edit(agents/suggestions/**)',
  'Bash(git log:*)',
  'Bash(git status:*)',
  'Bash(git diff:*)',
  'Bash(npm audit:*)',
  'Bash(npm outdated:*)',
];

export class AgentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** `## Heading` sections of a markdown body → { heading(lower) → text }. */
function sections(body) {
  const out = {};
  const lines = body.split(/\r?\n/);
  let key = null;
  let buf = [];
  const flush = () => {
    if (key != null) out[key] = buf.join('\n').trim();
  };
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      flush();
      key = m[1].toLowerCase();
      buf = [];
    } else if (key != null) {
      buf.push(line);
    }
  }
  flush();
  return out;
}

function pick(secs, ...names) {
  for (const n of names) if (secs[n] != null && secs[n] !== '') return secs[n];
  return null;
}

// ── Parsing ────────────────────────────────────────────────────────────────

export function parseAgent(text, filename, stat) {
  const agent = {
    file: filename,
    id: filename.replace(/\.md$/i, ''),
    name: null,
    description: null,
    schedule: 'off',
    enabled: true,
    source: 'project',
    approvalMode: 'interactive',
    permissions: [],
    how: null,
    instructions: null,
    whenApproved: null,
    mtime: stat ? stat.mtimeMs : null,
    parseError: null,
  };
  const fm = splitFrontmatter(text);
  if (!fm.found) agent.parseError = 'No YAML frontmatter found.';
  else if (fm.error) agent.parseError = 'Frontmatter could not be parsed: ' + fm.error;
  const meta = fm.found && !fm.error ? fm.meta : {};
  if (meta.name != null) agent.name = String(meta.name);
  if (meta.description != null) agent.description = String(meta.description);
  if (meta.schedule != null) agent.schedule = String(meta.schedule).trim() || 'off';
  if (meta.enabled != null) agent.enabled = meta.enabled !== false && String(meta.enabled).toLowerCase() !== 'false';
  if (meta.source != null) agent.source = String(meta.source);
  if (meta.approvalMode === 'headless' || meta.approval_mode === 'headless') agent.approvalMode = 'headless';
  const perms = meta.permissions ?? meta.tools;
  if (Array.isArray(perms)) agent.permissions = perms.map((r) => String(r).trim()).filter((r) => RULE_RE.test(r));
  if (!ID_RE.test(agent.id)) agent.parseError = agent.parseError || 'File name must be lowercase letters, digits and hyphens.';
  if (agent.schedule !== 'off' && !validSchedule(agent.schedule)) {
    agent.parseError = agent.parseError || `Unknown schedule "${agent.schedule}" (use off, daily, weekly, monthly or a cron expression).`;
    agent.schedule = 'off';
  }
  const secs = sections(fm.body);
  agent.how = pick(secs, 'how it works', 'how');
  agent.instructions = pick(secs, 'instructions', 'prompt');
  agent.whenApproved = pick(secs, 'when approved', 'on approval');
  if (!agent.name) {
    const h1 = fm.body.match(/^#\s+(?!#)(.+?)\s*$/m);
    agent.name = h1 ? h1[1] : agent.id;
  }
  if (!agent.description && agent.how) agent.description = firstParagraph(agent.how);
  return agent;
}

export function parseSuggestion(text, filename, stat) {
  const s = {
    file: filename,
    id: null,
    agent: null,
    title: null,
    status: 'open',
    created: null,
    decided: null,
    spec: null,
    excerpt: null,
    body: null,
    mtime: stat ? stat.mtimeMs : null,
    parseError: null,
  };
  const fm = splitFrontmatter(text);
  if (!fm.found) s.parseError = 'No YAML frontmatter found.';
  else if (fm.error) s.parseError = 'Frontmatter could not be parsed: ' + fm.error;
  const meta = fm.found && !fm.error ? fm.meta : {};
  if (meta.id != null) s.id = String(meta.id).toUpperCase();
  if (meta.agent != null) s.agent = String(meta.agent);
  if (meta.title != null) s.title = String(meta.title);
  if (meta.status != null) s.status = String(meta.status).toLowerCase().trim();
  if (meta.created != null) s.created = String(meta.created instanceof Date ? meta.created.toISOString().slice(0, 10) : meta.created);
  if (meta.decided != null && meta.decided !== '') s.decided = String(meta.decided instanceof Date ? meta.decided.toISOString().slice(0, 10) : meta.decided);
  if (meta.spec != null && meta.spec !== '') s.spec = String(meta.spec).toUpperCase();
  if (!s.id) {
    const m = filename.match(/^(S-\d+)/i);
    if (m) s.id = m[1].toUpperCase();
  }
  if (!s.title) {
    const h1 = fm.body.match(/^#\s+(?!#)(.+?)\s*$/m);
    s.title = h1 ? h1[1] : filename;
  }
  if (!SUGGESTION_STATUSES.includes(s.status)) {
    s.parseError = s.parseError || `Unknown status "${s.status}".`;
    s.status = 'open';
  }
  s.body = fm.body.trim();
  s.excerpt = firstParagraph(fm.body.replace(/^#.*$/gm, ''));
  return s;
}

export function readAgents(projectDir) {
  const dir = path.join(projectDir, 'agents');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md'));
  } catch {
    return [];
  }
  const out = [];
  for (const file of files.sort()) {
    const full = path.join(dir, file);
    const text = readIfExists(full);
    if (text == null) continue;
    let stat = null;
    try {
      stat = fs.statSync(full);
    } catch {
      /* vanished */
    }
    try {
      out.push(parseAgent(text, file, stat));
    } catch (err) {
      out.push({ file, id: file.replace(/\.md$/i, ''), name: file, schedule: 'off', enabled: false, permissions: [], parseError: 'Could not be parsed: ' + err.message });
    }
  }
  // Enabled first, then by name (SPEC-04 §A.1).
  return out.sort((a, b) => Number(b.enabled) - Number(a.enabled) || String(a.name).localeCompare(String(b.name)));
}

export function readSuggestions(projectDir) {
  const dir = path.join(projectDir, 'agents', 'suggestions');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md'));
  } catch {
    return [];
  }
  const out = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const text = readIfExists(full);
    if (text == null) continue;
    let stat = null;
    try {
      stat = fs.statSync(full);
    } catch {
      /* vanished */
    }
    try {
      out.push(parseSuggestion(text, file, stat));
    } catch (err) {
      out.push({ file, id: null, title: file, status: 'open', parseError: 'Could not be parsed: ' + err.message });
    }
  }
  // Newest first: by id number, then mtime.
  const num = (s) => (s.id && s.id.match(/\d+/) ? Number(s.id.match(/\d+/)[0]) : 0);
  return out.sort((a, b) => num(b) - num(a) || (b.mtime || 0) - (a.mtime || 0));
}

function nextSuggestionId(suggestions) {
  let max = 0;
  for (const s of suggestions) {
    const m = s.id && s.id.match(/^S-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return 'S-' + String(max + 1).padStart(3, '0');
}

// ── Standard agents (templates/agents → <project>/agents) ─────────────────

/** Ids disabled for a project by `agents.disabled` in forge.config.yaml:
 *  a flat list applies everywhere, an object maps slug (or `default`) → list. */
function disabledFor(config, slug) {
  const d = config.agents && config.agents.disabled;
  if (Array.isArray(d)) return new Set(d.map(String));
  if (d && typeof d === 'object') {
    const list = Array.isArray(d[slug]) ? d[slug] : Array.isArray(d.default) ? d.default : [];
    return new Set(list.map(String));
  }
  return new Set();
}

/**
 * Copy every standard agent the project lacks (never overwrite; ADR-021
 * mechanism). Returns the ids installed. `_template` is left alone so the
 * shipped template folder holds only what is tracked.
 */
export function ensureStandardAgents(config, slug) {
  if (slug === '_template') return [];
  const srcDir = path.join(config.rootDir, 'templates', 'agents');
  let files = [];
  try {
    files = fs.readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.md'));
  } catch {
    return [];
  }
  const projectDir = path.join(config.projectsDir, slug);
  if (!fs.existsSync(projectDir)) return [];
  const disabled = disabledFor(config, slug);
  const destDir = path.join(projectDir, 'agents');
  const installed = [];
  for (const file of files) {
    const id = file.replace(/\.md$/i, '');
    if (disabled.has(id)) continue;
    const dest = path.join(destDir, file);
    if (fs.existsSync(dest)) continue;
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(dest, fs.readFileSync(path.join(srcDir, file), 'utf8'));
    installed.push(id);
  }
  return installed;
}

// ── Frontmatter edits (the only writes Forge does to these files) ─────────

/**
 * Set scalar keys inside the frontmatter block, line by line, so comments
 * and the body are kept as they are. Missing keys are appended to the block.
 */
export function patchFrontmatter(file, fields) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^(﻿?---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/);
  if (!m) throw new AgentError(409, 'The file has no YAML frontmatter to update.');
  const nl = m[1].includes('\r\n') ? '\r\n' : '\n';
  const lines = m[2].split(/\r?\n/);
  const pending = { ...fields };
  const out = lines.map((line) => {
    const km = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):/);
    if (!km || !(km[1] in pending)) return line;
    const value = pending[km[1]];
    delete pending[km[1]];
    // Keep a trailing comment if the line had one.
    const cm = line.match(/\s+(#.*)$/);
    return km[1] + ':' + formatYaml(value) + (cm ? '  ' + cm[1] : '');
  });
  for (const [k, v] of Object.entries(pending)) out.push(k + ':' + formatYaml(v));
  const next = m[1] + out.join(nl) + m[3] + text.slice(m[0].length);
  fs.writeFileSync(file, next);
}

/** Value part of a `key: value` line (with its leading space), or '' for empty. */
function formatYaml(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? ' true' : ' false';
  const s = String(v);
  // Plain only when YAML cannot misread it: a date, or a word-led string.
  // Cron expressions start with `*` (a YAML alias) and must be quoted.
  const plain =
    /^\d{4}-\d{2}-\d{2}$/.test(s) ||
    (/^[A-Za-z][A-Za-z0-9 _./+-]*$/.test(s) && !/^(true|false|null|yes|no|on|off)$/i.test(s));
  return ' ' + (plain ? s : JSON.stringify(s));
}

// ── Schedules ──────────────────────────────────────────────────────────────

export function validSchedule(s) {
  if (NAMED_SCHEDULES.includes(s)) return true;
  return parseCron(s) != null;
}

/** 5-field cron → { minute, hour, dom, month, dow } as Sets, or null. */
function parseCron(expr) {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ];
  const sets = [];
  for (let i = 0; i < 5; i += 1) {
    const set = new Set();
    for (const piece of parts[i].split(',')) {
      const m = piece.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/);
      if (!m) return null;
      let lo = m[1] === '*' ? ranges[i][0] : Number(m[1]);
      let hi = m[1] === '*' ? ranges[i][1] : m[2] != null ? Number(m[2]) : Number(m[1]);
      const step = m[3] != null ? Number(m[3]) : 1;
      if (step < 1 || lo < ranges[i][0] || hi > ranges[i][1] || lo > hi) return null;
      for (let v = lo; v <= hi; v += step) set.add(i === 4 && v === 7 ? 0 : v);
    }
    sets.push(set);
  }
  return { minute: sets[0], hour: sets[1], dom: sets[2], month: sets[3], dow: sets[4], domAny: parts[2] === '*', dowAny: parts[4] === '*' };
}

/** First time strictly after `after` (ms) at which `schedule` fires, or null. */
export function nextDue(schedule, after) {
  const from = new Date(after);
  from.setSeconds(0, 0);
  if (schedule === 'daily' || schedule === 'weekly' || schedule === 'monthly') {
    const t = new Date(from);
    t.setHours(SCHEDULE_HOUR, 0, 0, 0);
    if (schedule === 'daily') {
      if (t <= from) t.setDate(t.getDate() + 1);
      return t.getTime();
    }
    if (schedule === 'weekly') {
      // Monday
      const shift = (1 - t.getDay() + 7) % 7;
      t.setDate(t.getDate() + shift);
      if (t <= from) t.setDate(t.getDate() + 7);
      return t.getTime();
    }
    t.setDate(1);
    if (t <= from) t.setMonth(t.getMonth() + 1, 1);
    return t.getTime();
  }
  const cron = parseCron(schedule);
  if (!cron) return null;
  const t = new Date(from);
  t.setMinutes(t.getMinutes() + 1);
  // Day by day (≤ 400 days), then matching hours and minutes within the day.
  for (let day = 0; day < 400; day += 1) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + day);
    const monthOk = cron.month.has(d.getMonth() + 1);
    const domOk = cron.dom.has(d.getDate());
    const dowOk = cron.dow.has(d.getDay());
    const dayOk = cron.domAny && cron.dowAny ? true : cron.domAny ? dowOk : cron.dowAny ? domOk : domOk || dowOk;
    if (!monthOk || !dayOk) continue;
    const startH = day === 0 ? t.getHours() : 0;
    for (let h = startH; h < 24; h += 1) {
      if (!cron.hour.has(h)) continue;
      const startM = day === 0 && h === t.getHours() ? t.getMinutes() : 0;
      for (let mi = startM; mi < 60; mi += 1) {
        if (cron.minute.has(mi)) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi).getTime();
      }
    }
  }
  return null;
}

export function describeSchedule(schedule) {
  if (schedule === 'off') return 'not scheduled';
  if (schedule === 'daily') return 'daily at 09:00';
  if (schedule === 'weekly') return 'weekly, Monday 09:00';
  if (schedule === 'monthly') return 'monthly, the 1st at 09:00';
  return 'cron ' + schedule;
}

// ── Runs ───────────────────────────────────────────────────────────────────

function runsFile(projectDir, agentId) {
  return path.join(projectDir, '.forge', 'agents', agentId + '.runs.json');
}

export function readRuns(projectDir, agentId) {
  try {
    const raw = JSON.parse(fs.readFileSync(runsFile(projectDir, agentId), 'utf8'));
    return Array.isArray(raw.runs) ? raw.runs : [];
  } catch {
    return [];
  }
}

function writeRuns(projectDir, agentId, runs) {
  const file = runsFile(projectDir, agentId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const keep = runs.slice(-RUN_HISTORY);
  fs.writeFileSync(
    file,
    JSON.stringify({ generatedBy: 'urd-forge', note: 'Generated run log — do not edit by hand.', agent: agentId, runs: keep }, null, 2)
  );
  return keep;
}

function newRunId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 6; i += 1) id += chars[Math.floor(Math.random() * chars.length)];
  return new Date().toISOString().slice(0, 10).replaceAll('-', '') + '-' + id;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const SUGGESTION_TEMPLATE = `---
id: S-NNN
agent: <agent id>
title: <one line a reviewer can act on>
status: open
created: <YYYY-MM-DD>
decided:
spec:
---

## What
One paragraph a reviewer can act on.

## Why
Risk or benefit, evidence, file references as \`path:line\`.

## Proposed change
The concrete steps you will carry out if this is approved.
`;

function suggestPrompt({ slug, agent, runId, mode, suggestions, maxPerRun }) {
  const existing = suggestions.length
    ? suggestions.map((s) => `- ${s.id || s.file} [${s.status}] ${s.title}${s.agent ? ' (' + s.agent + ')' : ''}`).join('\n')
    : '- none yet';
  return `# Agent run — ${agent.name} (${agent.id})

Project: ${slug} · Run: ${runId} · Mode: suggestions${mode === 'interactive' ? ' (interactive)' : ''} · Started: ${new Date().toISOString()}

You are the **${agent.name}** of this project. Read the project's CLAUDE.md
first so you know its format and conventions.

## Instructions

${agent.instructions || '(The agent file has no "## Instructions" section — use the description: ' + (agent.description || agent.name) + ')'}

## Run contract (added by URD Forge — overrides anything above)

1. Read anything in this project. Do **not** change any project file during
   this run — the only files you may create are suggestion files.
2. Write each finding as ONE file in \`agents/suggestions/\`, named
   \`S-NNN-<short-slug>.md\`, with exactly this format:

\`\`\`markdown
${SUGGESTION_TEMPLATE}\`\`\`

   Use \`agent: ${agent.id}\`, \`status: open\`, \`created: ${today()}\`.
   The next free id is **${nextSuggestionId(suggestions)}**; number further
   suggestions consecutively.
3. Existing suggestions are listed below. Do not repeat one that is open,
   approved, in-progress or done. Do not repeat one that is not-approved
   unless the situation has changed since — if it has, say so under "Why".
   Archived ones may be proposed again if still relevant.
4. At most **${maxPerRun}** suggestions this run. Fewer, well-founded ones
   beat many thin ones. If you find nothing worth suggesting, write no file.
5. Finish with a short summary: which suggestions you wrote (id and title),
   or "No suggestions this run" and why.

## Existing suggestions

${existing}
`;
}

function approvePrompt({ slug, agent, runId, suggestion, text }) {
  return `# Agent task — ${agent.name} (${agent.id}): carry out ${suggestion.id}

Project: ${slug} · Run: ${runId} · Mode: approved suggestion · Started: ${new Date().toISOString()}

The project owner approved your suggestion **${suggestion.id} — ${suggestion.title}**.
Read the project's CLAUDE.md first so you follow its format and conventions.

## The suggestion (agents/suggestions/${suggestion.file})

${text.trim()}

## What to do when a suggestion is approved (from the agent file)

${agent.whenApproved || 'Implement the proposed change as described, keeping the project consistent (roadmap, decisions, changelog) as CLAUDE.md requires.'}

## Contract (added by URD Forge)

1. First set \`status: in-progress\` in the suggestion's frontmatter.
2. Do the work described under "Proposed change". Keep to that scope.
3. Update ROADMAP/DOCS/CONCEPT exactly as the project's CLAUDE.md requires.
4. When finished, set \`status: done\` and append a \`## Result\` section to
   the suggestion file: what changed, which files, anything left for a human.
   If you could not complete it, set \`status: approved\` back and explain
   under \`## Result\`.
5. Do not commit unless the project's CLAUDE.md says so.
6. End with a short summary of what you did.
`;
}

function quoteArg(s) {
  // Both PowerShell and POSIX shells take a double-quoted string; the values
  // we pass contain no quotes (validated) so no escaping is needed.
  return '"' + String(s).replace(/"/g, '') + '"';
}

/**
 * The runner: starts agent runs (manual, scheduled, approval), keeps the
 * per-agent run log, and notices when a run has ended. One instance per
 * server.
 */
export class AgentRunner {
  constructor(config, store, broadcast) {
    this.config = config;
    this.store = store;
    this.broadcast = broadcast;
    // `${slug}/${agentId}` → { runId, session, watcher, ... } while live
    this.live = new Map();
    this.timer = null;
  }

  projectDir(slug) {
    return path.join(this.config.projectsDir, slug);
  }

  agentFor(slug, agentId) {
    if (!ID_RE.test(String(agentId || ''))) throw new AgentError(400, 'Invalid agent id.');
    const agent = readAgents(this.projectDir(slug)).find((a) => a.id === agentId);
    if (!agent) throw new AgentError(404, 'Unknown agent: ' + agentId);
    if (agent.parseError) throw new AgentError(409, 'The agent file could not be parsed: ' + agent.parseError);
    return agent;
  }

  suggestionFor(slug, suggestionId) {
    const id = String(suggestionId || '').toUpperCase();
    if (!SUGGESTION_ID_RE.test(id)) throw new AgentError(400, 'Invalid suggestion id.');
    const s = readSuggestions(this.projectDir(slug)).find((x) => x.id === id);
    if (!s) throw new AgentError(404, 'Unknown suggestion: ' + id);
    if (!FILE_RE.test(s.file)) throw new AgentError(400, 'Suggestion file name is not safe to use.');
    return s;
  }

  isRunning(slug, agentId) {
    return this.live.has(slug + '/' + agentId);
  }

  /** Agents of a project with their run state, for the API. */
  describeAgents(slug) {
    const dir = this.projectDir(slug);
    return readAgents(dir).map((a) => {
      const runs = readRuns(dir, a.id);
      const last = runs.length ? runs[runs.length - 1] : null;
      const live = this.liveFor(slug, a.id);
      return {
        ...a,
        scheduleText: describeSchedule(a.schedule),
        running: live.map((e) => ({ runId: e.runId, tabId: e.session.tabId, startedAt: e.startedAt, mode: e.mode })),
        lastRun: last,
        nextDue: a.enabled && a.schedule !== 'off' ? this.nextDueFor(dir, a, runs) : null,
        runs: runs.slice().reverse(),
      };
    });
  }

  nextDueFor(dir, agent, runs) {
    // Anchor: the last run (or skip) of any kind, else the agent file's
    // mtime — turning scheduling on edits the file, so that is "since when".
    const last = runs.length ? runs[runs.length - 1].startedAt : null;
    const anchor = last ? Date.parse(last) : agent.mtime || Date.now();
    return nextDue(agent.schedule, anchor);
  }

  // ── Starting runs ──────────────────────────────────────────────────────

  /**
   * Build the prompt file and command for a run. `mode`: 'suggest'
   * (headless), 'interactive' (suggestions, interactive session) or
   * 'approve' (carry out `suggestionId`). Returns { runId, command, title }.
   */
  prepare(slug, agent, mode, suggestionId) {
    const dir = this.projectDir(slug);
    const runId = newRunId();
    const runsDir = path.join(dir, '.forge', 'agents', 'runs');
    fs.mkdirSync(runsDir, { recursive: true });
    const promptRel = '.forge/agents/runs/' + runId + '.md';
    const doneRel = '.forge/agents/runs/' + runId + '.done';
    let prompt;
    let title;
    let flags = '';
    if (mode === 'approve') {
      const suggestion = this.suggestionFor(slug, suggestionId);
      if (!['approved', 'in-progress'].includes(suggestion.status)) {
        throw new AgentError(409, 'Only an approved suggestion can be handed to the agent (status is ' + suggestion.status + ').');
      }
      const text = fs.readFileSync(path.join(dir, 'agents', 'suggestions', suggestion.file), 'utf8');
      prompt = approvePrompt({ slug, agent, runId, suggestion, text });
      title = agent.name + ' · ' + suggestion.id;
      if (agent.approvalMode === 'headless') {
        flags = ' -p --permission-mode acceptEdits' + rulesFlag(agent.permissions);
      }
    } else {
      const suggestions = readSuggestions(dir);
      prompt = suggestPrompt({ slug, agent, runId, mode, suggestions, maxPerRun: this.config.agents.maxSuggestionsPerRun });
      title = agent.name;
      if (mode === 'suggest') flags = ' -p' + rulesFlag([...SUGGEST_RULES, ...agent.permissions]);
    }
    fs.writeFileSync(path.join(runsDir, runId + '.md'), prompt);
    const ask = quoteArg('Read ' + promptRel + ' and follow it exactly.');
    // The prompt goes right after `claude` (before the flags, so a list flag
    // cannot swallow it); in interactive mode it is the first message. The
    // trailing echo marks the end of the run in a file (`.done`) — the same
    // line works in PowerShell and POSIX shells, and `.forge/` is ignored by
    // the file watcher.
    const command = 'claude ' + ask + flags + '; echo done > ' + doneRel;
    return { runId, command, title, promptRel };
  }

  /** Type a prepared run into an existing session (a tab the browser opened). */
  startInSession(slug, session, { agentId, mode, suggestionId, trigger }) {
    const agent = this.agentFor(slug, agentId);
    if (mode !== 'approve' && this.isRunning(slug, agentId)) {
      throw new AgentError(409, agent.name + ' is already running — wait for that run to finish.');
    }
    const run = this.prepare(slug, agent, mode, suggestionId);
    if (!writeCommand(session, run.command)) throw new AgentError(409, 'The terminal session is not alive.');
    this.track(slug, agent, run, session, mode, suggestionId, trigger || 'manual');
    return run;
  }

  /** Spawn a tab on the server and start the run in it (scheduled runs). */
  startDetached(slug, agentId, { mode = 'suggest', suggestionId = null, trigger = 'scheduled' } = {}) {
    const agent = this.agentFor(slug, agentId);
    if (mode !== 'approve' && this.isRunning(slug, agentId)) {
      throw new AgentError(409, agent.name + ' is already running.');
    }
    const run = this.prepare(slug, agent, mode, suggestionId);
    const session = spawnSession(slug, {
      cwd: this.projectDir(slug),
      title: agent.name + (trigger === 'scheduled' ? ' (scheduled)' : ''),
      maxTabs: this.config.terminal.maxTabs,
    });
    // Give the shell a moment to come up before typing (as the client does).
    setTimeout(() => writeCommand(session, run.command), 800);
    this.track(slug, agent, run, session, mode, suggestionId, trigger);
    return run;
  }

  /** Live runs of an agent (a suggestion run and any approval runs). */
  liveFor(slug, agentId) {
    const out = [];
    for (const [k, e] of this.live) if (k === slug + '/' + agentId || k.startsWith(slug + '/' + agentId + '#')) out.push(e);
    return out;
  }

  track(slug, agent, run, session, mode, suggestionId, trigger) {
    const dir = this.projectDir(slug);
    // Only one live suggestion run per agent; approval runs of the same
    // agent may overlap with it, so those are keyed by run.
    const key = slug + '/' + agent.id + (mode === 'approve' ? '#' + run.runId : '');
    const startedAt = new Date().toISOString();
    const before = new Set(readSuggestions(dir).map((s) => s.file));
    const record = {
      runId: run.runId,
      mode,
      trigger,
      suggestionId: suggestionId || null,
      tabId: session.tabId,
      startedAt,
      endedAt: null,
      exitCode: null,
      suggestions: null,
      outcome: 'running',
    };
    writeRuns(dir, agent.id, [...readRuns(dir, agent.id), record]);
    const doneFile = path.join(dir, '.forge', 'agents', 'runs', run.runId + '.done');
    const entry = { runId: run.runId, session, startedAt, mode, agentId: agent.id, dispose: null, timer: null };
    const finish = (outcome, exitCode) => {
      if (!this.live.has(key) || this.live.get(key) !== entry) return;
      this.live.delete(key);
      clearInterval(entry.timer);
      if (entry.dispose) entry.dispose();
      const after = readSuggestions(dir).map((s) => s.file);
      const created = after.filter((f) => !before.has(f)).length;
      const runs = readRuns(dir, agent.id).map((r) =>
        r.runId === run.runId
          ? { ...r, endedAt: new Date().toISOString(), exitCode: exitCode ?? null, suggestions: created, outcome }
          : r
      );
      writeRuns(dir, agent.id, runs);
      try {
        fs.rmSync(doneFile, { force: true });
      } catch {
        /* ignore */
      }
      this.broadcast({ type: 'agent-run', slug, agentId: agent.id, runId: run.runId, event: 'ended', outcome, suggestions: created });
    };
    // Ended when the shell has written the .done file, or when the tab dies.
    entry.timer = setInterval(() => {
      if (fs.existsSync(doneFile)) finish('finished', 0);
    }, 2000);
    entry.dispose = onSessionExit(session, (exitCode) => finish(fs.existsSync(doneFile) ? 'finished' : 'stopped', exitCode));
    this.live.set(key, entry);
    this.broadcast({ type: 'agent-run', slug, agentId: agent.id, runId: run.runId, tabId: session.tabId, event: 'started', mode });
  }

  /** WebSocket message from a tab: `agent-run` or `agent-approve`. */
  handleMessage(slug, msg, session) {
    if (msg.type === 'agent-run') {
      const mode = msg.mode === 'interactive' ? 'interactive' : 'suggest';
      this.startInSession(slug, session, { agentId: msg.agentId, mode, trigger: 'manual' });
      return true;
    }
    if (msg.type === 'agent-approve') {
      const suggestion = this.suggestionFor(slug, msg.suggestionId);
      if (!suggestion.agent) throw new AgentError(409, 'The suggestion names no agent to hand it to.');
      this.startInSession(slug, session, { agentId: suggestion.agent, mode: 'approve', suggestionId: suggestion.id, trigger: 'approval' });
      return true;
    }
    return false;
  }

  // ── Scheduler ──────────────────────────────────────────────────────────

  start() {
    // First pass shortly after start (catch-up, Decisions Q4), then once a minute.
    setTimeout(() => this.tick(), 15000);
    this.timer = setInterval(() => this.tick(), 60000);
  }

  stop() {
    clearInterval(this.timer);
  }

  tick() {
    if (!terminalAvailable().available) return;
    const now = Date.now();
    for (const slug of this.store.projects.keys()) {
      if (slug === '_template' || this.store.localState.isArchived(slug)) continue;
      const dir = this.projectDir(slug);
      for (const agent of readAgents(dir)) {
        if (!agent.enabled || agent.schedule === 'off' || agent.parseError) continue;
        const runs = readRuns(dir, agent.id);
        const due = this.nextDueFor(dir, agent, runs);
        if (due == null || now < due) continue;
        if (this.isRunning(slug, agent.id)) {
          this.skip(dir, agent, 'previous run still alive');
          continue;
        }
        try {
          this.startDetached(slug, agent.id, { mode: 'suggest', trigger: 'scheduled' });
          console.log(`[forge] Scheduled run of ${agent.id} started in projects/${slug}`);
        } catch (err) {
          this.skip(dir, agent, err.message);
          console.warn(`[forge] Scheduled run of ${agent.id} in projects/${slug} skipped: ${err.message}`);
        }
      }
    }
  }

  /** A due run that could not start: logged, and it moves the anchor so the
   *  scheduler does not retry every minute. */
  skip(dir, agent, reason) {
    writeRuns(dir, agent.id, [
      ...readRuns(dir, agent.id),
      { runId: newRunId(), mode: 'suggest', trigger: 'scheduled', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), outcome: 'skipped', reason },
    ]);
  }
}

function rulesFlag(rules) {
  // One comma-separated argument: unambiguous for a flag that also accepts
  // a space-separated list.
  const clean = [...new Set(rules.filter((r) => RULE_RE.test(r) && !r.includes(',')))];
  if (!clean.length) return '';
  return ' --allowedTools ' + quoteArg(clean.join(','));
}

// ── Helpers for the API ────────────────────────────────────────────────────

export function agentFile(config, slug, agentId) {
  if (!ID_RE.test(String(agentId || ''))) throw new AgentError(400, 'Invalid agent id.');
  const file = path.join(config.projectsDir, slug, 'agents', agentId + '.md');
  if (!fs.existsSync(file)) throw new AgentError(404, 'Unknown agent: ' + agentId);
  return file;
}

export function suggestionFile(config, slug, suggestionId) {
  const id = String(suggestionId || '').toUpperCase();
  if (!SUGGESTION_ID_RE.test(id)) throw new AgentError(400, 'Invalid suggestion id.');
  const s = readSuggestions(path.join(config.projectsDir, slug)).find((x) => x.id === id);
  if (!s || !FILE_RE.test(s.file)) throw new AgentError(404, 'Unknown suggestion: ' + id);
  return { file: path.join(config.projectsDir, slug, 'agents', 'suggestions', s.file), suggestion: s };
}
