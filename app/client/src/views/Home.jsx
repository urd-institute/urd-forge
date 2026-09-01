import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ProgressBar, ViewHeader, timeAgo } from '../components/bits.jsx';

function DevServers() {
  const [servers, setServers] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api('/servers')
        .then((d) => alive && setServers(d.servers || []))
        .catch(() => alive && setServers([]));
    };
    load();
    const timer = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!servers || servers.length === 0) return null;

  return (
    <section className="server-panel">
      <h2 className="server-panel-title mono">dev servers</h2>
      <ul className="server-list">
        {servers.map((s) => (
          <li key={s.slug + ':' + s.port} className="server-row">
            <span className={'server-dot ' + (s.up ? 'up' : 'down')} title={s.up ? 'responding' : 'not responding'} />
            <a className="server-project" href={'#/p/' + encodeURIComponent(s.slug)}>
              {s.slug}
            </a>
            {s.label && <span className="muted">{s.label}</span>}
            {s.tabId && (
              <a
                className="muted server-tab"
                href={'#/p/' + encodeURIComponent(s.slug) + '?tab=' + encodeURIComponent(s.tabId)}
                title="Open the terminal tab this server runs in"
              >
                ▸ {s.tab || 'terminal'}
              </a>
            )}
            {s.up ? (
              <a className="mono server-url" href={s.url} target="_blank" rel="noreferrer">
                {s.url}
              </a>
            ) : (
              <span className="mono server-url muted">{s.url}</span>
            )}
            <span className="mono server-state muted">{s.up ? 'up' : 'down'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Home({ projects }) {
  return (
    <div className="view">
      <ViewHeader kicker="urd forge" title="The forge for spec-driven work">
        <p className="lede">
          Forge reads your project files — it never writes them. Pick a project to see its
          roadmap, specs and decisions, or open its command window. New to Forge?{' '}
          <a href="#/help">Read the guide</a>.
        </p>
      </ViewHeader>

      <DevServers />

      <div className="card-grid">
        {projects.map((p) => (
          <a key={p.slug} className="card project-card" href={'#/p/' + encodeURIComponent(p.slug)}>
            <h3>
              {p.pinned && (
                <span className="pin-mark" title="Pinned to the top">
                  ★
                </span>
              )}
              {p.name}
            </h3>
            {p.summary && <p className="muted clamp">{p.summary}</p>}
            {p.progress != null ? <ProgressBar pct={p.progress} /> : <span className="muted mono">no roadmap</span>}
            <div className="card-meta mono">
              {p.specCount} spec{p.specCount === 1 ? '' : 's'}
              {p.openSpecCount > 0 && ` · ${p.openSpecCount} open`}
              {p.updatedAt && ` · ${timeAgo(p.updatedAt)}`}
            </div>
          </a>
        ))}
        <a className="card new-card" href="#/new">
          + Start a new project
        </a>
      </div>

      {projects.length === 0 && (
        <p className="muted">
          No projects yet. Create a folder under <code>projects/</code> using the Forge format
          (README.md, ROADMAP.md, specs/…) and it will appear here.
        </p>
      )}
    </div>
  );
}
