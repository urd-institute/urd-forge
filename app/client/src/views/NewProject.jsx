import React, { useState } from 'react';
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
    </div>
  );
}
