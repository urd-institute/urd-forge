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
} from '../components/bits.jsx';

export default function Overview({ slug, tick }) {
  const { data: project, error } = useFetch(() => api('/projects/' + encodeURIComponent(slug)), [slug, tick]);
  const { data: readme } = useFetch(
    () => api('/projects/' + encodeURIComponent(slug) + '/file?path=README.md').catch(() => null),
    [slug, tick]
  );

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
