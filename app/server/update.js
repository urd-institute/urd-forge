/*
 * Self-update via git (github.com/urd-institute/urd-forge).
 *
 * Safety model: the update is only ever applied as a clean fast-forward.
 * Before touching anything we check (1) that the installation has no local
 * commits the update lacks, and (2) that no locally modified or untracked
 * file overlaps with the files the update changes. Any overlap → refuse with
 * the file list, and nothing on disk is changed. The user's projects live in
 * projects/ and are untracked, so they are never touched by an update.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileP = promisify(execFile);

export class UpdateError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createUpdater(rootDir, version) {
  let state = {
    checkedAt: null,
    available: false,
    behind: 0,
    ahead: 0,
    commits: [],
    conflicts: [],
    error: null,
    current: { version, sha: null, branch: null },
  };

  async function git(...args) {
    try {
      const { stdout } = await execFileP('git', args, { cwd: rootDir, timeout: 60_000, windowsHide: true });
      return stdout.replace(/\r?\n$/, '');
    } catch (err) {
      const stderr = (err.stderr || '').toString().trim();
      const line = stderr.split('\n').find((l) => l.trim()) || err.message || 'git failed';
      throw new UpdateError(500, line.replace(/^fatal:\s*/i, ''));
    }
  }

  async function localInfo() {
    return {
      version,
      sha: await git('rev-parse', '--short', 'HEAD'),
      branch: await git('rev-parse', '--abbrev-ref', 'HEAD'),
    };
  }

  async function check() {
    try {
      const current = await localInfo();
      await git('fetch', '--quiet', 'origin');
      const upstream = 'origin/' + current.branch;
      const behind = Number(await git('rev-list', '--count', `HEAD..${upstream}`)) || 0;
      const ahead = Number(await git('rev-list', '--count', `${upstream}..HEAD`)) || 0;
      const commits = behind
        ? (await git('log', '--oneline', '--no-decorate', `HEAD..${upstream}`)).split('\n').slice(0, 20)
        : [];

      let conflicts = [];
      if (behind) {
        const incoming = new Set(
          (await git('diff', '--name-only', `HEAD..${upstream}`)).split('\n').filter(Boolean)
        );
        const porcelain = (await git('status', '--porcelain')).split('\n').filter(Boolean);
        const localFiles = porcelain
          .flatMap((l) => l.slice(3).split(' -> '))
          .map((s) => s.trim().replace(/^"|"$/g, ''))
          .filter(Boolean);
        conflicts = [...new Set(localFiles.filter((f) => incoming.has(f)))];
      }

      state = { checkedAt: Date.now(), available: behind > 0, behind, ahead, commits, conflicts, error: null, current };
    } catch (err) {
      state = { ...state, checkedAt: Date.now(), error: err.message };
    }
    return state;
  }

  async function apply() {
    await check(); // always re-verify immediately before touching anything
    if (state.error) throw new UpdateError(500, 'Update check failed: ' + state.error);
    if (!state.available) throw new UpdateError(409, 'Already up to date — nothing to install.');
    if (state.ahead > 0) {
      throw new UpdateError(
        409,
        `Your installation has ${state.ahead} local commit(s) the update does not include. ` +
          'Nothing was changed — merge manually with git pull.'
      );
    }
    if (state.conflicts.length > 0) {
      throw new UpdateError(
        409,
        'These locally changed files would be overwritten by the update: ' +
          state.conflicts.join(', ') +
          '. Nothing was changed — commit, move or revert them first.'
      );
    }

    const steps = [];
    await git('pull', '--ff-only', 'origin', state.current.branch);
    steps.push('git pull (fast-forward): ok');

    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await execFileP(npm, ['install', '--no-audit', '--no-fund'], {
      cwd: rootDir,
      timeout: 600_000,
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    steps.push('npm install: ok');

    await execFileP(process.execPath, [path.join(rootDir, 'scripts', 'forge.js'), '--build-only'], {
      cwd: rootDir,
      timeout: 600_000,
      windowsHide: true,
    });
    steps.push('client rebuild: ok');

    await check();
    return { ok: true, steps, restartRequired: true, now: state.current };
  }

  return { check, apply, getState: () => state };
}
