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

// ============== STATE SYNC (throttled) ==============
// Active player's device captures + sends the full snapshot after every
// state-mutating refreshAll(). Throttled to ~80ms so the burst of refreshes
// during animations doesn't flood the wire.
GameMP._broadcastTimer = null;
GameMP._lastBroadcastTs = 0;
GameMP.THROTTLE_MS = 80;

GameMP.broadcastState = function () {
  if (!GameMP.enabled || !GameMP.ws) return;
  if (GameMP._suspendBroadcast) return;
  // Decide what to send. Active-player device (or host running a CPU)
  // sends a FULL snapshot. Off-turn devices send only their own player
  // slot so they can't clobber the active turn's authoritative state.
  const now = Date.now();
  const elapsed = now - GameMP._lastBroadcastTs;
  if (elapsed >= GameMP.THROTTLE_MS) {
    GameMP._doSend();
    return;
  }
  if (GameMP._broadcastTimer) return;
  GameMP._broadcastTimer = setTimeout(() => {
    GameMP._broadcastTimer = null;
    GameMP._doSend();
  }, GameMP.THROTTLE_MS - elapsed);
};

GameMP._doSend = function () {
  GameMP._lastBroadcastTs = Date.now();
  if (GameMP.isLocalDeviceActive()) {
    const snapshot = GameMP._serializeState();
    GameMP.send({ type: 'state', state: snapshot, ts: Date.now() });
  } else if (GameMP.localSlot != null && GameState.players[GameMP.localSlot]) {
    GameMP.send({
      type: 'player-update',
      slot: GameMP.localSlot,
      player: GameState.players[GameMP.localSlot],
      ts: Date.now(),
    });
  }
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
    modal: GameMP._captureModal(),
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
    // Open / update / close spectator modals to mirror the active player.
    GameMP._applyModal(state.modal || null);
  } finally {
    GameMP._suspendBroadcast = false;
  }
};

// ============== MODAL CAPTURE / SPECTATOR RENDER ==============
GameMP._SYNC_MODAL_IDS = ['battleModal', 'encounterModal', 'drawModal', 'branchModal', 'faintedModal', 'victoryModal', 'evolveAnimModal'];

GameMP._captureModal = function () {
  // Battle takes priority since it has its own object source-of-truth
  if (window.GameBattle && GameBattle.active && !GameBattle.active._spectator) {
    const b = GameBattle.active;
    return {
      type: 'battle',
      data: {
        kind: b.kind,
        opponentLabel: b.opponentLabel,
        opponentColor: b.opponentColor,
        playerTeam: b.playerTeam,
        oppTeam: b.oppTeam,
        playerActive: b.playerActive,
        oppActive: b.oppActive,
        message: b.message,
        opponentPending: !!b.opponentPending,
        leaderId: b.opts && b.opts.leader ? b.opts.leader.name.toLowerCase() : null,
      },
    };
  }
  // Otherwise find any visible synced modal
  const visible = GameMP._SYNC_MODAL_IDS.map(id => document.getElementById(id))
    .find(el => el && !el.hidden);
  if (!visible) return null;
  switch (visible.id) {
    case 'encounterModal': {
      return {
        type: 'encounter',
        data: {
          title: GameUI.el('encounterTitle').textContent,
          name: GameUI.el('encounterName').textContent,
          spriteSrc: GameUI.el('encounterSprite').getAttribute('src'),
          typesHtml: GameUI.el('encounterTypes').innerHTML,
          result: GameUI.el('encounterResult').textContent,
          resultClass: GameUI.el('encounterResult').className,
        },
      };
    }
    case 'drawModal':
      return { type: 'draws', data: { titleHtml: GameUI.el('drawTitle').innerHTML, revealHtml: GameUI.el('drawReveal').innerHTML } };
    case 'faintedModal':
      return { type: 'fainted', data: { msg: GameUI.el('faintedMessage').textContent, spriteSrc: GameUI.el('faintedSprite').getAttribute('src') } };
    case 'branchModal':
      return { type: 'branch', data: { optionsHtml: GameUI.el('branchOptions').innerHTML } };
    case 'victoryModal':
      return { type: 'victory', data: { winnerHtml: GameUI.el('winnerName').innerHTML, teamHtml: GameUI.el('winnerTeam').innerHTML } };
    case 'evolveAnimModal':
      return { type: 'evolve', data: { title: GameUI.el('evolveAnimTitle').textContent, message: GameUI.el('evolveAnimMessage').textContent } };
    default:
      return { type: 'generic', data: { id: visible.id } };
  }
};

