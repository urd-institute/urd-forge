import React, { useEffect, useState } from 'react';
import { ViewHeader, ErrorNote } from '../components/bits.jsx';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Two-click confirm button, same pattern as the terminal's Stop session. */
function ArmedButton({ label, armedLabel, disabled, title, onFire }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={'preset stop-session' + (armed ? ' armed' : '')}
      disabled={disabled}
      title={title}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onFire();
      }}
    >
      {armed ? armedLabel : label}
    </button>
  );
}

export default function Update() {
  const [state, setState] = useState(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // null | 'restarting' | 'restart-failed' | 'stopped'
  const [phase, setPhase] = useState(null);

  function load(forceCheck) {
    if (forceCheck) setChecking(true);
    return fetch('/api/update' + (forceCheck ? '?check=1' : ''))
      .then((r) => r.json())
      .then(setState)
      .catch(() => {})
      .finally(() => setChecking(false));
  }

  useEffect(() => {
    load(false);
  }, []);

  async function install() {
    setInstalling(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/update/apply', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setInstalling(false);
      load(false);
    }
  }

  async function restartForge() {
    setError(null);
    setPhase('restarting');
    try {
      const res = await fetch('/api/restart', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPhase(null);
        setError(data.error || res.statusText);
        return;
      }
    } catch {
      // The server may die before the reply arrives — that IS the restart.
    }
    await wait(1500);
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      try {
        const r = await fetch('/api/status');
        if (r.ok) {
          location.reload();
          return;
        }
      } catch {
        /* still down */
      }
      await wait(1000);
    }
    setPhase('restart-failed');
  }

  async function stopForge() {
    setError(null);
    try {
      await fetch('/api/stop', { method: 'POST' });
    } catch {
      /* the connection dying is the expected outcome */
    }
    setPhase('stopped');
  }

  const supervised = Boolean(state && state.supervised);

  function processCard() {
    if (phase === 'restarting') {
      return (
        <section className="card">
          <h3>Restarting…</h3>
          <p className="muted">Forge is starting again — this page reloads when it is back.</p>
        </section>
      );
    }
    if (phase === 'stopped') {
      return (
        <section className="card">
          <h3>Forge stopped</h3>
          <p className="muted">
            Start it again with <span className="mono">npm run forge</span> in the installation
            folder, then reload this page.
          </p>
        </section>
      );
    }
    return (
      <section className="card">
        <h3>Restart or stop Forge</h3>
        <p className="muted small">
          Both end every terminal session.{' '}
          {supervised
            ? 'Restart brings Forge straight back — this is how an installed update takes effect.'
            : 'Forge was started without npm run forge, so it cannot start itself again — only stop.'}
        </p>
        {phase === 'restart-failed' && (
          <ErrorNote>
            Forge did not come back within a minute. Check the window running it, or start it
            again with <span className="mono">npm run forge</span>.
          </ErrorNote>
        )}
        <div className="btn-row">
          <ArmedButton
            label="Restart Forge"
            armedLabel="Click again to restart"
            disabled={!supervised}
            title={supervised ? 'Ends all terminal sessions and starts Forge again.' : 'Unavailable — start Forge with npm run forge to enable.'}
            onFire={restartForge}
          />
          <ArmedButton
            label="Stop Forge"
            armedLabel="Click again to stop"
            title="Ends all terminal sessions and shuts Forge down."
            onFire={stopForge}
          />
        </div>
      </section>
    );
  }

  const cur = state && state.current;

  if (state && state.disabled) {
    return (
      <div className="view">
        <ViewHeader kicker="updates" title="Updates" />
        <section className="card">
          <h3>Self-update is disabled here</h3>
          <p className="muted">
            This installation has <span className="mono">updates: false</span> in{' '}
            <span className="mono">forge.config.yaml</span> — typically because it is a
            development copy, which is updated by committing to the repository rather than
            pulling from it. Remove the setting to re-enable updates.
          </p>
        </section>
        {error && <ErrorNote>{error}</ErrorNote>}
        {processCard()}
      </div>
    );
  }

  return (
    <div className="view">
      <ViewHeader kicker="updates" title="Updates">
        <p className="lede">
          Forge updates itself from{' '}
          <span className="mono">github.com/urd-institute/urd-forge</span>. An update is
          only installed when it applies cleanly — your projects and any local changes are
          never overwritten. If anything conflicts, Forge refuses and tells you which files.
        </p>
      </ViewHeader>

      <section className="card">
        <h3>Installed version</h3>
        <p className="mono">
          v{cur && cur.version ? cur.version : '?'}
          {cur && cur.sha && <> · commit {cur.sha}</>}
          {cur && cur.branch && <> · branch {cur.branch}</>}
        </p>
        <button className="preset" onClick={() => load(true)} disabled={checking || installing}>
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
        {state && state.checkedAt && (
          <span className="muted small"> Last checked: {new Date(state.checkedAt).toLocaleTimeString()}</span>
        )}
      </section>

      {state && state.error && (
        <ErrorNote>
          Update check failed: {state.error}
          <div className="small" style={{ marginTop: 6 }}>
            Updates require this installation to be a git clone of the repository with
            network access to GitHub.
          </div>
        </ErrorNote>
      )}

      {state && !state.error && state.checkedAt && !state.available && !result && (
        <section className="card">
          <h3>Up to date</h3>
          <p className="muted">You are running the latest version.</p>
        </section>
      )}

      {state && state.available && (
        <section className="card">
          <h3>
            Update available — {state.behind} new commit{state.behind === 1 ? '' : 's'}
          </h3>
          <ul className="plain-list mono small">
            {state.commits.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>

          {state.ahead > 0 && (
            <ErrorNote>
              Your installation has {state.ahead} local commit{state.ahead === 1 ? '' : 's'} the
              update does not include. Install is disabled — merge manually with{' '}
              <span className="mono">git pull</span>.
            </ErrorNote>
          )}

          {state.conflicts.length > 0 && (
            <ErrorNote>
              These locally changed files would conflict with the update, so installing is
              disabled until they are committed, moved or reverted:
              <ul className="plain-list mono small" style={{ marginTop: 6 }}>
                {state.conflicts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </ErrorNote>
          )}

          {state.ahead === 0 && state.conflicts.length === 0 && (
            <>
              <p className="muted small">
                Installs with a clean fast-forward, refreshes dependencies and rebuilds the
                client. Terminal sessions keep running until you restart Forge.
              </p>
              <button className="btn-primary" onClick={install} disabled={installing}>
                {installing ? 'Installing… (this can take a minute)' : 'Install update'}
              </button>
            </>
          )}
        </section>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      {result && (
        <section className="card">
          <h3>Update installed</h3>
          <ul className="plain-list mono small">
            {result.steps.map((s) => (
              <li key={s}>✓ {s}</li>
            ))}
          </ul>
          {supervised ? (
            <>
              <p>
                <strong>Restart Forge to finish.</strong> Terminal sessions end; the page
                reloads when Forge is back.
              </p>
              <button
                className="btn-primary"
                onClick={restartForge}
                disabled={phase === 'restarting'}
              >
                {phase === 'restarting' ? 'Restarting…' : 'Restart Forge now'}
              </button>
            </>
          ) : (
            <p>
              <strong>Restart Forge to finish:</strong> stop it (Ctrl+C in the window running
              it) and run <span className="mono">npm run forge</span> again.
            </p>
          )}
        </section>
      )}

      {processCard()}
    </div>
  );
}
