/*
 * URD Forge server.
 * Localhost only (SPEC-00 §6): binds 127.0.0.1, no command execution via the
 * HTTP API — the terminal runs over a dedicated WebSocket with node-pty.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';

import { loadConfig, presetsFor } from './config.js';
import { Store } from './store.js';
import { scaffoldProject, importSpec, installForgeCommand, ScaffoldError } from './scaffold.js';
import { exportProject, importProject } from './transfer.js';
import { filterSpecs } from './specfilter.js';
import { createUpdater, UpdateError } from './update.js';
import { search } from './search.js';
import { startWatcher } from './watcher.js';
import { loadPty, terminalAvailable, attachTerminal, killAll, listTabs, onTabEvent } from './terminal.js';
import { listServers } from './servers.js';
import {
  AgentRunner,
  AgentError,
  SUGGESTION_STATUSES,
  agentFile,
  suggestionFile,
  patchFrontmatter,
  readSuggestions,
  validSchedule,
} from './agents.js';

const started = Date.now();
// Set by the `npm run forge` supervisor: exiting with this code makes it
// start the server again, which is how the UI's restart button works.
const supervised = process.env.FORGE_SUPERVISED === '1';
const RESTART_EXIT_CODE = 75;
const IMPORT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = loadConfig(rootDir);
// Single source of truth for the version shown in the UI and the Updates screen.
const VERSION = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
const store = new Store(config);
store.scanAll();
for (const p of store.projects.values()) store.writeCache(p);

await loadPty();

const updater = createUpdater(rootDir, VERSION);
// Quiet background check shortly after start; failures (offline, not a git
// clone) are kept in the state and shown on the Updates screen only.
// Skipped entirely when self-update is disabled (development copies).
if (config.updates) setTimeout(() => updater.check().catch(() => {}), 3000);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// ── API ────────────────────────────────────────────────────────────────────
const api = express.Router();

api.get('/status', (req, res) => {
  res.json({
    app: 'urd-forge',
    version: VERSION,
    projects: store.projects.size,
    terminal: terminalAvailable(),
    startupMs: Date.now() - started,
  });
});

api.get('/projects', (req, res) => {
  res.json(store.list());
});

api.post('/projects', (req, res) => {
  // Creates the document structure only — the content is drafted by a Claude
  // Code session in the project's terminal (no command execution over HTTP).
  try {
    const { slug, name } = scaffoldProject(config, req.body || {});
    store.refresh(slug);
    res.status(201).json({ slug, name });
  } catch (err) {
    if (err instanceof ScaffoldError) return res.status(err.status).json({ error: err.message });
    console.warn('[forge] scaffold failed:', err);
    res.status(500).json({ error: 'Could not create the project: ' + err.message });
  }
});

api.post('/projects/:slug/specs', (req, res) => {
  // Imports a spec written elsewhere into the project's specs/ folder.
  // File creation only — no command execution over HTTP.
  if (!store.get(req.params.slug)) return res.status(404).json({ error: 'Unknown project' });
  try {
    const result = importSpec(config, req.params.slug, req.body || {});
    store.refresh(req.params.slug);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ScaffoldError) return res.status(err.status).json({ error: err.message });
    console.warn('[forge] spec import failed:', err);
    res.status(500).json({ error: 'Could not import the spec: ' + err.message });
  }
});

api.get('/projects/:slug/specs/filter', (req, res) => {
  // Content match for the spec-board filter (SPEC-02 §3.3). Read-only: the
  // client matches the card fields itself and adds these body hits.
  if (!store.get(req.params.slug)) return res.status(404).json({ error: 'Unknown project' });
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (!q) return res.json({ matches: [] });
  res.json({ matches: filterSpecs(config, req.params.slug, q) });
});

api.post('/projects/:slug/commands/forge', (req, res) => {
  // Installs the /forge Claude Code command into an existing project.
  // File creation only — no command execution over HTTP.
  if (!store.get(req.params.slug)) return res.status(404).json({ error: 'Unknown project' });
  try {
    const result = installForgeCommand(config, req.params.slug);
    store.refresh(req.params.slug);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ScaffoldError) return res.status(err.status).json({ error: err.message });
    console.warn('[forge] command install failed:', err);
    res.status(500).json({ error: 'Could not install the command: ' + err.message });
  }
});

api.get('/servers', async (req, res) => {
  // Dev-server overview: declared in config or spotted in live terminal
  // output, each probed with a TCP connect on 127.0.0.1 (read-only).
  try {
    res.json({ servers: await listServers(config, store) });
  } catch (err) {
    console.warn('[forge] server scan failed:', err);
    res.json({ servers: [] });
  }
});

api.post('/projects/import', (req, res) => {
  // Imports a whole project from a zip (e.g. exported from another Forge
  // installation). The upload is streamed to a temp file and extracted into
  // a new projects/<slug>/ — file creation only, no command execution.
  const type = String(req.headers['content-type'] || '');
  if (!/zip|octet-stream/i.test(type)) {
    return res.status(415).json({ error: 'Send the zip file as the request body (Content-Type: application/zip).' });
  }
  const tmp = path.join(os.tmpdir(), `forge-import-${process.pid}-${Date.now()}.zip`);
  const out = fs.createWriteStream(tmp);
  let bytes = 0;
  let tooLarge = false;
  const cleanup = () => fs.rm(tmp, { force: true }, () => {});
  req.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > IMPORT_MAX_BYTES && !tooLarge) {
      tooLarge = true;
      res.status(413).json({ error: 'The zip file is too large (max 2 GB).' });
      req.destroy();
    }
  });
  req.on('error', () => {
    out.destroy();
    cleanup();
    if (!res.headersSent) res.status(400).json({ error: 'The upload was interrupted.' });
  });
  out.on('error', (err) => {
    cleanup();
    res.status(500).json({ error: 'Could not store the upload: ' + err.message });
  });
  out.on('finish', async () => {
    if (tooLarge) {
      cleanup();
      return res.status(413).json({ error: 'The zip file is too large (max 2 GB).' });
    }
    try {
      const result = await importProject(config, tmp, { slug: req.query.slug });
      store.refresh(result.slug);
      broadcast({ type: 'projects-changed' });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ScaffoldError) return res.status(err.status).json({ error: err.message });
      console.warn('[forge] project import failed:', err);
      res.status(500).json({ error: 'Could not import the project: ' + err.message });
    } finally {
      cleanup();
    }
  });
  req.pipe(out);
});

api.get('/projects/:slug/export', (req, res) => {
  // Downloads the project folder as a zip (read-only; see transfer.js for
  // what is skipped).
  const project = store.get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Unknown project' });
  try {
    exportProject(config, project.slug, res);
  } catch (err) {
    console.warn('[forge] project export failed:', err);
    res.status(500).json({ error: 'Could not export the project: ' + err.message });
  }
});

api.get('/projects/:slug', (req, res) => {
  const project = store.get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Unknown project' });
  res.json({
    ...project,
    archived: store.localState.isArchived(project.slug),
    pinned: store.localState.isPinned(project.slug),
  });
});

api.post('/projects/:slug/pin', (req, res) => {
  // Pinned projects are listed first in the sidebar and on the home screen.
  // Local installation state, like archiving.
  const project = store.get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Unknown project' });
  const pinned = !(req.body && req.body.pinned === false);
  store.localState.setPinned(project.slug, pinned);
  broadcast({ type: 'projects-changed' });
  res.json({ slug: project.slug, pinned });
});

api.post('/projects/:slug/archive', (req, res) => {
  // Archive/restore is local installation state (forge.state.json) — the
  // project's files are untouched, and the flag survives self-updates.
  const project = store.get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Unknown project' });
  const archived = !(req.body && req.body.archived === false);
  store.localState.setArchived(project.slug, archived);
  broadcast({ type: 'projects-changed' });
  res.json({ slug: project.slug, archived });
});

// Live terminal tabs of a project (SPEC-03 §4.1) — read-only; tabs are
// created by connecting to the terminal WebSocket, never over HTTP.
api.get('/projects/:slug/terminals', (req, res) => {
  if (!store.get(req.params.slug)) return res.status(404).json({ error: 'Unknown project' });
  res.json({ tabs: listTabs(req.params.slug), maxTabs: config.terminal.maxTabs });
});

// ── Agents (SPEC-04) ───────────────────────────────────────────────────────
// Reads are plain file reads; the two PATCH routes edit one frontmatter
// field each. Runs are never started over HTTP — the browser opens a
// terminal tab and names the agent on that WebSocket (see the upgrade
// handler), and the server builds the command from the files on disk.
api.get('/projects/:slug/agents', (req, res) => {
  if (!store.get(req.params.slug)) return res.status(404).json({ error: 'Unknown project' });
  res.json({
    agents: runner.describeAgents(req.params.slug),
    suggestions: readSuggestions(path.join(config.projectsDir, req.params.slug)),
    maxSuggestionsPerRun: config.agents.maxSuggestionsPerRun,
    terminal: terminalAvailable(),
  });
});

api.get('/projects/:slug/agents/:id', (req, res) => {
  if (!store.get(req.params.slug)) return res.status(404).json({ error: 'Unknown project' });
  const agent = runner.describeAgents(req.params.slug).find((a) => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Unknown agent' });
  res.json(agent);
});

api.patch('/projects/:slug/agents/:id', (req, res) => {
  // `enabled` and `schedule` only — a frontmatter edit, nothing else.
  if (!store.get(req.params.slug)) return res.status(404).json({ error: 'Unknown project' });
  const body = req.body || {};
  const fields = {};
  if (body.enabled != null) fields.enabled = Boolean(body.enabled);
  if (body.schedule != null) {
    const s = String(body.schedule).trim().toLowerCase();
    if (!validSchedule(s)) return res.status(400).json({ error: 'Schedule must be off, daily, weekly, monthly or a 5-field cron expression.' });
    fields.schedule = s;
  }
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to change (enabled, schedule).' });
  try {
    patchFrontmatter(agentFile(config, req.params.slug, req.params.id), fields);
    store.refresh(req.params.slug);
    res.json({ id: req.params.id, ...fields });
  } catch (err) {
    if (err instanceof AgentError) return res.status(err.status).json({ error: err.message });
    console.warn('[forge] agent update failed:', err);
    res.status(500).json({ error: 'Could not update the agent: ' + err.message });
  }
});

api.get('/projects/:slug/suggestions', (req, res) => {
  if (!store.get(req.params.slug)) return res.status(404).json({ error: 'Unknown project' });
  res.json({ suggestions: readSuggestions(path.join(config.projectsDir, req.params.slug)) });
});

api.patch('/projects/:slug/suggestions/:id', (req, res) => {
  // `status` only. `decided` follows: set on a decision, cleared on reopen.
  if (!store.get(req.params.slug)) return res.status(404).json({ error: 'Unknown project' });
  const status = String((req.body && req.body.status) || '').toLowerCase().trim();
  if (!SUGGESTION_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Status must be one of: ' + SUGGESTION_STATUSES.join(', ') + '.' });
  }
  try {
    const { file, suggestion } = suggestionFile(config, req.params.slug, req.params.id);
    const fields = { status };
    if (['approved', 'not-approved', 'archived'].includes(status)) fields.decided = new Date().toISOString().slice(0, 10);
    else if (status === 'open') fields.decided = '';
    patchFrontmatter(file, fields);
    store.refresh(req.params.slug);
    res.json({ id: suggestion.id, agent: suggestion.agent, ...fields });
  } catch (err) {
    if (err instanceof AgentError) return res.status(err.status).json({ error: err.message });
    console.warn('[forge] suggestion update failed:', err);
    res.status(500).json({ error: 'Could not update the suggestion: ' + err.message });
  }
});

api.get('/projects/:slug/presets', (req, res) => {
  if (!store.get(req.params.slug)) return res.status(404).json({ error: 'Unknown project' });
  res.json({ presets: presetsFor(config, req.params.slug), terminal: terminalAvailable() });
});

api.get('/projects/:slug/file', (req, res) => {
  const project = store.get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Unknown project' });
  const rel = String(req.query.path || '');
  const resolved = store.resolveFile(req.params.slug, rel);
  if (!resolved) return res.status(400).json({ error: 'Invalid path' });
  let content;
  let stat;
  try {
    stat = fs.statSync(resolved);
    if (!stat.isFile()) throw new Error('not a file');
    if (stat.size > 2 * 1024 * 1024) return res.status(413).json({ error: 'File too large to display' });
    content = fs.readFileSync(resolved, 'utf8');
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }
  res.json({ path: rel.replaceAll('\\', '/'), content, mtime: stat.mtimeMs });
});

api.get('/update', async (req, res) => {
  if (!config.updates) {
    return res.json({ disabled: true, available: false, current: { version: VERSION }, supervised });
  }
  if (req.query.check === '1') await updater.check();
  res.json({ ...updater.getState(), supervised });
});

api.post('/update/apply', async (req, res) => {
  if (!config.updates) {
    return res
      .status(403)
      .json({ error: 'Self-update is disabled in this installation (updates: false in forge.config.yaml).' });
  }
  try {
    res.json(await updater.apply());
  } catch (err) {
    if (err instanceof UpdateError) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Update failed: ' + err.message });
  }
});

// Restart/stop the Forge process itself. Still no command execution over
// HTTP (SPEC-00 §6): the process only ends itself — the supervisor in
// scripts/forge.js starts it again when it sees the restart exit code.
api.post('/restart', (req, res) => {
  if (!supervised) {
    return res.status(409).json({
      error:
        'Forge is running without its supervisor, so it cannot start itself again. ' +
        'Restart it from the window running it (npm run forge).',
    });
  }
  console.log('[forge] Restart requested from the UI.');
  res.json({ restarting: true });
  setTimeout(() => {
    killAll();
    process.exit(RESTART_EXIT_CODE);
  }, 300);
});

api.post('/stop', (req, res) => {
  console.log('[forge] Stop requested from the UI.');
  res.json({ stopping: true });
  setTimeout(() => {
    killAll();
    process.exit(0);
  }, 300);
});

api.get('/search', (req, res) => {
  const q = String(req.query.q || '');
  const project = req.query.project ? String(req.query.project) : null;
  res.json(search(config, q, { project }));
});

app.use('/api', api);

// ── Static client ──────────────────────────────────────────────────────────
const distDir = path.join(rootDir, 'app', 'client', 'dist');
app.use(express.static(distDir));
app.get(/^\/(?!api\/|ws\/).*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) res.status(404).send('Client not built. Run: npm run forge');
  });
});

// ── HTTP + WebSockets ──────────────────────────────────────────────────────
const server = http.createServer(app);
const wssEvents = new WebSocketServer({ noServer: true });
const wssTerm = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/ws/events') {
    wssEvents.handleUpgrade(req, socket, head, (ws) => wssEvents.emit('connection', ws, req));
  } else if (url.pathname === '/ws/terminal') {
    wssTerm.handleUpgrade(req, socket, head, (ws) => {
      const slug = url.searchParams.get('project') || '';
      const project = store.get(slug);
      if (!project) {
        ws.send(JSON.stringify({ type: 'unavailable', message: 'Unknown project: ' + slug }));
        ws.close();
        return;
      }
      attachTerminal(ws, {
        slug,
        tabId: url.searchParams.get('tab') || '',
        title: url.searchParams.get('title') || '',
        cwd: path.join(config.projectsDir, slug),
        cols: Number(url.searchParams.get('cols')) || 100,
        rows: Number(url.searchParams.get('rows')) || 30,
        presets: presetsFor(config, slug),
        maxTabs: config.terminal.maxTabs,
        // Agent runs (SPEC-04): the message names an agent or suggestion id;
        // the runner reads the files and types the command itself.
        onMessage: (msg, session) => runner.handleMessage(slug, msg, session),
      });
    });
  } else {
    socket.destroy();
  }
});

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const ws of wssEvents.clients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

startWatcher(config, store, broadcast);
onTabEvent(broadcast);
const runner = new AgentRunner(config, store, broadcast);
runner.start();

server.listen(config.port, '127.0.0.1', () => {
  const term = terminalAvailable();
  console.log('');
  console.log('  URD FORGE  ·  http://localhost:' + config.port);
  console.log('  projects:  ' + store.projects.size + '  (' + config.projectsDir + ')');
  console.log('  terminal:  ' + (term.available ? 'ready' : 'unavailable — ' + (term.error || 'node-pty missing')));
  console.log('  started in ' + (Date.now() - started) + ' ms');
  console.log('');
});

function shutdown() {
  runner.stop();
  killAll();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
