// =============================================================
// game.js  ·  movement, tile resolution, turn flow
// =============================================================
window.GameGame = {};

GameGame.start = function () {
  // Players are already set up by setup screen.
  GameUI.refreshAll();
  GameBoard.renderTokens();
  GameUI.log(`<span class="actor">${GameState.currentPlayer().name}</span>'s turn. Roll to move.`);
  const area = GameData.getArea(GameData.getTile(GameState.currentPlayer().tile).area);
  GameAudio.playArea(area.id || GameData.getTile(GameState.currentPlayer().tile).area);
  // ensure music starts when player triggers an action
};

GameGame.rollAndMove = function (rolledOverride) {
  const player = GameState.currentPlayer();
  if (GameState.busy) return;
  if (GameState.pendingTileResolution) {
    GameUI.log('Resolve the current tile first.', 'system');
    return;
  }
  GameState.busy = true;
  // Loaded Dice (item) overrides the next roll with the player's chosen value.
  let loaded = 0;
  if (player.flags && player.flags.loadedDice > 0) {
    loaded = player.flags.loadedDice;
    player.flags.loadedDice = 0;
  }
  const roll = rolledOverride != null ? rolledOverride : (loaded > 0 ? loaded : GameState.rollDice());
  GameAudio.sfx.dice();
  GameUI.log(`<span class="actor">${player.name}</span> rolled <strong>${roll}</strong>${loaded > 0 ? ' <span class="crit">(Loaded Dice!)</span>' : ''}.`);
  // Big in-board dice animation. Hold movement until tumble settles so the
  // roll value is visible before the token starts moving.
  if (GameUI && GameUI.runBigDice) {
    GameUI.runBigDice(roll, () => GameGame.movePlayer(player, roll));
  } else {
    GameGame.movePlayer(player, roll);
  }
};

GameGame.movePlayer = function (player, steps, onArrive) {
  if (steps <= 0) {
    GameGame.handleTileLanding(player, onArrive);
    return;
  }
  const tile = GameData.getTile(player.tile);
  if (!tile) {
    GameGame.handleTileLanding(player, onArrive);
    return;
  }

  const advance = (nextI) => {
    if (nextI == null) {
      GameGame.handleTileLanding(player, onArrive);
      return;
    }
    if (nextI > GameBoard.maxTileIndex()) {
      player.tile = GameBoard.maxTileIndex();
      GameBoard.renderTokens();
      GameUI.renderCurrentPlayerCard();
      GameGame.handleTileLanding(player, onArrive);
      return;
    }
    player.tile = nextI;
    GameAudio.sfx.step();
    GameBoard.renderTokens({ hop: true });
    GameUI.renderCurrentPlayerCard();

    // Gym tiles are absolute stops. Player lands on the gym, remaining
    // movement spaces are forfeit. Giovanni at end (tile 104) too.
    const arrived = GameData.getTile(nextI);
    if (arrived && arrived.type === 'gym') {
      if (steps - 1 > 0) GameUI.log(`<span class="system">${player.name} stops at the gym. ${steps - 1} unused space${steps - 1 === 1 ? '' : 's'} forfeit.</span>`, 'system');
      setTimeout(() => GameGame.handleTileLanding(player, onArrive), 300);
      return;
    }

    setTimeout(() => GameGame.movePlayer(player, steps - 1, onArrive), 280);
  };

  // A tile is a branch if it has a branchTo array. This allows branch behavior
  // to coexist with the tile's normal type (so e.g. tile 32 can be a wild encounter
  // AND show a path picker when you roll OFF it).
  if (Array.isArray(tile.branchTo) && tile.branchTo.length) {
    GameUI.showBranch(tile, picked => advance(picked));
  } else {
    advance(GameBoard.nextTileFrom(player.tile));
  }
};

GameGame.handleTileLanding = function (player, onAfter) {
  const tile = GameData.getTile(player.tile);
  const area = GameData.getArea(tile.area);
  GameAudio.playArea(tile.area);
  // Movement animation is done; release the movement lock. From here on,
  // pendingTileResolution + per-modal guards take over.
  GameState.busy = false;
  GameState.pendingTileResolution = true;
  GameUI.renderCurrentPlayerCard();
  // Random tile event (small chance bonus on top of the normal tile effect).
  GameGame.fireRandomTileEvent(player, tile);

  // Team Rocket ambush: a 1-in-20 surprise on landing (human players only).
  // It resolves FIRST — battle or theft — and only then does the tile's own
  // effect play out, via the onDone continuation.
  if (GameGame._maybeTeamRocket(player, tile, () => GameGame._resolveTile(player, tile, area, onAfter))) {
    return;
  }
  GameGame._resolveTile(player, tile, area, onAfter);
};

