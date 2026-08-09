/*
 * Pure text parsers for the Forge format (SPEC-00 §4).
 * All parsers are tolerant: hand-written deviations produce a `parseError`
 * note instead of throwing (SPEC-00 §8).
 */
import YAML from 'yaml';

const CHECKBOX_RE = /^\s*[-*]\s*\[([ xX])\]\s+(.*)$/;
const PHASE_RE = /^##\s+(?!#)(.+?)\s*$/;

/** ROADMAP.md → phases with checkbox progress. */
export function parseRoadmap(text) {
  const phases = [];
  let current = null;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const phase = line.match(PHASE_RE);
    if (phase) {
      current = { title: phase[1], items: [], line: i + 1 };
      phases.push(current);
      return;
    }
    const box = line.match(CHECKBOX_RE);
    if (box) {
      if (!current) {
        current = { title: null, items: [], line: i + 1 };
        phases.push(current);
      }
      current.items.push({ text: box[2].trim(), done: box[1] !== ' ', line: i + 1 });
    }
  });

  const withItems = phases.filter((p) => p.items.length > 0);
  for (const p of withItems) {
    p.total = p.items.length;
    p.done = p.items.filter((it) => it.done).length;
    p.pct = Math.round((p.done / p.total) * 100);
  }
  const total = withItems.reduce((n, p) => n + p.total, 0);
  const done = withItems.reduce((n, p) => n + p.done, 0);
  return {
    phases: withItems,
    total,
    done,
    pct: total > 0 ? Math.round((done / total) * 100) : null,
    parseError: total === 0 ? 'No checklist items found — nothing to compute progress from.' : null,
  };
}

const SPEC_STATUSES = ['draft', 'approved', 'in-progress', 'done'];

function asList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** specs/*.md → card for the spec board. YAML frontmatter preferred; falls
 *  back to scanning the first lines for `id:` / `status:` (tolerance). */
export function parseSpec(text, filename) {
  const spec = {
    file: filename,
    id: null,
    title: null,
    status: 'unknown',
    dependsOn: [],
    blocks: [],
    parseError: null,
  };

  let body = text;
  const fm = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fm) {
    body = text.slice(fm[0].length);
    try {
      const meta = YAML.parse(fm[1]) || {};
      spec.id = meta.id != null ? String(meta.id) : null;
      spec.title = meta.titel || meta.title || null;
      if (meta.status != null) spec.status = String(meta.status).toLowerCase();
      spec.dependsOn = asList(meta.afhaenger_af ?? meta.depends_on ?? meta.dependsOn);
      spec.blocks = asList(meta.blokkerer ?? meta.blocks);
    } catch (err) {
      spec.parseError = 'Frontmatter could not be parsed: ' + err.message;
    }
  } else {
    // Tolerant fallback: metadata line like `*id: SPEC-00 · status: approved …*`
    const head = text.split(/\r?\n/).slice(0, 12).join('\n');
    const id = head.match(/\bid:\s*([A-Za-z0-9._-]+)/i);
    const status = head.match(/\bstatus:\s*([a-z-]+)/i);
    if (id) spec.id = id[1];
    if (status) spec.status = status[1].toLowerCase();
    if (!id && !status) spec.parseError = 'No YAML frontmatter found.';
  }

  if (!spec.title) {
    const h1 = body.match(/^#\s+(?!#)(.+?)\s*$/m);
    if (h1) spec.title = h1[1];
  }
  if (!spec.id) {
    const fromName = filename.match(/^(SPEC-[A-Za-z0-9._-]+?)(?:-|\.md$)/i);
    if (fromName) spec.id = fromName[1].toUpperCase();
  }
  if (!SPEC_STATUSES.includes(spec.status)) {
    if (spec.status !== 'unknown' && !spec.parseError) {
      spec.parseError = `Unknown status "${spec.status}".`;
    }
    spec.status = SPEC_STATUSES.includes(spec.status) ? spec.status : 'unknown';
  }
  return spec;
}

/** CONCEPT.md → `## Changelog` section as a timeline (list items and ### headings). */
export function parseChangelog(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h2 = line.match(PHASE_RE);
    if (h2) {
      inSection = /^changelog\b/i.test(h2[1].trim());
      continue;
    }
    if (!inSection) continue;
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      entries.push({ label: h3[1], text: '', line: i + 1 });
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (item) {
      // `- 2026-08-09 — text` style: split a leading date off as the label.
      const dated = item[1].match(/^(\d{4}-\d{2}-\d{2})\s*[·—:-]*\s*(.*)$/);
      if (dated) entries.push({ label: dated[1], text: dated[2], line: i + 1, fromItem: true });
      else if (entries.length && entries[entries.length - 1].text === '' && !entries[entries.length - 1].fromItem) {
        entries[entries.length - 1].text = item[1];
      } else {
        entries.push({ label: null, text: item[1], line: i + 1, fromItem: true });
      }
      continue;
    }
    // Wrapped continuation lines belong to the previous entry.
    if (entries.length && line.trim() !== '') {
      const last = entries[entries.length - 1];
      last.text = (last.text ? last.text + ' ' : '') + line.trim();
    }
  }
  return entries;
}

/** DOCS.md → `### ADR-…` headings as a decision log. */
export function parseAdrs(text) {
  const lines = text.split(/\r?\n/);
  const adrs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+(ADR-[A-Za-z0-9._-]+)\s*[·—:–-]*\s*(.*)$/);
    if (!m) continue;
    const bodyLines = [];
    for (let j = i + 1; j < lines.length && !/^#{1,3}\s/.test(lines[j]); j++) {
      bodyLines.push(lines[j]);
    }
    adrs.push({
      id: m[1],
      title: m[2] || m[1],
      line: i + 1,
      excerpt: bodyLines.join('\n').trim().slice(0, 400),
    });
  }
  return adrs;
}

/** README.md / CONCEPT.md → first real paragraph, used as a summary. */
export function firstParagraph(text) {
  const blocks = text
    .replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const t = block.trim();
    if (!t || /^#/.test(t) || /^[-*]\s*\[/.test(t) || /^```/.test(t) || /^\*[^*]+\*$/.test(t)) continue;
    return t.replace(/\r?\n/g, ' ').slice(0, 500);
  }
  return null;
}

/** README.md → first `# heading` as the project display name. */
export function projectName(readmeText, fallback) {
  const h1 = readmeText && readmeText.match(/^#\s+(?!#)(.+?)\s*$/m);
  return h1 ? h1[1] : fallback;
}
