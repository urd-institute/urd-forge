/*
 * Command window backend (SPEC-00 §6, SPEC-03).
 * Sessions are keyed by project slug and tab id: a project may have several
 * tabs (up to `terminal.maxTabs`), each its own pty with cwd = the project
 * folder. Attached over WebSocket only — commands are never executed via the
 * HTTP API. Sessions die with the app.
 *
 * node-pty is an optional dependency (native module). If it failed to
 * install, Forge still runs as an overview and the terminal reports itself
 * unavailable (SPEC-00 §8a).
 */
import os from 'node:os';
import path from 'node:path';

let ptyLib = null;
let ptyError = null;

export async function loadPty() {
  try {
    ptyLib = await import('@lydell/node-pty');
  } catch (err1) {
    try {
      ptyLib = await import('node-pty');
    } catch (err2) {
      ptyError = err1.message;
    }
  }
  return ptyLib != null;
}

export function terminalAvailable() {
  return { available: ptyLib != null, error: ptyLib ? null : ptyError };
}

// Replayed to a client that (re)attaches. Sized to match the client's
// 10,000-line xterm scrollback rather than a screenful or two.
const SCROLLBACK_LIMIT = 1_000_000;
const TAB_ID_RE = /^[a-z0-9]{4,16}$/;
const TITLE_MAX = 40;
// slug → Map<tabId, { pty, buffer, clients:Set<ws>, dead, tabId, title, createdAt }>
const sessions = new Map();

// index.js registers a listener that broadcasts tab events over /ws/events,
// so every open browser window keeps the same tab list (SPEC-03 §4.1).
let tabListener = null;
export function onTabEvent(fn) {
  tabListener = fn;
}
function emitTab(slug, session, event) {
  if (tabListener) tabListener({ type: 'terminal-tab', slug, tabId: session.tabId, title: session.title, event });
}

function defaultShell() {
  if (process.platform === 'win32') return process.env.COMSPEC ? 'powershell.exe' : 'powershell.exe';
  return process.env.SHELL || (process.platform === 'darwin' ? 'zsh' : 'bash');
}

function projectTabs(slug) {
  let tabs = sessions.get(slug);
  if (!tabs) {
    tabs = new Map();
    sessions.set(slug, tabs);
  }
  return tabs;
}

function liveCount(slug) {
  let n = 0;
  for (const s of projectTabs(slug).values()) if (!s.dead) n += 1;
  return n;
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, TITLE_MAX);
}

function getSession(slug, tabId, cwd, cols, rows, title) {
  const tabs = projectTabs(slug);
  const existing = tabs.get(tabId);
  if (existing && !existing.dead) return existing;

  const proc = ptyLib.spawn(defaultShell(), [], {
    name: 'xterm-256color',
    cols: cols || 100,
    rows: rows || 30,
    cwd,
    env: { ...process.env, FORGE_PROJECT: slug },
  });
  const session = {
    pty: proc,
    buffer: '',
    clients: new Set(),
    dead: false,
    tabId,
    title: cleanTitle(title) || '',
    createdAt: Date.now(),
  };

  proc.onData((data) => {
    session.buffer = (session.buffer + data).slice(-SCROLLBACK_LIMIT);
    for (const ws of session.clients) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'data', data }));
    }
  });
  proc.onExit(({ exitCode }) => {
    session.dead = true;
    // `closed` tells other windows the user closed the tab (remove it) as
    // opposed to the program ending on its own (keep it, offer a restart).
    for (const ws of session.clients) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'exit', exitCode, closed: session.closed }));
    }
    if (tabs.get(tabId) === session) tabs.delete(tabId);
    emitTab(slug, session, session.closed ? 'closed' : 'exit');
  });

  tabs.set(tabId, session);
  emitTab(slug, session, 'created');
  return session;
}

export function attachTerminal(ws, { slug, tabId, cwd, cols, rows, presets, maxTabs, title }) {
  const refuse = (message) => {
    ws.send(JSON.stringify({ type: 'unavailable', message }));
    ws.close();
  };
  if (!ptyLib) {
    refuse(
      'Terminal is unavailable: node-pty could not be loaded (' +
        (ptyError || 'unknown error') +
        '). Forge still works as an overview. See README → Requirements.'
    );
    return;
  }
  if (!TAB_ID_RE.test(tabId || '')) {
    refuse('Invalid terminal tab id.');
    return;
  }

  const existing = projectTabs(slug).get(tabId);
  const fresh = !existing || existing.dead;
  const limit = Math.max(1, Number(maxTabs) || 6);
  if (fresh && liveCount(slug) >= limit) {
    refuse('This project already has ' + limit + ' terminal tabs open (terminal.maxTabs) — close one first.');
    return;
  }
  let session;
  try {
    session = getSession(slug, tabId, cwd, cols, rows, title);
  } catch (err) {
    refuse('Could not start shell: ' + err.message);
    return;
  }

  session.clients.add(ws);
  ws.send(
    JSON.stringify({
      type: 'ready',
      presets,
      shell: defaultShell(),
      cwd,
      fresh,
      tabId,
      title: session.title,
    })
  );
  if (session.buffer) ws.send(JSON.stringify({ type: 'data', data: session.buffer, replay: true }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (session.dead) return;
    if (msg.type === 'input' && typeof msg.data === 'string') {
      session.pty.write(msg.data);
    } else if (msg.type === 'resize' && msg.cols > 0 && msg.rows > 0) {
      try {
        session.pty.resize(Math.floor(msg.cols), Math.floor(msg.rows));
      } catch {
        /* pty may be closing */
      }
    } else if (msg.type === 'kill') {
      // User asked to stop the session (Stop button) or close the tab
      // (`close: true`). onExit does the cleanup and notifies every client.
      if (msg.close === true) session.closed = true;
      try {
        session.pty.kill();
      } catch {
        /* already gone */
      }
    } else if (msg.type === 'preset' && typeof msg.command === 'string') {
      // Presets come from forge.config.yaml (or the built-in defaults) and are
      // matched against the server-side list — the client cannot invent commands.
      const found = presets.flatMap((g) => g.items).find((p) => p.command === msg.command);
      if (found) session.pty.write(found.command + (process.platform === 'win32' ? '\r' : '\n'));
    } else if (msg.type === 'title' && typeof msg.title === 'string') {
      // Tab name (from a preset label, the program's OSC title, or the user).
      // Kept server-side so it survives reloads and is shared between windows.
      const title = cleanTitle(msg.title);
      if (title !== session.title) {
        session.title = title;
        emitTab(slug, session, 'title');
      }
    }
  });

  ws.on('close', () => {
    session.clients.delete(ws);
    // Session stays alive for reattachment; it dies with the app (§6).
  });
}

/** Live tabs of a project, in creation order: [{tabId, title, createdAt, alive}]. */
export function listTabs(slug) {
  const out = [];
  for (const s of projectTabs(slug).values()) {
    if (!s.dead) out.push({ tabId: s.tabId, title: s.title, createdAt: s.createdAt, alive: true });
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

/** Live sessions for the dev-server scan: [{slug, tabId, title, buffer}]. */
export function liveSessions() {
  const out = [];
  for (const [slug, tabs] of sessions) {
    for (const s of tabs.values()) {
      if (!s.dead) out.push({ slug, tabId: s.tabId, title: s.title, buffer: s.buffer });
    }
  }
  return out;
}

export function killAll() {
  for (const tabs of sessions.values()) {
    for (const s of tabs.values()) {
      try {
        s.pty.kill();
      } catch {
        /* already gone */
      }
    }
  }
  sessions.clear();
}
