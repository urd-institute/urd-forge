/*
 * Local installation state: user choices that must survive self-updates.
 * Lives in forge.state.json next to forge.config.yaml — untracked by git,
 * so a `git pull` from the Updates screen never resets it. The config file
 * stays hand-edited; this file is written by Forge only.
 *
 * Holds the archived projects and the pinned ones (listed first in the
 * sidebar and on the home screen).
 */
import fs from 'node:fs';
import path from 'node:path';

export class LocalState {
  constructor(rootDir) {
    this.file = path.join(rootDir, 'forge.state.json');
    this.archived = new Set();
    this.pinned = new Set();
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(raw.archived)) this.archived = new Set(raw.archived.map(String));
      if (Array.isArray(raw.pinned)) this.pinned = new Set(raw.pinned.map(String));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[forge] Could not read forge.state.json — starting empty:', err.message);
      }
    }
  }

  isArchived(slug) {
    return this.archived.has(slug);
  }

  /** Archived slugs are kept even if the folder disappears — a project that
   *  comes back (e.g. restored by an update) stays archived. */
  setArchived(slug, archived) {
    if (archived) this.archived.add(slug);
    else this.archived.delete(slug);
    this.save();
  }

  isPinned(slug) {
    return this.pinned.has(slug);
  }

  setPinned(slug, pinned) {
    if (pinned) this.pinned.add(slug);
    else this.pinned.delete(slug);
    this.save();
  }

  save() {
    try {
      fs.writeFileSync(
        this.file,
        JSON.stringify(
          {
            note: 'Local URD Forge state (per installation) — managed from the UI.',
            archived: [...this.archived].sort(),
            pinned: [...this.pinned].sort(),
          },
          null,
          2
        ) + '\n'
      );
    } catch (err) {
      console.warn('[forge] Could not write forge.state.json:', err.message);
    }
  }
}
