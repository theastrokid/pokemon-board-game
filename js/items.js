// =============================================================
// items.js  ·  item card use, evolve, discard for room
// =============================================================
window.GameItems = {};

// Apply an item to a chosen target
GameItems.applyItem = function (item, player, ctx) {
  ctx = ctx || {};
  switch (item.type) {
    case 'heal':
      GameItems.applyHeal(item, player, ctx);
      break;
    case 'revive':
      GameItems.applyRevive(item, player);
      break;
    case 'evolve':
      GameItems.applyEvolve(item, player);
      break;
    case 'buff':
      GameItems.applyBuff(item, player);
      break;
    case 'battlebuff':
      GameItems.applyBattleBuff(item, player);
      break;
    case 'lucky':
      player.flags.luckyEgg = true;
      GameUI.log(`${player.name} clutches a Lucky Egg for the next gym battle.`);
      GameState.consumeItem(player, item.id);
      break;
    default:
      GameUI.log(`No effect implemented for ${item.name}.`, 'system');
  }
  GameUI.refreshAll();
};

// Each X-Attack / X-Defense item adds 3 buffed moves. Stacks linearly —
// e.g. 4× X-Attack queues 12 boosted attacks for the next battle's lead mon.
GameItems.applyBattleBuff = function (item, player) {
  const TURNS_PER_ITEM = 3;
  if (item.stat === 'attack') {
    player.flags.x2AttackPending = (Number(player.flags.x2AttackPending) || 0) + TURNS_PER_ITEM;
    const total = player.flags.x2AttackPending;
    GameUI.log(`${player.name} powered up with <strong>X-Attack</strong>. Next battle's lead Pokemon gets +25% Attack for <strong>${total} move${total === 1 ? '' : 's'}</strong>.`, 'crit');
  } else if (item.stat === 'defense') {
    player.flags.x2DefensePending = (Number(player.flags.x2DefensePending) || 0) + TURNS_PER_ITEM;
    const total = player.flags.x2DefensePending;
    GameUI.log(`${player.name} braced with <strong>X-Defense</strong>. Next battle's lead Pokemon gets +25% Defense for <strong>${total} incoming hit${total === 1 ? '' : 's'}</strong>.`, 'crit');
  }
  GameState.consumeItem(player, item.id);
};

GameItems.useItem = function (itemId) {
  const player = GameState.currentPlayer();
  const item = GameData.getItem(itemId);
  if (!item || !player.items[itemId]) return;
  GameItems.applyItem(item, player, {});
};

GameItems.applyHeal = function (item, player, ctx) {
  const targets = (ctx.inBattle ? [ctx.battle.playerTeam[ctx.battle.playerActive]] : player.party).filter(m => !m.fainted && m.hp < m.maxHp);
  if (targets.length === 0) {
    GameUI.log(`No Pokemon need healing.`, 'system');
    return;
  }
  const count = player.items[item.id] || 0;
  GameItems.promptPickPartyMember(targets, mon => {
    if (item.amount >= 999) mon.hp = mon.maxHp;
    else mon.hp = Math.min(mon.maxHp, mon.hp + item.amount);
    if (mon.hp >= mon.maxHp) GameState.resetMoves(mon);
    GameState.consumeItem(player, item.id);
    GameUI.log(`${player.name} used <strong>${item.name}</strong> on ${mon.name}. HP now ${mon.hp}/${mon.maxHp}.`);
    GameAudio.sfx.heal();
    GameUI.refreshAll();
    // Re-open picker if more of the same item AND more eligible targets exist
    if ((player.items[item.id] || 0) > 0) {
      const moreTargets = (ctx.inBattle ? [ctx.battle.playerTeam[ctx.battle.playerActive]] : player.party).filter(m => !m.fainted && m.hp < m.maxHp);
      if (moreTargets.length > 0) {
        setTimeout(() => GameItems.applyHeal(item, player, ctx), 200);
      }
    }
  }, {
    title: `Use ${item.name}`,
    hint: count > 1 ? `${count} left · pick a Pokemon (Done when finished)` : 'Pick a Pokemon to heal',
  });
};

