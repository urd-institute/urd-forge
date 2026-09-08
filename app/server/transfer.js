/*
 * Project export/import: a project folder as a zip file, for moving projects
 * between Forge installations (e.g. into a fresh copy of Forge).
 *
 * Export streams `projects/<slug>/` as `<slug>/…` inside the zip. Skipped:
 * `node_modules` (reinstallable), `.forge/` (generated cache) and OS junk.
 * `.git` is included, so history travels with the project.
 *
 * Import extracts a zip into a new `projects/<slug>/`. File creation only —
 * no command execution over HTTP (SPEC-00 §6). Entries are validated
 * (no absolute paths, drive letters or `..`), a shared top-level folder is
 * stripped, and the same folders as on export are skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import yauzl from 'yauzl';
import { ScaffoldError } from './scaffold.js';

// Import limits: the upload itself is capped by the route; these cap what a
// zip may expand to, so a zip bomb cannot fill the disk.
const IMPORT_MAX_ENTRIES = 50000;
const IMPORT_MAX_UNPACKED = 4 * 1024 * 1024 * 1024;
// Names Windows reserves for devices (writing to `CON` hits the console).
const RESERVED_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
const SKIP_DIRS = new Set(['node_modules', '.forge']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

function isSkippedPath(relPosix) {
  const parts = relPosix.split('/');
  if (SKIP_FILES.has(parts[parts.length - 1])) return true;
  return parts.slice(0, -1).some((p) => SKIP_DIRS.has(p));
}

/** Files under `dir`, as [{abs, rel}] with posix-style relative paths. */
function listFiles(dir, rel = '') {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const relPath = rel ? rel + '/' + e.name : e.name;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...listFiles(path.join(dir, e.name), relPath));
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue;
      out.push({ abs: path.join(dir, e.name), rel: relPath });
    }
  }
  return out;
}

export function exportFileName(slug) {
  return `${slug}-forge-export-${new Date().toISOString().slice(0, 10)}.zip`;
}

/** Streams the project as a zip into `res` (an HTTP response). */
export function exportProject(config, slug, res) {
  const dir = path.join(config.projectsDir, slug);
  const files = listFiles(dir);
  const zip = new yazl.ZipFile();
  for (const f of files) zip.addFile(f.abs, slug + '/' + f.rel);
  zip.end();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(slug)}"`);
  zip.outputStream.on('error', (err) => {
    console.warn('[forge] export failed:', err.message);
    res.destroy(err);
  });
  zip.outputStream.pipe(res);
  return files.length;
}

function readEntries(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err) return reject(new ScaffoldError(400, 'Not a valid zip file: ' + err.message));
      const entries = [];
      zipfile.on('error', (e) => reject(new ScaffoldError(400, 'Could not read the zip file: ' + e.message)));
      zipfile.on('entry', (entry) => {
        entries.push(entry);
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve({ zipfile, entries }));
      zipfile.readEntry();
    });
  });
}

function openEntry(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream)));
  });
}

/** Extracts `zipPath` into projects/<slug>/. Resolves with {slug, files}. */
export async function importProject(config, zipPath, { slug }) {
  slug = String(slug || '').trim();
  if (!SLUG_RE.test(slug)) throw new ScaffoldError(400, 'Slug must be 2-50 characters: lowercase letters, digits and hyphens.');
  if (slug.startsWith('_')) throw new ScaffoldError(400, 'This slug is reserved.');
  const dir = path.join(config.projectsDir, slug);
  if (fs.existsSync(dir)) throw new ScaffoldError(409, `A project named "${slug}" already exists.`);

  const { zipfile, entries } = await readEntries(zipPath);
  try {
    // yauzl already rejects absolute paths and `..` segments and normalises
    // backslashes; keep our own guard as well, and decide whether every
    // entry sits inside one top-level folder (the usual shape of a zip).
    let files = entries
      .filter((e) => !e.fileName.endsWith('/'))
      .map((e) => ({ entry: e, rel: e.fileName.replace(/^\/+/, '') }))
      .filter((f) => f.rel && !f.rel.startsWith('__MACOSX/'));
    if (files.length === 0) throw new ScaffoldError(400, 'The zip file contains no files.');

    const tops = new Set(files.map((f) => f.rel.split('/')[0]));
    if (tops.size === 1 && files.every((f) => f.rel.includes('/'))) {
      const prefix = [...tops][0] + '/';
      files = files.map((f) => ({ ...f, rel: f.rel.slice(prefix.length) }));
    }
    files = files.filter((f) => !isSkippedPath(f.rel));
    if (files.length === 0) throw new ScaffoldError(400, 'The zip file contains no project files (only skipped folders).');

    if (files.length > IMPORT_MAX_ENTRIES) {
      throw new ScaffoldError(400, 'The zip file contains too many files (limit ' + IMPORT_MAX_ENTRIES + ').');
    }
    const unpacked = files.reduce((n, f) => n + (f.entry.uncompressedSize || 0), 0);
    if (unpacked > IMPORT_MAX_UNPACKED) {
      throw new ScaffoldError(400, 'The zip file would unpack to more than ' + IMPORT_MAX_UNPACKED / 1024 ** 3 + ' GB.');
    }

    for (const f of files) {
      const segments = f.rel.split('/');
      if (segments.some((s) => s === '' || s === '.' || s === '..') || /^[A-Za-z]:/.test(f.rel)) {
        throw new ScaffoldError(400, 'The zip file contains an unsafe path: ' + f.rel);
      }
      if (segments.some((s) => RESERVED_NAME_RE.test(s) || /[. ]$/.test(s))) {
        throw new ScaffoldError(400, 'The zip file contains a file name Windows cannot store: ' + f.rel);
      }
      const target = path.resolve(dir, ...segments);
      if (target !== dir && !target.startsWith(dir + path.sep)) {
        throw new ScaffoldError(400, 'The zip file contains an unsafe path: ' + f.rel);
      }
      f.target = target;
    }

    fs.mkdirSync(dir, { recursive: true });
    try {
      for (const f of files) {
        fs.mkdirSync(path.dirname(f.target), { recursive: true });
        const stream = await openEntry(zipfile, f.entry);
        await pipeline(stream, fs.createWriteStream(f.target));
      }
    } catch (err) {
      // Never leave a half-imported project behind.
      fs.rmSync(dir, { recursive: true, force: true });
      throw err;
    }
    return { slug, files: files.length, hasReadme: files.some((f) => f.rel === 'README.md') };
  } finally {
    zipfile.close();
  }
}
