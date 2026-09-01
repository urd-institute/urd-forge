import React from 'react';
import { api } from '../api.js';
import {
  ProgressBar,
  StatusPill,
  Markdown,
  ViewHeader,
  ErrorNote,
  useFetch,
  fileLink,
  timeAgo,
  SchemePicker,
} from '../components/bits.jsx';
import { projectScheme, setSetting } from '../settings.js';

export default function Overview({ slug, tick, onChanged }) {
  const { data: project, error } = useFetch(() => api('/projects/' + encodeURIComponent(slug)), [slug, tick]);
  const { data: readme } = useFetch(
    () => api('/projects/' + encodeURIComponent(slug) + '/file?path=README.md').catch(() => null),
    [slug, tick]
  );
  const [scheme, setScheme] = React.useState(() => projectScheme(slug));
  React.useEffect(() => setScheme(projectScheme(slug)), [slug]);
  function pickScheme(key) {
    setScheme(key);
    setSetting('scheme:' + slug, key || '');
  }
  const [archiveBusy, setArchiveBusy] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState(null);
  const [pinBusy, setPinBusy] = React.useState(false);
  const [pinError, setPinError] = React.useState(null);

  async function setArchived(archived) {
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      const res = await fetch('/api/projects/' + encodeURIComponent(slug) + '/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      onChanged && onChanged();
    } catch (err) {
      setArchiveError(err.message);
    }
    setArchiveBusy(false);
  }

  async function setPinned(pinned) {
    setPinBusy(true);
    setPinError(null);
    try {
      const res = await fetch('/api/projects/' + encodeURIComponent(slug) + '/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      onChanged && onChanged();
    } catch (err) {
      setPinError(err.message);
    }
    setPinBusy(false);
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!project) return <div className="view muted">Loading…</div>;

  return (
    <div className="view">
      <ViewHeader kicker={'project · ' + slug} title={project.name}>
        {project.progress != null && (
          <div className="header-progress">
            <ProgressBar pct={project.progress} />
          </div>
        )}
      </ViewHeader>

      <div className="columns">
        <div className="col-main">
          {readme ? (
            <section className="card">
              <Markdown text={readme.content} />
            </section>
          ) : (
            <ErrorNote>No README.md — this folder does not follow the Forge format yet.</ErrorNote>
          )}
        </div>

        <div className="col-side">
          {project.openSpecs.length > 0 && (
            <section className="card">
              <h3>Open specs</h3>
              <ul className="plain-list">
                {project.openSpecs.map((s) => (
                  <li key={s.file}>
                    <a href={fileLink(slug, 'specs/' + s.file)}>
                      <span className="mono">{s.id || s.file}</span> {s.title && '— ' + s.title}
                    </a>{' '}
                    <StatusPill status={s.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h3>Recent activity</h3>
            <ul className="plain-list mono small">
              {project.recentFiles.map((f) => (
                <li key={f.path}>
                  <a href={fileLink(slug, f.path)}>{f.path}</a>
                  <span className="muted"> · {timeAgo(f.mtime)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h3>{project.pinned ? 'Pinned' : 'Pin to the top'}</h3>
            <p className="muted small">
              {project.pinned
                ? 'This project is listed first in the sidebar and on the home screen (★).'
                : 'Lists the project first in the sidebar and on the home screen, ahead of the alphabetical list.'}
            </p>
            <button className="preset" onClick={() => setPinned(!project.pinned)} disabled={pinBusy}>
              {pinBusy ? 'Working…' : project.pinned ? 'Unpin project' : 'Pin project'}
            </button>
            {pinError && <p className="error-note small">{pinError}</p>}
          </section>

          <section className="card">
            <h3>Export</h3>
            <p className="muted small">
              Downloads the project folder as a zip — documents, specs and git history included;{' '}
              <span className="mono">node_modules</span> and the <span className="mono">.forge</span> cache are
              left out. Import it into another Forge installation from its <em>New project</em> screen.
            </p>
            <div className="card-actions">
              <a className="preset" href={'/api/projects/' + encodeURIComponent(slug) + '/export'} download>
                Export project (.zip)
              </a>
            </div>
          </section>

          <section className="card">
            <h3>{project.archived ? 'Archived' : 'Archive'}</h3>
            <p className="muted small">
              {project.archived
                ? 'This project is archived: hidden from the sidebar and the home screen. Its files are untouched.'
                : 'Hides the project from the sidebar and the home screen — the files are untouched, and you can restore it from the Archive link at any time.'}
            </p>
            <button
              className="preset"
              onClick={() => setArchived(!project.archived)}
              disabled={archiveBusy}
            >
              {archiveBusy ? 'Working…' : project.archived ? 'Restore project' : 'Archive project'}
            </button>
            {archiveError && <p className="error-note small">{archiveError}</p>}
          </section>

          <section className="card">
            <h3>Color scheme</h3>
            <p className="muted small">
              Give this project its own palette, so you can tell projects apart at a glance. "Default" follows
              the scheme on the Settings screen. Stored in this browser.
            </p>
            <SchemePicker value={scheme} onChange={pickScheme} allowInherit />
          </section>

          {project.changelog.length > 0 && (
            <section className="card">
              <h3>Concept timeline</h3>
              <ul className="timeline">
                {project.changelog.slice(-6).reverse().map((e, i) => (
                  <li key={i}>
                    {e.label && <span className="mono muted">{e.label} </span>}
                    {e.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
