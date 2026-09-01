import React, { useRef, useState } from 'react';
import { ViewHeader, ErrorNote } from '../components/bits.jsx';

function slugify(name) {
  return name
    .toLowerCase()
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'oe')
    .replaceAll('å', 'aa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/** Slug suggested from an export's file name: "<slug>-forge-export-<date>.zip". */
function slugFromZipName(fileName) {
  return slugify(fileName.replace(/\.zip$/i, '').replace(/-forge-export-\d{4}-\d{2}-\d{2}$/i, ''));
}

function ImportProject() {
  const [file, setFile] = useState(null);
  const [slug, setSlug] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFile(f);
    setSlug(slugFromZipName(f.name));
    setError(null);
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/projects/import?slug=' + encodeURIComponent(slug), {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      location.hash = '#/p/' + encodeURIComponent(data.slug);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <section className="import-project">
      <h2>…or import an existing project</h2>
      <p className="lede">
        Bring a project over from another Forge installation: choose the zip file made by{' '}
        <em>Export project</em> on its Overview screen (any zip of a project folder works). Forge
        unpacks it into a new folder under <span className="mono">projects/</span> — nothing else
        is touched, and existing projects are never overwritten.
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}

      <form className="card new-project-form" onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="ip-file">Project zip file</label>
          <div>
            <button type="button" className="preset" onClick={() => fileInput.current.click()}>
              Choose .zip file…
            </button>
            {file && <span className="file-name mono">{file.name}</span>}
            <input
              ref={fileInput}
              id="ip-file"
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={onFile}
              hidden
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="ip-slug">Folder name (slug)</label>
          <input
            id="ip-slug"
            type="text"
            className="mono"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="my-project"
            pattern="[a-z0-9][a-z0-9-]{1,49}"
            title="Lowercase letters, digits and hyphens"
            required
          />
          <div className="muted small">
            Becomes <span className="mono">projects/{slug || 'my-project'}/</span>
          </div>
        </div>

        <button className="btn-primary" type="submit" disabled={busy || !file}>
          {busy ? 'Importing…' : 'Import project'}
        </button>
      </form>
    </section>
  );
}

export default function NewProject() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function onName(v) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      location.hash = '#/p/' + encodeURIComponent(data.slug) + '/terminal?autostart=brief';
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="view">
      <ViewHeader kicker="new project" title="Start a new project">
        <p className="lede">
          Describe the idea — Forge scaffolds the document structure, opens the project's
          command window and starts a Claude Code session that drafts the concept, roadmap
          and first specs from your description. You continue the conversation in the terminal.
        </p>
      </ViewHeader>

      {error && <ErrorNote>{error}</ErrorNote>}

      <form className="card new-project-form" onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="np-name">Project name</label>
          <input
            id="np-name"
            type="text"
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="My project"
            maxLength={100}
            required
            autoFocus
          />
        </div>

        <div className="form-field">
          <label htmlFor="np-slug">Folder name (slug)</label>
          <input
            id="np-slug"
            type="text"
            className="mono"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="my-project"
            pattern="[a-z0-9][a-z0-9-]{1,49}"
            title="Lowercase letters, digits and hyphens"
            required
          />
          <div className="muted small">
            Becomes <span className="mono">projects/{slug || 'my-project'}/</span>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="np-desc">Describe the project</label>
          <textarea
            id="np-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is it, who is it for, what should v1 do? Write in any language — the documents will be drafted in the same language."
            maxLength={10000}
            required
          />
        </div>

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create project & start Claude Code'}
        </button>
      </form>

      <ImportProject />
    </div>
  );
}
