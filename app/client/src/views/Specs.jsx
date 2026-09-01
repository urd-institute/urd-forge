import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { StatusPill, ViewHeader, ErrorNote, useFetch, fileLink } from '../components/bits.jsx';

const COLUMNS = [
  { status: 'draft', label: 'Draft' },
  { status: 'approved', label: 'Approved' },
  { status: 'in-progress', label: 'In progress' },
  { status: 'done', label: 'Done' },
  // Replaced by a newer spec — kept for history, never "open".
  { status: 'superseded', label: 'Superseded' },
];

/* ── Filter helpers (SPEC-02 §3.2; the server mirrors these rules) ─────── */

/** Query → words; a `#word` only matches topics. */
function queryWords(q) {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.startsWith('#') ? { word: w.slice(1), topicOnly: true } : { word: w, topicOnly: false }))
    .filter((w) => w.word);
}

function fieldText(spec) {
  return [spec.id, spec.title, spec.file, ...(spec.dependsOn || []), ...(spec.blocks || [])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

/** Words the card fields alone cannot answer — those need the server. */
function unresolvedWords(spec, words) {
  const fields = fieldText(spec);
  const topics = spec.topics || [];
  const missing = [];
  for (const w of words) {
    const inTopics = topics.some((t) => t.includes(w.word));
    if (w.topicOnly) {
      if (!inTopics) return null; // can never match
      continue;
    }
    if (!inTopics && !fields.includes(w.word)) missing.push(w.word);
  }
  return missing;
}

function readFilterFromHash() {
  const q = new URLSearchParams((location.hash.split('?')[1] || '').replace(/^\?/, ''));
  return {
    text: q.get('q') || '',
    topics: (q.get('topic') || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  };
}

function writeFilterToHash(slug, text, topics) {
  const params = new URLSearchParams();
  if (text.trim()) params.set('q', text.trim());
  if (topics.length) params.set('topic', topics.join(','));
  const base = '#/p/' + encodeURIComponent(slug) + '/specs';
  const next = params.toString() ? base + '?' + params.toString() : base;
  if (location.hash !== next) history.replaceState(null, '', next);
}

/** Wraps the matched words in <mark>. */
function Highlight({ text, words }) {
  const plain = words.filter((w) => !w.topicOnly).map((w) => w.word);
  if (!text || !plain.length) return text || null;
  const re = new RegExp('(' + plain.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
  return text.split(re).map((part, i) => (plain.includes(part.toLowerCase()) ? <mark key={i}>{part}</mark> : part));
}

export default function Specs({ slug, tick }) {
  const { data: project, error } = useFetch(() => api('/projects/' + encodeURIComponent(slug)), [slug, tick]);
  const initial = useMemo(readFilterFromHash, [slug]);
  const [text, setText] = useState(initial.text);
  const [topics, setTopics] = useState(initial.topics);
  const [contentHits, setContentHits] = useState({ q: '', matches: null });
  const inputRef = useRef(null);

  // Filter state lives in the URL so it survives reload and can be shared.
  useEffect(() => {
    writeFilterToHash(slug, text, topics);
  }, [slug, text, topics]);

  // `/` focuses the filter field when nothing else has focus.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || (document.activeElement && document.activeElement.isContentEditable)) return;
      e.preventDefault();
      inputRef.current && inputRef.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Content matches come from the server (debounced); the field matches are
  // computed locally so the board reacts instantly while typing.
  const words = useMemo(() => queryWords(text), [text]);
  const needsServer = words.some((w) => !w.topicOnly);
  useEffect(() => {
    if (!needsServer) {
      setContentHits({ q: '', matches: null });
      return undefined;
    }
    const q = text.trim();
    let alive = true;
    const timer = setTimeout(() => {
      api('/projects/' + encodeURIComponent(slug) + '/specs/filter?q=' + encodeURIComponent(q))
        .then((r) => alive && setContentHits({ q, matches: r.matches || [] }))
        .catch(() => alive && setContentHits({ q, matches: [] }));
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [slug, text, needsServer, tick]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!project) return <div className="view muted">Loading…</div>;

  const specs = project.specs || [];
  const unknown = specs.filter((s) => !COLUMNS.some((c) => c.status === s.status));

  // Topic chips: every topic in the project, with counts.
  const topicCounts = new Map();
  for (const s of specs) for (const t of s.topics || []) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
  const allTopics = [...topicCounts.keys()].sort();
  const activeTopics = topics.filter((t) => topicCounts.has(t));

  const serverHits = contentHits.matches && contentHits.q === text.trim() ? new Map(contentHits.matches.map((m) => [m.file, m])) : null;
  const filtering = words.length > 0 || activeTopics.length > 0;

  /** null = hidden; otherwise { snippet } for a visible card. */
  function matchInfo(spec) {
    if (activeTopics.length && !activeTopics.some((t) => (spec.topics || []).includes(t))) return null;
    if (!words.length) return { snippet: null };
    const missing = unresolvedWords(spec, words);
    if (missing === null) return null;
    if (!missing.length) return { snippet: null };
    // Needs the body: hidden until the server has answered for this query.
    if (!serverHits) return null;
    const hit = serverHits.get(spec.file);
    return hit ? { snippet: hit.snippet } : null;
  }

  const visible = new Map();
  for (const s of specs) {
    const m = matchInfo(s);
    if (m) visible.set(s.file, m);
  }

  const summary = filtering
    ? [text.trim(), ...activeTopics.map((t) => '#' + t)].filter(Boolean).join(' ')
    : '';

  return (
    <div className="view">
      <ViewHeader kicker={'spec board · ' + slug} title="Specs">
        <div className="spec-filter">
          <span className="spec-filter-box">
            <input
              ref={inputRef}
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Filter specs…"
              aria-label="Filter specs by words in id, title, topics or content"
              spellCheck={false}
            />
            {text && (
              <button className="spec-filter-clear" onClick={() => setText('')} title="Clear filter" aria-label="Clear filter">
                ✕
              </button>
            )}
          </span>
          <span className="spec-filter-hint">words match id, title, topics and content · #topic · press / to focus</span>
          <a className="preset import-spec-btn" href={'#/p/' + encodeURIComponent(slug) + '/import-spec'}>
            + Import spec
          </a>
        </div>
      </ViewHeader>

      {allTopics.length > 0 && (
        <div className="topic-chips">
          {allTopics.map((t) => (
            <button
              key={t}
              className={'topic-chip' + (activeTopics.includes(t) ? ' active' : '')}
              onClick={() => setTopics(activeTopics.includes(t) ? activeTopics.filter((x) => x !== t) : [...activeTopics, t])}
              title={activeTopics.includes(t) ? 'Remove topic from filter' : 'Only show specs with this topic'}
            >
              {t}
              <span className="count mono">{topicCounts.get(t)}</span>
            </button>
          ))}
          {activeTopics.length > 0 && (
            <button className="topic-chip" onClick={() => setTopics([])} title="Clear topic filter">
              clear
            </button>
          )}
        </div>
      )}

      {specs.length === 0 && <ErrorNote>No specs/ folder (or it is empty).</ErrorNote>}

      <div className="board">
        {COLUMNS.map((col) => {
          const cards = specs.filter((s) => s.status === col.status);
          const shown = cards.filter((s) => visible.has(s.file));
          return (
            <div className="board-col" key={col.status}>
              <div className="board-col-head">
                <StatusPill status={col.status} />
                <span className="mono muted">{filtering ? shown.length + '/' + cards.length : cards.length}</span>
              </div>
              {shown.map((s) => (
                <SpecCard key={s.file} spec={s} slug={slug} words={words} snippet={visible.get(s.file).snippet} />
              ))}
            </div>
          );
        })}
      </div>

      {filtering && specs.length > 0 && visible.size === 0 && (
        <p className="muted filter-empty">No specs match "{summary}".</p>
      )}

      {unknown.length > 0 && unknown.some((s) => visible.has(s.file)) && (
        <section className="card">
          <h3>Could not be parsed</h3>
          <p className="muted small">
            These files did not match the Forge format — shown instead of failing (SPEC-00 §8).
          </p>
          {unknown
            .filter((s) => visible.has(s.file))
            .map((s) => (
              <SpecCard key={s.file} spec={s} slug={slug} words={words} snippet={visible.get(s.file).snippet} />
            ))}
        </section>
      )}
    </div>
  );
}

function SpecCard({ spec, slug, words = [], snippet = null }) {
  return (
    <a className="card spec-card" href={fileLink(slug, 'specs/' + spec.file)}>
      <div className="mono spec-id">
        <Highlight text={spec.id || spec.file} words={words} />
      </div>
      {spec.title && (
        <div className="spec-title">
          <Highlight text={spec.title} words={words} />
        </div>
      )}
      {spec.dependsOn.length > 0 && (
        <div className="mono small muted">depends on: {spec.dependsOn.join(', ')}</div>
      )}
      {spec.blocks.length > 0 && <div className="mono small muted">blocks: {spec.blocks.join(', ')}</div>}
      {spec.topics && spec.topics.length > 0 && (
        <div className="spec-topics">
          {spec.topics.map((t) => (
            <span key={t} className="spec-topic">
              {t}
            </span>
          ))}
        </div>
      )}
      {snippet && (
        <div className="spec-snippet">
          <Highlight text={snippet} words={words} />
        </div>
      )}
      {spec.parseError && <div className="small error-text">{spec.parseError}</div>}
    </a>
  );
}
