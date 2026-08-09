import React from 'react';
import { ProgressBar, ViewHeader, timeAgo } from '../components/bits.jsx';

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

      <div className="card-grid">
        {projects.map((p) => (
          <a key={p.slug} className="card project-card" href={'#/p/' + encodeURIComponent(p.slug)}>
            <h3>{p.name}</h3>
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
