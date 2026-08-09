/*
 * Checkbox documents: `##` headings as phases, `- [ ]` / `- [x]` items as
 * steps → progress per phase and overall. Forge reads ROADMAP.md with this;
 * TAFL reads PLAN.md. Tolerant: no items yields a `parseError` note, never
 * an exception.
 */
const CHECKBOX_RE = /^\s*[-*]\s*\[([ xX])\]\s+(.*)$/;
const PHASE_RE = /^##\s+(?!#)(.+?)\s*$/;

/** Text → { phases, total, done, pct, parseError }. */
export function parsePhases(text) {
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
