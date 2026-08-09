/*
 * `## Changelog` section → timeline entries (list items and ### headings).
 * `- 2026-08-09 — text` items get the date split off as the label; wrapped
 * continuation lines attach to the previous entry.
 */
const H2_RE = /^##\s+(?!#)(.+?)\s*$/;

export function parseChangelog(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h2 = line.match(H2_RE);
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
      const dated = item[1].match(/^(\d{4}-\d{2}-\d{2})\s*[·—:-]*\s*(.*)$/);
      if (dated) entries.push({ label: dated[1], text: dated[2], line: i + 1, fromItem: true });
      else if (entries.length && entries[entries.length - 1].text === '' && !entries[entries.length - 1].fromItem) {
        entries[entries.length - 1].text = item[1];
      } else {
        entries.push({ label: null, text: item[1], line: i + 1, fromItem: true });
      }
      continue;
    }
    if (entries.length && line.trim() !== '') {
      const last = entries[entries.length - 1];
      last.text = (last.text ? last.text + ' ' : '') + line.trim();
    }
  }
  return entries;
}
