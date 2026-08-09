import React from 'react';
import { api } from '../api.js';
import { StatusPill, ViewHeader, ErrorNote, useFetch, fileLink } from '../components/bits.jsx';

const COLUMNS = [
  { status: 'draft', label: 'Draft' },
  { status: 'approved', label: 'Approved' },
  { status: 'in-progress', label: 'In progress' },
  { status: 'done', label: 'Done' },
];

export default function Specs({ slug, tick }) {
  const { data: project, error } = useFetch(() => api('/projects/' + encodeURIComponent(slug)), [slug, tick]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!project) return <div className="view muted">Loading…</div>;

  const specs = project.specs || [];
  const unknown = specs.filter((s) => !COLUMNS.some((c) => c.status === s.status));

  return (
    <div className="view">
      <ViewHeader kicker={'spec board · ' + slug} title="Specs">
        <a className="preset import-spec-btn" href={'#/p/' + encodeURIComponent(slug) + '/import-spec'}>
          + Import spec
        </a>
      </ViewHeader>

      {specs.length === 0 && <ErrorNote>No specs/ folder (or it is empty).</ErrorNote>}

      <div className="board">
        {COLUMNS.map((col) => {
          const cards = specs.filter((s) => s.status === col.status);
          return (
            <div className="board-col" key={col.status}>
              <div className="board-col-head">
                <StatusPill status={col.status} />
                <span className="mono muted">{cards.length}</span>
              </div>
              {cards.map((s) => (
                <SpecCard key={s.file} spec={s} slug={slug} />
              ))}
            </div>
          );
        })}
      </div>

      {unknown.length > 0 && (
        <section className="card">
          <h3>Could not be parsed</h3>
          <p className="muted small">
            These files did not match the Forge format — shown instead of failing (SPEC-00 §8).
          </p>
          {unknown.map((s) => (
            <SpecCard key={s.file} spec={s} slug={slug} />
          ))}
        </section>
      )}
    </div>
  );
}

function SpecCard({ spec, slug }) {
  return (
    <a className="card spec-card" href={fileLink(slug, 'specs/' + spec.file)}>
      <div className="mono spec-id">{spec.id || spec.file}</div>
      {spec.title && <div className="spec-title">{spec.title}</div>}
      {spec.dependsOn.length > 0 && (
        <div className="mono small muted">depends on: {spec.dependsOn.join(', ')}</div>
      )}
      {spec.blocks.length > 0 && <div className="mono small muted">blocks: {spec.blocks.join(', ')}</div>}
      {spec.parseError && <div className="small error-text">{spec.parseError}</div>}
    </a>
  );
}
