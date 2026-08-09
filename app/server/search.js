/*
 * Free-text search across all project files (SPEC-00 §5.5).
 * Naive line scan — the files are the database, and v1 scale (tens of
 * projects, markdown files) does not need an index.
 */
import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXT = new Set([
  '.md', '.txt', '.yaml', '.yml', '.json', '.js', '.mjs', '.cjs', '.ts',
  '.tsx', '.jsx', '.css', '.html', '.sh', '.ps1', '.py', '.toml', '.csv',
]);
const IGNORED_DIRS = new Set(['.forge', '.git', 'node_modules', '.claude']);
const MAX_FILE_SIZE = 1024 * 1024;
const MAX_RESULTS = 200;

function* walk(dir, base = '', depth = 0) {
  if (depth > 8) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (IGNORED_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) yield* walk(full, rel, depth + 1);
    else if (e.isFile() && TEXT_EXT.has(path.extname(e.name).toLowerCase())) yield { full, rel };
  }
}

export function search(config, query, { project = null } = {}) {
  const q = query.trim().toLowerCase();
  if (!q) return { query, results: [], truncated: false };

  let slugs = [];
  try {
    slugs = fs
      .readdirSync(config.projectsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  } catch {
    /* no projects dir */
  }
  if (project) slugs = slugs.filter((s) => s === project);

  const results = [];
  let truncated = false;

  outer: for (const slug of slugs) {
    for (const { full, rel } of walk(path.join(config.projectsDir, slug))) {
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_SIZE) continue;
      let text;
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (!text.toLowerCase().includes(q)) continue;
      const lines = text.split(/\r?\n/);
      const matches = [];
      for (let i = 0; i < lines.length && matches.length < 5; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          matches.push({ line: i + 1, text: lines[i].trim().slice(0, 240) });
        }
      }
      results.push({ project: slug, file: rel, matches });
      if (results.length >= MAX_RESULTS) {
        truncated = true;
        break outer;
      }
    }
  }
  return { query, results, truncated };
}
