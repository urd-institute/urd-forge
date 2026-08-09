#!/usr/bin/env node
/*
 * Entry point for `npm run forge`.
 * Builds the client on first run (or with --build-only / --rebuild), then
 * starts the Forge server. `--dev` starts the Vite dev server (HMR) alongside
 * the Forge server.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(rootDir, 'app', 'client');
const distIndex = path.join(clientDir, 'dist', 'index.html');

const args = process.argv.slice(2);
const buildOnly = args.includes('--build-only');
const rebuild = args.includes('--rebuild');
const dev = args.includes('--dev');

async function buildClient() {
  console.log('[forge] Building client…');
  const { build } = await import('vite');
  await build({ root: clientDir, logLevel: 'info' });
}

if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: clientDir });
  await vite.listen();
  vite.printUrls();
  await import('../app/server/index.js');
} else {
  if (buildOnly || rebuild || !fs.existsSync(distIndex)) await buildClient();
  if (!buildOnly) await import('../app/server/index.js');
}
