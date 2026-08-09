import React from 'react';
import { api } from '../api.js';
import { Markdown, ViewHeader, ErrorNote, useFetch } from '../components/bits.jsx';

export default function FileView({ slug, path, tick }) {
  const { data, error } = useFetch(
    () => api('/projects/' + encodeURIComponent(slug) + '/file?path=' + encodeURIComponent(path)),
    [slug, path, tick]
  );

  const isMarkdown = /\.md$/i.test(path);

  return (
    <div className="view">
      <ViewHeader kicker={'file · ' + slug} title={path} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && (
        <section className="card">
          {isMarkdown ? (
            <Markdown text={data.content} />
          ) : (
            <pre className="raw-file mono">{data.content}</pre>
          )}
        </section>
      )}
    </div>
  );
}
