/*
 * Client-side UI preferences, stored in this browser's localStorage under
 * `forge-*` keys. Synchronous by design: read on demand, write + notify
 * listeners in the same window so open views can react immediately.
 */
const EVENT = 'forge-settings-changed';

export function getSetting(key, fallback) {
  const v = localStorage.getItem('forge-' + key);
  return v != null ? v : fallback;
}

export function setSetting(key, value) {
  localStorage.setItem('forge-' + key, String(value));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key } }));
}

export function onSettingsChange(fn) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

export const TERM_FONT_DEFAULT = 13;
export const TERM_FONT_MIN = 10;
export const TERM_FONT_MAX = 22;

/** Terminal font size in px, clamped so a broken stored value never breaks xterm. */
export function termFontSize() {
  const n = Number(getSetting('term-font', TERM_FONT_DEFAULT));
  if (!Number.isFinite(n)) return TERM_FONT_DEFAULT;
  return Math.min(TERM_FONT_MAX, Math.max(TERM_FONT_MIN, Math.round(n)));
}

/* Terminal panel (SPEC-03): open state and height, remembered per browser. */
export const PANEL_MIN_HEIGHT = 120;
export const PANEL_MAX_FRACTION = 0.85;

/** 'closed' | 'open' | 'max' — closed until the user first opens it. */
export function panelMode() {
  const v = getSetting('panel', 'closed');
  return v === 'open' || v === 'max' ? v : 'closed';
}

/** Panel height in px, clamped to what fits in the current window. */
export function panelHeight() {
  const n = Number(getSetting('panel-height', 0));
  const fallback = Math.round(window.innerHeight * 0.4);
  return clampPanelHeight(Number.isFinite(n) && n > 0 ? n : fallback);
}

export function clampPanelHeight(px) {
  const max = Math.max(PANEL_MIN_HEIGHT, Math.round(window.innerHeight * PANEL_MAX_FRACTION));
  return Math.min(max, Math.max(PANEL_MIN_HEIGHT, Math.round(px)));
}

/* Color schemes: each is a full palette with a light and a dark variant, so
 * the light/dark theme setting stays independent of the scheme. The default
 * scheme is Forge's paper & ink; the others are token overrides in
 * styles.css under `[data-scheme]`. A project may override the browser-wide
 * choice (stored as `scheme:<slug>`; empty = inherit). */
export const SCHEME_DEFAULT = 'paper';
export const SCHEMES = [
  { key: 'paper', label: 'Paper & ink', hint: 'Warm paper, ember accent (default)', swatch: ['#f6f2ea', '#1c1a17', '#a24a2b'] },
  { key: 'slate', label: 'Slate', hint: 'Cool grey paper, blue accent', swatch: ['#eef1f5', '#1a1f26', '#2f5f9e'] },
  { key: 'forest', label: 'Forest', hint: 'Green-tinted paper, leaf accent', swatch: ['#f0f3ea', '#1b201a', '#3f7a3a'] },
  { key: 'ocean', label: 'Ocean', hint: 'Sea-glass paper, teal accent', swatch: ['#eaf2f4', '#14232a', '#1f7a8c'] },
  { key: 'plum', label: 'Plum', hint: 'Rosy paper, plum accent', swatch: ['#f5f0f3', '#221a20', '#7d3f78'] },
  { key: 'sand', label: 'Sand', hint: 'Desert paper, terracotta accent', swatch: ['#f7efe2', '#2a2016', '#c1682a'] },
  { key: 'graphite', label: 'Graphite', hint: 'Neutral grey, red accent', swatch: ['#f2f2f1', '#161616', '#b3352b'] },
];

function validScheme(key) {
  return SCHEMES.some((s) => s.key === key) ? key : null;
}

/** The browser-wide scheme. */
export function globalScheme() {
  return validScheme(getSetting('scheme', SCHEME_DEFAULT)) || SCHEME_DEFAULT;
}

/** A project's own scheme, or null when it follows the global one. */
export function projectScheme(slug) {
  if (!slug) return null;
  return validScheme(getSetting('scheme:' + slug, '')) || null;
}

/** Effective scheme for a view: the project's override, else the global one. */
export function schemeFor(slug) {
  return projectScheme(slug) || globalScheme();
}
