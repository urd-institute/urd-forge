import React, { useState } from 'react';
import { api, apiPatch } from '../api.js';
import { ErrorNote, Markdown, StatusPill, ViewHeader, fileLink, timeAgo, useFetch } from '../components/bits.jsx';

/*
 * Agents (SPEC-04): the project's agent files with run controls, and the
 * suggestions they produced with the review actions. Every run is a terminal
 * tab: the view only opens a tab and names the agent or suggestion — the
 * server builds the command from the files on disk.
 */

const SCHEDULES = [
  { value: 'off', label: 'Not scheduled' },
  { value: 'daily', label: 'Daily (09:00)' },
  { value: 'weekly', label: 'Weekly (Monday 09:00)' },
  { value: 'monthly', label: 'Monthly (1st, 09:00)' },
  { value: 'cron', label: 'Cron expression…' },
];

const STATUS_CHIPS = [
  { key: 'open', label: 'Open' },
  { key: 'approved', label: 'Approved' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
  { key: 'not-approved', label: 'Not approved' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

function agentsPath(slug, sub) {
  return '#/p/' + encodeURIComponent(slug) + '/agents' + (sub ? '/' + sub : '');
}

/** The Claude Code command that drafts a spec from a suggestion (via /forge). */
function draftSpecCommand(suggestion) {
  return (
    'claude "/forge the suggestion in agents/suggestions/' +
    suggestion.file +
    ' - read that file first: its What, Why and Proposed change are the basis of the spec.' +
    ' When the spec is written, set spec: <its id> in the suggestion file\'s frontmatter."'
  );
}

export default function Agents({ slug, sub, tick, panel }) {
  const { data, error } = useFetch(() => api('/projects/' + encodeURIComponent(slug) + '/agents'), [slug, tick]);
  const { data: project } = useFetch(() => api('/projects/' + encodeURIComponent(slug)), [slug, tick]);
  const [notice, setNotice] = useState(null);
  const tab = sub === 'suggestions' ? 'suggestions' : 'agents';

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <div className="view muted">Loading…</div>;

  const agents = data.agents || [];
  const suggestions = data.suggestions || [];
  const openCount = suggestions.filter((s) => s.status === 'open').length;
  const terminalOk = !data.terminal || data.terminal.available !== false;

  function openTab(opts) {
    const p = panel && panel.current;
    if (!p) return;
    const id = p.openTab(opts);
    if (id) p.show('open');
  }

  return (
    <div className="view">
      <ViewHeader kicker={'agents · ' + slug} title="Agents">
        <nav className="subtabs" aria-label="Agents sections">
          <a className={'subtab' + (tab === 'agents' ? ' active' : '')} href={agentsPath(slug)}>
            Agents <span className="count mono">{agents.length}</span>
          </a>
          <a className={'subtab' + (tab === 'suggestions' ? ' active' : '')} href={agentsPath(slug, 'suggestions')}>
            Suggestions <span className="count mono">{openCount} open</span>
          </a>
        </nav>
      </ViewHeader>

      {!terminalOk && (
        <ErrorNote>
          The terminal is unavailable ({(data.terminal && data.terminal.error) || 'node-pty missing'}), so agents cannot run.
          Their files and suggestions are still shown.
        </ErrorNote>
      )}
      {notice && (
        <div className="error-note">
          {notice}{' '}
          <button className="preset" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {tab === 'agents' ? (
        <AgentsTab slug={slug} agents={agents} project={project} terminalOk={terminalOk} openTab={openTab} setNotice={setNotice} />
      ) : (
        <SuggestionsTab slug={slug} suggestions={suggestions} agents={agents} terminalOk={terminalOk} openTab={openTab} setNotice={setNotice} />
      )}
    </div>
  );
}

/* ── Agents ─────────────────────────────────────────────────────────────── */

function AgentsTab({ slug, agents, project, terminalOk, openTab, setNotice }) {
  return (
    <>
      <p className="muted small">
        An agent is a markdown file in <span className="mono">agents/</span>: a description, how it works, the
        instructions Claude Code gets when it runs, and what to do when a suggestion is approved. A run reads the
        project and writes its findings as suggestions — it changes nothing else. Standard agents are installed with
        scheduling off; turn it on here.
      </p>

      {agents.length === 0 && <ErrorNote>No agents/ folder (or it is empty).</ErrorNote>}

      {agents.map((a) => (
        <AgentCard key={a.id} slug={slug} agent={a} terminalOk={terminalOk} openTab={openTab} setNotice={setNotice} />
      ))}

      <NewAgent slug={slug} project={project} terminalOk={terminalOk} openTab={openTab} />
    </>
  );
}

function outcomeText(run) {
  if (!run) return 'never run';
  const when = run.startedAt ? timeAgo(Date.parse(run.startedAt)) : '';
  if (run.outcome === 'running') return 'started ' + when;
  if (run.outcome === 'skipped') return 'skipped ' + when + (run.reason ? ' (' + run.reason + ')' : '');
  const n = run.suggestions == null ? '' : ' · ' + run.suggestions + ' suggestion' + (run.suggestions === 1 ? '' : 's');
  return (run.outcome === 'stopped' ? 'stopped ' : 'finished ') + when + n;
}

function AgentCard({ slug, agent, terminalOk, openTab, setNotice }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cron, setCron] = useState(null); // draft cron expression while editing
  const live = agent.running || [];
  // Only a live suggestion run blocks another; approval runs may overlap.
  const running = live.some((r) => r.mode !== 'approve');
  const anyLive = live.length > 0;
  const named = ['off', 'daily', 'weekly', 'monthly'].includes(agent.schedule);
  const selectValue = cron != null ? 'cron' : named ? agent.schedule : 'cron';

  async function patch(fields) {
    setBusy(true);
    try {
      await apiPatch('/projects/' + encodeURIComponent(slug) + '/agents/' + encodeURIComponent(agent.id), fields);
      setCron(null);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  function run(mode) {
    if (!terminalOk) return;
    if (running && mode !== 'approve') {
      setNotice(agent.name + ' is already running — open its tab in the terminal panel.');
      return;
    }
    openTab({ title: agent.name, locked: true, message: { type: 'agent-run', agentId: agent.id, mode } });
  }

  return (
    <section className={'card agent-card' + (agent.enabled ? '' : ' disabled')}>
      <div className="agent-head">
        <div>
          <h3>
            {agent.name}
            {anyLive && <span className="run-dot" title="Running" />}
          </h3>
          {agent.description && <p className="muted agent-desc">{agent.description}</p>}
        </div>
        <div className="agent-pills">
          <span className="pill">{agent.source === 'standard' ? 'standard' : 'project'}</span>
          <span className={'pill' + (agent.schedule !== 'off' && agent.enabled ? ' status-approved' : '')}>
            {agent.enabled ? agent.scheduleText : 'disabled'}
          </span>
        </div>
      </div>

      {agent.parseError && <div className="small error-text">{agent.parseError}</div>}

      <div className="agent-meta mono small muted">
        <span>last run: {outcomeText(agent.lastRun)}</span>
        {agent.nextDue && !running && <span>next: {new Date(agent.nextDue).toLocaleString()}</span>}
        {anyLive && (
          <span>
            running in tab{' '}
            {agent.running.map((r) => (
              <a key={r.runId} href={'#/p/' + encodeURIComponent(slug) + '/agents?tab=' + encodeURIComponent(r.tabId)}>
                ▸ {r.mode === 'approve' ? 'approval' : 'suggestions'}
              </a>
            ))}
          </span>
        )}
      </div>

      <div className="agent-controls">
        <button className="preset" onClick={() => run('suggest')} disabled={!terminalOk || Boolean(agent.parseError) || running} title="Headless run in a new terminal tab: reads the project, writes suggestions only">
          ▶ Run now
        </button>
        <button className="preset" onClick={() => run('interactive')} disabled={!terminalOk || Boolean(agent.parseError) || running} title="Interactive Claude Code session with the same instructions — for agents that need questions answered">
          Run interactively
        </button>
        <label className="toggle" title="A disabled agent never runs on its schedule">
          <input type="checkbox" checked={agent.enabled} disabled={busy} onChange={(e) => patch({ enabled: e.target.checked })} />
          enabled
        </label>
        <label className="schedule-pick">
          <span className="muted small">schedule</span>
          <select
            value={selectValue}
            disabled={busy || !agent.enabled}
            onChange={(e) => {
              if (e.target.value === 'cron') setCron(named ? '0 9 * * 1' : agent.schedule);
              else patch({ schedule: e.target.value });
            }}
          >
            {SCHEDULES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {(cron != null || !named) && (
          <form
            className="cron-form"
            onSubmit={(e) => {
              e.preventDefault();
              patch({ schedule: cron != null ? cron : agent.schedule });
            }}
          >
            <input
              className="mono"
              value={cron != null ? cron : agent.schedule}
              onChange={(e) => setCron(e.target.value)}
              placeholder="min hour dom month dow"
              spellCheck={false}
              size={16}
            />
            <button className="preset" type="submit" disabled={busy || cron == null}>
              Set
            </button>
          </form>
        )}
        <span className="agent-controls-right">
          <a className="source-link mono" href={fileLink(slug, 'agents/' + agent.file)}>
            agents/{agent.file}
          </a>
          <button className="preset" onClick={() => setOpen(!open)}>
            {open ? 'Close' : 'Open'}
          </button>
        </span>
      </div>

      {open && (
        <div className="agent-details">
          <Section title="How it works" text={agent.how} />
          <Section title="Instructions" text={agent.instructions} />
          <Section title="When approved" text={agent.whenApproved} />
          <h4>Run history</h4>
          {(agent.runs || []).length === 0 ? (
            <p className="muted small">No runs yet.</p>
          ) : (
            <table className="runs-table mono small">
              <thead>
                <tr>
                  <th>started</th>
                  <th>trigger</th>
                  <th>mode</th>
                  <th>outcome</th>
                  <th>suggestions</th>
                </tr>
              </thead>
              <tbody>
                {agent.runs.map((r) => (
                  <tr key={r.runId}>
                    <td>{r.startedAt ? new Date(r.startedAt).toLocaleString() : ''}</td>
                    <td>{r.trigger}</td>
                    <td>{r.mode === 'approve' ? 'approval ' + (r.suggestionId || '') : r.mode}</td>
                    <td>
                      {r.outcome}
                      {r.reason ? ' — ' + r.reason : ''}
                    </td>
                    <td>{r.suggestions == null ? '' : r.suggestions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

function Section({ title, text }) {
  return (
    <>
      <h4>{title}</h4>
      {text ? <Markdown text={text} /> : <p className="muted small">not provided</p>}
    </>
  );
}

function NewAgent({ slug, project, terminalOk, openTab }) {
  const [desc, setDesc] = useState('');
  const [spec, setSpec] = useState('');
  const specs = (project && project.specs ? project.specs : []).filter((s) => s.id);

  function fromDescription(e) {
    e.preventDefault();
    const text = desc.trim().replace(/["\r\n]+/g, ' ');
    if (!text) return;
    openTab({ title: 'New agent', command: 'claude "/forge agent ' + text + '"' });
    setDesc('');
  }

  function fromSpec(e) {
    e.preventDefault();
    if (!spec || !/^[A-Za-z0-9._-]+$/.test(spec)) return;
    openTab({ title: 'New agent', command: 'claude "/forge agent from ' + spec + '"' });
  }

  return (
    <section className="card">
      <h3>Add an agent</h3>
      <p className="muted small">
        Claude Code drafts the agent file with the <span className="mono">/forge agent</span> command — from a
        description, or from a spec (the agent then keeps the project in line with that spec and suggests deviations).
        New agents start unscheduled.
      </p>
      <form className="card-actions" onSubmit={fromDescription}>
        <input
          className="new-agent-input"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What should the agent look for? e.g. accessibility problems in the UI"
          maxLength={400}
        />
        <button className="preset" type="submit" disabled={!terminalOk || !desc.trim()}>
          Draft with Claude
        </button>
      </form>
      {specs.length > 0 && (
        <form className="card-actions" onSubmit={fromSpec}>
          <select value={spec} onChange={(e) => setSpec(e.target.value)}>
            <option value="">From a spec…</option>
            {specs.map((s) => (
              <option key={s.file} value={s.id}>
                {s.id} — {s.title}
              </option>
            ))}
          </select>
          <button className="preset" type="submit" disabled={!terminalOk || !spec}>
            Agent from spec
          </button>
        </form>
      )}
    </section>
  );
}

/* ── Suggestions ────────────────────────────────────────────────────────── */

function SuggestionsTab({ slug, suggestions, agents, terminalOk, openTab, setNotice }) {
  const [status, setStatus] = useState('open');
  const [agentFilter, setAgentFilter] = useState('');
  const counts = new Map();
  for (const s of suggestions) counts.set(s.status, (counts.get(s.status) || 0) + 1);
  const shown = suggestions.filter((s) => (status === 'all' || s.status === status) && (!agentFilter || s.agent === agentFilter));
  const agentIds = [...new Set(suggestions.map((s) => s.agent).filter(Boolean))].sort();
  const names = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <>
      <p className="muted small">
        Suggestions are files in <span className="mono">agents/suggestions/</span>, written by agent runs. Approve one
        to hand it back to the agent that made it; <em>Draft spec</em> turns it into a spec with{' '}
        <span className="mono">/forge</span>; <em>Not approved</em> is remembered (the agent will not propose it again);{' '}
        <em>Archive</em> just tidies it away.
      </p>

      <div className="topic-chips">
        {STATUS_CHIPS.map((c) => (
          <button key={c.key} className={'topic-chip' + (status === c.key ? ' active' : '')} onClick={() => setStatus(c.key)}>
            {c.label}
            <span className="count mono">{c.key === 'all' ? suggestions.length : counts.get(c.key) || 0}</span>
          </button>
        ))}
        {agentIds.length > 1 && (
          <select className="chip-select" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
            <option value="">all agents</option>
            {agentIds.map((id) => (
              <option key={id} value={id}>
                {names.get(id) || id}
              </option>
            ))}
          </select>
        )}
      </div>

      {suggestions.length === 0 && (
        <p className="muted">No suggestions yet — run an agent from the Agents tab.</p>
      )}
      {suggestions.length > 0 && shown.length === 0 && <p className="muted filter-empty">Nothing with this status.</p>}

      <div className="suggestion-list">
        {shown.map((s) => (
          <SuggestionRow key={s.file} slug={slug} suggestion={s} agentName={names.get(s.agent) || s.agent} terminalOk={terminalOk} openTab={openTab} setNotice={setNotice} />
        ))}
      </div>
    </>
  );
}

function SuggestionRow({ slug, suggestion: s, agentName, terminalOk, openTab, setNotice }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState(null);

  async function setStatus(status) {
    setBusy(true);
    try {
      await apiPatch('/projects/' + encodeURIComponent(slug) + '/suggestions/' + encodeURIComponent(s.id), { status });
      return true;
    } catch (err) {
      setNotice(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!(await setStatus('approved'))) return;
    handToAgent();
  }

  function handToAgent() {
    if (!terminalOk) return;
    if (!s.agent) {
      setNotice('This suggestion names no agent, so there is nobody to hand it to. Set `agent:` in its frontmatter.');
      return;
    }
    openTab({ title: (agentName || s.agent) + ' · ' + s.id, locked: true, message: { type: 'agent-approve', suggestionId: s.id } });
  }

  function draftSpec() {
    if (!terminalOk) return;
    openTab({ title: 'Draft spec · ' + s.id, command: draftSpecCommand(s) });
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && body == null) {
      api('/projects/' + encodeURIComponent(slug) + '/file?path=' + encodeURIComponent('agents/suggestions/' + s.file))
        .then((f) => setBody(f.content.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')))
        .catch((err) => setBody('*Could not load the file: ' + err.message + '*'));
    }
  }

  const st = s.status;
  return (
    <div className={'card suggestion-row status-' + st}>
      <div className="suggestion-head" onClick={toggle} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && toggle()}>
        <span className="mono spec-id">{s.id || s.file}</span>
        <span className="suggestion-title">{s.title}</span>
        <span className="mono small muted suggestion-meta">
          {agentName || s.agent || 'no agent'}
          {s.created && ' · ' + s.created}
          {s.spec && ' · ' + s.spec}
        </span>
        <StatusPill status={st} />
      </div>
      {s.parseError && <div className="small error-text">{s.parseError}</div>}
      {!open && s.excerpt && <p className="muted small suggestion-excerpt">{s.excerpt}</p>}
      {open && (
        <div className="suggestion-body">
          {body == null ? <p className="muted small">Loading…</p> : <Markdown text={body} />}
          <a className="source-link mono" href={fileLink(slug, 'agents/suggestions/' + s.file)}>
            agents/suggestions/{s.file}
          </a>
        </div>
      )}
      <div className="suggestion-actions">
        {st === 'open' && (
          <>
            <button className="preset approve" onClick={approve} disabled={busy || !terminalOk} title="Marks it approved and opens a tab where the agent carries it out">
              ✓ Approve
            </button>
            <button className="preset" onClick={draftSpec} disabled={busy || !terminalOk} title="Opens a tab with /forge to draft a spec from this suggestion">
              Draft spec
            </button>
            <button className="preset" onClick={() => setStatus('not-approved')} disabled={busy}>
              Not approved
            </button>
            <button className="preset" onClick={() => setStatus('archived')} disabled={busy}>
              Archive
            </button>
          </>
        )}
        {st === 'approved' && (
          <>
            <button className="preset approve" onClick={handToAgent} disabled={busy || !terminalOk} title="Opens a tab where the agent carries out the suggestion">
              ▶ Hand to agent
            </button>
            <button className="preset" onClick={draftSpec} disabled={busy || !terminalOk}>
              Draft spec
            </button>
            <button className="preset" onClick={() => setStatus('done')} disabled={busy} title="If you did it yourself">
              Mark done
            </button>
            <button className="preset" onClick={() => setStatus('open')} disabled={busy}>
              Reopen
            </button>
          </>
        )}
        {st === 'in-progress' && (
          <>
            <span className="muted small">The agent is working on it (see the terminal panel).</span>
            <button className="preset" onClick={() => setStatus('done')} disabled={busy}>
              Mark done
            </button>
            <button className="preset" onClick={() => setStatus('open')} disabled={busy}>
              Reopen
            </button>
          </>
        )}
        {(st === 'done' || st === 'not-approved') && (
          <>
            <button className="preset" onClick={() => setStatus('open')} disabled={busy}>
              Reopen
            </button>
            <button className="preset" onClick={() => setStatus('archived')} disabled={busy}>
              Archive
            </button>
          </>
        )}
        {st === 'archived' && (
          <button className="preset" onClick={() => setStatus('open')} disabled={busy}>
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}
