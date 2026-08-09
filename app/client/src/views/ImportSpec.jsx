import React, { useRef, useState } from 'react';
import { ViewHeader, ErrorNote } from '../components/bits.jsx';

export default function ImportSpec({ slug }) {
  const [content, setContent] = useState('');
  const [area, setArea] = useState('');
  const [integrate, setIntegrate] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    f.text().then((text) => {
      setContent(text);
      if (!area) setArea(f.name.replace(/\.md$/i, '').replace(/^SPEC-\d+-?/i, ''));
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/projects/' + encodeURIComponent(slug) + '/specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, area }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (integrate) {
        location.hash =
          '#/p/' + encodeURIComponent(slug) + '/terminal?autostart=spec&file=' + encodeURIComponent(data.file);
      } else {
        location.hash = '#/p/' + encodeURIComponent(slug) + '/specs';
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="view">
      <ViewHeader kicker={'import spec · ' + slug} title="Import a spec">
        <p className="lede">
          Paste a spec written elsewhere — for example drafted with Claude — or choose a
          markdown file. Forge assigns the next free SPEC number, normalises the
          frontmatter and files it under <span className="mono">specs/</span>. The content
          itself is left untouched.
        </p>
      </ViewHeader>

      {error && <ErrorNote>{error}</ErrorNote>}

      <form className="card new-project-form" onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="is-content">Spec markdown</label>
          <textarea
            id="is-content"
            className="mono spec-paste"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={'---\nid: SPEC-07\ntitel: …\nstatus: draft\n---\n\n# The spec…\n\n(frontmatter is optional — Forge adds it if missing)'}
            required
          />
          <div className="import-file-row">
            <button type="button" className="preset" onClick={() => fileInput.current.click()}>
              Choose .md file…
            </button>
            <input ref={fileInput} type="file" accept=".md,.markdown,.txt" onChange={onFile} hidden />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="is-area">Area name (used in the filename, optional)</label>
          <input
            id="is-area"
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="e.g. export, search, sharing"
            maxLength={60}
          />
        </div>

        <label className="check-row">
          <input type="checkbox" checked={integrate} onChange={(e) => setIntegrate(e.target.checked)} />
          <span>
            Open the terminal and ask Claude Code to integrate the spec (roadmap steps,
            dependencies, decision log)
          </span>
        </label>

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Importing…' : 'Import spec'}
        </button>
      </form>
    </div>
  );
}
