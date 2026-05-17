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
  if (window.GameMP && GameMP.enabled && !GameMP.isHost) return;
  if (Date.now() - GameCpu._lastActionTime < GameCpu.COOLDOWN_MS) return;
  const fire = GameCpu._chooseAction();
  if (!fire) return;
  GameCpu._lastActionTime = Date.now();
  // Capture the CPU we INTENDED to act for. The setTimeout delay can span a
  // turn handoff (state sync, opponent finishing fast), so re-validate before
  // firing so the host can't accidentally roll dice on a human guest's turn.
  const expected = p;
  setTimeout(() => {
    const now = GameState.currentPlayer && GameState.currentPlayer();
    if (now !== expected) return;
    if (!now || !now.isCpu) return;
    if (window.GameMP && GameMP.enabled && !GameMP.isHost) return;
    fire();
  }, 250 + Math.floor(Math.random() * 250));
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
  // If a regular ball is auto-selected (pendingEncounterBall), use the roll
  // button. Otherwise — the player only has Master Balls, which the auto-roll
  // flow refuses ("Pick a ball first") — click the Master Ball directly so it
  // resolves via the dedicated guaranteed-catch path.
  const rollBtn = GameUI.el('encounterAutoRollBtn');
  if (GameState.pendingEncounterBall && rollBtn && !rollBtn.disabled) {
    rollBtn.click();
    return;
  }
  if ((player.balls.masterball || 0) > 0) {
    const mbBtn = document.querySelector('#ballRow .ball-btn[data-ball="masterball"]');
    if (mbBtn && !mbBtn.disabled) { mbBtn.click(); return; }
  }
  // Nothing playable — flee so we don't infinite-loop on "Pick a ball first".
  GameCpu._click('encounterFleeBtn');
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
  // Pick the strongest usable move (PP > 0).
  const usable = pMon.moves
    .map((mv, i) => ({ mv, i, pp: (mv.pp || 0) }))
    .filter(x => x.pp > 0);
  if (usable.length === 0) {
    // All PP exhausted on the lead. Look for ANY party member with usable PP.
    const haveAlternate = b.playerTeam.some((m, i) => i !== b.playerActive && !m.fainted && m.moves.some(mv => (mv.pp || 0) > 0));
    if (haveAlternate) {
      GameCpu._click('switchBtn');
    } else {
      // No alternate has PP either — forfeit so we don't softlock on switches.
      GameBattle.forfeit();
    }
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
  const item = GameData.getItem(healId);
  // BYPASS the heal picker: GameItems.applyHeal opens itemPickerModal so a
  // human can choose which party member to heal. For the CPU, opening that
  // picker is fatal — the watchdog's next tick fires the "open modal? click
  // Cancel" branch, which cancels the heal AND consumes the CPU's turn (the
  // setTimeout below has already scheduled opponentTurn()). Apply the heal
  // directly to the active battle mon and consume the item ourselves.
  if (item.amount >= 999) pMon.hp = pMon.maxHp;
  else pMon.hp = Math.min(pMon.maxHp, pMon.hp + item.amount);
  if (pMon.hp >= pMon.maxHp) GameState.resetMoves(pMon);
  GameState.consumeItem(player, healId);
  GameUI.log(`${player.name} used <strong>${item.name}</strong> on ${pMon.name}. HP now ${pMon.hp}/${pMon.maxHp}.`);
  GameAudio.sfx.heal();
  GameBattle.syncBackToParty && GameBattle.syncBackToParty();
  GameBattle.renderBattle(b);
  GameUI.refreshAll();
  // Opponent still gets a turn (item use consumes the action).
  setTimeout(() => GameBattle.opponentTurn(), 500);
  return true;
};

// ============== BRANCH ==============
GameCpu._handleBranch = function () {
  const opts = document.querySelectorAll('#branchOptions .branch-option');
  if (opts.length === 0) return;
  // Random branch pick — keeps gameplay varied across runs.
  const pick = opts[Math.floor(Math.random() * opts.length)];
  pick.click();
};
