import React from 'react';
import { api } from '../api.js';
import { ViewHeader, ErrorNote, useFetch, fileLink } from '../components/bits.jsx';

export default function Search({ query, tick }) {
  const { data, error, loading } = useFetch(
    () => (query ? api('/search?q=' + encodeURIComponent(query)) : Promise.resolve(null)),
    [query, tick]
  );

  return (
    <div className="view">
      <ViewHeader kicker="search · all projects" title={query ? `“${query}”` : 'Search'} />

      {!query && <p className="muted">Type a query in the sidebar to search across every project file.</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && query && <p className="muted">Searching…</p>}

      {data && (
        <>
          <p className="muted mono small">
            {data.results.length} file{data.results.length === 1 ? '' : 's'}
            {data.truncated && ' (truncated)'}
          </p>
          {data.results.map((r) => (
            <section className="card search-hit" key={r.project + '/' + r.file}>
              <a className="mono search-file" href={fileLink(r.project, r.file)}>
                {r.project} / {r.file}
              </a>
              <ul className="plain-list small">
                {r.matches.map((m) => (
                  <li key={m.line}>
                    <span className="mono muted">{m.line}:</span> <Highlight text={m.text} q={data.query} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function Highlight({ text, q }) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}
