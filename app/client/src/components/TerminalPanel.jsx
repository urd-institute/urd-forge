import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import TerminalTab from './TerminalTab.jsx';
import { api, apiPost, subscribeEvents } from '../api.js';
import { clampPanelHeight, getSetting, panelHeight, panelMode, setSetting } from '../settings.js';

/*
 * The terminal panel (SPEC-03): docked at the bottom of the content area on
 * every screen, with one tab per pty session of the project shown. Lives in
 * App.jsx outside the route switch so the xterm instances survive navigation.
 *
 * Modes: 'closed' (a one-line status bar), 'open' (draggable height), 'max'
 * (fills the content area; the current view is hidden). Remembered per
 * browser, as is the active tab per project.
 */

function newTabId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i += 1) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// OSC window titles worth showing as the tab name. Shells announce
// themselves or the working directory on start; that would overwrite a
// preset label ("Claude Code") the moment the shell comes up.
function interestingTitle(t, slug) {
  const s = String(t || '').trim();
  if (!s) return false;
  if (/powershell|cmd\.exe|command prompt|^bash$|^zsh$|^sh$|^fish$|^administrator:/i.test(s)) return false;
  if (/[\\/]/.test(s)) return false;
  if (s === slug) return false;
  return true;
}

function nextDefaultTitle(tabs) {
  let n = 1;
  const used = new Set(tabs.map((t) => t.title));
  while (used.has('Terminal ' + n)) n += 1;
  return 'Terminal ' + n;
}