GameItems.applyRevive = function (item, player) {
  const targets = player.party.filter(m => m.fainted);
  if (targets.length === 0) {
    GameUI.log(`No fainted Pokemon to revive.`, 'system');
    return;
  }
  const reviveCount = player.items[item.id] || 0;
  GameItems.promptPickPartyMember(targets, mon => {
    mon.fainted = false;
    mon.hp = Math.max(1, Math.round(mon.maxHp * (item.amount || 0.5)));
    if (mon.hp >= mon.maxHp) GameState.resetMoves(mon);
    GameState.consumeItem(player, item.id);
    GameUI.log(`${player.name} revived ${mon.name} with ${item.name}. HP ${mon.hp}/${mon.maxHp}.`);
    GameAudio.sfx.heal();
    GameUI.refreshAll();
    if ((player.items[item.id] || 0) > 0 && player.party.some(m => m.fainted)) {
      setTimeout(() => GameItems.applyRevive(item, player), 200);
    }
  }, {
    title: `Use ${item.name}`,
    hint: reviveCount > 1 ? `${reviveCount} left · pick a fainted Pokemon (Done when finished)` : 'Pick a fainted Pokemon to revive',
  });
};

GameItems.applyEvolve = function (item, player) {
  // Eligible = any party Pokemon. Mons with a next evolution evolve normally;
  // mons that have peaked (no further evolution) get a +25% stat boost instead.
  const eligible = player.party;
  if (eligible.length === 0) {
    alert('No Pokemon in your party.');
    return;
  }
  GameUI.showEvolutionPicker(eligible, (mon, chosenEvolutionId) => {
    // Per-Pokemon limit: each instance can only take one Rare Candy per turn.
    if (GameState.candiedInstancesThisTurn[mon.instanceId]) {
      GameUI.log(`${mon.name} has already used a Rare Candy this turn.`, 'system');
      return;
    }
    if (chosenEvolutionId == null) {
      // Stat boost path (fully-evolved Pokemon). Lifetime cap: 1 per mon ever.
      if ((mon.boostCount || 0) >= 1) {
        GameUI.log(`${mon.name} has already received its Rare Candy boost.`, 'system');
        return;
      }
      GameItems.applyStatBoost(player, mon);
      GameState.consumeItem(player, item.id);
      GameState.candiedInstancesThisTurn[mon.instanceId] = true;
      GameUI.log(`<span class="crit">${player.name}'s ${mon.name} grew stronger! +25% HP, +25% move power, PP raised to 40/5.</span>`, 'crit');
      GameAudio.sfx.fanfare();
      GameUI.refreshAll();
      return;
    }
    const evolved = chosenEvolutionId;
    const newData = GameData.getPokemon(evolved);
    const oldName = mon.name;
    const oldSpeciesId = mon.speciesId;
    const wasFainted = mon.fainted;
    GameState.consumeItem(player, item.id);
    GameState.candiedInstancesThisTurn[mon.instanceId] = true;
    GameUI.refreshAll();
    GameUI.playEvolutionAnimation(oldSpeciesId, evolved, oldName, newData.name, () => {
      mon.speciesId = evolved;
      mon.name = newData.name;
      mon.types = newData.types.slice();
      const oldMax = mon.maxHp;
      mon.maxHp = newData.hp;
      if (wasFainted) {
        // Fainted Pokemon revives at 10% of new max HP
        mon.hp = Math.max(1, Math.round(newData.hp * 0.1));
        mon.fainted = false;
      } else {
        mon.hp = Math.min(newData.hp, mon.hp + (newData.hp - oldMax));
      }
      mon.moves = GameState.cloneMoves(newData.moves);
      // Evolution clears any prior +25% boosts (new species, new base stats).
      mon.boostCount = 0;
      const suffix = wasFainted ? ` and revived at ${mon.hp}/${mon.maxHp} HP` : '';
      GameUI.log(`<span class="crit">${player.name}'s ${oldName} evolved into ${newData.name}${suffix}!</span>`, 'crit');
      GameAudio.sfx.fanfare();
      GameUI.refreshAll();
    });
  });
};

// One-shot +25% stat boost for a fully-evolved Pokemon. Limit: 1 per mon.
// Effects: +25% maxHp, +25% move power, max PP bumped to 40 (weak) / 5 (strong),
// full heal, fainted cleared. Caller must check (mon.boostCount || 0) < 1.
GameItems.applyStatBoost = function (player, mon) {
  mon.maxHp = Math.max(mon.maxHp + 1, Math.round(mon.maxHp * 1.25));
  mon.hp = mon.maxHp;
  mon.fainted = false;
  mon.moves.forEach(mv => {
    mv.power = Math.max(mv.power + 1, Math.round(mv.power * 1.25));
    mv.maxPp = mv.gated ? 5 : 40;
    mv.pp = mv.maxPp;
  });
  mon.boostCount = (mon.boostCount || 0) + 1;
};

