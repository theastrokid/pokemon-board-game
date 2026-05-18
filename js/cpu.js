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
      // The two-step trade confirm targets CPU recipients only — trade.js
      // already auto-accepts after a delay, so don't fire a cancel here.
      case 'tradeConfirmModal':return null;
      default:                 return null;
    }
  }
  // 3. No modal, not busy → pre-roll strategy, then roll.
  //    CPUs used to just roll-and-move every turn and never invest in their
  //    party — so they stalled out around the 3rd gym when the stat curve
  //    outpaced their starter. Pre-roll, they now revive fainted mons, heal
  //    low-HP ones, burn Rare Candies on the best evolution target, and
  //    swap their three strongest mons into the battle slots. Each call
  //    returns ONE action; the watchdog comes back ~700ms later for the
  //    next one, so the human can see the moves happening.
  if (!GameState.busy && !GameState.pendingTileResolution) {
    const strategy = GameCpu._chooseStrategicAction();
    if (strategy) return strategy;
    return () => {
      if (window.console) console.log('[cpu] firing rollAndMove for', GameState.currentPlayer().name);
      GameGame.rollAndMove();
    };
  }
  return null;
};

// ============== STRATEGIC PRE-ROLL ==============

// Returns a function for the next strategic action, or null if nothing to do.
// Checked in priority order — earlier actions (revive, heal) fix immediate
// problems before later ones (evolution, slot optimization) build long-term
// strength.
GameCpu._chooseStrategicAction = function () {
  const player = GameState.currentPlayer();
  if (!player) return null;
  if (GameCpu._findReviveTarget(player)) {
    return () => GameCpu._doRevive(player);
  }
  if (GameCpu._findHealTarget(player)) {
    return () => GameCpu._doHeal(player);
  }
  if (GameCpu._findEvolveTarget(player)) {
    return () => GameCpu._doEvolve(player);
  }
  if (GameCpu._shouldOptimizeBattleSlots(player)) {
    return () => GameCpu._doOptimizeBattleSlots(player);
  }
  return null;
};

GameCpu._findHealItemId = function (player) {
  return Object.keys(player.items || {}).find(id => {
    const it = GameData.getItem(id);
    return it && it.type === 'heal' && player.items[id] > 0;
  });
};

GameCpu._findReviveItemId = function (player) {
  return Object.keys(player.items || {}).find(id => {
    const it = GameData.getItem(id);
    return it && it.type === 'revive' && player.items[id] > 0;
  });
};

GameCpu._findEvolveItemId = function (player) {
  return Object.keys(player.items || {}).find(id => {
    const it = GameData.getItem(id);
    return it && it.type === 'evolve' && player.items[id] > 0;
  });
};

// === Revive ===
GameCpu._findReviveTarget = function (player) {
  if (!GameCpu._findReviveItemId(player)) return null;
  return player.party.find(m => m.fainted) || null;
};

GameCpu._doRevive = function (player) {
  const reviveId = GameCpu._findReviveItemId(player);
  const target = GameCpu._findReviveTarget(player);
  if (!reviveId || !target) return;
  const item = GameData.getItem(reviveId);
  target.fainted = false;
  target.hp = Math.max(1, Math.round(target.maxHp * (item.amount || 0.5)));
  if (target.hp >= target.maxHp) GameState.resetMoves(target);
  GameState.consumeItem(player, reviveId);
  GameUI.log(`${player.name} revived <strong>${target.name}</strong>.`);
  GameAudio.sfx.heal();
  GameUI.refreshAll();
};

// === Heal ===
// Heal when a mon is below 50% HP. Use the smallest healer that does the job
// so we preserve the big ones (Hyper Potion) for gym fights.
GameCpu._findHealTarget = function (player) {
  if (!GameCpu._findHealItemId(player)) return null;
  return player.party
    .filter(m => !m.fainted && m.hp / m.maxHp < 0.5)
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || null;
};

