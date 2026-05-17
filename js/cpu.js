// =============================================================
// cpu.js · simple CPU AI brain
//
// Watches the DOM + GameState. Whenever the active player is a CPU and a
// new modal opens / a new turn starts, fires the appropriate auto-action
// with a small human-like delay so the human players can follow along.
// =============================================================
window.GameCpu = {};

// Polling watchdog. Simple cooldown — no signature dedupe — so it can't get
// stuck when state transitions briefly leave the world in a "between" state
// (button just enabled, modal just opened, etc.).
GameCpu._lastActionTime = 0;
GameCpu.COOLDOWN_MS = 700;

GameCpu.start = function () {
  if (GameCpu._tick) clearInterval(GameCpu._tick);
  GameCpu._tick = setInterval(GameCpu._maybeAct, 200);
};

GameCpu.stop = function () {
  if (GameCpu._tick) { clearInterval(GameCpu._tick); GameCpu._tick = null; }
};

GameCpu._maybeAct = function () {
  const p = GameState.currentPlayer && GameState.currentPlayer();
  if (!p || !p.isCpu) return;
  // Multiplayer: only the host drives CPUs (avoids divergence — guest's
  // direct rollAndMove call would mutate their state independently).
  // Single-device mode: always drive CPUs.
  if (window.GameMP && GameMP.enabled && !GameMP.isHost) return;
  if (Date.now() - GameCpu._lastActionTime < GameCpu.COOLDOWN_MS) return;
  const fire = GameCpu._chooseAction();
  if (!fire) return;
  GameCpu._lastActionTime = Date.now();
  if (window.console) console.log('[cpu]', p.name, 'host=' + (window.GameMP && GameMP.isHost), 'active=' + GameState.activePlayerIdx, 'acting');
  setTimeout(fire, 250 + Math.floor(Math.random() * 250));
};

// Returns a function that performs the next CPU action, or null if there's
// nothing actionable right now. Called every 200ms — always picks based on
// the LIVE state.
GameCpu._chooseAction = function () {
  // 1. Battle in progress
  const battleModal = document.getElementById('battleModal');
  if (battleModal && !battleModal.hidden && GameBattle.active && !GameBattle.active._spectator) {
    return () => GameCpu._handleBattle();
  }
  // 2. Other modals (skip the ones the spectator mirrors — those aren't ours
  //    to interact with)
  const openModal = Array.from(document.querySelectorAll('.modal'))
    .find(m => !m.hidden && m.dataset.spectator !== '1');
  if (openModal) {
    switch (openModal.id) {
      case 'encounterModal':   return () => GameCpu._handleEncounter();
      case 'drawModal':        return () => GameCpu._click('drawContinueBtn');
      case 'noBallsModal':     return null;
      case 'faintedModal':     return null;
      case 'branchModal':      return () => GameCpu._handleBranch();
      case 'tradeModal':       return () => GameCpu._click('tradeCancelBtn');
      case 'pvpModal':         return () => GameCpu._click('pvpCancelBtn');
      case 'evolvePickerModal':return () => GameCpu._click('evolvePickerCancel');
      case 'releaseModal':     return () => GameCpu._click('releaseCancelBtn');
      case 'tileModal':        return () => GameCpu._click('tileResolveBtn');
      case 'victoryModal':     return () => GameCpu._click('victoryContinueBtn');
      case 'hofModal':         return () => GameCpu._click('hofCloseBtn');
      case 'itemPickerModal':  return () => GameCpu._click('itemPickerCancel');
      default:                 return null;
    }
  }
  // 3. No modal, not busy → roll. Call GameGame.rollAndMove() DIRECTLY rather
  //    than clicking the button, so we don't depend on the multiplayer button
  //    gate being open at the exact moment we fire.
  if (!GameState.busy && !GameState.pendingTileResolution) {
    return () => {
      if (window.console) console.log('[cpu] firing rollAndMove for', GameState.currentPlayer().name);
      // Spectator-cleanup: in MP, the host might have a spectator modal
      // lingering. Skip the click route — direct call.
      GameGame.rollAndMove();
    };
  }
  return null;
};

GameCpu._click = function (id) {
  const btn = GameUI.el(id);
  if (btn && !btn.disabled) btn.click();
};

// ============== ENCOUNTER ==============
GameCpu._handleEncounter = function () {
  // If we have any balls, pick the best one then roll. Otherwise flee.
  const player = GameState.currentPlayer();
  const totalBalls = Object.values(player.balls || {}).reduce((s, n) => s + n, 0);
  if (totalBalls === 0) {
    GameCpu._click('encounterFleeBtn');
    return;
  }
  // Pick a ball — prefer the cheapest one that still has good odds for this area.
  // Default to whatever's already auto-selected.
  const rollBtn = GameUI.el('encounterAutoRollBtn');
  if (rollBtn && !rollBtn.disabled) rollBtn.click();
};

// ============== BATTLE ==============
GameCpu._handleBattle = function () {
  const b = GameBattle.active;
  if (!b || b.opponentPending) return;
  const pMon = b.playerTeam[b.playerActive];
  if (!pMon || pMon.fainted) return;
  // If lead is below 25% HP and we have a healing item with the active mon, heal first.
  if (pMon.hp / pMon.maxHp <= 0.25) {
    if (GameCpu._tryUseHealInBattle()) return;
  }
  // Pick the strongest usable move (PP > 0). Prefer gated (strong) when available.
  const usable = pMon.moves
    .map((mv, i) => ({ mv, i, pp: (mv.pp || 0) }))
    .filter(x => x.pp > 0);
  if (usable.length === 0) {
    // All PP exhausted — switch if possible, else struggle by clicking move 0 (will trigger struggle in opponentTurn... actually for player we have no struggle)
    GameCpu._click('switchBtn');
    return;
  }
  usable.sort((a, b2) => b2.mv.power - a.mv.power);
  GameBattle.choosePlayerMove(usable[0].i);
};

GameCpu._tryUseHealInBattle = function () {
  const player = GameState.currentPlayer();
  // Find any 'heal' type item in inventory
  const healId = Object.keys(player.items || {}).find(id => {
    const item = GameData.getItem(id);
    return item && item.type === 'heal' && player.items[id] > 0;
  });
  if (!healId) return false;
  // Skip if mon is already full
  const b = GameBattle.active;
  const pMon = b.playerTeam[b.playerActive];
  if (pMon.hp >= pMon.maxHp) return false;
  // Apply directly using the in-battle item flow
  try {
    GameItems.applyItem(GameData.getItem(healId), player, { inBattle: true, battle: b });
    GameBattle.syncBackToParty && GameBattle.syncBackToParty();
    GameBattle.renderBattle(b);
    // Opponent still gets a turn
    setTimeout(() => GameBattle.opponentTurn(), 500);
    return true;
  } catch (e) { return false; }
};

// ============== BRANCH ==============
GameCpu._handleBranch = function () {
  const opts = document.querySelectorAll('#branchOptions .branch-option');
  if (opts.length === 0) return;
  // Random branch pick — keeps gameplay varied across runs.
  const pick = opts[Math.floor(Math.random() * opts.length)];
  pick.click();
};
