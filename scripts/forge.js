#!/usr/bin/env node
/*
 * Entry point for `npm run forge`.
 * Builds the client on first run (or with --build-only / --rebuild), then
 * supervises the Forge server: it runs as a child process, and an exit with
 * code 75 (requested by the UI's restart button) starts it again — after an
 * update this loads the new server code without touching this window.
 * `--dev` starts the Vite dev server (HMR) alongside.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(rootDir, 'app', 'client');
const distIndex = path.join(clientDir, 'dist', 'index.html');
const serverEntry = path.join(rootDir, 'app', 'server', 'index.js');
const RESTART_EXIT_CODE = 75;

const args = process.argv.slice(2);
const buildOnly = args.includes('--build-only');
const rebuild = args.includes('--rebuild');
const dev = args.includes('--dev');

async function buildClient() {
  console.log('[forge] Building client…');
  const { build } = await import('vite');
  await build({ root: clientDir, logLevel: 'info' });
}

function runServerOnce() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [serverEntry], {
      stdio: 'inherit',
      env: { ...process.env, FORGE_SUPERVISED: '1' },
    });
    child.on('exit', (code) => resolve(code == null ? 0 : code));
  });
}

async function superviseServer() {
  for (;;) {
    const code = await runServerOnce();
    if (code !== RESTART_EXIT_CODE) {
      process.exitCode = code;
      return;
    }
    console.log('[forge] Restarting server…');
  }
}

if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: clientDir });
  await vite.listen();
  vite.printUrls();
  await superviseServer();
} else {
  if (buildOnly || rebuild || !fs.existsSync(distIndex)) await buildClient();
  if (!buildOnly) await superviseServer();
}
