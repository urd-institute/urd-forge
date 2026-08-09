/*
 * File watcher → re-parse changed projects → push to the UI (SPEC-00 §7).
 * Thin wrapper over @urd/reader-core's watchUnits with Forge's ignore list.
 */
import { watchUnits } from '@urd/reader-core';

export function startWatcher(config, store, broadcast) {
  return watchUnits(config.projectsDir, {
    ignored: /(^|[\\/])(\.forge|\.git|node_modules|\.claude)([\\/]|$)/,
    isKnown: (slug) => Boolean(store.get(slug)),
    onUnit: (slug) => {
      const project = store.refresh(slug);
      if (project) {
        broadcast({ type: 'project-updated', slug });
      } else {
        broadcast({ type: 'projects-changed' });
      }
    },
    onNewUnit: (slug) => {
      // New project folder appeared.
      store.refresh(slug);
      broadcast({ type: 'projects-changed' });
    },
    onError: (err) => console.warn('[forge] watcher error:', err.message),
  });
}
