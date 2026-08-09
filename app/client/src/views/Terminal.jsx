import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { ViewHeader } from '../components/bits.jsx';
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
  const [presets, setPresets] = useState([]);
  const [notice, setNotice] = useState(null);
  const [pendingCommand, setPendingCommand] = useState(null);
  const [ended, setEnded] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  // Bumping this restarts the effect below: new WebSocket → new session.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    setNotice(null);
    setEnded(false);
    setConfirmStop(false);

    const term = new XTerm({
      fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace',
      fontSize: termFontSize(),
      cursorBlink: true,
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

    const onResize = () => {
      fit.fit();
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(holder.current);

    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      sub.dispose();
      ws.close();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, generation]);

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
      <div className="term-holder" ref={holder} />
      <p className="muted small">
        Session runs in <span className="mono">projects/{slug}</span> · localhost only · dies with the app.
      </p>
    </div>
  );
}
