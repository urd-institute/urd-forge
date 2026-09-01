export async function api(path) {
  const res = await fetch('/api' + path);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* keep statusText */
    }
    throw new Error(msg);
  }
  return res.json();
}

/** POST JSON to the API; resolves with the parsed response. */
export async function apiPost(path, body) {
  const res = await fetch('/api' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}

/** Subscribe to live update events; returns an unsubscribe function. */
export function subscribeEvents(onMessage) {
  let ws;
  let closed = false;
  let retry;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws/events`);
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data));
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      if (!closed) retry = setTimeout(connect, 2000);
    };
  }
  connect();

  return () => {
    closed = true;
    clearTimeout(retry);
    if (ws) ws.close();
  };
}
