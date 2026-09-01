import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { ViewHeader, useFetch } from '../components/bits.jsx';
import { api, apiPost } from '../api.js';
import { termFontSize } from '../settings.js';

const BRIEF_COMMAND = 'claude "Read .forge/brief.md and follow the instructions in it."';

function autostartCommand(autostart, file) {
  if (autostart === 'brief') return BRIEF_COMMAND;
  if (autostart === 'spec' && file && /^[A-Za-z0-9._-]+$/.test(file)) {
    return (
      'claude "Read specs/' +
      file +
      ' - a newly imported spec. Review it against CLAUDE.md and the existing specs,' +
      ' set its status and dependencies, add its steps to ROADMAP.md, and log an ADR in DOCS.md if it changes any decisions."'
    );
  }
  return null;
}

export default function Terminal({ slug, autostart, autostartFile }) {
  const holder = useRef(null);
  const wsRef = useRef(null);
  // Refits the terminal to its holder; set by the session effect below.
  const fitRef = useRef(null);
  const [presets, setPresets] = useState([]);
  const [notice, setNotice] = useState(null);
  const [pendingCommand, setPendingCommand] = useState(null);
  const [ended, setEnded] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  // Bumping this restarts the effect below: new WebSocket → new session.
  const [generation, setGeneration] = useState(0);
  // Whether the project has the /forge Claude Code command (SPEC-02 §4.3).
  const [forgeTick, setForgeTick] = useState(0);
  const [forgeError, setForgeError] = useState(null);
  const { data: project } = useFetch(() => api('/projects/' + encodeURIComponent(slug)), [slug, forgeTick]);

  async function installForge() {
    setForgeError(null);
    try {
      await apiPost('/projects/' + encodeURIComponent(slug) + '/commands/forge');
      setForgeTick((t) => t + 1);
    } catch (err) {
      setForgeError(err.message);
    }
  }

  useEffect(() => {
    setNotice(null);
    setEnded(false);
    setConfirmStop(false);

    const term = new XTerm({
      fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace',
      fontSize: termFontSize(),
      cursorBlink: true,
      // xterm's default (1000 lines) is exhausted quickly by Claude Code's
      // redraws; keep enough that earlier output stays reachable.
      scrollback: 10000,
      theme: {
        background: '#1c1a17',
        foreground: '#e8e2d6',
        cursor: '#e8b04b',
        selectionBackground: '#5a523f',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(holder.current);
    fit.fit();

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(
      `${proto}://${location.host}/ws/terminal?project=${encodeURIComponent(slug)}&cols=${term.cols}&rows=${term.rows}`
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'data') term.write(msg.data);
      else if (msg.type === 'ready') {
        setPresets(msg.presets || []);
        // Autostart only applies to the first session on this view — a
        // manually restarted session should come up as a plain shell.
        const cmd = generation === 0 ? autostartCommand(autostart, autostartFile) : null;
        if (cmd && msg.fresh) {
          // Brand-new session: run the command automatically. Revisiting the
          // URL never re-runs it (the session is no longer fresh).
          setTimeout(() => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'input', data: cmd + '\r' }));
          }, 600);
        } else if (cmd) {
          // A session is already running (possibly mid-Claude-conversation) —
          // never type into it automatically; offer the command as a button.
          setPendingCommand(cmd);
        }
      }
      else if (msg.type === 'unavailable') setNotice(msg.message);
      else if (msg.type === 'exit') {
        setEnded(true);
        setNotice('Session ended (exit code ' + msg.exitCode + ').');
      }
    };
    ws.onclose = () => {
      if (!notice) setNotice((n) => n || null);
    };

    const sub = term.onData((data) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'input', data }));
    });

    // ── Keep the terminal fitted to its holder ─────────────────────────
    // The holder shrinks after the first fit (the preset rows arrive over the
    // WebSocket, the /forge note appears once the project is fetched), and
    // ResizeObserver callbacks are throttled while the tab is in the
    // background. A missed fit leaves the terminal taller than the holder:
    // the bottom rows are clipped by overflow:hidden, and xterm shows no
    // scrollbar because, as far as it knows, everything fits. So: fit on
    // every signal, only tell the pty when the size really changed (ConPTY
    // repaints on every resize), verify the result and retry until it holds.
    let sent = { cols: term.cols, rows: term.rows };
    let retries = 0;
    let retryFrame = 0;
    const syncSize = () => {
      if (ws.readyState !== 1 || (term.cols === sent.cols && term.rows === sent.rows)) return;
      sent = { cols: term.cols, rows: term.rows };
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };
    // True when the terminal is taller than its holder (rows clipped) or at
    // least a full row shorter than it (space wasted after the holder grew).
    const misfits = () => {
      const el = holder.current;
      if (!el || !term.element) return false;
      const inner = el.clientHeight; // .term-inner has no padding or border
      const height = term.element.getBoundingClientRect().height;
      if (inner <= 0 || height <= 0) return false;
      const cell = height / Math.max(1, term.rows);
      return height > inner + 1 || inner - height >= cell;
    };
    const fitNow = () => {
      if (!holder.current || !term.element) return;
      fit.fit();
      syncSize();
      cancelAnimationFrame(retryFrame);
      if (misfits() && retries < 20) {
        retries += 1;
        retryFrame = requestAnimationFrame(fitNow);
      } else {
        retries = 0;
      }
    };
    fitRef.current = fitNow;
    ws.addEventListener('open', syncSize);
    window.addEventListener('resize', fitNow);
    document.addEventListener('visibilitychange', fitNow);
    const ro = new ResizeObserver(fitNow);
    ro.observe(holder.current);
    // Last line of defence: a cheap periodic check that never lets a clipped
    // (or needlessly small) terminal stay that way, whatever the browser did
    // with the events above — ResizeObserver and animation frames are paused
    // in a hidden tab; a timer keeps ticking.
    const guard = setInterval(() => {
      if (misfits()) fitNow();
    }, 1500);

    return () => {
      fitRef.current = null;
      clearInterval(guard);
      cancelAnimationFrame(retryFrame);
      window.removeEventListener('resize', fitNow);
      document.removeEventListener('visibilitychange', fitNow);
      ro.disconnect();
      sub.dispose();
      ws.close();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, generation]);

  // Anything rendered above the terminal (presets, notices, the /forge note)
  // changes the holder's height — refit after every render. fit() is a no-op
  // when the size is unchanged.
  useLayoutEffect(() => {
    if (fitRef.current) fitRef.current();
  });

  function runPreset(command) {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'preset', command }));
  }

  function stopSession() {
    if (!confirmStop) {
      setConfirmStop(true);
      // Reset the armed state if the second click never comes.
      setTimeout(() => setConfirmStop(false), 4000);
      return;
    }
    setConfirmStop(false);
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'kill' }));
  }

  return (
    <div className="view view-terminal">
      <ViewHeader kicker={'command window · ' + slug} title="Terminal">
        {presets.length > 0 && !ended && (
          <div className="preset-groups">
            {presets.map((g, i) => (
              <div className="preset-group" key={g.group || i}>
                {g.group && <span className="preset-group-label mono">{g.group}</span>}
                {g.items.map((p) => (
                  <button key={p.label} className="preset" onClick={() => runPreset(p.command)} title={p.command}>
                    {p.label}
                  </button>
                ))}
              </div>
            ))}
            <div className="preset-group">
              <span className="preset-group-label mono">Session</span>
              <button
                className={'preset stop-session' + (confirmStop ? ' armed' : '')}
                onClick={stopSession}
                title="Ends the shell and everything running in it. Use Ctrl+C in the terminal to interrupt just the running program."
              >
                {confirmStop ? 'Click again to stop' : 'Stop session'}
              </button>
            </div>
          </div>
        )}
      </ViewHeader>

      {project && project.hasForgeCommand === false && !ended && (
        <div className="pending-command forge-install">
          <span>
            <code>/forge</code> is not installed in this project — the Claude Code command that drafts a new spec
            (<code>/forge spec</code>) and answers a spec's open questions (<code>/forge q</code>).
          </span>
          <button className="preset" onClick={installForge} title="Creates .claude/commands/forge.md in the project">
            Install /forge
          </button>
          {forgeError && <span className="error-text small">{forgeError}</span>}
        </div>
      )}
      {notice && (
        <div className="error-note">
          {notice}
          {ended && (
            <button className="preset restart-session" onClick={() => setGeneration((g) => g + 1)}>
              Start a new session
            </button>
          )}
        </div>
      )}
      {pendingCommand && !ended && (
        <div className="pending-command">
          <span>
            Spec imported. This project already has a running session — send the
            integration command when the terminal is ready for input:
          </span>
          <button
            className="preset"
            onClick={() => {
              const ws = wsRef.current;
              if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'input', data: pendingCommand + '\r' }));
                setPendingCommand(null);
              }
            }}
          >
            Send integration command
          </button>
        </div>
      )}
      {/* xterm is mounted in an unpadded inner element: the fit addon sizes
          the terminal from its parent's border-box height, so padding on the
          parent would make it one row too tall (clipped, with no scrollbar). */}
      <div className="term-holder">
        <div className="term-inner" ref={holder} />
      </div>
      <p className="muted small">
        Session runs in <span className="mono">projects/{slug}</span> · localhost only · dies with the app.
      </p>
    </div>
  );
}
