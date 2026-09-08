#!/usr/bin/env node
/*
 * Runs as npm "preinstall". Fails early with a human-readable message when the
 * Node.js version is too old, instead of letting native module builds explode
 * with a raw compiler error (SPEC-00 §8a).
 */
// What the build tooling (Vite 8 / rolldown) declares: ^20.19.0 || >=22.12.0.
// Node 21.x and 22.0–22.11 are NOT supported, even though they are "newer"
// than 20.19 — a plain "at least 20.19" check let Node 22.2.0 through, and its
// bundled npm 10.8 then skipped the bundler's native package (npm/cli#4828).
const [major, minor] = process.versions.node.split('.').map((n) => Number.parseInt(n, 10));

const supported =
  (major === 20 && minor >= 19) ||
  (major === 22 && minor >= 12) ||
  major >= 23;

if (!supported) {
  console.error('');
  console.error('  URD Forge requires Node.js 20.19+ (LTS) or 22.12+.');
  console.error('  You are running Node.js ' + process.versions.node + ', which the build tooling');
  console.error('  (Vite 8) does not support.');
  console.error('');
  console.error('  Fix: install the current LTS from https://nodejs.org');
  console.error('       (or with a version manager: `nvm install --lts`)');
  console.error('  Then run `npm install` again.');
  console.error('');
  process.exit(1);
}
