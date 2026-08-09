/*
 * New-project scaffolding (created from the UI).
 * Forge only creates the document structure — from the _template project if
 * one exists, else a minimal built-in skeleton. The actual content is written
 * by a Claude Code session in the project's terminal, driven by the brief
 * Forge leaves in .forge/brief.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
const TEMPLATE_FILES = ['CLAUDE.md', 'CONCEPT.md', 'ROADMAP.md', 'DOCS.md', 'DESIGN.md'];

export class ScaffoldError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function fillPlaceholders(text, name, slug) {
  return text
    .replaceAll('<Project name>', name)
    .replaceAll('<project name>', name)
    .replaceAll('<project-slug>', slug);
}

export function scaffoldProject(config, { name, slug, description }) {
  name = String(name || '').trim();
  slug = String(slug || '').trim();
  description = String(description || '').trim();

  if (!name || name.length > 100) throw new ScaffoldError(400, 'Project name is required (max 100 characters).');
  if (!SLUG_RE.test(slug)) throw new ScaffoldError(400, 'Slug must be 2-50 characters: lowercase letters, digits and hyphens.');
  if (slug.startsWith('_') || slug === 'urd-forge') throw new ScaffoldError(400, 'This slug is reserved.');
  if (!description) throw new ScaffoldError(400, 'A project description is required — Claude Code drafts the documents from it.');
  if (description.length > 10000) throw new ScaffoldError(400, 'Description too long (max 10,000 characters).');

  const dir = path.join(config.projectsDir, slug);
  if (fs.existsSync(dir)) throw new ScaffoldError(409, `A project named "${slug}" already exists.`);

  const templateDir = path.join(config.projectsDir, '_template');
  fs.mkdirSync(path.join(dir, 'specs'), { recursive: true });

  // README is always written fresh so the project shows its real name and
  // summary in Forge immediately.
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    `# ${name}\n\n${description}\n\n*(Just scaffolded — a Claude Code session drafts the full documents from` +
      ` \`.forge/brief.md\`. This README will be rewritten as part of that.)*\n`
  );

  for (const file of TEMPLATE_FILES) {
    const src = path.join(templateDir, file);
    let content = null;
    if (fs.existsSync(src)) {
      content = fillPlaceholders(fs.readFileSync(src, 'utf8'), name, slug);
    } else if (file === 'CLAUDE.md') {
      // No _template project — fall back to the installation-level template.
      const fallback = path.join(config.rootDir, 'templates', 'CLAUDE.md');
      if (fs.existsSync(fallback)) content = fillPlaceholders(fs.readFileSync(fallback, 'utf8'), name, slug);
    }
    if (content != null) fs.writeFileSync(path.join(dir, file), content);
  }

  const forgeDir = path.join(dir, '.forge');
  fs.mkdirSync(forgeDir, { recursive: true });
  fs.writeFileSync(
    path.join(forgeDir, 'brief.md'),
    `# Project brief — ${name}

This project was just scaffolded in the Forge format. Turn this brief into the
initial project documents.

## The idea (written by the project owner)

${description}

## What to do now

1. Read CLAUDE.md — it defines the Forge format this project must follow.
2. Rewrite README.md so it properly introduces the project.
3. Write CONCEPT.md: the canonical concept based on the idea above, ending
   with a \`## Changelog\` section containing today's first entry.
4. Write ROADMAP.md: 2-4 phases (\`## Fase N — name\` or \`## Phase N — name\`)
   with concrete checkbox steps. Leave every box unchecked.
5. Draft the first spec(s) in specs/ as SPEC-01-<area>.md (YAML frontmatter,
   \`status: draft\`). One spec per area; start with the most foundational.
6. Record any initial decisions in DOCS.md as \`### ADR-001 — title\` entries.
7. Keep DESIGN.md only if the project needs design tokens; otherwise delete it.

Write the documents in the same language as the idea above. When you are done,
summarise what you created and ask the owner to review the draft concept.
`
  );

  return { slug, name };
}

function slugifyArea(s) {
  return String(s || '')
    .toLowerCase()
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'oe')
    .replaceAll('å', 'aa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Import a spec written elsewhere (e.g. drafted by Claude) into an existing
 * project. Forge normalises the mechanical parts — id numbering, frontmatter,
 * filename — and leaves the content untouched.
 */
export function importSpec(config, projectSlug, { content, area }) {
  content = String(content || '').replace(/^﻿/, '');
  if (!content.trim()) throw new ScaffoldError(400, 'Spec content is required — paste the markdown or choose a file.');
  if (content.length > 200_000) throw new ScaffoldError(400, 'Spec too large (max 200 KB).');

  const projectDir = path.join(config.projectsDir, projectSlug);
  if (!fs.existsSync(projectDir)) throw new ScaffoldError(404, 'Unknown project.');
  const specsDir = path.join(projectDir, 'specs');
  fs.mkdirSync(specsDir, { recursive: true });

  // Existing spec numbers, from ids in frontmatter and from filenames.
  const taken = new Set();
  for (const f of fs.readdirSync(specsDir)) {
    const m = f.match(/SPEC-(\d+)/i);
    if (m) taken.add(Number(m[1]));
  }

  // Split off frontmatter (if any) and read what the spec says about itself.
  let meta = {};
  let body = content;
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fm) {
    try {
      meta = YAML.parse(fm[1]) || {};
    } catch {
      throw new ScaffoldError(400, 'The frontmatter in the pasted spec could not be parsed as YAML.');
    }
    body = content.slice(fm[0].length);
  }

  const h1 = body.match(/^#\s+(?!#)(.+?)\s*$/m);
  const title = meta.titel || meta.title || (h1 && h1[1].replace(/^SPEC-\S+\s*[·—:-]*\s*/i, '')) || area || 'Imported spec';

  // Keep the spec's own id if it has a free number; otherwise assign the next.
  let num = null;
  const ownId = String(meta.id || '').match(/^SPEC-(\d+)$/i);
  let reassigned = false;
  if (ownId && !taken.has(Number(ownId[1]))) {
    num = Number(ownId[1]);
  } else {
    num = taken.size ? Math.max(...taken) + 1 : 1;
    reassigned = Boolean(ownId);
  }
  const id = 'SPEC-' + String(num).padStart(2, '0');

  meta.id = id;
  if (!meta.titel && !meta.title) meta.titel = title;
  if (!meta.status) meta.status = 'draft';
  if (meta.afhaenger_af == null && meta.depends_on == null && meta.dependsOn == null) meta.afhaenger_af = [];
  if (meta.blokkerer == null && meta.blocks == null) meta.blokkerer = [];

  const areaSlug = slugifyArea(area) || slugifyArea(title) || 'spec';
  let file = `${id}-${areaSlug}.md`;
  let n = 2;
  while (fs.existsSync(path.join(specsDir, file))) file = `${id}-${areaSlug}-${n++}.md`;

  const text = '---\n' + YAML.stringify(meta).trimEnd() + '\n---\n\n' + body.replace(/^\s+/, '');
  fs.writeFileSync(path.join(specsDir, file), text);

  return { file, id, title: meta.titel || meta.title, reassigned };
}
