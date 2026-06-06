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
      case 'itemPickerModal':  return () => {
        // A full-party catch prompt? Decide smartly (keep upgrades). Otherwise
        // it's some other item picker the CPU doesn't drive — just cancel.
        if (window.GameItems && GameItems._discardForRoomIncoming != null) GameCpu._handleDiscardForRoom();
        else GameCpu._click('itemPickerCancel');
      };
      case 'dicePickerModal':  return () => GameCpu._click('dicePickCancel');
      case 'gymPrepModal':     return () => GameCpu._click('gymPrepFightBtn');
      case 'shopModal':        return () => GameCpu._click('shopCloseBtn');
      // Team Rocket: during the theft RESULT (Continue button shown) the CPU
      // clicks through; during the intro / battle phases it waits (the intro
      // auto-advances and the battle is handled by the battle branch above).
      case 'teamRocketModal':  return () => {
        const actions = document.getElementById('teamRocketActions');
        if (actions && !actions.hidden) GameCpu._click('teamRocketContinueBtn');
      };
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
// problems before later ones (evolution, discard, slot optimization) build
// long-term strength.
//
// Order intentionally puts EVOLVE before DISCARD: discarding a Pokemon
// scales the reward by its evolution stage (×2 for Stage 2, ×3 for Stage 3,
// extra ×2 for Ancient Temple natives). Evolving first means weak Stage 1
// mons get bumped up before we cash them in, so each release pays more.
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
  if (GameCpu._findDiscardTarget(player)) {
    return () => GameCpu._doDiscard(player);
  }
  if (GameCpu._findBattleBuffItemId(player)) {
    return () => GameCpu._doUseBattleBuff(player);
  }
  if (GameCpu._hasLuckyEgg(player)) {
    return () => GameCpu._doUseLuckyEgg(player);
  }
  if (GameCpu._hasLoadedDice(player)) {
    return () => GameCpu._doUseLoadedDice(player);
  }
  if (GameCpu._shouldOptimizeBattleSlots(player)) {
    return () => GameCpu._doOptimizeBattleSlots(player);
  }
  return null;
};

// Lucky Egg: arm the 2× next-gym-reward multiplier as soon as we have one (it
// persists until the next gym, so there's no reason to hold it).
GameCpu._hasLuckyEgg = function (player) {
  return !!(player.items && player.items.lucky_egg > 0) && !(player.flags && player.flags.luckyEgg);
};
GameCpu._doUseLuckyEgg = function (player) {
  if (!player.items || !player.items.lucky_egg) return;
  player.flags = player.flags || {};
  player.flags.luckyEgg = true;
  GameState.consumeItem(player, 'lucky_egg');
  GameUI.log(`${player.name} clutches a Lucky Egg for the next gym battle.`, 'system');
  GameUI.refreshAll();
};

