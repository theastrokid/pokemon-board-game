// =============================================================
// cpu.js · simple CPU AI brain
//
// Watches the DOM + GameState. Whenever the active player is a CPU and a
// new modal opens / a new turn starts, fires the appropriate auto-action
// with a small human-like delay so the human players can follow along.
// =============================================================
window.GameCpu = {};

// Polling watchdog — re-checks every 250ms which state the CPU should react to.
GameCpu._lastSignature = null;

GameCpu.start = function () {
  if (GameCpu._tick) clearInterval(GameCpu._tick);
  GameCpu._tick = setInterval(GameCpu._maybeAct, 250);
};

GameCpu.stop = function () {
  if (GameCpu._tick) { clearInterval(GameCpu._tick); GameCpu._tick = null; }
};

GameCpu._maybeAct = function () {
  const p = GameState.currentPlayer && GameState.currentPlayer();
  if (!p || !p.isCpu) return;
  // Build a state signature so we don't re-fire the same action.
  const sig = GameCpu._currentSignature();
  if (sig === GameCpu._lastSignature) return;
  GameCpu._lastSignature = sig;
  setTimeout(() => GameCpu._dispatch(), GameCpu._humanDelayMs());
};

GameCpu._humanDelayMs = function () { return 450 + Math.floor(Math.random() * 350); };

GameCpu._currentSignature = function () {
  // Tracks what the CPU is currently looking at: turn, modal, busy, etc.
  // Must include enough modal detail to detect repeat attempts in the SAME
  // modal — e.g. encounter retries after a missed ball throw, where the
  // modal ID and player are unchanged but the result text + button state
  // shift.
  const p = GameState.currentPlayer();
  const b = window.GameBattle && GameBattle.active;
  const openModal = Array.from(document.querySelectorAll('.modal'))
    .find(m => !m.hidden);
  let modalDetail = null;
  if (openModal) {
    const resultEl = openModal.querySelector('#encounterResult, #battleMessage, #drawTitle');
    const enabledList = Array.from(openModal.querySelectorAll('button:not([disabled])'))
      .map(btn => btn.id || btn.dataset.ball || btn.textContent.slice(0, 10))
      .join(',');
    modalDetail = (resultEl ? resultEl.textContent : '') + '|' + enabledList;
  }
  return JSON.stringify({
    pid: p ? p.id : null,
    turn: GameState.turnCount,
    tile: p ? p.tile : null,
    pending: GameState.pendingTileResolution,
    busy: GameState.busy,
    modal: openModal ? openModal.id : null,
    modalDetail,
    battle: b ? { kind: b.kind, pAct: b.playerActive, oAct: b.oppActive, opPend: !!b.opponentPending, msg: b.message } : null,
  });
};

GameCpu._dispatch = function () {
  const p = GameState.currentPlayer && GameState.currentPlayer();
  if (!p || !p.isCpu) return;
  // 1. Battle (highest priority)
  const battleModal = GameUI.el('battleModal');
  if (battleModal && !battleModal.hidden && GameBattle.active) {
    GameCpu._handleBattle();
    return;
  }
  // 2. Other modals
  const openModal = Array.from(document.querySelectorAll('.modal')).find(m => !m.hidden);
  if (openModal) {
    switch (openModal.id) {
      case 'encounterModal':   return GameCpu._handleEncounter();
      case 'drawModal':        return GameCpu._click('drawContinueBtn');
      case 'noBallsModal':     return; // auto-closes via timer
      case 'faintedModal':     return; // auto-closes via timer
      case 'branchModal':      return GameCpu._handleBranch();
      case 'tradeModal':       return GameCpu._click('tradeCancelBtn'); // CPU skips trades
      case 'pvpModal':         return GameCpu._click('pvpCancelBtn');   // CPU skips PvP for now
      case 'evolvePickerModal':return GameCpu._click('evolvePickerCancel');
      case 'releaseModal':     return GameCpu._click('releaseCancelBtn');
      case 'tileModal':        return GameCpu._click('tileResolveBtn');
      case 'victoryModal':     return GameCpu._click('victoryContinueBtn');
      case 'hofModal':         return GameCpu._click('hofCloseBtn');
      case 'itemPickerModal':  return GameCpu._click('itemPickerCancel');
      default: return;
    }
  }
  // 3. No modal, no battle, no busy → take a turn (roll the dice)
  if (!GameState.busy && !GameState.pendingTileResolution) {
    const rollBtn = GameUI.el('rollMoveBtn');
    if (rollBtn && !rollBtn.disabled) rollBtn.click();
  }
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
