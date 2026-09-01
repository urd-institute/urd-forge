/*
 * Dev-server overview. Two sources, both localhost-only:
 *
 *  1. Detected — localhost URLs printed in a project's live terminal session
 *     (dev servers announce themselves: "Local: http://localhost:5173/").
 *  2. Declared — a `servers:` map in forge.config.yaml for servers that are
 *     started outside Forge's terminals.
 *
 * Each candidate port is probed with a plain TCP connect against 127.0.0.1 —
 * no HTTP requests are made and nothing is ever executed.
 */
import net from 'node:net';
import { liveSessions } from './terminal.js';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)/g;
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})/gi;

function probe(port, timeout = 600) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (up) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeout, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function detectedPorts(buffer) {
  const ports = new Set();
  const clean = buffer.replace(ANSI_RE, '');
  for (const match of clean.matchAll(URL_RE)) {
    const port = Number(match[1]);
    if (port > 0 && port < 65536) ports.add(port);
  }
  return ports;
}

function declaredFor(config, slug) {
  const list = Array.isArray(config.servers[slug]) ? config.servers[slug] : [];
  const out = [];
  for (const entry of list) {
    const url = typeof entry === 'string' ? entry : entry && typeof entry.url === 'string' ? entry.url : null;
    if (!url) continue;
    let port = null;
    try {
      const parsed = new URL(url);
      port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
    } catch {
      continue;
    }
    out.push({ url, port, label: entry && entry.label ? String(entry.label) : null });
  }
  return out;
}

/** All known dev servers with liveness: [{slug, url, port, label, source, up, tabId?, tab?}]. */
export async function listServers(config, store) {
  const candidates = [];
  const seen = new Set(); // `${slug}:${port}`

  for (const slug of store.projects.keys()) {
    for (const entry of declaredFor(config, slug)) {
      if (seen.has(slug + ':' + entry.port)) continue;
      seen.add(slug + ':' + entry.port);
      candidates.push({ slug, ...entry, source: 'declared' });
    }
  }

  for (const { slug, tabId, title, buffer } of liveSessions()) {
    if (!store.get(slug)) continue;
    for (const port of detectedPorts(buffer)) {
      if (port === config.port) continue; // Forge itself
      if (seen.has(slug + ':' + port)) continue;
      seen.add(slug + ':' + port);
      // tabId/tab let the overview link straight to the terminal tab (SPEC-03).
      candidates.push({ slug, url: 'http://localhost:' + port, port, label: null, source: 'detected', tabId, tab: title || null });
    }
  }

  const results = await Promise.all(candidates.map((c) => probe(c.port)));
  return candidates
    .map((c, i) => ({ ...c, up: results[i] }))
    .sort((a, b) => (a.slug === b.slug ? a.port - b.port : a.slug < b.slug ? -1 : 1));
}