// The tile's normal landing effect. Split out of handleTileLanding so the
// Team Rocket event can run ahead of it without re-rolling tile events.
GameGame._resolveTile = function (player, tile, area, onAfter) {
  const after = () => {
    GameState.pendingTileResolution = false;
    if (onAfter) onAfter();
  };

  switch (tile.type) {
    case 'pokemon': {
      if (player.flags.maxRepel) {
        player.flags.maxRepel = false;
        GameUI.log(`Max Repel kicks in. No wild Pokemon appears.`);
        GameUI.refreshAll();
        GameGame.afterTileResolved();
        return;
      }
      // Did a legendary spawn float over this tile? Override the encounter
      // pool with the legendary species and clear the spawn so other players
      // can't double-dip.
      const legendaryOverride = GameGame._consumeLegendaryOverrideIfHere(player.tile);
      const speciesId = legendaryOverride || GameData.pickEncounterSpeciesId(tile.area);
      // No balls at all → show out-of-pokeballs popup and skip the encounter
      const totalBalls = Object.values(player.balls).reduce((s, n) => s + n, 0);
      if (totalBalls === 0) {
        GameUI.log(`<span class="actor">${player.name}</span> sees a wild <strong>${GameData.getPokemon(speciesId).name}</strong> but has no Pokeballs.`, 'lose');
        GameUI.showOutOfBallsPopup(GameData.getPokemon(speciesId).name, () => GameGame.afterTileResolved());
        return;
      }
      if (legendaryOverride) {
        GameUI.log(`<span class="crit">⚡ A wild <strong>${GameData.getPokemon(speciesId).name}</strong> challenges ${player.name}!</span>`, 'crit');
        GameEncounter.start(speciesId, tile.area, { isLegendary: true });
      } else {
        GameUI.log(`Wild <strong>${GameData.getPokemon(speciesId).name}</strong> appears in ${area.name}.`);
        GameEncounter.start(speciesId, tile.area);
      }
      break;
    }
    case 'specific': {
      const legendaryOverride = GameGame._consumeLegendaryOverrideIfHere(player.tile);
      const speciesId = legendaryOverride || tile.speciesId;
      const totalBalls = Object.values(player.balls).reduce((s, n) => s + n, 0);
      if (totalBalls === 0) {
        GameUI.log(`<span class="actor">${player.name}</span> sees a wild <strong>${GameData.getPokemon(speciesId).name}</strong> but has no Pokeballs.`, 'lose');
        GameUI.showOutOfBallsPopup(GameData.getPokemon(speciesId).name, () => GameGame.afterTileResolved());
        return;
      }
      if (legendaryOverride) {
        GameUI.log(`<span class="crit">⚡ A wild <strong>${GameData.getPokemon(speciesId).name}</strong> challenges ${player.name}!</span>`, 'crit');
        GameEncounter.start(speciesId, tile.area, { isLegendary: true });
      } else {
        GameUI.log(`Wild <strong>${GameData.getPokemon(speciesId).name}</strong> appears (specific tile).`);
        GameEncounter.start(speciesId, tile.area);
      }
      break;
    }
    case 'item': {
      const draws = [];
      for (let i = 0; i < 2; i++) {
        const it = GameData.pickItemCard();
        GameState.giveItem(player, it.id);
        draws.push({ kind: 'item', itemId: it.id, name: it.name, description: it.description });
      }
      GameUI.log(`${player.name} drew 2 items.`);
      GameUI.refreshAll();
      GameUI.showDraws('You drew 2 items', draws, () => GameGame.afterTileResolved());
      break;
    }
    case 'pokeball': {
      // Special branch tiles (safari, after gym 2 / before gym 3) pay double.
      const n = tile.doubleReward ? 6 : 3;
      const draws = [];
      for (let i = 0; i < n; i++) {
        const ball = GameData.pickPokeballCard();
        GameState.giveBall(player, ball.id);
        draws.push({ kind: 'pokeball', ballId: ball.id, name: ball.name });
      }
      GameUI.log(`${player.name} drew ${n} pokeballs${tile.doubleReward ? ' (double!)' : ''}.`);
      GameUI.refreshAll();
      GameUI.showDraws(tile.doubleReward ? `Jackpot tile! You drew ${n} pokeballs` : `You drew ${n} pokeballs`, draws, () => GameGame.afterTileResolved());
      break;
    }
    case 'masterball': {
      const n = tile.doubleReward ? 2 : 1;
      const draws = [];
      for (let i = 0; i < n; i++) {
        GameState.giveBall(player, 'masterball');
        draws.push({ kind: 'pokeball', ballId: 'masterball', name: 'Master Ball' });
      }
      GameUI.log(`${player.name} received <strong>${n} Master Ball${n > 1 ? 's' : ''}</strong>!`, 'crit');
      GameUI.refreshAll();
      GameUI.showDraws(n > 1 ? `Jackpot tile! You found ${n} Master Balls!` : 'You found a Master Ball!', draws, () => GameGame.afterTileResolved());
      break;
    }
    case 'trade': {
      const after = () => GameGame.afterTileResolved();
      // Solo play: no other trainers on the board — a wandering NPC proposes a
      // respectable swap (a Pokemon or items of similar value, with a little
      // variance) that the player can accept or decline.
      if (GameState.players.length < 2) {
        if (GameTrade.startNpcOffer) GameTrade.startNpcOffer(after);
        else { GameUI.log('No one to trade with.', 'system'); GameGame.afterTileResolved(); }
        return;
      }
      // CPUs auto-generate a trade offer to another player; the offer is then
      // routed through the normal accept/decline flow (a human target must
      // explicitly accept). Humans open the trade builder as before.
      if (player.isCpu && GameTrade.startCpuOffer) {
        GameTrade.startCpuOffer(after);
      } else {
        GameTrade.start(after);
      }
      break;
    }
    case 'pokecentre': {
      GameState.healPlayer(player);
      GameState.lastPokecentreForPlayer[player.id] = player.tile;
      GameAudio.sfx.heal();
      GameUI.log(`${player.name}'s Pokemon are fully healed at the Pokemon Center.`, 'win');
      GameUI.refreshAll();
      setTimeout(() => GameGame.afterTileResolved(), 400);
      break;
    }
    case 'fainted': {
      // Per-tile returnTo override (e.g. safari branch fainted tiles send to 53),
      // otherwise return to the last pokecentre the player actually visited,
      // otherwise the nearest pokecentre going backward by tile ID.
      let returnTile;
      if (tile.returnTo != null) {
        returnTile = tile.returnTo;
      } else if (GameState.lastPokecentreForPlayer[player.id] != null) {
        returnTile = GameState.lastPokecentreForPlayer[player.id];
      } else {
        returnTile = GameState.findLastPokecentreTile(player.tile);
      }
      const returnLabel = GameData.getTile(returnTile)?.displayLabel || returnTile;
      GameAudio.sfx.faint();
      // Show fainted popup, then speedy slide back, then heal
      GameUI.showFaintedPopup(player, returnTile, () => {
        // Mark active token for speedy return transition, then update tile
        const tokenEl = document.querySelector(`.token[data-player-id="${player.id}"]`);
        if (tokenEl) tokenEl.classList.add('returning');
        player.tile = returnTile;
        GameBoard.renderTokens();
        // Heal AFTER the slide animation visually completes (~0.7s)
        setTimeout(() => {
          GameState.healPlayer(player);
          GameUI.log(`${player.name}'s Pokemon all fainted. Returned to tile ${returnLabel} and healed.`, 'lose');
          if (tokenEl) tokenEl.classList.remove('returning');
          GameUI.refreshAll();
          GameGame.afterTileResolved();
        }, 750);
      });
      break;
    }
    case 'gym': {
      GameGame.startGymBattle(tile);
      break;
    }
    case 'battle': {
      GameGame.startPvPBattle();
      break;
    }
    case 'branch': {
      // Shouldn't land on branch (handled mid-move), but safety
      GameGame.afterTileResolved();
      break;
    }
    case 'start': {
      // Just the starting position, no action
      GameGame.afterTileResolved();
      break;
    }
    default:
      GameUI.log(`Unhandled tile type: ${tile.type}`, 'system');
      GameGame.afterTileResolved();
  }
};

