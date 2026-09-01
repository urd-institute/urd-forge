import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { termFontSize } from '../settings.js';

/*
 * One terminal tab (SPEC-03 §4): an xterm instance attached to one pty
 * session (`slug` + `tabId`) over its own WebSocket. Mounted by the panel for
 * every tab of the project and kept alive while the user navigates between
 * views — only the active tab is displayed, the others are `display: none`.
 *
 * Keys the panel handles itself (Ctrl+J / Ctrl+` toggle, Alt+N new tab,
 * Alt+1…9 switch tab) are let through xterm so the panel's document-level
 * listener sees them.
 */
function isPanelShortcut(ev) {
  if (ev.type !== 'keydown') return false;
  if (ev.ctrlKey && !ev.altKey && !ev.shiftKey && (ev.key === 'j' || ev.key === 'J' || ev.code === 'Backquote')) return true;
  if (ev.altKey && !ev.ctrlKey && (ev.key === 'n' || ev.key === 'N' || /^[1-9]$/.test(ev.key))) return true;
  return false;
}

const TerminalTab = forwardRef(function TerminalTab(
  { slug, tabId, title, active, initialCommand, viaPreset, generation, onReady, onExit, onTitle, onActivity, onUnavailable },
  ref
) {
  const holder = useRef(null);
  const wsRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // Callbacks change every render; keep the latest without restarting the session.
  const cbs = useRef({});
  cbs.current = { onReady, onExit, onTitle, onActivity, onUnavailable };

  useImperativeHandle(ref, () => ({
    runPreset(command) {
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'preset', command }));
    },
    sendInput(data) {
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'input', data }));
    },
    kill(close) {
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'kill', close: Boolean(close) }));
    },
    // The tab name lives on the server so it survives reloads (SPEC-03 §4.2).
    setTitle(title) {
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'title', title }));
    },
    fit() {
      if (fitRef.current) fitRef.current();
    },
    focus() {
      if (termRef.current) termRef.current.focus();
    },
  }));

  useEffect(() => {
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
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.attachCustomKeyEventHandler((ev) => !isPanelShortcut(ev));
    term.open(holder.current);
    if (holder.current.clientHeight > 0) fit.fit();

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(
      `${proto}://${location.host}/ws/terminal?project=${encodeURIComponent(slug)}&tab=${encodeURIComponent(tabId)}` +
        `&title=${encodeURIComponent(title || '')}&cols=${term.cols}&rows=${term.rows}`
    );
    wsRef.current = ws;
    let started = false;

    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'data') {
        if (msg.replay) {
          // Scrollback replay on (re)attach: repaint once it is in, in case
          // the renderer measured the element before layout settled.
          term.write(msg.data, () => {
            if (fitRef.current) fitRef.current();
            term.refresh(0, term.rows - 1);
          });
          return;
        }
        term.write(msg.data);
        if (!activeRef.current && cbs.current.onActivity) cbs.current.onActivity();
      } else if (msg.type === 'ready') {
        if (cbs.current.onReady) cbs.current.onReady(msg);
        // A command to run in a brand-new tab (a preset launched "in new
        // tab", or the autostart after creating/importing). Only when the
        // session is fresh: a reattached session is never typed into.
        if (initialCommand && msg.fresh && !started) {
          started = true;
          setTimeout(() => {
            if (ws.readyState !== 1) return;
            if (viaPreset) ws.send(JSON.stringify({ type: 'preset', command: initialCommand }));
            else ws.send(JSON.stringify({ type: 'input', data: initialCommand + '\r' }));
          }, 600);
        }
      } else if (msg.type === 'unavailable') {
        if (cbs.current.onUnavailable) cbs.current.onUnavailable(msg.message);
      } else if (msg.type === 'exit') {
        if (cbs.current.onExit) cbs.current.onExit(msg.exitCode, Boolean(msg.closed));
      }
    };

    const subData = term.onData((data) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'input', data }));
    });
    // The program's own window title (OSC 0/2) — Claude Code sets one.
    const subTitle = term.onTitleChange((t) => {
      if (cbs.current.onTitle) cbs.current.onTitle(t);
    });

    // ── Keep the terminal fitted to its holder (ADR-015) ───────────────
    // Fit on every signal, only tell the pty when the size really changed
    // (ConPTY repaints on every resize), verify the result and retry until
    // it holds. A hidden tab (display: none) has no height: never fit it —
    // the fit addon would shrink it to 2×1 and reflow the scrollback.
    let sent = { cols: term.cols, rows: term.rows };
    let retries = 0;
    let retryFrame = 0;
    const visible = () => holder.current && holder.current.clientHeight > 0;
    const syncSize = () => {
      if (ws.readyState !== 1 || (term.cols === sent.cols && term.rows === sent.rows)) return;
      sent = { cols: term.cols, rows: term.rows };
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };
    const misfits = () => {
      const el = holder.current;
      if (!el || !term.element) return false;
      const inner = el.clientHeight;
      const height = term.element.getBoundingClientRect().height;
      if (inner <= 0 || height <= 0) return false;
      const cell = height / Math.max(1, term.rows);
      return height > inner + 1 || inner - height >= cell;
    };
    const fitNow = () => {
      if (!visible() || !term.element) return;
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
    const guard = setInterval(() => {
      if (misfits()) fitNow();
    }, 1500);

    return () => {
      fitRef.current = null;
      termRef.current = null;
      clearInterval(guard);
      cancelAnimationFrame(retryFrame);
      window.removeEventListener('resize', fitNow);
      document.removeEventListener('visibilitychange', fitNow);
      ro.disconnect();
      subData.dispose();
      subTitle.dispose();
      ws.close();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tabId, generation]);

  // Becoming visible: fit (the ResizeObserver fires too, but not while the
  // browser tab is in the background) and take the keyboard.
  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => {
      if (fitRef.current) fitRef.current();
      if (termRef.current) termRef.current.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [active]);

  /* xterm is mounted in an unpadded inner element: the fit addon sizes the
     terminal from its parent's border-box height, so padding on the parent
     would make it one row too tall (clipped, with no scrollbar). */
  return (
    <div className="term-holder" style={active ? undefined : { display: 'none' }}>
      <div className="term-inner" ref={holder} />
    </div>
  );
});

export default TerminalTab;
