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