GameCpu._doHeal = function (player) {
  const target = GameCpu._findHealTarget(player);
  if (!target) return;
  const missing = target.maxHp - target.hp;
  // Rank potions by amount ASC, pick the smallest that covers `missing` —
  // or the biggest available if nothing covers (so we still close the gap).
  const healers = Object.keys(player.items || {})
    .map(id => {
      const it = GameData.getItem(id);
      return it && it.type === 'heal' && player.items[id] > 0 ? it : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.amount || 0) - (b.amount || 0));
  if (healers.length === 0) return;
  const cover = healers.find(h => (h.amount || 0) >= missing);
  const chosen = cover || healers[healers.length - 1];
  if ((chosen.amount || 0) >= 999) target.hp = target.maxHp;
  else target.hp = Math.min(target.maxHp, target.hp + (chosen.amount || 0));
  if (target.hp >= target.maxHp) GameState.resetMoves(target);
  GameState.consumeItem(player, chosen.id);
  GameUI.log(`${player.name} used <strong>${chosen.name}</strong> on ${target.name}. HP now ${target.hp}/${target.maxHp}.`);
  GameAudio.sfx.heal();
  GameUI.refreshAll();
};

// === Evolve ===
// Prefer un-evolved party members (real evolution gives ~25%+ HP and access
// to better moves). Fall back to stat-boosting fully-evolved mons that
// haven't had their +25% boost yet.
GameCpu._findEvolveTarget = function (player) {
  if (!GameCpu._findEvolveItemId(player)) return null;
  if (!window.GameItems || !GameItems.getEvolutionOptions) return null;
  const eligibleForEvo = player.party.find(m => {
    if (GameState.candiedInstancesThisTurn[m.instanceId]) return false;
    return GameItems.getEvolutionOptions(m.speciesId).length > 0;
  });
  if (eligibleForEvo) return { mon: eligibleForEvo, mode: 'evolve' };
  const eligibleForBoost = player.party.find(m => {
    if (GameState.candiedInstancesThisTurn[m.instanceId]) return false;
    if ((m.boostCount || 0) >= 1) return false;
    return GameItems.getEvolutionOptions(m.speciesId).length === 0;
  });
  if (eligibleForBoost) return { mon: eligibleForBoost, mode: 'boost' };
  return null;
};

GameCpu._doEvolve = function (player) {
  const candyId = GameCpu._findEvolveItemId(player);
  const target = GameCpu._findEvolveTarget(player);
  if (!candyId || !target) return;
  const mon = target.mon;
  if (target.mode === 'boost') {
    GameItems.applyStatBoost(player, mon);
    GameUI.log(`<span class="crit">${player.name}'s ${mon.name} grew stronger! +25% HP, +25% move power.</span>`, 'crit');
  } else {
    const options = GameItems.getEvolutionOptions(mon.speciesId);
    // For multi-evolution (Eevee/Slowpoke) just take the first option — keeps
    // CPU behavior deterministic enough to simulate.
    const chosen = options[0];
    const newData = GameData.getPokemon(chosen);
    const oldName = mon.name;
    const wasFainted = mon.fainted;
    mon.speciesId = chosen;
    mon.name = newData.name;
    mon.types = newData.types.slice();
    const oldMax = mon.maxHp;
    mon.maxHp = newData.hp;
    if (wasFainted) {
      mon.hp = Math.max(1, Math.round(newData.hp * 0.1));
      mon.fainted = false;
    } else {
      mon.hp = Math.min(newData.hp, mon.hp + (newData.hp - oldMax));
    }
    mon.moves = GameState.cloneMoves(newData.moves);
    mon.boostCount = 0;
    GameUI.log(`<span class="crit">${player.name}'s ${oldName} evolved into ${newData.name}!</span>`, 'crit');
  }
  GameState.consumeItem(player, candyId);
  GameState.candiedInstancesThisTurn[mon.instanceId] = true;
  GameAudio.sfx.fanfare();
  GameUI.refreshAll();
};

// === Battle slot optimization ===
// Battle uses the first 3 party members. If a stronger mon is in storage
// (slots 4-6), shuffle so the three strongest non-fainted mons fight first.
GameCpu._monScore = function (m) {
  if (!m) return -Infinity;
  if (m.fainted) return -1000 + (m.maxHp || 0); // fainted goes to back but rank by potential
  const maxMove = (m.moves || []).reduce((mx, mv) => Math.max(mx, mv.power || 0), 0);
  return (m.maxHp || 0) + 2 * maxMove;
};

GameCpu._shouldOptimizeBattleSlots = function (player) {
  if (!player.party || player.party.length <= 3) return false;
  const sorted = [...player.party].sort((a, b) => GameCpu._monScore(b) - GameCpu._monScore(a));
  const currentTop3 = new Set(player.party.slice(0, 3));
  // Different if any of the optimal top 3 ISN'T already in the current top 3.
  return sorted.slice(0, 3).some(m => !currentTop3.has(m));
};

