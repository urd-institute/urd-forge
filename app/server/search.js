/*
 * Free-text search across all project files (SPEC-00 §5.5). Thin wrapper
 * over @urd/reader-core's searchUnits with Forge's ignore list; "unit"
 * becomes "project" in the API shape.
 */
import { searchUnits } from '@urd/reader-core';

const TEXT_EXT = [
  '.md', '.txt', '.yaml', '.yml', '.json', '.js', '.mjs', '.cjs', '.ts',
  '.tsx', '.jsx', '.css', '.html', '.sh', '.ps1', '.py', '.toml', '.csv',
];
const IGNORED_DIRS = ['.forge', '.git', 'node_modules', '.claude'];

export function search(config, query, { project = null } = {}) {
  const { results, truncated } = searchUnits(config.projectsDir, query, {
    unit: project,
    textExtensions: TEXT_EXT,
    ignoredDirs: IGNORED_DIRS,
  });
  return {
    query,
    results: results.map(({ unit, file, matches }) => ({ project: unit, file, matches })),
    truncated,
  };
}