GameItems.applyBuff = function (item, player) {
  if (item.stat === 'attack') {
    player.flags.xAttack = true;
    GameUI.log(`${player.name} powered up with X Attack. Next move deals +25%.`);
  } else if (item.stat === 'defense') {
    player.flags.xDefend = true;
    GameUI.log(`${player.name} braced with X Defend. Next hit incoming takes -25%.`);
  }
  GameState.consumeItem(player, item.id);
};

// Lookup of evolutions for the dex we ship. Source-of-truth for evolutions.
// Multi-evolution cases (Eevee, Slowpoke) listed in GameItems.multiEvolutions.
GameItems.evolutions = {
  // Gen 1 (1-151)
  1: 2, 2: 3, 4: 5, 5: 6, 7: 8, 8: 9, 10: 11, 11: 12, 13: 14, 14: 15,
  16: 17, 17: 18, 19: 20, 21: 22, 23: 24, 25: 26, 27: 28, 29: 30, 30: 31,
  32: 33, 33: 34, 35: 36, 37: 38, 39: 40, 41: 42, 43: 44, 44: 45,
  46: 47, 48: 49, 50: 51, 52: 53, 54: 55, 56: 57, 58: 59,
  60: 61, 61: 62, 63: 64, 64: 65, 66: 67, 67: 68, 69: 70, 70: 71,
  72: 73, 74: 75, 75: 76, 77: 78, 81: 82, 84: 85, 86: 87, 88: 89,
  90: 91, 92: 93, 93: 94, 96: 97, 98: 99, 100: 101, 102: 103, 104: 105,
  109: 110, 111: 112, 116: 117, 118: 119, 120: 121,
  123: 212, 129: 130, 138: 139, 140: 141, 147: 148, 148: 149,
  // Gen 2 cross-evolutions of Gen 1 (only those whose target is in the dataset)
  42: 169, // Golbat → Crobat (overridden via multi below)
  // Gen 2 pre-evolutions
  155: 157, // Cyndaquil → Typhlosion (skips Quilava if not in dex)
  158: 160, // Totodile → Feraligatr (skips Croconaw if not in dex)
  161: 162, // Sentret → Furret
  163: 164, // Hoothoot → Noctowl
  167: 168, // Spinarak → Ariados
  172: 25,  // Pichu → Pikachu
  173: 35,  // Cleffa → Clefairy
  175: 176, // Togepi → Togetic
  179: 181, // Mareep → Ampharos (skips Flaaffy)
  246: 247, 247: 248, // Larvitar → Pupitar → Tyranitar
};

// Pokemon with multiple evolution paths — player picks one.
GameItems.multiEvolutions = {
  79:  [80, 199],                  // Slowpoke → Slowbro or Slowking
  133: [134, 135, 136, 196, 197],  // Eevee → Vaporeon/Jolteon/Flareon/Espeon/Umbreon
};

// 42 (Golbat) appears in `evolutions` but Crobat is the only target — kept simple.
// 79 (Slowpoke) uses multiEvolutions so the 79: 80 entry was removed from `evolutions`.

GameItems.getEvolution = function (speciesId) {
  const next = GameItems.evolutions[speciesId];
  if (!next) return null;
  if (!GameData.pokemon[String(next)]) return null;
  return next;
};

// Returns 1 (base), 2 (first evolution), or 3 (final/second evolution) by
// walking backwards through evolutions/multiEvolutions. Capped at 3.
GameItems.getEvolutionStage = function (speciesId) {
  const findPre = (id) => {
    for (const [from, to] of Object.entries(GameItems.evolutions)) {
      if (Number(to) === Number(id)) return Number(from);
    }
    for (const [from, opts] of Object.entries(GameItems.multiEvolutions)) {
      if (opts.map(Number).includes(Number(id))) return Number(from);
    }
    return null;
  };
  let stage = 1, cur = speciesId, guard = 0;
  while (guard++ < 4) {
    const pre = findPre(cur);
    if (pre == null) break;
    stage++;
    cur = pre;
  }
  return Math.min(stage, 3);
};

// Computes the discard reward multiplier for a given speciesId.
//   Stage 2 evolution: ×2
//   Stage 3 evolution: ×3
//   Native to Ancient Temple area: extra ×2 (multiplicative)
// Returns { multiplier, reasons } where reasons is an array of short labels
// for the UI.
GameItems.computeDiscardBonus = function (speciesId) {
  const stage = GameItems.getEvolutionStage(speciesId);
  const reasons = [];
  let multiplier = 1;
  if (stage === 2) { multiplier *= 2; reasons.push('Stage 2 evolution (×2)'); }
  else if (stage === 3) { multiplier *= 3; reasons.push('Stage 3 evolution (×3)'); }
  const templeArea = GameData.board.areas && GameData.board.areas.temple;
  const templePool = (templeArea && templeArea.encounters) || [];
  const inTemple = templePool.some(e => (typeof e === 'number' ? e : e.id) === speciesId);
  if (inTemple) { multiplier *= 2; reasons.push('Ancient Temple native (×2)'); }
  return { multiplier, reasons, stage, inTemple };
};