// Loaded Dice: a CPU just sets its next roll to 6 for max progress (movement
// absolute-stops at gyms, so it never overshoots a gym).
GameCpu._hasLoadedDice = function (player) {
  return !!(player.items && player.items.loaded_dice > 0) && !(player.flags && player.flags.loadedDice > 0);
};
GameCpu._doUseLoadedDice = function (player) {
  if (!player.items || !player.items.loaded_dice) return;
  player.flags = player.flags || {};
  player.flags.loadedDice = 6;
  GameState.consumeItem(player, 'loaded_dice');
  GameUI.log(`${player.name} loaded the dice (next roll: 6).`, 'system');
  GameUI.refreshAll();
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
// Heal when a mon is below HEAL_THRESHOLD. Use the smallest healer that
// does the job so we preserve the big ones (Hyper Potion) for gym fights.
GameCpu.HEAL_THRESHOLD = 0.5;
GameCpu._findHealTarget = function (player) {
  if (!GameCpu._findHealItemId(player)) return null;
  return player.party
    .filter(m => !m.fainted && m.hp / m.maxHp < GameCpu.HEAL_THRESHOLD)
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
  const candies = (player.items && player.items.rare_candy) || 0;
  // Evolve cost scales with stage: Stage 1→2 = 1 candy, Stage 2→3 = 2.
  const eligibleForEvo = player.party.find(m => {
    if (GameState.candiedInstancesThisTurn[m.instanceId]) return false;
    return GameItems.getEvolutionOptions(m.speciesId).length > 0
      && candies >= GameItems.getEvolutionStage(m.speciesId);
  });
  if (eligibleForEvo) return { mon: eligibleForEvo, mode: 'evolve' };
  // Stat boost for maxed mons: a single +50% for 3 candies.
  const eligibleForBoost = player.party.find(m => {
    if (GameState.candiedInstancesThisTurn[m.instanceId]) return false;
    if (GameItems.getEvolutionOptions(m.speciesId).length > 0) return false; // can still evolve
    if ((m.boostCount || 0) >= 1) return false;
    return candies >= 3;
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
    const cost = 3; // single +50% boost costs 3 candies
    GameItems.applyStatBoost(player, mon);
    for (let i = 0; i < cost; i++) GameState.consumeItem(player, candyId);
    GameState.candiedInstancesThisTurn[mon.instanceId] = true;
    GameUI.log(`<span class="crit">${player.name}'s ${mon.name} grew stronger! +50% (used ${cost} Rare Candies).</span>`, 'crit');
    GameAudio.sfx.fanfare();
    GameUI.refreshAll();
    return;
  }
  {
    const options = GameItems.getEvolutionOptions(mon.speciesId);
    // Evolve cost scales with the evolving mon's stage (1 candy Stage 1→2, 2 Stage 2→3).
    const evoCost = GameItems.getEvolutionStage(mon.speciesId);
    // For multi-evolution (Eevee/Slowpoke) just take the first option — keeps
    // CPU behavior deterministic enough to simulate.
    const chosen = options[0];
    const newData = GameData.getPokemon(chosen);
    const oldName = mon.name;
    const wasFainted = mon.fainted;
    mon._evoCost = evoCost;
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
  const evoCostFinal = mon._evoCost || 1;
  delete mon._evoCost;
  for (let i = 0; i < evoCostFinal; i++) GameState.consumeItem(player, candyId);
  GameState.candiedInstancesThisTurn[mon.instanceId] = true;
  GameAudio.sfx.fanfare();
  GameUI.refreshAll();
};

// === Battle buffs (X-Attack / X-Defense) ===
// 'battlebuff' items don't apply in-battle — they stash pending boosted
// turns onto the player flag, and the next battle's lead mon enjoys them.
// Stacking is linear (each item = +3 boosted turns), so we burn them as
// soon as we see them: the buff will land on the next gym / PvP lead.
GameCpu._findBattleBuffItemId = function (player) {
  return Object.keys(player.items || {}).find(id => {
    const it = GameData.getItem(id);
    return it && it.type === 'battlebuff' && player.items[id] > 0;
  });
};

GameCpu._doUseBattleBuff = function (player) {
  const id = GameCpu._findBattleBuffItemId(player);
  if (!id) return;
  const item = GameData.getItem(id);
  if (!window.GameItems || !GameItems.applyBattleBuff) {
    // Fallback: still consume to avoid loop, but no-op.
    GameState.consumeItem(player, id);
    return;
  }
  GameItems.applyBattleBuff(item, player);
  GameUI.refreshAll();
};

// === Party management: keep a FULL squad of the strongest mons ===
// The CPU builds a big, high-stat team. It fills all 6 slots and, when it
// catches something while full, keeps the newcomer only if it out-stats the
// weakest mon on the bench (see GameCpu._handleDiscardForRoom). It no longer
// cashes Pokemon in for items — a deep, strong roster answers more gym
// matchups and posts a higher Hall of Fame team-stat score. With a target of
// 6 the proactive discard below is effectively disabled (party never exceeds 6).
GameCpu.TARGET_PARTY_SIZE = 6;

// A "keep" score: raw strength plus a big bonus when the mon is the ONLY
// holder of its primary type in the party (so we don't discard our last Fire
// mon just because it's a point weaker). The discard target is the mon with
// the lowest keep score.
GameCpu._keepScore = function (mon, party) {
  if (!mon) return -Infinity;
  const prim = (mon.types && mon.types[0]) || 'normal';
  const sameType = party.filter(m => m !== mon && m.types && m.types[0] === prim).length;
  const uniqueBonus = sameType === 0 ? 400 : 0; // protect one-of-a-kind types
  return GameCpu._monScore(mon) + uniqueBonus;
};

GameCpu._findDiscardTarget = function (player) {
  if (!player || !player.party) return null;
  if (player.party.length <= GameCpu.TARGET_PARTY_SIZE) return null;
  if (player.party.length <= 1) return null; // game blocks releasing your last
  // Discard the lowest keep-score mon — fainted + redundant-type weaklings go
  // first; unique types are protected. Never release a shiny (they're prized
  // and now worth double on release if the player ever wants to).
  const candidates = player.party.filter(m => !m.isShiny);
  const pool = candidates.length ? candidates : [...player.party];
  pool.sort((a, b) => GameCpu._keepScore(a, player.party) - GameCpu._keepScore(b, player.party));
  return pool[0] || null;
};

GameCpu._doDiscard = function (player) {
  const target = GameCpu._findDiscardTarget(player);
  if (!target) return;
  const idx = player.party.findIndex(m => m.instanceId === target.instanceId);
  if (idx < 0 || player.party.length <= 1) return;
  // Mirror GameUI.discardPartyMember's reward math (bypass the modal — CPU
  // wouldn't click through it anyway, and the existing CPU watchdog would
  // just hit Cancel on releaseModal).
  const bonus = (window.GameItems && GameItems.computeDiscardBonus)
    ? GameItems.computeDiscardBonus(target.speciesId, target.isShiny)
    : { multiplier: 1, reasons: [] };
  const n = bonus.multiplier || 1;
  const released = player.party.splice(idx, 1)[0];
  for (let i = 0; i < n; i++) {
    const it = GameData.pickItemCard();
    GameState.giveItem(player, it.id);
  }
  for (let i = 0; i < n; i++) {
    const ball = GameData.pickPokeballCard();
    GameState.giveBall(player, ball.id);
  }
  const bonusTag = n > 1 ? ` <span class="crit">(×${n} ${bonus.reasons.join(' + ')})</span>` : '';
  GameUI.log(`${player.name} released <strong>${released.name}</strong> · drew ${n} item${n>1?'s':''} + ${n} ball${n>1?'s':''}${bonusTag}.`, 'crit');
  GameAudio.sfx.item && GameAudio.sfx.item();
  GameUI.refreshAll();
};

// Stat estimate for a freshly-caught species (matches _monScore on a new mon).
GameCpu._speciesScore = function (speciesId) {
  const p = GameData.getPokemon(speciesId);
  if (!p) return 0;
  const maxMove = (p.moves || []).reduce((mx, mv) => Math.max(mx, mv.power || 0), 0);
  return (p.hp || 0) + 2 * maxMove;
};

// Full-party catch: keep the newcomer only if it out-stats the weakest mon on
// the bench (then click that mon's card to swap + collect prizes). Otherwise
// skip. This is what stops the CPU forfeiting a strong catch like Lugia.
GameCpu._handleDiscardForRoom = function () {
  const player = GameState.currentPlayer();
  const incomingId = window.GameItems && GameItems._discardForRoomIncoming;
  if (incomingId == null) { GameCpu._click('itemPickerCancel'); return; }
  const pool = player.party.filter(m => !m.isShiny);       // shinies are protected
  const cand = pool.length ? pool : player.party.slice();
  const weakest = cand.slice().sort((a, b) => GameCpu._monScore(a) - GameCpu._monScore(b))[0];
  const incomingScore = GameCpu._speciesScore(incomingId);
  if (weakest && incomingScore > GameCpu._monScore(weakest)) {
    const idx = player.party.findIndex(m => m.instanceId === weakest.instanceId);
    const grid = GameUI.el('itemPickerGrid');
    const card = grid && grid.children[idx];
    if (card) { card.click(); return; } // swaps weakest out, keeps the catch
  }
  GameCpu._click('itemPickerCancel'); // newcomer not worth a slot — keep team
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
  const ctx = window.GameEncounter && GameEncounter._activeCtx;
  const attemptsUsed = ctx ? (ctx.attemptsUsed || 0) : 0;

  // After 2 failed throws, stop wasting cheap balls — escalate to the BEST ball
  // available (usually a Master Ball = guaranteed catch).
  if (attemptsUsed >= 2) {
    const order = ['masterball', 'ultraball', 'greatball', 'pokeball'];
    const best = order.find(b => (player.balls[b] || 0) > 0);
    const bestBtn = best && document.querySelector(`#ballRow .ball-btn[data-ball="${best}"]`);
    if (bestBtn && !bestBtn.disabled) {
      bestBtn.click(); // Master Ball auto-catches; others just select
      if (best !== 'masterball') {
        const rb = GameUI.el('encounterAutoRollBtn');
        if (rb && !rb.disabled) rb.click();
      }
      return;
    }
  }

  // Default (first throws): use the auto-selected (most-populous) ball.
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

// Reorder a CPU's party right before a gym fight so the three best matchups vs
// THIS leader's team fill the battle slots, led by the best answer to the
// leader's first Pokemon. Uses type effectiveness + raw stats.
GameCpu.orderPartyForGym = function (player, leaderTeam) {
  if (!player || !player.party || player.party.length <= 1) return;
  if (!leaderTeam || !leaderTeam.length || !window.GameBattle || !GameBattle.typeEffect) return;
  const leaderDatas = leaderTeam.map(s => GameData.getPokemon(s.id)).filter(Boolean);
  if (!leaderDatas.length) return;
  const offenseVs = (mon, ld) => (mon.moves || []).reduce((mx, mv) =>
    Math.max(mx, GameBattle.typeEffect(mv.type, ld.types) * ((mon.types || []).includes(mv.type) ? 1.2 : 1)), 0);
  const matchupScore = (mon) => {
    if (mon.fainted) return -1e6 + GameCpu._monScore(mon);
    let off = 0, def = 0;
    leaderDatas.forEach(ld => {
      off += offenseVs(mon, ld);
      def += (ld.types || []).reduce((mx, t) => Math.max(mx, GameBattle.typeEffect(t, mon.types || [])), 1);
    });
    return GameCpu._monScore(mon) + off * 30 - def * 10;
  };
  player.party.sort((a, b) => matchupScore(b) - matchupScore(a));
  // Lead with the best counter to the leader's first Pokemon (battle slots only).
  const lead0 = leaderDatas[0];
  if (lead0) {
    let bestIdx = -1, bestVal = -Infinity;
    player.party.forEach((m, i) => {
      if (m.fainted) return; // battles use up to 6 — consider the WHOLE bench
      // Pick the best counter to the leader's first mon, tie-broken toward the
      // stronger Pokemon so the lead is a real threat, not a glass cannon.
      const v = offenseVs(m, lead0) * 1000 + GameCpu._monScore(m);
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    });
    if (bestIdx > 0) {
      const [lead] = player.party.splice(bestIdx, 1);
      player.party.unshift(lead);
    }
  }
  const remark = (player._gymLossStreak | 0) > 0 ? 'regrouped and reordered for another shot at' : 'sized up';
  GameUI.log(`${player.name} ${remark} the gym and set the matchup.`, 'system');
  GameUI.refreshAll();
};

// ============== BATTLE ==============
GameCpu.IN_BATTLE_HEAL_THRESHOLD = 0.25;
GameCpu.SWITCH_LOW_HP_THRESHOLD = 0.20;
GameCpu._handleBattle = function () {
  const b = GameBattle.active;
  if (!b || b.opponentPending) return;
  const pMon = b.playerTeam[b.playerActive];
  if (!pMon || pMon.fainted) return;
  const oMon = b.oppTeam[b.oppActive];

  // Switch out if (a) HP <= SWITCH_LOW_HP_THRESHOLD AND there's a healthier
  // benchmate that can actually attack, OR (b) the current mon does ≤0.5x to
  // opp AND a benchmate does ≥2x. Either way we burn a turn but the swap
  // pays for itself within 1-2 moves against a stat-scaled gym leader.
  const switchPick = GameCpu._pickSwitchTarget(b, pMon, oMon);
  if (switchPick != null) {
    GameBattle.switchTo(switchPick);
    return;
  }

  // Healing fallback for when no switch helps.
  if (pMon.hp / pMon.maxHp <= GameCpu.IN_BATTLE_HEAL_THRESHOLD) {
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
    else GameBattle.choosePlayerMove(-1); // Struggle rather than throw the fight
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
  const currentLow = pMon.hp / pMon.maxHp <= GameCpu.SWITCH_LOW_HP_THRESHOLD;
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