GameGame.afterTileResolved = function () {
  GameState.pendingTileResolution = false;
  GameUI.refreshAll();
  // Auto-advance to the next player after a short pause so the previous result
  // is readable. Skipped if the current player already completed the game (the
  // Giovanni victory popup handles that flow itself).
  const player = GameState.currentPlayer();
  if (player && player.completed) return;
  GameState.busy = true; // block any input during the auto-advance window
  setTimeout(() => {
    GameState.busy = false;
    // Bail out if a new battle / modal opened in the meantime.
    if (GameBattle.active) return;
    if (GameState.pendingTileResolution) return;
    const anyModalOpen = Array.from(document.querySelectorAll('.modal'))
      .some(m => !m.hidden);
    if (anyModalOpen) return;
    GameGame.endTurn();
  }, 900);
};

GameGame.endTurn = function () {
  // Block spam end-turn while movement / pending tile resolution is in flight.
  if (GameState.busy) return;
  if (GameState.pendingTileResolution) {
    GameUI.log('Resolve the current tile first.', 'system');
    return;
  }
  // Advance to next player, skipping anyone who's already completed (beat Giovanni).
  let safety = GameState.players.length;
  GameState.advanceTurn();
  while (GameState.currentPlayer().completed && safety-- > 0) {
    GameUI.log(`<span class="system">${GameState.currentPlayer().name} already entered the Hall of Fame. Skipping.</span>`, 'system');
    GameState.advanceTurn();
  }
  // If every remaining player is completed, end the game
  if (GameState.players.every(p => p.completed)) {
    GameGame.endGame();
    return;
  }
  // Per-turn world events: legendary spawns. Run after advanceTurn so the new
  // turnCount drives the timing math.
  GameState.expireLegendaryIfStale();
  GameState.maybeSpawnLegendary();
  GameUI.refreshAll();
  GameBoard.renderTokens();
  if (window.GameBoard && GameBoard.renderLegendaryOverlay) GameBoard.renderLegendaryOverlay();
  const np = GameState.currentPlayer();
  GameAudio.playArea(GameData.getTile(np.tile).area);
  GameUI.log(`<span class="actor">${np.name}</span>'s turn.`);
  // Egg countdown advances once per handoff for the player whose turn is now
  // starting. Any that reach 0 (with party room) hatch right here on their turn.
  const hatched = GameState.tickEggsTurnStart(np);
  if (hatched.length) GameGame._runHatches(np, hatched);
};