GameMP._applyModal = function (modal) {
  // 1) Close any synced modals we currently have open as spectator that the
  //    remote no longer reports (or that switched type).
  if (!modal || modal.type !== 'battle') {
    if (window.GameBattle && GameBattle.active && GameBattle.active._spectator) {
      const bm = GameUI.el('battleModal');
      if (bm) { bm.hidden = true; delete bm.dataset.spectator; }
      GameBattle.active = null;
    }
  }
  GameMP._SYNC_MODAL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.dataset.spectator !== '1') return;
    // It's a spectator-owned modal — close if remote doesn't have this same type open
    const idToType = { battleModal:'battle', encounterModal:'encounter', drawModal:'draws', branchModal:'branch', faintedModal:'fainted', victoryModal:'victory', evolveAnimModal:'evolve' };
    if (!modal || idToType[id] !== modal.type) {
      el.hidden = true;
      delete el.dataset.spectator;
    }
  });

  if (!modal) return;
  // 2) Open / update the spectator modal for the type the remote reports.
  switch (modal.type) {
    case 'battle':     return GameMP._renderSpectatorBattle(modal.data);
    case 'encounter':  return GameMP._renderSpectatorEncounter(modal.data);
    case 'draws':      return GameMP._renderSpectatorDraws(modal.data);
    case 'branch':     return GameMP._renderSpectatorBranch(modal.data);
    case 'fainted':    return GameMP._renderSpectatorFainted(modal.data);
    case 'victory':    return GameMP._renderSpectatorVictory(modal.data);
    case 'evolve':     return GameMP._renderSpectatorEvolve(modal.data);
    default:           return; // unknown — fall back to status banner
  }
};

GameMP._renderSpectatorBattle = function (d) {
  GameBattle.active = Object.assign({}, d, { _spectator: true, opts: d.leaderId ? { leader: { name: d.leaderId.charAt(0).toUpperCase() + d.leaderId.slice(1) } } : {} });
  const modal = GameUI.el('battleModal');
  modal.hidden = false;
  modal.dataset.spectator = '1';
  GameBattle.renderBattle(GameBattle.active);
  // Disable interaction
  modal.querySelectorAll('button').forEach(b => { b.disabled = true; });
  modal.querySelectorAll('.move-btn, .team-slot').forEach(b => { b.style.pointerEvents = 'none'; });
};

GameMP._renderSpectatorEncounter = function (d) {
  const modal = GameUI.el('encounterModal');
  modal.hidden = false;
  modal.dataset.spectator = '1';
  GameUI.el('encounterTitle').textContent = d.title || '';
  GameUI.el('encounterName').textContent = d.name || '';
  if (d.spriteSrc) GameUI.el('encounterSprite').src = d.spriteSrc;
  GameUI.el('encounterTypes').innerHTML = d.typesHtml || '';
  GameUI.el('encounterResult').textContent = d.result || '';
  GameUI.el('encounterResult').className = d.resultClass || 'encounter-result';
  // Lock all controls
  modal.querySelectorAll('button').forEach(b => b.disabled = true);
};

GameMP._renderSpectatorDraws = function (d) {
  const modal = GameUI.el('drawModal');
  modal.hidden = false;
  modal.dataset.spectator = '1';
  GameUI.el('drawTitle').innerHTML = d.titleHtml || '';
  GameUI.el('drawReveal').innerHTML = d.revealHtml || '';
  modal.querySelectorAll('button').forEach(b => b.disabled = true);
};

GameMP._renderSpectatorBranch = function (d) {
  const modal = GameUI.el('branchModal');
  modal.hidden = false;
  modal.dataset.spectator = '1';
  GameUI.el('branchOptions').innerHTML = d.optionsHtml || '';
  // Strip click handlers by replacing options with non-clickable copies
  GameUI.el('branchOptions').querySelectorAll('.branch-option').forEach(o => {
    const c = o.cloneNode(true);
    o.replaceWith(c);
  });
};

GameMP._renderSpectatorFainted = function (d) {
  const modal = GameUI.el('faintedModal');
  modal.hidden = false;
  modal.dataset.spectator = '1';
  GameUI.el('faintedMessage').textContent = d.msg || '';
  if (d.spriteSrc) GameUI.el('faintedSprite').src = d.spriteSrc;
};

GameMP._renderSpectatorVictory = function (d) {
  const modal = GameUI.el('victoryModal');
  modal.hidden = false;
  modal.dataset.spectator = '1';
  GameUI.el('winnerName').innerHTML = d.winnerHtml || '';
  GameUI.el('winnerTeam').innerHTML = d.teamHtml || '';
  modal.querySelectorAll('button').forEach(b => b.disabled = true);
};

GameMP._renderSpectatorEvolve = function (d) {
  const modal = GameUI.el('evolveAnimModal');
  modal.hidden = false;
  modal.dataset.spectator = '1';
  GameUI.el('evolveAnimTitle').textContent = d.title || '';
  GameUI.el('evolveAnimMessage').textContent = d.message || '';
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
      // The remote pushed a full state. Replace ours.
      if (msg.state) GameMP._applyState(msg.state);
      if (GameMP.localSlot == null && GameState.players && GameState.players.length > 1) {
        GameMP.localSlot = 1;
        GameMP.send({ type: 'hello', playerSlot: 1, isHost: false });
      }
      break;
    case 'player-update':
      // Partial update — replace just one slot. Used for off-turn party
      // management (discard, item use, reorder) so the sender doesn't clobber
      // the active player's authoritative state.
      if (msg.slot != null && msg.player && GameState.players) {
        GameMP._suspendBroadcast = true;
        try {
          GameState.players[msg.slot] = msg.player;
          if (window.GameUI && GameUI.refreshAll) GameUI.refreshAll();
          if (window.GameBoard && GameBoard.renderTokens) GameBoard.renderTokens();
        } finally {
          GameMP._suspendBroadcast = false;
        }
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
