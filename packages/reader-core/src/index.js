/*
 * @urd/reader-core — shared reader engine for URD Forge and URD TAFL.
 * Taxonomy-neutral: it knows frontmatter, checkboxes and heading patterns —
 * not "specs", "tasks" or "boards". Each app composes its own taxonomy on
 * top. Tolerance principle throughout: hand-written deviations produce
 * `parseError`/`error` notes, never exceptions.
 */
export { splitFrontmatter, stripFrontmatter } from './frontmatter.js';
export { parsePhases } from './blocks.js';
export { parseHeadingLog } from './headings.js';
export { parseChangelog } from './changelog.js';
export { firstParagraph, projectName } from './summary.js';
export { watchUnits } from './watch.js';
export { searchUnits } from './search.js';
