/*
 * Spec-board filter, server side (SPEC-02 §3). The client filters the card
 * fields (id, title, topics, dependencies) instantly on its own; this module
 * answers the free-text part that needs the spec bodies, which are not part
 * of the project response. Read-only, like the rest of the reader.
 */
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter } from '@urd/reader-core';
import { parseSpec } from './parser.js';

const SNIPPET_LEN = 120;

/** Split a query into lower-cased words. `#word` restricts to topics. */
export function queryWords(q) {
  return String(q || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.startsWith('#') ? { word: w.slice(1), topicOnly: true } : { word: w, topicOnly: false }))
    .filter((w) => w.word);
}

/** Field text a spec card is matched against (mirrors the client). */
export function specFieldText(spec) {
  return [spec.id, spec.title, spec.file, ...spec.dependsOn, ...spec.blocks].filter(Boolean).join('\n').toLowerCase();
}

function snippetAround(line, word) {
  const trimmed = line.trim().replace(/^#+\s*/, '').replace(/^[-*]\s+(\[[ xX]\]\s*)?/, '');
  const idx = trimmed.toLowerCase().indexOf(word);
  if (trimmed.length <= SNIPPET_LEN) return trimmed;
  const start = Math.max(0, Math.min(idx - 40, trimmed.length - SNIPPET_LEN));
  const end = Math.min(trimmed.length, start + SNIPPET_LEN);
  return (start > 0 ? '…' : '') + trimmed.slice(start, end) + (end < trimmed.length ? '…' : '');
}

/**
 * Specs in the project whose fields or body contain every word of `q`.
 * Returns [{ file, snippet }]; `snippet` is the first body line hit by a word
 * that the card fields do not already show (null when the fields cover it).
 */
export function filterSpecs(config, projectSlug, q) {
  const words = queryWords(q);
  if (!words.length) return [];
  const specsDir = path.join(config.projectsDir, projectSlug, 'specs');
  let files = [];
  try {
    files = fs.readdirSync(specsDir).filter((f) => f.toLowerCase().endsWith('.md')).sort();
  } catch {
    return [];
  }

  const matches = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(specsDir, file), 'utf8');
    } catch {
      continue;
    }
    let spec;
    try {
      spec = parseSpec(text, file);
    } catch {
      spec = { id: null, title: file, file, dependsOn: [], blocks: [], topics: [] };
    }
    const fields = specFieldText(spec);
    const topics = spec.topics || [];
    const bodyLines = splitFrontmatter(text).body.split(/\r?\n/);
    const bodyLower = bodyLines.map((l) => l.toLowerCase());

    let ok = true;
    let snippet = null;
    for (const { word, topicOnly } of words) {
      if (topicOnly) {
        if (!topics.some((t) => t.includes(word))) {
          ok = false;
          break;
        }
        continue;
      }
      if (fields.includes(word) || topics.some((t) => t.includes(word))) continue;
      const at = bodyLower.findIndex((l) => l.includes(word));
      if (at < 0) {
        ok = false;
        break;
      }
      if (snippet == null) snippet = snippetAround(bodyLines[at], word);
    }
    if (ok) matches.push({ file, snippet });
  }
  return matches;
}
