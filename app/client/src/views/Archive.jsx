import React, { useState } from 'react';
import { ProgressBar, ViewHeader, ErrorNote, timeAgo } from '../components/bits.jsx';

export default function Archive({ projects, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function restore(slug) {
    setBusy(slug);
    setError(null);
    try {
      const res = await fetch('/api/projects/' + encodeURIComponent(slug) + '/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      onChanged && onChanged();
    } catch (err) {
      setError(err.message);
    }
    setBusy(null);
  }

  return (
    <div className="view">
      <ViewHeader kicker="archive" title="Archived projects">
        <p className="lede">
          Archived projects are hidden from the sidebar and the home screen, but their files in{' '}
          <code>projects/</code> are untouched and still searchable. Restore a project to bring it
          back.
        </p>
      </ViewHeader>

      {error && <ErrorNote>{error}</ErrorNote>}

      {projects.length === 0 ? (
        <p className="muted">Nothing here — no projects are archived.</p>
      ) : (
        <ul className="archive-list">
          {projects.map((p) => (
            <li key={p.slug} className="archive-row">
              <div className="archive-main">
                <a className="archive-name" href={'#/p/' + encodeURIComponent(p.slug)}>
                  {p.name}
                </a>
                {p.summary && <p className="muted clamp small">{p.summary}</p>}
                <div className="card-meta mono">
                  {p.specCount} spec{p.specCount === 1 ? '' : 's'}
                  {p.progress != null && ` · ${Math.round(p.progress)}%`}
                  {p.updatedAt && ` · ${timeAgo(p.updatedAt)}`}
                </div>
              </div>
              {p.progress != null && (
                <div className="archive-progress">
                  <ProgressBar pct={p.progress} slim />
                </div>
              )}
              <button className="preset" onClick={() => restore(p.slug)} disabled={busy === p.slug}>
                {busy === p.slug ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
