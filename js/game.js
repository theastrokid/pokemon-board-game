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
  const roll = rolledOverride != null ? rolledOverride : GameState.rollDice();
  GameAudio.sfx.dice();
  GameUI.log(`<span class="actor">${player.name}</span> rolled <strong>${roll}</strong>.`);
  GameGame.movePlayer(player, roll);
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
      const draws = [];
      for (let i = 0; i < 3; i++) {
        const ball = GameData.pickPokeballCard();
        GameState.giveBall(player, ball.id);
        draws.push({ kind: 'pokeball', ballId: ball.id, name: ball.name });
      }
      GameUI.log(`${player.name} drew 3 pokeballs.`);
      GameUI.refreshAll();
      GameUI.showDraws('You drew 3 pokeballs', draws, () => GameGame.afterTileResolved());
      break;
    }
    case 'masterball': {
      GameState.giveBall(player, 'masterball');
      GameUI.log(`${player.name} received a <strong>Master Ball</strong>!`, 'crit');
      GameUI.refreshAll();
      GameUI.showDraws('You found a Master Ball!', [{ kind: 'pokeball', ballId: 'masterball', name: 'Master Ball' }], () => GameGame.afterTileResolved());
      break;
    }
    case 'trade': {
      if (GameState.players.length < 2) {
        GameUI.log('No one to trade with.', 'system');
        GameGame.afterTileResolved();
        return;
      }
      GameTrade.start(() => GameGame.afterTileResolved());
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
  // Per-turn world events: legendary spawns, weather shifts. Run after
  // advanceTurn so the new turnCount drives the timing math.
  GameState.expireLegendaryIfStale();
  GameState.maybeSpawnLegendary();
  GameState.maybeChangeWeather();
  GameUI.refreshAll();
  GameBoard.renderTokens();
  if (window.GameBoard && GameBoard.renderLegendaryOverlay) GameBoard.renderLegendaryOverlay();
  if (window.GameUI && GameUI.renderWeatherBanner) GameUI.renderWeatherBanner();
  const np = GameState.currentPlayer();
  GameAudio.playArea(GameData.getTile(np.tile).area);
  GameUI.log(`<span class="actor">${np.name}</span>'s turn.`);
};

GameGame.startGymBattle = function (tile) {
  const leader = GameData.getGymLeader(tile.leader);
  const player = GameState.currentPlayer();
  if (player.party.filter(m => !m.fainted).length === 0) {
    GameUI.log(`${player.name} has no Pokemon able to fight.`, 'lose');
    GameGame.gymLoss(tile, leader);
    return;
  }
  GameUI.log(`<span class="crit">${player.name} challenges Gym Leader ${leader.name}!</span>`, 'crit');
  GameBattle.start({
    kind: 'gym',
    leader,
    onWin: () => GameGame.gymWin(tile, leader),
    onLose: () => GameGame.gymLoss(tile, leader),
  });
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
    GameState.addToHallOfFame(player);
    // Clear pendingTileResolution so the victory modal's "Continue" button can
    // actually hand off the turn (endTurn refuses to run while pending).
    GameState.pendingTileResolution = false;
    GameUI.refreshAll();
    GameUI.showVictory(player, leader);
    return;
  }

  // Normal gym victory: collect items + pokeballs (no Pokemon — per earlier rule)
  const draws = [];
  const luckyMul = player.flags.luckyEgg ? 2 : 1;
  player.flags.luckyEgg = false;
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
  GameUI.log(`<span class="win">${player.name} defeated ${leader.name}!</span> Rewards drawn.`, 'win');
  GameUI.refreshAll();
  GameUI.showDraws(`${leaderImg} Victory over ${leader.name}!`, draws, () => {
    GameGame.afterTileResolved();
  });
};

GameGame.gymLoss = function (tile, leader) {
  const player = GameState.currentPlayer();
  const penalty = leader.failPenalty;
  if (penalty === 'back8') {
    player.tile = Math.max(0, player.tile - 8);
    GameUI.log(`${player.name} fell back 8 tiles after losing.`, 'lose');
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
  { id: 'free_berry',      msg: 'You spot a berry tree — Oran Berry collected!',         grant: () => ({ item: 'oran_berry' }) },
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
