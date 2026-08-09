import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export function loadConfig(rootDir) {
  const file = path.join(rootDir, 'forge.config.yaml');
  let raw = {};
  try {
    raw = YAML.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[forge] Could not parse forge.config.yaml — using defaults:', err.message);
    }
  }
  return {
    rootDir,
    port: Number(raw.port) || 4400,
    projectsDir: path.resolve(rootDir, raw.projectsDir || 'projects'),
    presets: raw.presets && typeof raw.presets === 'object' ? raw.presets : {},
    // Declared dev servers per project slug, for servers started outside
    // Forge's terminals: slug → ["http://localhost:3000", {label, url}, …].
    servers: raw.servers && typeof raw.servers === 'object' ? raw.servers : {},
    // `updates: false` disables self-update entirely — meant for development
    // copies, where the repository is updated by committing, not by pulling.
    updates: raw.updates !== false,
  };
}

/* Built-in defaults, used when forge.config.yaml defines no presets.
 * Grouped by topic so the command window explains itself. */
const DEFAULT_PRESET_GROUPS = [
  {
    group: 'Status',
    items: [
      { label: 'Project status', command: 'claude "Read ROADMAP.md, specs/ and DOCS.md and give me a short status: overall progress, what is in progress right now, and the 3 most important next steps."' },
      { label: 'Outstanding', command: 'claude "List everything outstanding in this project: unchecked steps in ROADMAP.md (per phase) and every spec that is not done. Prioritise the list and mark what blocks other work."' },
      { label: 'Git status', command: 'git status' },
      { label: 'Recent changes', command: 'git log --oneline -15' },
    ],
  },
  {
    group: 'Tasks',
    items: [
      { label: 'Next task', command: 'claude "Find the next unchecked step in ROADMAP.md (respect spec dependencies). Briefly explain how you will solve it, start when I confirm, and tick the step when it is done."' },
      { label: 'Implement a spec', command: 'claude "List the specs with status approved or in-progress and ask which one to implement. Then implement it, update its status and tick the matching steps in ROADMAP.md."' },
      { label: 'Continue session', command: 'claude --continue' },
    ],
  },
  {
    group: 'Documents',
    items: [
      { label: 'New spec', command: 'claude "I want to write a new spec. Interview me briefly about the area and the goal, then write it in specs/ following the Forge format with status draft and correct dependencies."' },
      { label: 'Consistency check', command: 'claude "Check that the project files are consistent: does ROADMAP.md match the spec statuses? Are decisions missing ADR entries in DOCS.md? Is the CONCEPT.md changelog up to date? Report only the deviations and fix them after my approval."' },
      { label: 'Log a decision', command: 'claude "I want to log a decision. Ask me what was decided and why, then append it as the next ADR in DOCS.md."' },
    ],
  },
  {
    group: 'Claude Code',
    items: [
      { label: 'Start Claude Code', command: 'claude' },
      // For use while Claude Code is running in the session: types the
      // /model slash command to show or switch the active model.
      { label: '/model', command: '/model' },
    ],
  },
];

function normalizeItems(list) {
  return list
    .filter((p) => p && typeof p.command === 'string')
    .map((p) => ({ label: String(p.label || p.command), command: p.command }));
}

/** Returns preset groups: [{group: string|null, items: [{label, command}]}].
 *  Accepts both the grouped format ({group, items}) and the old flat list. */
export function presetsFor(config, slug) {
  const own = Array.isArray(config.presets[slug]) ? config.presets[slug] : null;
  const def = Array.isArray(config.presets.default) ? config.presets.default : null;
  const raw = own || def;
  if (!raw) return DEFAULT_PRESET_GROUPS;

  const groups = [];
  const loose = [];
  for (const entry of raw) {
    if (entry && Array.isArray(entry.items)) {
      groups.push({ group: entry.group != null ? String(entry.group) : null, items: normalizeItems(entry.items) });
    } else if (entry && typeof entry.command === 'string') {
      loose.push(...normalizeItems([entry]));
    }
  }
  if (loose.length) groups.unshift({ group: null, items: loose });
  return groups.filter((g) => g.items.length > 0);
}