// Hatch a queue of ready Eggs one at a time. Humans get the reveal animation
// (blocking the roll via GameState.busy until they continue); CPUs hatch
// silently so play stays snappy. Room is already guaranteed by tickEggsTurnStart.
GameGame._runHatches = function (player, eggs) {
  const queue = eggs.slice();
  const next = () => {
    if (!queue.length) { GameUI.refreshAll(); return; }
    const egg = queue.shift();
    if (player.isCpu || !GameUI.showEggHatch) {
      const mon = GameState.makeHatchling(player, egg.speciesId);
      GameUI.log(`<span class="crit">✨ ${player.name}'s Egg hatched into a SHINY ${mon ? mon.name : 'Pokemon'}!</span>`, 'crit');
      GameUI.refreshAll();
      next();
    } else {
      GameUI.showEggHatch(player, egg, next);
    }
  };
  next();
};

// Choose the Pokemon a gym leader will actually fight with THIS battle.
// Leaders now carry a `pool` (6 for the first three gyms, 10 for Giovanni)
// and a `teamSize` (3, or 6 for Giovanni). We draw `teamSize` at random from
// the pool. Called exactly once per battle (in startGymBattle) so the team is
// stable across the intro animation, the prep modal, and the fight itself.
GameGame.ALL_TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];

// Score a candidate gym team for type variety. Higher is better. Strongly
// rewards teams where NO single attacking type is 2× super-effective against
// every member (so one strong-type Pokemon can't sweep the whole gym), and
// rewards having ≥2 distinct primary types (never "all the same type").
GameGame._teamVarietyScore = function (team) {
  if (!team || !team.length) return 0;
  const datas = team.map(m => GameData.getPokemon(m.id)).filter(Boolean);
  if (!datas.length) return 0;
  const primaries = new Set(datas.map(d => d.types[0]));
  let universalWeakness = false;
  if (window.GameBattle && GameBattle.typeEffect) {
    universalWeakness = GameGame.ALL_TYPES.some(t =>
      datas.every(d => GameBattle.typeEffect(t, d.types) >= 2));
  }
  let score = primaries.size * 10;
  if (!universalWeakness) score += 1000;   // no single type sweeps the team
  if (primaries.size >= 2) score += 100;    // not mono-type
  return score;
};

GameGame._selectGymTeam = function (leader) {
  // Backward-compat: a leader defined with a fixed `team` and no `pool`.
  if (!leader.pool || !leader.pool.length) return (leader.team || []).slice();
  const size = Math.min(leader.teamSize || leader.pool.length, leader.pool.length);
  const drawOnce = () => {
    const arr = leader.pool.map(m => Object.assign({}, m));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    let picked = arr.slice(0, size);
    if (leader.bossEscalating) {
      // Final boss: order the drawn mons by level and lay an escalating power
      // curve over them, so the LAST mon sent out is always the strongest no
      // matter which were drawn. Preserves the boss-fight feel.
      picked.sort((a, b) => (a.level || 0) - (b.level || 0));
      const curve = [1, 1.1, 1.2, 1.3, 1.4, 1.5];
      picked = picked.map((m, idx) => Object.assign({}, m, { scale: curve[Math.min(idx, curve.length - 1)] }));
    }
    return picked;
  };
  // Draw several times and keep the most type-varied team, so a gym leader
  // never fields an all-one-type squad a single counter can sweep. Best-effort:
  // for an inherently mono-weak theme (e.g. Fire vs Water) it still guarantees
  // mixed types even if that one canonical weakness remains.
  // Target = no universal weakness (1000) AND >=2 distinct primary types (100).
  // Blaine's mono-Fire-leaning pool can't clear that (Water always sweeps), so
  // it just keeps the most varied draw — which is still never all-one-type.
  let best = drawOnce();
  let bestScore = GameGame._teamVarietyScore(best);
  for (let attempt = 0; attempt < 30 && bestScore < 1100; attempt++) {
    const team = drawOnce();
    const score = GameGame._teamVarietyScore(team);
    if (score > bestScore) { best = team; bestScore = score; }
  }
  return best;
};

GameGame.startGymBattle = function (tile) {
  const leader = GameData.getGymLeader(tile.leader);
  const player = GameState.currentPlayer();
  if (player.party.filter(m => !m.fainted).length === 0) {
    GameUI.log(`${player.name} has no Pokemon able to fight.`, 'lose');
    GameGame.gymLoss(tile, leader);
    return;
  }
  // Pick the battle team ONCE. The same selection drives the intro animation,
  // the prep modal, and GameBattle.start — so the Pokemon the player is shown
  // are exactly the Pokemon they fight.
  const battleLeader = Object.assign({}, leader, { team: GameGame._selectGymTeam(leader) });
  GameUI.log(`<span class="crit">${player.name} challenges Gym Leader ${leader.name}!</span>`, 'crit');
  const fight = () => GameBattle.start({
    kind: 'gym',
    leader: battleLeader,
    onWin: () => GameGame.gymWin(tile, battleLeader),
    onLose: () => GameGame.gymLoss(tile, battleLeader),
  });
  // Humans get the pre-fight prep modal (see leader's team + reorder party).
  // CPUs skip it — they already optimize battle slots pre-roll.
  const toPrep = () => {
    if (player.isCpu || !GameUI.showGymPrep) {
      // CPUs reorder their squad for the matchup right before fighting.
      if (player.isCpu && window.GameCpu && GameCpu.orderPartyForGym) {
        GameCpu.orderPartyForGym(player, battleLeader.team);
      }
      fight();
    } else {
      GameUI.showGymPrep(battleLeader, fight);
    }
  };
  // Brief cinematic intro: who they're facing + the exact team coming up.
  // Humans only — CPUs go straight to the fight to keep play snappy.
  if (!player.isCpu && GameUI.showGymIntro) {
    GameUI.showGymIntro(battleLeader, toPrep);
  } else {
    toPrep();
  }
};

