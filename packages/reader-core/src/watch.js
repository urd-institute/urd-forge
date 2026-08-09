/*
 * Watch a root folder of unit subfolders (projects in Forge, boards in TAFL)
 * and report changes debounced per unit.
 */
import path from 'node:path';
import chokidar from 'chokidar';

/**
 * options:
 *   ignored            chokidar ignore pattern
 *   debounceMs         per-unit debounce (default 250)
 *   isKnown(slug)      → false routes add/addDir events to onNewUnit
 *   onUnit(slug)       debounced change callback
 *   onNewUnit(slug)    a unit folder appeared (called immediately)
 *   onError(err)
 */
export function watchUnits(rootDir, options = {}) {
  const {
    ignored,
    debounceMs = 250,
    isKnown = () => true,
    onUnit = () => {},
    onNewUnit = null,
    onError = null,
  } = options;

  const watcher = chokidar.watch(rootDir, {
    ignored,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  const pending = new Map(); // slug → timeout

  function schedule(slug) {
    clearTimeout(pending.get(slug));
    pending.set(
      slug,
      setTimeout(() => {
        pending.delete(slug);
        onUnit(slug);
      }, debounceMs)
    );
  }

  watcher.on('all', (event, changedPath) => {
    const rel = path.relative(rootDir, changedPath);
    if (rel.startsWith('..')) return;
    const slug = rel.split(path.sep)[0];
    if (!slug) return;
    if (onNewUnit && !isKnown(slug) && (event === 'add' || event === 'addDir')) {
      onNewUnit(slug);
      return;
    }
    schedule(slug);
  });

  if (onError) watcher.on('error', onError);
  return watcher;
}
