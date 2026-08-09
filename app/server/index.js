/*
 * URD Forge server.
 * Localhost only (SPEC-00 §6): binds 127.0.0.1, no command execution via the
 * HTTP API — the terminal runs over a dedicated WebSocket with node-pty.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';

import { loadConfig, presetsFor } from './config.js';
import { Store } from './store.js';
import { scaffoldProject, importSpec, ScaffoldError } from './scaffold.js';
import { createUpdater, UpdateError } from './update.js';
import { search } from './search.js';
import { startWatcher } from './watcher.js';
import { loadPty, terminalAvailable, attachTerminal, killAll } from './terminal.js';

const started = Date.now();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = loadConfig(rootDir);
const store = new Store(config);
store.scanAll();
for (const p of store.projects.values()) store.writeCache(p);

await loadPty();

const updater = createUpdater(rootDir, '1.0.0');
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
    version: '1.0.0',
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

api.get('/projects/:slug', (req, res) => {
  const project = store.get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Unknown project' });
  res.json(project);
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
    return res.json({ disabled: true, available: false, current: { version: '1.0.0' } });
  }
  if (req.query.check === '1') await updater.check();
  res.json(updater.getState());
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
        cwd: path.join(config.projectsDir, slug),
        cols: Number(url.searchParams.get('cols')) || 100,
        rows: Number(url.searchParams.get('rows')) || 30,
        presets: presetsFor(config, slug),
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
  killAll();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
