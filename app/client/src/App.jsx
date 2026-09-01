import React, { useEffect, useRef, useState } from 'react';
import { api, subscribeEvents } from './api.js';
import Overview from './views/Overview.jsx';
import Roadmap from './views/Roadmap.jsx';
import Specs from './views/Specs.jsx';
import Decisions from './views/Decisions.jsx';
import TerminalPanel from './components/TerminalPanel.jsx';
import Search from './views/Search.jsx';
import FileView from './views/FileView.jsx';
import Home from './views/Home.jsx';
import Help from './views/Help.jsx';
import NewProject from './views/NewProject.jsx';
import ImportSpec from './views/ImportSpec.jsx';
import Update from './views/Update.jsx';
import Settings from './views/Settings.jsx';
import Archive from './views/Archive.jsx';
import { ProgressBar } from './components/bits.jsx';
import { getSetting, onSettingsChange, schemeFor } from './settings.js';

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart || '');
  if (parts[0] === 'p' && parts[1]) {
    return { view: parts[2] || 'overview', slug: decodeURIComponent(parts[1]), query };
  }
  if (parts[0] === 'search') return { view: 'search', slug: null, query };
  if (parts[0] === 'help') return { view: 'help', slug: null, query };
  if (parts[0] === 'new') return { view: 'new', slug: null, query };
  if (parts[0] === 'updates') return { view: 'updates', slug: null, query };
  if (parts[0] === 'archive') return { view: 'archive', slug: null, query };
  if (parts[0] === 'settings') return { view: 'settings', slug: null, query };
  return { view: 'home', slug: null, query };
}

const NAV = [
  { key: 'overview', label: 'Overview' },
  { key: 'roadmap', label: 'Roadmap' },
  { key: 'specs', label: 'Specs' },
  { key: 'decisions', label: 'Decisions' },
  // Opens the terminal panel maximized (SPEC-03 §3.4) — the route is an alias.
  { key: 'terminal', label: 'Terminal' },
];

const BRIEF_COMMAND = 'claude "Read .forge/brief.md and follow the instructions in it."';

/** The command a `#/p/<slug>/terminal?autostart=…` link asks to run in a new tab. */
function autostartCommand(autostart, file) {
  if (autostart === 'brief') return BRIEF_COMMAND;
  if (autostart === 'spec' && file && /^[A-Za-z0-9._-]+$/.test(file)) {
    return (
      'claude "Read specs/' +
      file +
      ' - a newly imported spec. Review it against CLAUDE.md and the existing specs,' +
      ' set its status and dependencies, add its steps to ROADMAP.md, and log an ADR in DOCS.md if it changes any decisions."'
    );
  }
  return null;
}

/** Applies the theme (light/dark) and the color scheme to the document. The
 *  scheme follows the project being viewed when it has its own. */
