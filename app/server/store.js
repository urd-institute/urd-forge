/*
 * Project store: scans /projects, parses the Forge format per project and
 * keeps the result in memory. Derived state is mirrored to
 * <project>/.forge/status.json — Forge never writes to the project files
 * themselves (SPEC-00 §7).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  parsePhases,
  parseChangelog,
  parseHeadingLog,
  firstParagraph,
  projectName,
} from '@urd/reader-core';
import { parseSpec } from './parser.js';
import { LocalState } from './state.js';
import { installForgeCommand } from './scaffold.js';

const IGNORED_DIRS = new Set(['.forge', '.git', 'node_modules', '.claude']);

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function walkFiles(dir, base, out, depth = 0) {
  if (depth > 8) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.isDirectory()) continue;
    if (IGNORED_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) {
      walkFiles(full, rel, out, depth + 1);
    } else if (e.isFile()) {
      try {
        const st = fs.statSync(full);
        out.push({ path: rel, mtime: st.mtimeMs, size: st.size });
      } catch {
        /* file vanished mid-scan */
      }
    }
  }
  return out;
}

export function parseProject(projectsDir, slug) {
  const dir = path.join(projectsDir, slug);
  const read = (name) => readIfExists(path.join(dir, name));

  const readme = read('README.md');
  const concept = read('CONCEPT.md');
  const docs = read('DOCS.md');
  const roadmapText = read('ROADMAP.md');

  const specsDir = path.join(dir, 'specs');
  const specs = [];
  let specFiles = [];
  try {
    specFiles = fs.readdirSync(specsDir).filter((f) => f.toLowerCase().endsWith('.md'));
  } catch {
    /* no specs dir */
  }
  for (const file of specFiles.sort()) {
    const text = readIfExists(path.join(specsDir, file));
    if (text == null) continue;
    try {
      specs.push(parseSpec(text, file));
    } catch (err) {
      specs.push({ file, id: null, title: file, status: 'unknown', dependsOn: [], blocks: [], topics: [], excerpt: null, parseError: 'Could not be parsed: ' + err.message });
    }
  }

  const files = walkFiles(dir, '', []).sort((a, b) => b.mtime - a.mtime);

  const project = {
    slug,
    name: projectName(readme, slug),
    summary: (readme && firstParagraph(readme)) || (concept && firstParagraph(concept)) || null,
    hasReadme: readme != null,
    hasConcept: concept != null,
    hasDocs: docs != null,
    hasRoadmap: roadmapText != null,
    hasDesign: readIfExists(path.join(dir, 'DESIGN.md')) != null,
    // Whether the project has the /forge Claude Code command (SPEC-02 §4).
    hasForgeCommand: fs.existsSync(path.join(dir, '.claude', 'commands', 'forge.md')),
    roadmap: roadmapText != null ? safeParse(() => parsePhases(roadmapText), 'ROADMAP.md') : null,
    specs,
    changelog: concept != null ? safeParse(() => parseChangelog(concept), 'CONCEPT.md', []) : [],
    adrs: docs != null ? safeParse(() => parseHeadingLog(docs, 'ADR'), 'DOCS.md', []) : [],
    recentFiles: files.slice(0, 10),
    fileCount: files.length,
    updatedAt: files.length ? files[0].mtime : null,
  };
  project.progress = project.roadmap && project.roadmap.pct != null ? project.roadmap.pct : null;
  project.openSpecs = specs.filter((s) => s.status !== 'done' && s.status !== 'superseded');
  return project;
}

function safeParse(fn, source, fallback) {
  try {
    return fn();
  } catch (err) {
    console.warn(`[forge] ${source} could not be parsed:`, err.message);
    if (fallback !== undefined) return fallback;
    return { parseError: 'Could not be parsed: ' + err.message };
  }
}

export class Store {
  constructor(config) {
    this.config = config;
    this.projects = new Map();
    this.localState = new LocalState(config.rootDir);
  }

  listSlugs() {
    try {
      return fs
        .readdirSync(this.config.projectsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !IGNORED_DIRS.has(e.name))
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  scanAll() {
    const slugs = this.listSlugs();
    const seen = new Set(slugs);
    for (const slug of slugs) this.refresh(slug, { writeCache: false });
    for (const slug of [...this.projects.keys()]) {
      if (!seen.has(slug)) this.projects.delete(slug);
    }
    return this.list();
  }

  refresh(slug, { writeCache = true } = {}) {
    const dir = path.join(this.config.projectsDir, slug);
    if (!fs.existsSync(dir)) {
      this.projects.delete(slug);
      return null;
    }
    this.ensureForgeCommand(slug);
    const project = parseProject(this.config.projectsDir, slug);
    this.projects.set(slug, project);
    if (writeCache) this.writeCache(project);
    return project;
  }

  /**
   * Every project gets the /forge Claude Code command (SPEC-02 §4.3) — not
   * just the ones scaffolded by Forge. `.claude/` is gitignored, so the
   * command can neither ship in `_template` nor arrive with an update; the
   * scan installs it wherever it is missing. Pure file creation, never an
   * overwrite (ADR-021). `_template` stays untouched so the shipped template
   * folder holds only tracked files.
   */
  ensureForgeCommand(slug) {
    if (slug === '_template') return;
    const dest = path.join(this.config.projectsDir, slug, '.claude', 'commands', 'forge.md');
    if (fs.existsSync(dest)) return;
    try {
      installForgeCommand(this.config, slug);
      console.log(`[forge] Installed /forge command in projects/${slug}`);
    } catch (err) {
      console.warn(`[forge] Could not install /forge in projects/${slug}:`, err.message);
    }
  }

  writeCache(project) {
    // Derived status lives in .forge/ — generated, never hand-edited (SPEC-00 §4).
    try {
      const forgeDir = path.join(this.config.projectsDir, project.slug, '.forge');
      fs.mkdirSync(forgeDir, { recursive: true });
      fs.writeFileSync(
        path.join(forgeDir, 'status.json'),
        JSON.stringify(
          {
            generatedBy: 'urd-forge',
            note: 'Generated cache — do not edit by hand.',
            generatedAt: new Date().toISOString(),
            slug: project.slug,
            name: project.name,
            progress: project.progress,
            specs: project.specs.map(({ id, status, file }) => ({ id, status, file })),
          },
          null,
          2
        )
      );
    } catch (err) {
      console.warn('[forge] Could not write .forge cache for', project.slug, '-', err.message);
    }
  }

  get(slug) {
    return this.projects.get(slug) || null;
  }

  /** Pinned projects first (each group alphabetical by slug). */
  list() {
    const state = this.localState;
    return [...this.projects.values()]
      .sort((a, b) => {
        const pin = Number(state.isPinned(b.slug)) - Number(state.isPinned(a.slug));
        return pin || a.slug.localeCompare(b.slug);
      })
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        summary: p.summary,
        progress: p.progress,
        specCount: p.specs.length,
        openSpecCount: p.openSpecs.length,
        updatedAt: p.updatedAt,
        archived: state.isArchived(p.slug),
        pinned: state.isPinned(p.slug),
      }));
  }

  /** Resolve a project-relative file path, refusing traversal outside the project. */
  resolveFile(slug, relPath) {
    const projectDir = path.resolve(this.config.projectsDir, slug);
    const resolved = path.resolve(projectDir, relPath);
    if (resolved !== projectDir && !resolved.startsWith(projectDir + path.sep)) return null;
    return resolved;
  }
}
