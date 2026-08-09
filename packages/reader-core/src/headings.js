/*
 * Prefixed heading logs: `### <PREFIX>-…` headings with the text below as an
 * excerpt. Forge reads the ADR log in DOCS.md with this; TAFL reuses the
 * format in DECISIONS.md.
 */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Text → [{ id, title, line, excerpt }] for `### PREFIX-…` headings. */
export function parseHeadingLog(text, prefix = 'ADR') {
  const headingRe = new RegExp('^###\\s+(' + escapeRe(prefix) + '-[A-Za-z0-9._-]+)\\s*[·—:–-]*\\s*(.*)$');
  const lines = text.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headingRe);
    if (!m) continue;
    const bodyLines = [];
    for (let j = i + 1; j < lines.length && !/^#{1,3}\s/.test(lines[j]); j++) {
      bodyLines.push(lines[j]);
    }
    entries.push({
      id: m[1],
      title: m[2] || m[1],
      line: i + 1,
      excerpt: bodyLines.join('\n').trim().slice(0, 400),
    });
  }
  return entries;
}
