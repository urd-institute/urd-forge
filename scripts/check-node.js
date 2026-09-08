#!/usr/bin/env node
/*
 * Runs as npm "preinstall". Fails early with a human-readable message when the
 * Node.js version is too old, instead of letting native module builds explode
 * with a raw compiler error (SPEC-00 §8a).
 */
// Node 20.19 or 22.12+: what the build tooling (Vite 8) needs.
const REQUIRED = [20, 19];
const [major, minor] = process.versions.node.split('.').map((n) => Number.parseInt(n, 10));

if (major < REQUIRED[0] || (major === REQUIRED[0] && minor < REQUIRED[1])) {
  console.error('');
  console.error('  URD Forge requires Node.js ' + REQUIRED.join('.') + ' (LTS) or newer.');
  console.error('  You are running Node.js ' + process.versions.node + '.');
  console.error('');
  console.error('  Fix: install the current LTS from https://nodejs.org');
  console.error('       (or with a version manager: `nvm install --lts`)');
  console.error('  Then run `npm install` again.');
  console.error('');
  process.exit(1);
}
