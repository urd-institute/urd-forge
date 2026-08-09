import React from 'react';
import { api } from '../api.js';
import { ProgressBar, ViewHeader, ErrorNote, useFetch, fileLink } from '../components/bits.jsx';

export default function Roadmap({ slug, tick }) {
  const { data: project, error } = useFetch(() => api('/projects/' + encodeURIComponent(slug)), [slug, tick]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!project) return <div className="view muted">Loading…</div>;

  const roadmap = project.roadmap;

  return (
    <div className="view">
      <ViewHeader kicker={'roadmap · ' + slug} title="Roadmap">
        {roadmap && roadmap.pct != null && (
          <div className="header-progress">
            <ProgressBar pct={roadmap.pct} />
            <span className="mono muted">
              {roadmap.done}/{roadmap.total} steps
            </span>
          </div>
        )}
        <a className="source-link mono" href={fileLink(slug, 'ROADMAP.md')}>
          source: ROADMAP.md
        </a>
      </ViewHeader>

      {!roadmap && <ErrorNote>No ROADMAP.md in this project.</ErrorNote>}
      {roadmap && roadmap.parseError && <ErrorNote>ROADMAP.md could not be parsed: {roadmap.parseError}</ErrorNote>}

      {roadmap &&
        roadmap.phases.map((phase, i) => (
          <section className="card phase" key={i}>
            <div className="phase-head">
              <h3>{phase.title || 'Steps'}</h3>
              <div className="phase-progress">
                <ProgressBar pct={phase.pct} />
                <span className="mono muted">
                  {phase.done}/{phase.total}
                </span>
              </div>
            </div>
            <ul className="steps">
              {phase.items.map((item, j) => (
                <li key={j} className={item.done ? 'done' : ''}>
                  <a href={fileLink(slug, 'ROADMAP.md')} title={'ROADMAP.md line ' + item.line}>
                    <span className="checkbox mono">{item.done ? '☑' : '☐'}</span> {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