GameItems.getEvolutionOptions = function (speciesId) {
  const multi = GameItems.multiEvolutions[speciesId];
  if (multi) return multi.filter(id => GameData.pokemon[String(id)]);
  const single = GameItems.getEvolution(speciesId);
  return single ? [single] : [];
};

// ============== PROMPT PICKERS ==============
GameItems.promptPickPartyMember = function (candidates, onPick, opts) {
  opts = opts || {};
  const player = GameState.currentPlayer();
  const modal = GameUI.el('itemPickerModal');
  GameUI.el('itemPickerTitle').textContent = opts.title || 'Pick a Pokemon';
  // Show item count hint if applicable (so user knows how many uses left)
  GameUI.el('itemPickerHint').textContent = opts.hint || '';
  const grid = GameUI.el('itemPickerGrid');
  grid.innerHTML = '';
  candidates.forEach(mon => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <img src="${GameData.spriteStatic(mon.speciesId)}" style="width:48px;height:48px;image-rendering:pixelated;" />
      <h4>${mon.name}</h4>
      <p>HP ${mon.hp}/${mon.maxHp}${mon.fainted ? ' · FAINTED' : ''}</p>
    `;
    card.onclick = () => {
      modal.hidden = true;
      onPick(mon);
    };
    grid.appendChild(card);
  });
  // Cancel always closes — used as the "Done" button for back-to-back use
  GameUI.el('itemPickerCancel').textContent = opts.cancelLabel || 'Done';
  GameUI.el('itemPickerCancel').onclick = () => { modal.hidden = true; };
  modal.hidden = false;
};

GameItems.promptDiscardForRoom = function (incomingSpeciesId, onKeep, onSkip) {
  const player = GameState.currentPlayer();
  const incoming = GameData.getPokemon(incomingSpeciesId);
  GameUI.el('itemPickerTitle').textContent = `Party full · pick one to discard`;
  GameUI.el('itemPickerHint').textContent = `Replacing with ${incoming.name}. Bonus rewards for Stage 2/3 or Ancient Temple natives.`;
  const grid = GameUI.el('itemPickerGrid');
  grid.innerHTML = '';
  player.party.forEach(mon => {
    const bonus = GameItems.computeDiscardBonus(mon.speciesId);
    const n = bonus.multiplier;
    const bonusBadge = n > 1
      ? `<div class="discard-bonus">×${n} reward · ${bonus.reasons.join(' + ')}</div>`
      : '';
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <img src="${GameData.spriteStatic(mon.speciesId)}" style="width:48px;height:48px;image-rendering:pixelated;" />
      <h4>${mon.name}</h4>
      <p>HP ${mon.hp}/${mon.maxHp}</p>
      ${bonusBadge}
    `;
    card.onclick = () => {
      GameUI.el('itemPickerModal').hidden = true;
      const idx = player.party.findIndex(m => m.instanceId === mon.instanceId);
      player.party.splice(idx, 1);
      GameState.addPokemonToParty(player, incomingSpeciesId);
      const draws = [];
      for (let i = 0; i < n; i++) {
        const it = GameData.pickItemCard();
        GameState.giveItem(player, it.id);
        draws.push({ kind: 'item', itemId: it.id, name: it.name, description: it.description });
      }
      for (let i = 0; i < n; i++) {
        const ball = GameData.pickPokeballCard();
        GameState.giveBall(player, ball.id);
        draws.push({ kind: 'pokeball', ballId: ball.id, name: ball.name });
      }
      const bonusTag = n > 1 ? ` <span class="crit">(×${n} ${bonus.reasons.join(' + ')})</span>` : '';
      GameUI.log(`Discarded <strong>${mon.name}</strong>. Drew ${n} item${n>1?'s':''} + ${n} pokeball${n>1?'s':''}${bonusTag}.`);
      const title = n > 1 ? `Reward draws · ×${n} bonus` : 'Reward draws';
      GameUI.showDraws(title, draws, onKeep);
    };
    grid.appendChild(card);
  });
  GameUI.el('itemPickerCancel').onclick = () => {
    GameUI.el('itemPickerModal').hidden = true;
    onSkip();
  };
  GameUI.el('itemPickerModal').hidden = false;
};