GameGame.gymWin = function (tile, leader) {
  const player = GameState.currentPlayer();
  const reward = leader.reward;

  if (!player.badges) player.badges = [];
  player.badges.push(leader.name);

  // Giovanni / endgame: no item or ball rewards, go straight to Hall of Fame.
  if (reward.endsGame) {
    GameUI.log(`<span class="win">${player.name} DEFEATED ${leader.name} and entered the HALL OF FAME!</span>`, 'win');
    player.completed = true;
    const hofEntry = GameState.addToHallOfFame(player);
    // Clear pendingTileResolution so the victory modal's "Continue" button can
    // actually hand off the turn (endTurn refuses to run while pending).
    GameState.pendingTileResolution = false;
    GameUI.refreshAll();
    GameUI.showVictory(player, leader, hofEntry);
    return;
  }

  // Normal gym victory: collect items + pokeballs (no Pokemon — per earlier rule)
  const draws = [];
  const luckyMul = player.flags.luckyEgg ? 2 : 1;
  player.flags.luckyEgg = false;
  // Prize money (doubled by an active Lucky Egg, same as the item rewards).
  const moneyReward = (reward.money || 0) * luckyMul;
  if (moneyReward > 0) player.money = (player.money || 0) + moneyReward;
  for (let i = 0; i < reward.items * luckyMul; i++) {
    const it = GameData.pickItemCard();
    GameState.giveItem(player, it.id);
    draws.push({ kind: 'item', itemId: it.id, name: it.name, description: it.description });
  }
  for (let i = 0; i < reward.pokeballs * luckyMul; i++) {
    const ball = GameData.pickPokeballCard();
    GameState.giveBall(player, ball.id);
    draws.push({ kind: 'pokeball', ballId: ball.id, name: ball.name });
  }
  const leaderId = leader.name.toLowerCase();
  const leaderImg = `<img src="sprites/trainers/${leaderId}.png" class="victory-leader-sprite" onerror="this.style.display='none'" alt="${leader.name}" />`;
  const moneyTag = moneyReward > 0 ? ` Earned <strong>₽${moneyReward}</strong>${luckyMul > 1 ? ' (Lucky Egg ×2!)' : ''}.` : '';
  GameUI.log(`<span class="win">${player.name} defeated ${leader.name}!</span> Rewards drawn.${moneyTag}`, 'win');
  GameUI.refreshAll();
  GameUI.showDraws(`${leaderImg} Victory over ${leader.name}!${moneyReward > 0 ? ` <span class="crit">+₽${moneyReward}</span>` : ''}`, draws, () => {
    GameGame.afterTileResolved();
  });
};

GameGame.gymLoss = function (tile, leader) {
  const player = GameState.currentPlayer();
  const penalty = leader.failPenalty;
  if (penalty === 'back8') {
    player.tile = Math.max(0, player.tile - 8);
    GameUI.log(`${player.name} fell back 8 tiles after losing.`, 'lose');
  } else if (penalty === 'back32') {
    player.tile = 32;
    GameUI.log(`${player.name} was defeated by Misty and sent back to tile 32.`, 'lose');
  } else if (penalty === 'back56') {
    player.tile = 56;
    GameUI.log(`${player.name} was defeated by Blaine and sent back to tile 56.`, 'lose');
  } else if (penalty === 'backToTradeBeforeBlaine') {
    // Legacy alias for older save files — now redirects to tile 56.
    player.tile = 56;
    GameUI.log(`${player.name} was defeated by Blaine and sent back to tile 56.`, 'lose');
  } else if (penalty === 'templeStart') {
    // Beat into temple but Giovanni was too strong. Temple starts at 77.
    player.tile = 77;
    GameUI.log(`${player.name} was crushed by Giovanni and forced back to the start of the Ancient Temple.`, 'lose');
  } else if (penalty === 'back75') {
    player.tile = 75;
    GameUI.log(`${player.name} was crushed by Giovanni and sent back to tile 75.`, 'lose');
  } else if (penalty === 'back83') {
    // Legacy alias — kept for older save files.
    player.tile = 75;
    GameUI.log(`${player.name} was crushed by Giovanni and sent back to tile 75.`, 'lose');
  }
  // Fully heal the party after a gym loss so the player can keep playing.
  GameState.healPlayer(player);
  GameAudio.sfx.heal();
  GameUI.log(`<span class="win">All of ${player.name}'s Pokemon were fully healed.</span>`, 'win');
  GameBoard.renderTokens();
  GameUI.refreshAll();
  setTimeout(() => GameGame.afterTileResolved(), 800);
};

