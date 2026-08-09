/*
 * Command window backend (SPEC-00 §6).
 * One pty session per project, cwd = the project folder. Attached over
 * WebSocket only — commands are never executed via the HTTP API. Sessions
 * die with the app.
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

const SCROLLBACK_LIMIT = 200_000;
const sessions = new Map(); // slug → { pty, buffer, clients:Set<ws>, dead }

function defaultShell() {
  if (process.platform === 'win32') return process.env.COMSPEC ? 'powershell.exe' : 'powershell.exe';
  return process.env.SHELL || (process.platform === 'darwin' ? 'zsh' : 'bash');
}

function getSession(slug, cwd, cols, rows) {
  const existing = sessions.get(slug);
  if (existing && !existing.dead) return existing;

  const proc = ptyLib.spawn(defaultShell(), [], {
    name: 'xterm-256color',
    cols: cols || 100,
    rows: rows || 30,
    cwd,
    env: { ...process.env, FORGE_PROJECT: slug },
  });
  const session = { pty: proc, buffer: '', clients: new Set(), dead: false };

  proc.onData((data) => {
    session.buffer = (session.buffer + data).slice(-SCROLLBACK_LIMIT);
    for (const ws of session.clients) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'data', data }));
    }
  });
  proc.onExit(({ exitCode }) => {
    session.dead = true;
    for (const ws of session.clients) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'exit', exitCode }));
    }
    sessions.delete(slug);
  });

  sessions.set(slug, session);
  return session;
}

export function attachTerminal(ws, { slug, cwd, cols, rows, presets }) {
  if (!ptyLib) {
    ws.send(
      JSON.stringify({
        type: 'unavailable',
        message:
          'Terminal is unavailable: node-pty could not be loaded (' +
          (ptyError || 'unknown error') +
          '). Forge still works as an overview. See README → Requirements.',
      })
    );
    ws.close();
    return;
  }

  const existing = sessions.get(slug);
  const fresh = !existing || existing.dead;
  let session;
  try {
    session = getSession(slug, cwd, cols, rows);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'unavailable', message: 'Could not start shell: ' + err.message }));
    ws.close();
    return;
  }

  session.clients.add(ws);
  ws.send(JSON.stringify({ type: 'ready', presets, shell: defaultShell(), cwd, fresh }));
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
    } else if (msg.type === 'preset' && typeof msg.command === 'string') {
      // Presets come from forge.config.yaml (or the built-in defaults) and are
      // matched against the server-side list — the client cannot invent commands.
      const found = presets.flatMap((g) => g.items).find((p) => p.command === msg.command);
      if (found) session.pty.write(found.command + (process.platform === 'win32' ? '\r' : '\n'));
    }
  });

  ws.on('close', () => {
    session.clients.delete(ws);
    // Session stays alive for reattachment; it dies with the app (§6).
  });
}

export function killAll() {
  for (const s of sessions.values()) {
    try {
      s.pty.kill();
    } catch {
      /* already gone */
    }
  }
  sessions.clear();
}
