/*
 * Tolerant YAML frontmatter handling. Hand-written deviations never throw —
 * a broken block yields an `error` string and an empty `meta` instead.
 */
import YAML from 'yaml';

const FM_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Split a document into frontmatter and body.
 * → { found, meta, body, error } — `meta` is {} when absent or broken,
 * `body` is always the text after the block (or the full text).
 */
export function splitFrontmatter(text) {
  const m = text.match(FM_RE);
  if (!m) return { found: false, meta: {}, body: text, error: null };
  let meta = {};
  let error = null;
  try {
    meta = YAML.parse(m[1]) || {};
  } catch (err) {
    error = err.message;
  }
  return { found: true, meta, body: text.slice(m[0].length), error };
}

/** The text with any leading frontmatter block removed (never parses it). */
export function stripFrontmatter(text) {
  return text.replace(FM_RE, '');
}