GameGame.startPvPBattle = function () {
  const player = GameState.currentPlayer();
  // Pick opponent (auto: random other player with party)
  const others = GameState.players.filter(p => p !== player && p.party.some(m => !m.fainted));
  if (others.length === 0) {
    GameUI.log('No valid opponents to battle.', 'system');
    GameGame.afterTileResolved();
    return;
  }
  // Show modal to pick prize and confirm
  const modal = GameUI.el('pvpModal');
  modal.hidden = false;
  GameUI.el('pvpIntro').textContent = `${player.name}, you landed on a battle tile. Pick which of your Pokemon you're putting up as the prize. If you lose, that Pokemon goes to your opponent.`;
  // Render party picker
  const picker = GameUI.el('pvpPrizePicker');
  picker.innerHTML = '';
  let prize = null;
  player.party.forEach(mon => {
    const card = document.createElement('div');
    card.className = 'party-card';
    card.innerHTML = `<img src="${GameData.spriteStatic(mon.speciesId)}" /><div class="pc-name">${mon.name}</div>`;
    card.onclick = () => {
      picker.querySelectorAll('.party-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      prize = mon;
      GameUI.el('pvpStartBtn').disabled = false;
    };
    picker.appendChild(card);
  });
  GameUI.el('pvpStartBtn').onclick = () => {
    modal.hidden = true;
    const opp = others[Math.floor(Math.random() * others.length)];
    GameUI.log(`<span class="crit">${player.name} battles ${opp.name}! Prize: ${prize.name}.</span>`, 'crit');
    // Track which of opponent's Pokemon are used in the battle so the winner picks from the unused remainder.
    const oppUsedIds = new Set();
    GameBattle.start({
      kind: 'pvp',
      opponentPlayer: opp,
      prizePokemon: prize,
      onBattleMonUsed: (mon) => oppUsedIds.add(mon.speciesId + ':' + mon.maxHp),
      onWin: () => {
        // Winner picks one of opponent's UNUSED Pokemon. Opponents must keep
        // at least 1 Pokemon — refuse to surrender if they only have 1 left.
        if (opp.party.length <= 1) {
          GameUI.log(`${opp.name} only has 1 Pokemon left and can't surrender it.`, 'system');
          GameGame.afterTileResolved();
          return;
        }
        const unused = opp.party.filter(m => !oppUsedIds.has(m.speciesId + ':' + m.maxHp));
        const pool = unused.length > 0 ? unused : opp.party; // fallback if all were used
        if (pool.length === 0) {
          GameUI.log(`${opp.name} has no Pokemon to surrender.`, 'system');
          GameGame.afterTileResolved();
          return;
        }
        // Show picker
        GameUI.el('itemPickerTitle').textContent = `Pick a Pokemon to take from ${opp.name}`;
        GameUI.el('itemPickerHint').textContent = unused.length > 0
          ? `Only Pokemon that did not fight are available.`
          : `All of ${opp.name}'s party fought. Pick any.`;
        const grid = GameUI.el('itemPickerGrid');
        grid.innerHTML = '';
        pool.forEach(mon => {
          const card = document.createElement('div');
          card.className = 'item-card';
          card.innerHTML = `
            <img src="${GameData.spriteStatic(mon.speciesId)}" style="width:64px;height:64px;image-rendering:pixelated;" />
            <h4>${mon.name}</h4>
            <p>HP ${mon.hp}/${mon.maxHp}</p>
          `;
          card.onclick = () => {
            GameUI.el('itemPickerModal').hidden = true;
            opp.party = opp.party.filter(m => m.instanceId !== mon.instanceId);
            if (player.party.length < 6) player.party.push(mon);
            else GameUI.log(`Party full. Released ${mon.name}.`, 'system');
            GameUI.log(`${player.name} took <strong>${mon.name}</strong> from ${opp.name}.`, 'win');
            GameUI.refreshAll();
            GameGame.afterTileResolved();
          };
          grid.appendChild(card);
        });
        GameUI.el('itemPickerCancel').onclick = () => {
          GameUI.el('itemPickerModal').hidden = true;
          GameGame.afterTileResolved();
        };
        GameUI.el('itemPickerModal').hidden = false;
      },
      onLose: () => {
        // Lose the prize — but never let the loser end with 0 Pokemon.
        if (player.party.length <= 1) {
          GameUI.log(`${player.name} would have surrendered <strong>${prize.name}</strong>, but it is their last Pokemon — they keep it.`, 'system');
          GameGame.afterTileResolved();
          return;
        }
        const idx = player.party.findIndex(m => m.instanceId === prize.instanceId);
        if (idx >= 0) {
          player.party.splice(idx, 1);
          if (opp.party.length < 6) opp.party.push(prize);
          GameUI.log(`${player.name} surrendered <strong>${prize.name}</strong> to ${opp.name}.`, 'lose');
        }
        GameGame.afterTileResolved();
      },
    });
  };
  GameUI.el('pvpCancelBtn').onclick = () => {
    modal.hidden = true;
    GameUI.log(`${player.name} backed out of the battle tile.`, 'system');
    GameGame.afterTileResolved();
  };
};

GameGame.endGame = function () {
  if (confirm('Return to the title screen? Current game will be saved.')) {
    GameState.save();
    location.reload();
  }
};

// Random tile events: small chance any landing triggers a bonus on top of
// the tile's normal effect. Keeps even "boring" wild tiles surprising.
GameGame.TILE_EVENT_CHANCE = 0.12;
GameGame.TILE_EVENTS = [
  { id: 'free_potion',     msg: 'A passing trainer hands you a Potion!',                 grant: () => ({ item: 'potion' }) },
  { id: 'free_super',      msg: 'You find a forgotten Super Potion on the path!',        grant: () => ({ item: 'super_potion' }) },
  { id: 'free_candy',      msg: '✨ A Rare Candy was lying on the path!',                grant: () => ({ item: 'rare_candy' }) },
  { id: 'free_pokeball',   msg: 'A kid drops a Poke Ball — finders keepers!',            grant: () => ({ ball: 'pokeball' }) },
  { id: 'free_greatball',  msg: 'You find an abandoned Great Ball!',                     grant: () => ({ ball: 'greatball' }) },
  { id: 'lucky_find',      msg: '💰 Hidden cache: Super Potion + Great Ball!',           grant: () => ({ item: 'super_potion', ball: 'greatball' }) },
  { id: 'mystery_xattack', msg: 'A scientist hands you X-Attack to test out.',           grant: () => ({ item: 'x2_attack' }) },
  { id: 'mystery_xdef',    msg: 'A scientist hands you X-Defense to test out.',         grant: () => ({ item: 'x2_defense' }) },
  { id: 'good_omen',       msg: '🌈 A good omen! Your next move in battle will crit.',   grant: () => ({ flag: 'guaranteedCrit' }) },
];

GameGame.fireRandomTileEvent = function (player, tile) {
  // Skip on tile types where the player already has a major event happening
  // (no double-dipping on gym/fainted/trade screens).
  if (!tile) return false;
  if (['gym', 'fainted', 'trade', 'battle', 'start'].includes(tile.type)) return false;
  if (Math.random() > GameGame.TILE_EVENT_CHANCE) return false;
  const ev = GameGame.TILE_EVENTS[Math.floor(Math.random() * GameGame.TILE_EVENTS.length)];
  const g = ev.grant();
  let bits = [];
  if (g.item) { GameState.giveItem(player, g.item); bits.push(GameData.getItem(g.item)?.name || g.item); }
  if (g.ball) { GameState.giveBall(player, g.ball); bits.push(GameData.getPokeball(g.ball)?.name || g.ball); }
  if (g.flag === 'guaranteedCrit') {
    player.flags = player.flags || {};
    player.flags.guaranteedCrit = true;
    bits.push('Guaranteed crit next move');
  }
  GameUI.log(`<span class="crit">🎁 ${player.name}: ${ev.msg}${bits.length ? ` (got: ${bits.join(' + ')})` : ''}</span>`, 'crit');
  if (window.GameUI && GameUI.showTileEventToast) GameUI.showTileEventToast(ev.msg);
  if (window.GameAudio && GameAudio.sfx.item) GameAudio.sfx.item();
  GameUI.refreshAll();
  return true;
};

// ============================== TEAM ROCKET ==============================
// 1 roll per landing (= 1 per turn), so 1/20 averages one ambush every ~20
// turns across all players. Applies to humans AND CPUs so it's actually seen.
GameGame.TEAM_ROCKET_CHANCE = 1 / 20;
// Thematic Team Rocket Pokemon, all present in the dex: Meowth, Koffing,
// Weezing, Gastly, Haunter, Ekans, Arbok, Zubat, Golbat, Raticate, Houndour,
// Murkrow, Wobbuffet, Sneasel.
GameGame.TEAM_ROCKET_POOL = [52, 109, 110, 92, 93, 23, 24, 41, 42, 20, 228, 198, 202, 215];

// Roll for a Team Rocket ambush on landing. Returns true if one triggered — the
// caller then STOPS and lets the TR flow call onDone to continue the tile.
// Applies to humans AND CPUs (CPU encounters auto-resolve via the watchdog) so
// the ambushes are actually seen. Never stacked on a gym / fainted / battle /
// start tile.
GameGame._maybeTeamRocket = function (player, tile, onDone) {
  if (!player) return false;
  if (!tile || ['gym', 'fainted', 'battle', 'start'].includes(tile.type)) return false;
  if (Math.random() >= GameGame.TEAM_ROCKET_CHANCE) return false;
  // Decide the outcome up front: 50% battle, 50% theft. If a battle is chosen
  // but the player has nothing able to fight, fall back to theft so we never
  // open a broken battle.
  const canFight = player.party.some(m => !m.fainted);
  const wantBattle = Math.random() < 0.5 && canFight;
  const run = () => {
    if (wantBattle) GameGame._teamRocketBattle(player, onDone);
    else GameGame._teamRocketTheft(player, onDone);
  };
  if (GameUI.showTeamRocketIntro) GameUI.showTeamRocketIntro(wantBattle ? 'battle' : 'theft', run);
  else run();
  return true;
};

GameGame._teamRocketBattle = function (player, onDone) {
  if (GameUI.hideTeamRocket) GameUI.hideTeamRocket();
  const badgeCount = (player.badges || []).length;
  const level = 12 + badgeCount * 10;            // scales with how far they've come
  const pool = GameGame.TEAM_ROCKET_POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  const size = Math.min(3, 2 + Math.floor(badgeCount / 2));
  const team = pool.slice(0, size).map(id => ({ id, level }));
  const rocketLeader = {
    name: 'Team Rocket', city: '', color: '#b0246a', team, scaleMultiplier: 1,
    prepLabel: '🚀 Team Rocket', prepSprite: 'sprites/trainers/jessiejames.png',
  };
  GameUI.log(`<span class="crit">🚀 Team Rocket wants to battle!</span>`, 'crit');

  const startFight = () => GameBattle.start({
    kind: 'gym',
    leader: rocketLeader,
    opponentLabel: '🚀 Team Rocket',
    onWin: () => {
      // Beating Team Rocket nets their stash: 3 items + 3 pokeballs, revealed
      // in the standard reward modal (Lucky Egg does NOT apply — it's gym-only).
      const draws = [];
      for (let i = 0; i < 3; i++) {
        const it = GameData.pickItemCard();
        GameState.giveItem(player, it.id);
        draws.push({ kind: 'item', itemId: it.id, name: it.name, description: it.description });
      }
      for (let i = 0; i < 3; i++) {
        const ball = GameData.pickPokeballCard();
        GameState.giveBall(player, ball.id);
        draws.push({ kind: 'pokeball', ballId: ball.id, name: ball.name });
      }
      GameUI.log(`<span class="win">${player.name} sent Team Rocket blasting off and grabbed their stash — 3 items + 3 pokeballs!</span>`, 'win');
      GameUI.refreshAll();
      const finish = () => { if (onDone) onDone(); };
      if (GameUI.showDraws) GameUI.showDraws('🚀 WON! Team Rocket blasted off — you grabbed their stash:', draws, finish);
      else finish();
    },
    onLose: () => {
      GameUI.log(`<span class="lose">Team Rocket defeated ${player.name} and fled.</span>`, 'lose');
      GameState.healPlayer(player); // never strand the player with a fainted party
      GameUI.refreshAll();
      const finish = () => { if (onDone) onDone(); };
      if (GameUI.showTeamRocketResult) GameUI.showTeamRocketResult('💥 You LOST to Team Rocket! They fled — your Pokémon were healed.', true, finish);
      else finish();
    },
  });

  // Humans get a prep screen (scout the Rocket team + reorder) first. CPUs
  // skip straight to the fight.
  if (!player.isCpu && GameUI.showGymPrep) {
    GameUI.showGymPrep(rocketLeader, startFight);
  } else {
    startFight();
  }
};

GameGame._teamRocketTheft = function (player, onDone) {
  // Steal from consumable items only — never balls, Eggs (not in items), or
  // any future key items. Up to 3 units; as many as possible if fewer exist.
  const units = [];
  Object.entries(player.items || {}).forEach(([id, n]) => { for (let i = 0; i < n; i++) units.push(id); });
  for (let i = units.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = units[i]; units[i] = units[j]; units[j] = t; }
  const stolen = units.slice(0, Math.min(3, units.length));
  const counts = {};
  stolen.forEach(id => {
    player.items[id]--; if (player.items[id] <= 0) delete player.items[id];
    counts[id] = (counts[id] || 0) + 1;
  });
  const summary = Object.entries(counts).map(([id, n]) => `${n}× ${(GameData.getItem(id) || {}).name || id}`).join(', ');
  const msg = stolen.length
    ? `Team Rocket snatched ${stolen.length} item${stolen.length === 1 ? '' : 's'} from your bag! (${summary})`
    : `Team Rocket rummaged through your bag but found nothing to steal!`;
  GameUI.log(`<span class="${stolen.length ? 'lose' : 'system'}">🚀 ${msg}</span>`, stolen.length ? 'lose' : 'system');
  GameUI.refreshAll();
  const finish = () => { if (onDone) onDone(); };
  if (GameUI.showTeamRocketResult) GameUI.showTeamRocketResult(msg, stolen.length > 0, finish);
  else finish();
};

// If a legendary spawn is parked on this tile, return its speciesId and clear
// the spawn (one-shot — first player to land claims it).
GameGame._consumeLegendaryOverrideIfHere = function (tileIdx) {
  const spawn = GameState.legendarySpawn;
  if (!spawn || spawn.tileIdx !== tileIdx) return null;
  const speciesId = spawn.speciesId;
  GameState.legendarySpawn = null;
  if (window.GameBoard && GameBoard.renderLegendaryOverlay) GameBoard.renderLegendaryOverlay();
  return speciesId;
};
