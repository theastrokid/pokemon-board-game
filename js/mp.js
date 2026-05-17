// =============================================================
// mp.js · multiplayer client (WebSocket → Cloudflare Worker room)
//
// Model: every game-state change is broadcast as a full snapshot. The active
// player's device is the source of truth; other clients replace their local
// GameState and re-render. Input is gated so only the player whose turn it
// is can interact on their own device.
// =============================================================
window.GameMP = {
  // Endpoint of the Cloudflare Worker that hosts the rooms.
  serverHttp: 'https://pokemon-board-mp.theastrokid2013.workers.dev',
  serverWs:   'wss://pokemon-board-mp.theastrokid2013.workers.dev',

  enabled: false,
  ws: null,
  roomCode: null,
  localSlot: null,   // index into GameState.players that THIS device controls
  isHost: false,
  peers: [],         // [{ sessionId, hello: { playerSlot, name } }]
  onPeerChange: null,
  onConnected: null,
  onDisconnected: null,
  _suspendBroadcast: false, // true while applying remote state, so we don't echo back
};

// ============== ROOM SETUP ==============
GameMP.hostRoom = async function () {
  const res = await fetch(GameMP.serverHttp + '/create', { method: 'POST' });
  if (!res.ok) throw new Error('Could not create room (' + res.status + ')');
  const { code } = await res.json();
  GameMP.roomCode = code;
  GameMP.isHost = true;
  GameMP.localSlot = 0; // host is always player 0
  GameMP.enabled = true;
  await GameMP._connect();
  return code;
};

GameMP.joinRoom = async function (code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(clean)) throw new Error('Code must be 4 letters');
  GameMP.roomCode = clean;
  GameMP.isHost = false;
  // localSlot is assigned later when the host's state arrives + we slot in
  GameMP.localSlot = null;
  GameMP.enabled = true;
  await GameMP._connect();
};

GameMP._connect = function () {
  return new Promise((resolve, reject) => {
    const url = `${GameMP.serverWs}/room/${GameMP.roomCode}`;
    const ws = new WebSocket(url);
    let opened = false;
    ws.addEventListener('open', () => {
      opened = true;
      GameMP.ws = ws;
      GameMP.send({
        type: 'hello',
        playerSlot: GameMP.localSlot,
        isHost: GameMP.isHost,
        ts: Date.now(),
      });
      if (GameMP.onConnected) GameMP.onConnected();
      resolve();
    });
    ws.addEventListener('message', (e) => GameMP._onMessage(e));
    ws.addEventListener('close', () => {
      GameMP.ws = null;
      if (GameMP.onDisconnected) GameMP.onDisconnected();
      // Try to reconnect after a delay (cap retries via simple backoff)
      if (GameMP.enabled) setTimeout(() => GameMP._connect().catch(() => {}), 2000);
    });
    ws.addEventListener('error', (e) => {
      if (!opened) reject(new Error('Could not connect to room'));
    });
  });
};

GameMP.disconnect = function () {
  GameMP.enabled = false;
  if (GameMP.ws) try { GameMP.ws.close(); } catch (e) {}
  GameMP.ws = null;
};

GameMP.send = function (msg) {
  if (!GameMP.ws || GameMP.ws.readyState !== WebSocket.OPEN) return;
  try { GameMP.ws.send(JSON.stringify(msg)); } catch (e) {}
};

// ============== STATE SYNC ==============
// Broadcasts the full GameState snapshot. Called after every state-mutating
// action by the active player's client.
GameMP.broadcastState = function (extra) {
  if (!GameMP.enabled || !GameMP.ws) return;
  if (GameMP._suspendBroadcast) return;
  const snapshot = GameMP._serializeState();
  GameMP.send({ type: 'state', state: snapshot, ts: Date.now(), extra: extra || null });
};

GameMP._serializeState = function () {
  return {
    players: GameState.players,
    activePlayerIdx: GameState.activePlayerIdx,
    turnCount: GameState.turnCount,
    pendingTileResolution: GameState.pendingTileResolution,
    busy: GameState.busy,
    lastPokecentreForPlayer: GameState.lastPokecentreForPlayer,
    candiedInstancesThisTurn: GameState.candiedInstancesThisTurn,
  };
};

GameMP._applyState = function (state) {
  GameMP._suspendBroadcast = true;
  try {
    GameState.players = state.players || GameState.players;
    GameState.activePlayerIdx = state.activePlayerIdx ?? GameState.activePlayerIdx;
    GameState.turnCount = state.turnCount ?? GameState.turnCount;
    GameState.pendingTileResolution = !!state.pendingTileResolution;
    GameState.busy = !!state.busy;
    GameState.lastPokecentreForPlayer = state.lastPokecentreForPlayer || {};
    GameState.candiedInstancesThisTurn = state.candiedInstancesThisTurn || {};
    if (window.GameUI && GameUI.refreshAll) GameUI.refreshAll();
    if (window.GameBoard && GameBoard.renderTokens) GameBoard.renderTokens();
  } finally {
    GameMP._suspendBroadcast = false;
  }
};

// ============== MESSAGE HANDLER ==============
GameMP._onMessage = function (event) {
  let msg;
  try { msg = JSON.parse(event.data); } catch (e) { return; }
  switch (msg.type) {
    case 'welcome':
      GameMP.sessionId = msg.sessionId;
      break;
    case 'peers':
      GameMP.peers = msg.peers || [];
      if (GameMP.onPeerChange) GameMP.onPeerChange();
      break;
    case 'peer-joined':
      GameMP.peers.push({ sessionId: msg.sessionId, hello: msg.hello });
      if (GameMP.onPeerChange) GameMP.onPeerChange();
      // If we're the host, immediately broadcast current state so the joiner
      // catches up. The DO also caches state, but a fresh push ensures it's
      // the most recent.
      if (GameMP.isHost) setTimeout(() => GameMP.broadcastState(), 200);
      break;
    case 'peer-left':
      GameMP.peers = GameMP.peers.filter(p => p.sessionId !== msg.sessionId);
      if (GameMP.onPeerChange) GameMP.onPeerChange();
      break;
    case 'state':
      // The remote pushed a new state. Replace ours.
      if (msg.state) GameMP._applyState(msg.state);
      // If we're a late-joining guest and don't have a localSlot yet, pick the
      // first non-host slot that's higher than ours. Default: slot 1 (player 2).
      if (GameMP.localSlot == null && GameState.players && GameState.players.length > 1) {
        GameMP.localSlot = 1;
        GameMP.send({ type: 'hello', playerSlot: 1, isHost: false });
      }
      break;
    default:
      break;
  }
};

// ============== HELPERS ==============
GameMP.isLocalDeviceActive = function () {
  if (!GameMP.enabled) return true; // single-device mode: always active
  if (GameMP.localSlot == null) return false;
  if (!GameState.currentPlayer) return false;
  const current = GameState.currentPlayer();
  if (!current) return false;
  // Host also drives CPU turns since the AI lives on the host's device.
  if (current.isCpu && GameMP.isHost) return true;
  return GameState.activePlayerIdx === GameMP.localSlot;
};

GameMP.statusBanner = function () {
  if (!GameMP.enabled) return null;
  const current = GameState.currentPlayer && GameState.currentPlayer();
  if (!current) return null;
  if (GameMP.isLocalDeviceActive()) return null;
  return `Waiting for ${current.name}...`;
};
