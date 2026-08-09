/*
 * Forge-taxonomy parsing (SPEC-00 §4). The generic machinery — frontmatter,
 * checkbox phases, heading logs, changelog, summaries — lives in
 * @urd/reader-core (SPEC-01); this file holds only what is Forge-specific:
 * specs/*.md with the Forge statuses and keys. Tolerant like the rest:
 * deviations produce a `parseError` note instead of throwing (SPEC-00 §8).
 */
import { splitFrontmatter } from '@urd/reader-core';

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

  const fm = splitFrontmatter(text);
  const body = fm.body;
  if (fm.found) {
    if (fm.error) {
      spec.parseError = 'Frontmatter could not be parsed: ' + fm.error;
    } else {
      const meta = fm.meta;
      spec.id = meta.id != null ? String(meta.id) : null;
      spec.title = meta.titel || meta.title || null;
      if (meta.status != null) spec.status = String(meta.status).toLowerCase();
      spec.dependsOn = asList(meta.afhaenger_af ?? meta.depends_on ?? meta.dependsOn);
      spec.blocks = asList(meta.blokkerer ?? meta.blocks);
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
