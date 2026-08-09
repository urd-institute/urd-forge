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