GameCpu._doOptimizeBattleSlots = function (player) {
  player.party.sort((a, b) => GameCpu._monScore(b) - GameCpu._monScore(a));
  GameUI.log(`${player.name} reshuffled their party for battle.`, 'system');
  GameUI.refreshAll();
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
  const oMon = b.oppTeam[b.oppActive];

  // Switch out if (a) HP <= 20% AND there's a healthier benchmate that can
  // actually attack, OR (b) the current mon does ≤0.5x to opp AND a benchmate
  // does ≥2x. Either way we burn a turn but the swap pays for itself within
  // 1-2 moves against a stat-scaled gym leader.
  const switchPick = GameCpu._pickSwitchTarget(b, pMon, oMon);
  if (switchPick != null) {
    GameBattle.switchTo(switchPick);
    return;
  }

  // Healing fallback for when no switch helps.
  if (pMon.hp / pMon.maxHp <= 0.25) {
    if (GameCpu._tryUseHealInBattle()) return;
  }

  // Pick the move that does the most expected damage, accounting for type
  // matchup + STAB. Old code just picked the highest raw power and ignored
  // resistances — Fire moves vs a Water gym leader, etc.
  const usable = pMon.moves
    .map((mv, i) => ({ mv, i, pp: (mv.pp || 0) }))
    .filter(x => x.pp > 0);
  if (usable.length === 0) {
    const haveAlternate = b.playerTeam.some((m, i) => i !== b.playerActive && !m.fainted && m.moves.some(mv => (mv.pp || 0) > 0));
    if (haveAlternate) GameCpu._click('switchBtn');
    else GameBattle.forfeit();
    return;
  }
  usable.sort((a, c) => GameCpu._moveScore(c.mv, pMon, oMon) - GameCpu._moveScore(a.mv, pMon, oMon));
  GameBattle.choosePlayerMove(usable[0].i);
};

// Expected damage proxy: power × type effectiveness × STAB. Doesn't bake
// the random 0.85-1.0 variance in, but the ordering is what matters.
GameCpu._moveScore = function (mv, attacker, defender) {
  if (!mv) return 0;
  const eff = (window.GameBattle && GameBattle.typeEffect && defender && defender.types)
    ? GameBattle.typeEffect(mv.type, defender.types)
    : 1;
  const stab = (attacker && attacker.types && attacker.types.includes(mv.type)) ? 1.2 : 1;
  return (mv.power || 0) * eff * stab;
};

// Returns the party index of a mon we should switch to, or null if staying
// put is best. Skips fainted + no-PP backups, and won't recommend switching
// when the only alternative is strictly worse than the current mon.
GameCpu._pickSwitchTarget = function (b, pMon, oMon) {
  if (!b || !pMon || !oMon) return null;
  const candidates = b.playerTeam
    .map((m, i) => ({ m, i }))
    .filter(x => x.i !== b.playerActive && x.m && !x.m.fainted && x.m.moves.some(mv => (mv.pp || 0) > 0));
  if (candidates.length === 0) return null;
  const bestMoveScore = (mon) => mon.moves.reduce((mx, mv) => Math.max(mx, GameCpu._moveScore(mv, mon, oMon)), 0);
  const incomingHpFrac = (mon) => mon.hp / Math.max(1, mon.maxHp);
  const currentScore = bestMoveScore(pMon);
  const currentLow = pMon.hp / pMon.maxHp <= 0.20;
  // Score each candidate by best-move-vs-opp × hp%. Adds a small bonus for
  // 2x effectiveness so a hard-counter wins out over a slightly bigger hitter.
  const ranked = candidates
    .map(c => {
      const ms = bestMoveScore(c.m);
      const hp = incomingHpFrac(c.m);
      return { i: c.i, m: c.m, ms, hp, score: ms * (0.5 + hp) };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  // Hard rule: never switch into a Pokemon that does ZERO damage to the opp.
  if (!best || best.ms <= 0) return null;
  // (a) current is critically low and best switch is healthy + competitive
  if (currentLow && best.hp >= 0.6 && best.ms >= currentScore * 0.75) return best.i;
  // (b) current does ≤0.5x effectiveness AND best switch does ≥2x
  const currentBestEff = pMon.moves.reduce((mx, mv) => Math.max(mx, GameBattle.typeEffect(mv.type, oMon.types)), 0);
  const bestSwitchEff = best.m.moves.reduce((mx, mv) => Math.max(mx, GameBattle.typeEffect(mv.type, oMon.types)), 0);
  if (currentBestEff <= 0.5 && bestSwitchEff >= 2) return best.i;
  return null;
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
