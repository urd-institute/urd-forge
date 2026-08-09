/*
 * Free-text search across unit folders under a root. Naive line scan — the
 * files are the database, and tens of units of markdown need no index.
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TEXT_EXT = [
  '.md', '.txt', '.yaml', '.yml', '.json', '.js', '.mjs', '.cjs', '.ts',
  '.tsx', '.jsx', '.css', '.html', '.sh', '.ps1', '.py', '.toml', '.csv',
];
const DEFAULT_IGNORED = ['.git', 'node_modules'];

function* walk(dir, ignored, textExt, maxDepth, base = '', depth = 0) {
  if (depth > maxDepth) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (ignored.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) yield* walk(full, ignored, textExt, maxDepth, rel, depth + 1);
    else if (e.isFile() && textExt.has(path.extname(e.name).toLowerCase())) yield { full, rel };
  }
}

/**
 * → { query, results: [{ unit, file, matches: [{ line, text }] }], truncated }
 * options: unit (restrict to one), textExtensions, ignoredDirs, maxFileSize,
 * maxResults, maxDepth, maxMatchesPerFile.
 */
export function searchUnits(rootDir, query, options = {}) {
  const {
    unit = null,
    textExtensions = DEFAULT_TEXT_EXT,
    ignoredDirs = DEFAULT_IGNORED,
    maxFileSize = 1024 * 1024,
    maxResults = 200,
    maxDepth = 8,
    maxMatchesPerFile = 5,
  } = options;

  const q = query.trim().toLowerCase();
  if (!q) return { query, results: [], truncated: false };

  const textExt = new Set(textExtensions.map((e) => e.toLowerCase()));
  const ignored = new Set(ignoredDirs);

  let slugs = [];
  try {
    slugs = fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  } catch {
    /* no root dir */
  }
  if (unit) slugs = slugs.filter((s) => s === unit);

  const results = [];
  let truncated = false;

  outer: for (const slug of slugs) {
    for (const { full, rel } of walk(path.join(rootDir, slug), ignored, textExt, maxDepth)) {
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.size > maxFileSize) continue;
      let text;
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (!text.toLowerCase().includes(q)) continue;
      const lines = text.split(/\r?\n/);
      const matches = [];
      for (let i = 0; i < lines.length && matches.length < maxMatchesPerFile; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          matches.push({ line: i + 1, text: lines[i].trim().slice(0, 240) });
        }
      }
      results.push({ unit: slug, file: rel, matches });
      if (results.length >= maxResults) {
        truncated = true;
        break outer;
      }
    }
  }
  return { query, results, truncated };
}
