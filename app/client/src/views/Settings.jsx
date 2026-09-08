import React, { useState } from 'react';
import { ViewHeader } from '../components/bits.jsx';
import {
  getSetting,
  setSetting,
  termFontSize,
  TERM_FONT_DEFAULT,
  TERM_FONT_MIN,
  TERM_FONT_MAX,
  SCHEMES,
  globalScheme,
} from '../settings.js';
import { SchemePicker } from '../components/bits.jsx';

const THEMES = [
  { key: 'light', icon: '☀', label: 'Light' },
  { key: 'system', icon: '◐', label: 'System' },
  { key: 'dark', icon: '☾', label: 'Dark' },
];

export default function Settings() {
  const [theme, setTheme] = useState(() => getSetting('theme', 'dark'));
  const [fontSize, setFontSize] = useState(termFontSize);
  const [scheme, setScheme] = useState(globalScheme);

  function pickScheme(key) {
    setScheme(key);
    setSetting('scheme', key);
  }

  function pickTheme(key) {
    setTheme(key);
    setSetting('theme', key);
  }

  function pickFontSize(px) {
    const next = Math.min(TERM_FONT_MAX, Math.max(TERM_FONT_MIN, px));
    setFontSize(next);
    setSetting('term-font', next);
  }

  return (
    <div className="view view-settings">
      <ViewHeader kicker="preferences · this browser" title="Settings" />

      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="settings-row">
          <div className="settings-text">
            <div className="settings-label">Color theme</div>
            <p className="muted small">Light, dark, or follow the system preference.</p>
          </div>
          <div className="theme-switch" role="group" aria-label="Color theme">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                className={theme === t.key ? 'active' : ''}
                onClick={() => pickTheme(t.key)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-text">
            <div className="settings-label">Color scheme</div>
            <p className="muted small">
              {SCHEMES.length} palettes, each with a light and a dark variant. A project can pick its own on
              its Overview screen.
            </p>
          </div>
          <SchemePicker value={scheme} onChange={pickScheme} />
        </div>
      </section>

      <section className="settings-section">
        <h2>Terminal</h2>
        <div className="settings-row">
          <div className="settings-text">
            <div className="settings-label">Font size</div>
            <p className="muted small">
              {TERM_FONT_MIN}–{TERM_FONT_MAX} px · applies to terminal tabs opened from now on (and to
              all tabs after a reload); running sessions keep going.
            </p>
          </div>
          <div className="stepper" role="group" aria-label="Terminal font size">
            <button
              type="button"
              onClick={() => pickFontSize(fontSize - 1)}
              disabled={fontSize <= TERM_FONT_MIN}
              aria-label="Smaller"
            >
              −
            </button>
            <span className="stepper-value mono">{fontSize} px</span>
            <button
              type="button"
              onClick={() => pickFontSize(fontSize + 1)}
              disabled={fontSize >= TERM_FONT_MAX}
              aria-label="Larger"
            >
              +
            </button>
          </div>
          {fontSize !== TERM_FONT_DEFAULT && (
            <button type="button" className="settings-reset" onClick={() => pickFontSize(TERM_FONT_DEFAULT)}>
              Reset to {TERM_FONT_DEFAULT} px
            </button>
          )}
        </div>
        <div className="term-preview" style={{ fontSize: fontSize + 'px' }} aria-hidden="true">
          $ claude "Read ROADMAP.md and give me a short status."
        </div>
      </section>

      <p className="muted small">
        Settings are stored in this browser (localStorage) — they follow the browser, not the
        installation.
      </p>
    </div>
  );
}
