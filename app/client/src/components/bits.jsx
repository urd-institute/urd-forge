import React from 'react';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

export function ProgressBar({ pct, slim = false }) {
  const value = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className={'progress' + (slim ? ' slim' : '')} title={value + '%'}>
      <div className="progress-fill" style={{ width: value + '%' }} />
      {!slim && <span className="progress-label mono">{value}%</span>}
    </div>
  );
}

export function StatusPill({ status }) {
  return <span className={'pill status-' + (status || 'unknown')}>{status || 'unknown'}</span>;
}

/** Renders local, trusted project markdown. */
export function Markdown({ text }) {
  const html = React.useMemo(() => marked.parse(text || ''), [text]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function fileLink(slug, path) {
  return '#/p/' + encodeURIComponent(slug) + '/file?path=' + encodeURIComponent(path);
}

export function ViewHeader({ kicker, title, children }) {
  return (
    <header className="view-header">
      {kicker && <div className="kicker mono">{kicker}</div>}
      <h1>{title}</h1>
      {children}
    </header>
  );
}

export function ErrorNote({ children }) {
  return <div className="error-note">{children}</div>;
}

export function useFetch(loader, deps) {
  const [state, setState] = React.useState({ data: null, error: null, loading: true });
  React.useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loader()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((err) => alive && setState({ data: null, error: err.message, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function timeAgo(ms) {
  if (!ms) return '';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(ms).toISOString().slice(0, 10);
}
