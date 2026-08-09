import React from 'react';
import { api } from '../api.js';
import { ViewHeader, ErrorNote, useFetch, fileLink } from '../components/bits.jsx';

export default function Decisions({ slug, tick }) {
  const { data: project, error } = useFetch(() => api('/projects/' + encodeURIComponent(slug)), [slug, tick]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!project) return <div className="view muted">Loading…</div>;

  const adrs = [...(project.adrs || [])].reverse(); // newest (last appended) first

  return (
    <div className="view">
      <ViewHeader kicker={'decision log · ' + slug} title="Decisions">
        <a className="source-link mono" href={fileLink(slug, 'DOCS.md')}>
          source: DOCS.md
        </a>
      </ViewHeader>

      {!project.hasDocs && <ErrorNote>No DOCS.md in this project.</ErrorNote>}
      {project.hasDocs && adrs.length === 0 && (
        <p className="muted">
          No ADR entries found. Record decisions in DOCS.md as <code>### ADR-001 — title</code>.
        </p>
      )}

      <div className="adr-list">
        {adrs.map((adr) => (
          <a key={adr.id + adr.line} className="card adr" href={fileLink(slug, 'DOCS.md')}>
            <div className="mono spec-id">{adr.id}</div>
            <h3>{adr.title}</h3>
            {adr.excerpt && <p className="muted small">{adr.excerpt}</p>}
          </a>
        ))}
      </div>
    </div>
  );
}
