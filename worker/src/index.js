// Pokemon Board Game · multiplayer room server
// One Durable Object per 4-letter room code. Clients open a WebSocket
// to /room/{CODE} and exchange JSON messages. The DO relays messages
// between sessions in the same room.

const ROOM_CODE_RE = /^[A-Z]{4}$/;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // omit I, O

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

function generateCode() {
  let out = '';
  for (let i = 0; i < 4; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // POST /create -> generates a 4-letter room code, returns { code }.
    if (url.pathname === '/create' && request.method === 'POST') {
      const code = generateCode();
      // Touch the DO so it's primed in storage (otherwise it lives only in memory).
      const id = env.ROOMS.idFromName(code);
      const obj = env.ROOMS.get(id);
      await obj.fetch('https://room.internal/init', { method: 'POST' });
      return new Response(JSON.stringify({ code }), {
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    // GET /room/{CODE}  -> WebSocket upgrade to that room's DO
    if (url.pathname.startsWith('/room/')) {
      const code = url.pathname.slice('/room/'.length).toUpperCase();
      if (!ROOM_CODE_RE.test(code)) {
        return new Response('Invalid room code', { status: 400, headers: corsHeaders() });
      }
      const id = env.ROOMS.idFromName(code);
      const obj = env.ROOMS.get(id);
      return obj.fetch(request);
    }

    // Simple health probe
    return new Response(JSON.stringify({ ok: true, service: 'pokemon-board-mp' }), {
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  },
};

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = []; // [{ ws, id, hello? }]
    this.lastState = null; // most recent full game state snapshot (replay for late joiners)
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/init' && request.method === 'POST') {
      return new Response('OK');
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      this.handleSession(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response('Not found', { status: 404 });
  }

  handleSession(ws) {
    ws.accept();
    const session = { ws, id: Math.random().toString(36).slice(2, 10) };
    this.sessions.push(session);

    // Send hello-back so the client knows the connection is established.
    try {
      ws.send(JSON.stringify({ type: 'welcome', sessionId: session.id, peers: this.sessions.length }));
    } catch (e) {}

    // Replay last known state for late joiners (so a guest joining mid-game catches up).
    if (this.lastState) {
      try {
        ws.send(JSON.stringify({ type: 'state', state: this.lastState }));
      } catch (e) {}
    }

    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }

      if (msg.type === 'state') {
        // Authoritative state snapshot from the current active client. Cache + broadcast.
        this.lastState = msg.state;
        this.broadcast(msg, session);
      } else if (msg.type === 'hello') {
        // Identify the player slot this session controls. Relay so peers update presence.
        session.hello = msg;
        this.broadcast({ type: 'peer-joined', sessionId: session.id, hello: msg }, session);
        // Echo current peers list back to the joiner.
        try {
          ws.send(JSON.stringify({
            type: 'peers',
            peers: this.sessions.filter(s => s.hello).map(s => ({ sessionId: s.id, hello: s.hello })),
          }));
        } catch (e) {}
      } else if (msg.type === 'chat' || msg.type === 'cursor' || msg.type === 'ping') {
        this.broadcast(msg, session);
      }
    });

    const onClose = () => {
      this.sessions = this.sessions.filter(s => s !== session);
      this.broadcast({ type: 'peer-left', sessionId: session.id });
    };
    ws.addEventListener('close', onClose);
    ws.addEventListener('error', onClose);
  }

  broadcast(msg, except) {
    const data = JSON.stringify(msg);
    for (const s of this.sessions) {
      if (s === except) continue;
      try { s.ws.send(data); } catch (e) {}
    }
  }
}
