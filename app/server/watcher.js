/*
 * File watcher → re-parse changed projects → push to the UI (SPEC-00 §7).
 */
import path from 'node:path';
import chokidar from 'chokidar';

export function startWatcher(config, store, broadcast) {
  const watcher = chokidar.watch(config.projectsDir, {
    ignored: /(^|[\\/])(\.forge|\.git|node_modules|\.claude)([\\/]|$)/,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  const pending = new Map(); // slug → timeout

  function scheduleRefresh(slug) {
    clearTimeout(pending.get(slug));
    pending.set(
      slug,
      setTimeout(() => {
        pending.delete(slug);
        const project = store.refresh(slug);
        if (project) {
          broadcast({ type: 'project-updated', slug });
        } else {
          broadcast({ type: 'projects-changed' });
        }
      }, 250)
    );
  }

  watcher.on('all', (event, changedPath) => {
    const rel = path.relative(config.projectsDir, changedPath);
    if (rel.startsWith('..')) return;
    const slug = rel.split(path.sep)[0];
    if (!slug) return;
    if (!store.get(slug) && (event === 'add' || event === 'addDir')) {
      // New project folder appeared.
      store.refresh(slug);
      broadcast({ type: 'projects-changed' });
      return;
    }
    scheduleRefresh(slug);
  });

  watcher.on('error', (err) => console.warn('[forge] watcher error:', err.message));
  return watcher;
}