const TerminalPanel = forwardRef(function TerminalPanel({ slug, badge }, ref) {
  const [mode, setModeState] = useState(panelMode);
  const [height, setHeight] = useState(panelHeight);
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [maxTabs, setMaxTabs] = useState(6);
  const [presets, setPresets] = useState([]);
  const [available, setAvailable] = useState(true);
  const [notice, setNotice] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmClose, setConfirmClose] = useState(null);
  const [renaming, setRenaming] = useState(null); // { tabId, draft }
  const [project, setProject] = useState(null);
  const [forgeError, setForgeError] = useState(null);
  const [forgeTick, setForgeTick] = useState(0);
  const tabRefs = useRef(new Map());
  const panelEl = useRef(null);
  const menuEl = useRef(null);
  const dragging = useRef(null);
  const pendingActivate = useRef(null);
  const stateRef = useRef({});
  stateRef.current = { mode, tabs, activeId, maxTabs, slug };

  const setMode = useCallback((m) => {
    setModeState(m);
    setSetting('panel', m);
  }, []);

  // ── Project change: load its tabs, presets and /forge status ────────
  useEffect(() => {
    setTabs([]);
    setActiveId(null);
    setNotice(null);
    setConfirmStop(false);
    setConfirmClose(null);
    setRenaming(null);
    setOpenMenu(null);
    setProject(null);
    if (!slug) return undefined;
    let alive = true;
    api('/projects/' + encodeURIComponent(slug) + '/terminals')
      .then((d) => {
        if (!alive) return;
        const list = (d.tabs || []).map((t) => ({ tabId: t.tabId, title: t.title, locked: false }));
        setMaxTabs(d.maxTabs || 6);
        setTabs((prev) => {
          // Tabs opened locally before the list arrived (autostart) win.
          const ids = new Set(prev.map((t) => t.tabId));
          return [...prev, ...list.filter((t) => !ids.has(t.tabId))];
        });
        setActiveId((cur) => {
          // A `?tab=` link may have asked for a tab before the list arrived.
          const wanted = pendingActivate.current;
          pendingActivate.current = null;
          if (wanted && list.some((t) => t.tabId === wanted)) return wanted;
          if (cur) return cur;
          const remembered = getSetting('tab:' + slug, '');
          return list.some((t) => t.tabId === remembered) ? remembered : list[0] ? list[0].tabId : null;
        });
      })
      .catch(() => {});
    api('/projects/' + encodeURIComponent(slug) + '/presets')
      .then((d) => {
        if (!alive) return;
        setPresets(d.presets || []);
        if (d.terminal && d.terminal.available === false) {
          setAvailable(false);
          setNotice('Terminal is unavailable: node-pty could not be loaded (' + (d.terminal.error || 'unknown error') + ').');
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!slug) return undefined;
    let alive = true;
    api('/projects/' + encodeURIComponent(slug))
      .then((p) => alive && setProject(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug, forgeTick]);

  useEffect(() => {
    if (slug && activeId) setSetting('tab:' + slug, activeId);
  }, [slug, activeId]);

  // ── Tab list shared between browser windows ─────────────────────────
  useEffect(
    () =>
      subscribeEvents((msg) => {
        if (msg.type !== 'terminal-tab' || msg.slug !== stateRef.current.slug) return;
        if (msg.event === 'created') {
          setTabs((ts) => (ts.some((t) => t.tabId === msg.tabId) ? ts : [...ts, { tabId: msg.tabId, title: msg.title, locked: false }]));
        } else if (msg.event === 'title') {
          setTabs((ts) => ts.map((t) => (t.tabId === msg.tabId && t.title !== msg.title ? { ...t, title: msg.title } : t)));
        } else if (msg.event === 'closed') {
          removeTab(msg.tabId);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function removeTab(tabId) {
    setTabs((ts) => {
      const next = ts.filter((t) => t.tabId !== tabId);
      setActiveId((cur) => {
        if (cur !== tabId) return cur;
        const i = ts.findIndex((t) => t.tabId === tabId);
        const fallback = next[Math.min(i, next.length - 1)];
        return fallback ? fallback.tabId : null;
      });
      return next;
    });
  }

  function patchTab(tabId, patch) {
    setTabs((ts) => ts.map((t) => (t.tabId === tabId ? { ...t, ...patch } : t)));
  }

  // ── Opening tabs ────────────────────────────────────────────────────
  const openTab = useCallback(
    ({ title, command, viaPreset } = {}) => {
      const { tabs: cur, maxTabs: limit, mode: m } = stateRef.current;
      if (!stateRef.current.slug) return null;
      if (cur.filter((t) => !t.ended).length >= limit) {
        setNotice('This project already has ' + limit + ' terminal tabs open (terminal.maxTabs) — close one first.');
        return null;
      }
      const tabId = newTabId();
      const tab = {
        tabId,
        title: title || nextDefaultTitle(cur),
        locked: false,
        initialCommand: command || null,
        viaPreset: Boolean(viaPreset),
        generation: 0,
      };
      setTabs((ts) => [...ts, tab]);
      setActiveId(tabId);
      setNotice(null);
      if (m === 'closed') setMode('open');
      return tabId;
    },
    [setMode]
  );

  useImperativeHandle(
    ref,
    () => ({
      show(m) {
        setMode(m || 'open');
      },
      toggle() {
        setMode(stateRef.current.mode === 'closed' ? 'open' : 'closed');
      },
      openTab,
      activate(tabId) {
        if (stateRef.current.tabs.some((t) => t.tabId === tabId)) setActiveId(tabId);
        else pendingActivate.current = tabId;
        if (stateRef.current.mode === 'closed') setMode('open');
      },
    }),
    [openTab, setMode]
  );

  // ── Keyboard ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (ev) => {
      if (!stateRef.current.slug) return;
      const inPanel = panelEl.current && panelEl.current.contains(document.activeElement);
      if (ev.ctrlKey && !ev.altKey && !ev.shiftKey && (ev.key === 'j' || ev.key === 'J' || ev.code === 'Backquote')) {
        ev.preventDefault();
        const m = stateRef.current.mode;
        if (m === 'closed') {
          setMode('open');
          // Focus the active tab once it is laid out (Ctrl+J opens *and* focuses).
          requestAnimationFrame(() => {
            const r = tabRefs.current.get(stateRef.current.activeId);
            if (r) r.focus();
          });
        } else if (inPanel) {
          setMode('closed');
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        } else {
          const r = tabRefs.current.get(stateRef.current.activeId);
          if (r) r.focus();
        }
        return;
      }
      if (!inPanel || !ev.altKey || ev.ctrlKey) return;
      if (ev.key === 'n' || ev.key === 'N') {
        ev.preventDefault();
        openTab();
      } else if (/^[1-9]$/.test(ev.key)) {
        const t = stateRef.current.tabs[Number(ev.key) - 1];
        if (t) {
          ev.preventDefault();
          setActiveId(t.tabId);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openTab, setMode]);

  // Close preset menus on a click elsewhere or Escape.
  useEffect(() => {
    if (openMenu == null) return undefined;
    const onDown = (ev) => {
      if (menuEl.current && !menuEl.current.contains(ev.target)) setOpenMenu(null);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  // Keep the stored height within the window.
  useEffect(() => {
    const onResize = () => setHeight((h) => clampPanelHeight(h));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Drag handle ─────────────────────────────────────────────────────
  function startDrag(ev) {
    if (mode !== 'open') return;
    ev.preventDefault();
    const startY = ev.clientY;
    const startH = height;
    dragging.current = { startY, startH };
    const onMove = (e) => {
      if (!dragging.current) return;
      setHeight(clampPanelHeight(dragging.current.startH + (dragging.current.startY - e.clientY)));
    };
    const onUp = () => {
      dragging.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      setHeight((h) => {
        setSetting('panel-height', h);
        return h;
      });
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // ── Actions ─────────────────────────────────────────────────────────
  const activeTab = tabs.find((t) => t.tabId === activeId) || null;

  function runPreset(p, inNewTab) {
    setOpenMenu(null);
    if (inNewTab || !activeTab || activeTab.ended) {
      openTab({ title: p.label, command: p.command, viaPreset: true });
      return;
    }
    const r = tabRefs.current.get(activeTab.tabId);
    if (r) {
      r.runPreset(p.command);
      r.focus();
    }
  }

  function stopSession() {
    if (!activeTab || activeTab.ended) return;
    if (!confirmStop) {
      setConfirmStop(true);
      setTimeout(() => setConfirmStop(false), 4000);
      return;
    }
    setConfirmStop(false);
    const r = tabRefs.current.get(activeTab.tabId);
    if (r) r.kill(false);
  }

  function closeTab(tab, ev) {
    if (ev) ev.stopPropagation();
    if (tab.ended) {
      removeTab(tab.tabId);
      return;
    }
    if (confirmClose !== tab.tabId) {
      setConfirmClose(tab.tabId);
      setTimeout(() => setConfirmClose((c) => (c === tab.tabId ? null : c)), 4000);
      return;
    }
    setConfirmClose(null);
    const r = tabRefs.current.get(tab.tabId);
    if (r) r.kill(true);
    removeTab(tab.tabId);
  }

  function restartTab(tab) {
    patchTab(tab.tabId, { ended: false, exitCode: null, initialCommand: null, generation: (tab.generation || 0) + 1 });
  }

  function setTitle(tab, title, lock) {
    const t = String(title || '').trim().slice(0, 40);
    if (!t) return;
    patchTab(tab.tabId, { title: t, locked: lock ? true : tab.locked });
    const r = tabRefs.current.get(tab.tabId);
    if (r) r.setTitle(t);
  }

  function commitRename() {
    if (!renaming) return;
    const tab = tabs.find((t) => t.tabId === renaming.tabId);
    if (tab && renaming.draft.trim()) setTitle(tab, renaming.draft, true);
    setRenaming(null);
  }

  async function installForge() {
    setForgeError(null);
    try {
      await apiPost('/projects/' + encodeURIComponent(slug) + '/commands/forge');
      setForgeTick((t) => t + 1);
    } catch (err) {
      setForgeError(err.message);
    }
  }

  if (!slug) return null;

  const unreadAny = tabs.some((t) => t.unread);
  const liveCount = tabs.filter((t) => !t.ended).length;

  function renderTab(t, isActive) {
    return (
      <TerminalTab
        key={t.tabId}
        ref={(r) => {
          if (r) tabRefs.current.set(t.tabId, r);
          else tabRefs.current.delete(t.tabId);
        }}
        slug={slug}
        tabId={t.tabId}
        title={t.title}
        active={isActive}
        initialCommand={t.initialCommand}
        viaPreset={t.viaPreset}
        generation={t.generation || 0}
        onReady={() => {
          if (t.initialCommand) patchTab(t.tabId, { initialCommand: null });
        }}
        onExit={(exitCode, closed) => {
          if (closed) removeTab(t.tabId);
          else patchTab(t.tabId, { ended: true, exitCode, unread: !isActive || mode === 'closed' });
        }}
        onTitle={(title) => {
          const cur = stateRef.current.tabs.find((x) => x.tabId === t.tabId);
          if (!cur || cur.locked || !interestingTitle(title, slug) || cur.title === title) return;
          setTitle(cur, title, false);
        }}
        onActivity={() => {
          setTabs((ts) => (ts.some((x) => x.tabId === t.tabId && !x.unread) ? ts.map((x) => (x.tabId === t.tabId ? { ...x, unread: true } : x)) : ts));
        }}
        onUnavailable={(message) => {
          setNotice(message);
          removeTab(t.tabId);
        }}
      />
    );
  }

  // One tree shape for all three modes: the status bar, header, toolbar and
  // notes come and go, but `.panel-body` keeps its position, so React keeps
  // the TerminalTab instances (and their sessions) across open/close.
  const shown = mode !== 'closed';
  const classes = ['panel', mode === 'closed' ? 'panel-closed' : mode === 'max' ? 'panel-max' : 'panel-open'];
  const style = mode === 'open' ? { height: height + 'px' } : undefined;

  return (
    <div className={classes.join(' ')} style={style} ref={panelEl}>
      {mode === 'closed' && (
        <button className="panel-status" onClick={() => setMode('open')} title="Open the terminal panel (Ctrl+J)">
          <span className="panel-caret">▲</span>
          <span className="panel-status-label">Terminal</span>
          {badge && <span className="panel-badge mono">{slug}</span>}
          <span className="panel-status-tabs muted">
            {tabs.length === 0 ? 'no session' : tabs.map((t) => t.title + (t.ended ? ' (ended)' : '')).join(' · ')}
          </span>
          {unreadAny && <span className="update-dot" title="New output" />}
        </button>
      )}
      {mode === 'open' && <div className="panel-handle" onPointerDown={startDrag} title="Drag to resize" />}

      {shown && (
      <div className="panel-header">
        <div className="panel-tabs" role="tablist">
          {tabs.map((t, i) => (
            <div
              key={t.tabId}
              role="tab"
              aria-selected={t.tabId === activeId}
              className={
                'panel-tab' +
                (t.tabId === activeId ? ' active' : '') +
                (t.ended ? ' ended' : '') +
                (t.unread && t.tabId !== activeId ? ' unread' : '')
              }
              onClick={() => {
                setActiveId(t.tabId);
                patchTab(t.tabId, { unread: false });
              }}
              onDoubleClick={() => setRenaming({ tabId: t.tabId, draft: t.title })}
              title={'Alt+' + (i + 1) + ' · double-click to rename'}
            >
              {renaming && renaming.tabId === t.tabId ? (
                <input
                  className="panel-tab-rename mono"
                  autoFocus
                  value={renaming.draft}
                  maxLength={40}
                  onChange={(e) => setRenaming({ ...renaming, draft: e.target.value })}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="panel-tab-title">{t.title}</span>
              )}
              {t.unread && t.tabId !== activeId && <span className="panel-tab-dot" />}
              <button
                className={'panel-tab-close' + (confirmClose === t.tabId ? ' armed' : '')}
                onClick={(e) => closeTab(t, e)}
                title={t.ended ? 'Close tab' : confirmClose === t.tabId ? 'Click again to close' : 'Close tab (ends the session)'}
              >
                {confirmClose === t.tabId ? '✓' : '×'}
              </button>
            </div>
          ))}
          <div className="panel-menu-wrap" ref={openMenu === 'new' ? menuEl : null}>
            <button
              className="panel-tab-new"
              onClick={(e) => {
                if (e.shiftKey || presets.length === 0) openTab();
                else setOpenMenu(openMenu === 'new' ? null : 'new');
              }}
              disabled={!available || liveCount >= maxTabs}
              title={liveCount >= maxTabs ? 'Tab limit reached (' + maxTabs + ')' : 'New tab (Alt+N) · pick a preset to start it with'}
            >
              + <span className="panel-caret-small">▾</span>
            </button>
            {openMenu === 'new' && (
              <div className="panel-menu">
                <button className="panel-menu-item" onClick={() => openTab()}>
                  <span>Empty shell</span>
                  <span className="mono muted small">Alt+N</span>
                </button>
                {presets.map((g, gi) => (
                  <React.Fragment key={g.group || gi}>
                    <div className="panel-menu-group mono">{g.group}</div>
                    {g.items.map((p) => (
                      <button key={p.label} className="panel-menu-item" onClick={() => runPreset(p, true)} title={p.command}>
                        {p.label}
                      </button>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel-tools">
          {badge && (
            <span className="panel-badge mono" title="The panel shows this project's sessions">
              {slug}
            </span>
          )}
          <button
            className="panel-icon"
            onClick={() => setMode(mode === 'max' ? 'open' : 'max')}
            title={mode === 'max' ? 'Restore panel size' : 'Maximize panel'}
          >
            {mode === 'max' ? '⤡' : '⤢'}
          </button>
          <button className="panel-icon" onClick={() => setMode('closed')} title="Close the panel (Ctrl+J) — sessions keep running">
            ▾
          </button>
        </div>
      </div>
      )}

      {shown && (
      <div className="panel-toolbar">
        <div className="panel-menus" ref={openMenu !== 'new' && openMenu != null ? menuEl : null}>
          {presets.map((g, gi) => (
            <div className="panel-menu-wrap" key={g.group || gi}>
              <button
                className={'panel-menu-button' + (openMenu === gi ? ' open' : '')}
                onClick={() => setOpenMenu(openMenu === gi ? null : gi)}
                disabled={!available}
              >
                {g.group || 'Presets'} <span className="panel-caret-small">▾</span>
              </button>
              {openMenu === gi && (
                <div className="panel-menu">
                  {g.items.map((p) => (
                    <button
                      key={p.label}
                      className="panel-menu-item"
                      onClick={(e) => runPreset(p, e.shiftKey)}
                      title={p.command + '\n\nShift+click: run in a new tab'}
                    >
                      <span>{p.label}</span>
                      <span
                        className="panel-menu-newtab mono"
                        onClick={(e) => {
                          e.stopPropagation();
                          runPreset(p, true);
                        }}
                        title="Run in a new tab"
                      >
                        + tab
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="panel-toolbar-right">
          {activeTab && !activeTab.ended && (
            <button
              className={'preset stop-session' + (confirmStop ? ' armed' : '')}
              onClick={stopSession}
              title="Ends the shell in this tab and everything running in it. Use Ctrl+C in the terminal to interrupt just the running program."
            >
              {confirmStop ? 'Click again to stop' : 'Stop session'}
            </button>
          )}
        </div>
      </div>
      )}

      {shown && project && project.hasForgeCommand === false && (
        <div className="panel-note">
          <span>
            <code>/forge</code> is not installed in this project — the Claude Code command that drafts a new spec from
            a description.
          </span>
          <button className="preset" onClick={installForge} title="Creates .claude/commands/forge.md in the project">
            Install /forge
          </button>
          {forgeError && <span className="error-text small">{forgeError}</span>}
        </div>
      )}
      {shown && notice && (
        <div className="panel-note panel-note-error">
          <span>{notice}</span>
          <button className="panel-icon" onClick={() => setNotice(null)} title="Dismiss">
            ×
          </button>
        </div>
      )}
      {shown && activeTab && activeTab.ended && (
        <div className="panel-note panel-note-error">
          <span>Session ended (exit code {activeTab.exitCode}).</span>
          <button className="preset" onClick={() => restartTab(activeTab)}>
            Restart in this tab
          </button>
          <button className="preset" onClick={() => removeTab(activeTab.tabId)}>
            Close tab
          </button>
        </div>
      )}

      {/* Tabs stay mounted while the panel is closed so sessions keep streaming. */}
      <div className="panel-body" style={shown ? undefined : { display: 'none' }}>
        {shown && tabs.length === 0 && (
          <div className="panel-empty muted">
            {available ? (
              <>
                No terminal open in <span className="mono">projects/{slug}</span> — press <span className="mono">+</span> for a
                shell, or pick a preset to start with. Sessions run on localhost only and die with the app.
              </>
            ) : (
              'Terminal unavailable — see the note above.'
            )}
          </div>
        )}
        {tabs.map((t) => renderTab(t, shown && t.tabId === activeId))}
      </div>
    </div>
  );
});

export default TerminalPanel;