function useApplyTheme(slug) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const setting = getSetting('theme', 'system');
      const dark = setting === 'dark' || (setting === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.dataset.scheme = schemeFor(slug);
    };
    apply();
    mq.addEventListener('change', apply);
    const off = onSettingsChange(apply);
    return () => {
      mq.removeEventListener('change', apply);
      off();
    };
  }, [slug]);
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [projects, setProjects] = useState([]);
  const [tick, setTick] = useState(0); // bumped on file-watcher events → views refetch
  const [searchDraft, setSearchDraft] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  // The terminal panel follows the selected project; on screens without one
  // (Home, Help, Updates…) it keeps showing the last project's sessions.
  const [lastSlug, setLastSlug] = useState(null);
  const panelRef = useRef(null);
  const panelSlug = route.slug || lastSlug;

  useApplyTheme(route.slug);

  useEffect(() => {
    if (route.slug) setLastSlug(route.slug);
  }, [route.slug]);

  // `#/p/<slug>/terminal` is an alias for "open the panel maximized"; an
  // `autostart` query runs its command in a new tab, `?tab=<id>` on any
  // project route activates that tab (dev-server list). The query is
  // stripped afterwards so a reload never runs the command twice.
  useEffect(() => {
    if (!route.slug || !panelRef.current) return;
    const tab = route.query.get('tab');
    if (route.view === 'terminal') {
      const cmd = autostartCommand(route.query.get('autostart'), route.query.get('file'));
      if (cmd) panelRef.current.openTab({ title: 'Claude Code', command: cmd, viaPreset: false });
      panelRef.current.show('max');
      location.replace('#/p/' + encodeURIComponent(route.slug));
    } else if (tab) {
      panelRef.current.activate(tab);
      location.replace('#/p/' + encodeURIComponent(route.slug) + (route.view === 'overview' ? '' : '/' + route.view));
    }
  }, [route]);

  useEffect(() => {
    // Quiet cached read — the server checks in the background after start.
    const t = setTimeout(() => {
      fetch('/api/update')
        .then((r) => r.json())
        .then((s) => setUpdateAvailable(Boolean(s.available)))
        .catch(() => {});
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    api('/projects').then(setProjects).catch(() => setProjects([]));
  }, [tick]);

  useEffect(
    () =>
      subscribeEvents((msg) => {
        if (msg.type === 'project-updated' || msg.type === 'projects-changed') {
          setTick((t) => t + 1);
        }
      }),
    []
  );

  // Archived projects (local installation state) stay out of the sidebar and
  // the home screen; they are reachable through the Archive link instead.
  const activeProjects = projects.filter((p) => !p.archived);
  const archivedProjects = projects.filter((p) => p.archived);

  function submitSearch(e) {
    e.preventDefault();
    if (searchDraft.trim()) location.hash = '#/search?q=' + encodeURIComponent(searchDraft.trim());
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/">
          <span className="brand-mark">⌘</span>
          <span>
            URD <em>FORGE</em>
          </span>
        </a>

        <form className="search-form" onSubmit={submitSearch}>
          <input
            type="search"
            placeholder="Search all projects…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </form>

        <div className="side-section">Projects</div>
        <nav className="project-list">
          {activeProjects.map((p, i) => (
            <React.Fragment key={p.slug}>
              {/* The server lists pinned projects first; mark where they end. */}
              {i > 0 && activeProjects[i - 1].pinned && !p.pinned && <div className="pin-divider" />}
              <a
                href={'#/p/' + encodeURIComponent(p.slug)}
                className={'project-item' + (route.slug === p.slug ? ' active' : '') + (p.pinned ? ' pinned' : '')}
              >
                <span className="project-name">
                  {p.pinned && (
                    <span className="pin-mark" title="Pinned to the top">
                      ★
                    </span>
                  )}
                  {p.name}
                </span>
                {p.progress != null && <ProgressBar pct={p.progress} slim />}
              </a>
              {route.slug === p.slug && (
                <nav className="view-nav">
                  {NAV.map((n) => (
                    <a
                      key={n.key}
                      href={'#/p/' + encodeURIComponent(p.slug) + (n.key === 'overview' ? '' : '/' + n.key)}
                      className={route.view === n.key ? 'active' : ''}
                    >
                      {n.label}
                    </a>
                  ))}
                </nav>
              )}
            </React.Fragment>
          ))}
          {activeProjects.length === 0 && (
            <div className="muted pad">No projects found in /projects.</div>
          )}
          <a href="#/new" className={'new-project-link' + (route.view === 'new' ? ' active' : '')}>
            <span className="mono">+</span> New project
          </a>
          {archivedProjects.length > 0 && (
            <a
              href="#/archive"
              className={'new-project-link archive-link' + (route.view === 'archive' ? ' active' : '')}
            >
              <span className="mono">▣</span> Archive ({archivedProjects.length})
            </a>
          )}
        </nav>

        <nav className="side-help">
          <a href="#/help" className={route.view === 'help' ? 'active' : ''}>
            <span className="help-mark mono">?</span> Help — using Forge
          </a>
          <a href="#/updates" className={route.view === 'updates' ? 'active' : ''}>
            <span className="help-mark mono">↻</span> Updates
            {updateAvailable && <span className="update-dot" title="Update available" />}
          </a>
          <a href="#/settings" className={route.view === 'settings' ? 'active' : ''}>
            <span className="help-mark mono">⚙</span> Settings
          </a>
        </nav>

        <div className="side-footer">
          <span>
            <span className="mono">urd-forge v1</span> · URD Institute
          </span>
        </div>
      </aside>

      <main className="content">
        <div className="content-view">
        {route.view === 'home' && <Home projects={activeProjects} />}
        {route.view === 'archive' && (
          <Archive projects={archivedProjects} onChanged={() => setTick((t) => t + 1)} />
        )}
        {route.view === 'help' && <Help />}
        {route.view === 'new' && <NewProject />}
        {route.view === 'updates' && <Update />}
        {route.view === 'settings' && <Settings />}
        {route.view === 'search' && <Search query={route.query.get('q') || ''} tick={tick} />}
        {route.slug && route.view === 'overview' && (
          <Overview slug={route.slug} tick={tick} onChanged={() => setTick((t) => t + 1)} />
        )}
        {route.slug && route.view === 'roadmap' && <Roadmap slug={route.slug} tick={tick} />}
        {route.slug && route.view === 'specs' && <Specs key={route.slug} slug={route.slug} tick={tick} />}
        {route.slug && route.view === 'decisions' && <Decisions slug={route.slug} tick={tick} />}
        {route.slug && route.view === 'import-spec' && <ImportSpec slug={route.slug} />}
        {route.slug && route.view === 'terminal' && (
          <Overview slug={route.slug} tick={tick} onChanged={() => setTick((t) => t + 1)} />
        )}
        {route.slug && route.view === 'file' && (
          <FileView slug={route.slug} path={route.query.get('path') || ''} tick={tick} />
        )}
        </div>
        <TerminalPanel ref={panelRef} slug={panelSlug} badge={!route.slug} />
      </main>
    </div>
  );
}
