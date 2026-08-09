#!/usr/bin/env node
/*
 * Runs as npm "preinstall". Fails early with a human-readable message when the
 * Node.js version is too old, instead of letting native module builds explode
 * with a raw compiler error (SPEC-00 §8a).
 */
const REQUIRED_MAJOR = 20;
const major = Number.parseInt(process.versions.node.split('.')[0], 10);

if (major < REQUIRED_MAJOR) {
  console.error('');
  console.error('  URD Forge requires Node.js ' + REQUIRED_MAJOR + ' (LTS) or newer.');
  console.error('  You are running Node.js ' + process.versions.node + '.');
  console.error('');
  console.error('  Fix: install the current LTS from https://nodejs.org');
  console.error('       (or with a version manager: `nvm install --lts`)');
  console.error('  Then run `npm install` again.');
  console.error('');
  process.exit(1);
}
