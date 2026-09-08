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

// The client is built by Vite, which relies on a platform-specific native
// package (@rolldown/binding-<platform>). npm sometimes skips those optional
// packages (npm/cli#4828), and the resulting error is a raw stack trace from
// deep inside the bundler. Translate it into instructions a new user can act on.
function isMissingNativeBinding(err) {
  const text = String(err && err.message ? err.message : err);
  return /Cannot find native binding/i.test(text)
    || /Cannot find module ['"]?@rolldown\/binding/i.test(text)
    || /Cannot find module ['"]?rolldown-binding/i.test(text);
}

function explainMissingNativeBinding(err) {
  console.error('');
  console.error('  URD Forge could not build the client: the bundler’s native package');
  console.error('  for ' + process.platform + '-' + process.arch + ' is missing from node_modules.');
  console.error('');
  console.error('  This is a known npm bug with optional dependencies (npm/cli#4828),');
  console.error('  not a problem with your Forge download. It usually means an old Node.js');
  console.error('  (you have ' + process.versions.node + '; Forge needs 20.19+ or 22.12+). Fix:');
  console.error('');
  console.error('   1. Install the current LTS from https://nodejs.org (it includes a fixed npm).');
  console.error('   2. Reinstall the dependencies from scratch:');
  console.error('');
  console.error('      rm -rf node_modules package-lock.json     (PowerShell: Remove-Item -Recurse -Force node_modules, package-lock.json)');
  console.error('      npm install');
  console.error('      npm run forge');
  console.error('');
  if (process.arch !== 'x64' && process.arch !== 'arm64') {
    console.error('  Note: you are running a ' + process.arch + ' build of Node.js. The bundler only');
    console.error('  ships x64 and arm64 binaries — install 64-bit Node.js from https://nodejs.org');
    console.error('');
  }
  console.error('  Original error: ' + (err && err.message ? err.message.split('\n')[0] : err));
  console.error('');
}

async function buildClient() {
  console.log('[forge] Building client…');
  try {
    const { build } = await import('vite');
    await build({ root: clientDir, logLevel: 'info' });
  } catch (err) {
    if (!isMissingNativeBinding(err)) throw err;
    explainMissingNativeBinding(err);
    process.exit(1);
  }
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
