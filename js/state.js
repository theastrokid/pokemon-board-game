// =============================================================
// state.js  ·  game state, players, persistence
// =============================================================
window.GameState = {
  players: [],
  activePlayerIdx: 0,
  turnCount: 1,
  pendingTileResolution: false,
  pendingBranch: null,
  pendingEncounterBall: null,
  lastPokecentreForPlayer: {},
  // Pokemon instanceIds that have already received a Rare Candy this turn.
  // Resets every turn. Lets a player use many candies but only 1 per Pokemon.
  candiedInstancesThisTurn: {},
  hallOfFame: [],
  options: { music: true, sfx: true },
  // Spam guard: true while a multi-step action (dice roll + movement, end-turn
  // animation, etc.) is mid-flight. Buttons should early-exit if set.
  busy: false,
  // Time-limited legendary spawn: floats over a random pokemon tile, despawns
  // after 2 turns if no one lands on it. { tileIdx, speciesId, expiresAtTurn }
  legendarySpawn: null,
};

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#06b6d4'];

GameState.reset = function () {
  GameState.players = [];
  GameState.activePlayerIdx = 0;
  GameState.turnCount = 1;
  GameState.pendingTileResolution = false;
  GameState.pendingBranch = null;
  GameState.pendingEncounterBall = null;
  GameState.lastPokecentreForPlayer = {};
  GameState.candiedInstancesThisTurn = {};
  GameState.busy = false;
  GameState.legendarySpawn = null;
};

// Catch-streak helper — used by encounter.js. Bumps the streak on success,
// resets on miss, gifts a bonus item every 5 in a row.
GameState.bumpCatchStreak = function (player) {
  player.catchStreak = (player.catchStreak || 0) + 1;
  player.bestCatchStreak = Math.max(player.bestCatchStreak || 0, player.catchStreak);
  if (player.catchStreak > 0 && player.catchStreak % 5 === 0) {
    // Reward escalates: every 5 catches gives a bonus item.
    const it = GameData.pickItemCard();
    GameState.giveItem(player, it.id);
    return { bonus: it };
  }
  return null;
};
GameState.resetCatchStreak = function (player) {
  if (!player) return;
  player.catchStreak = 0;
};

// ============== LEGENDARY SPAWNS ==============
// Pool of legendary Pokemon IDs that can spawn on wild tiles. All present
// in pokemon.json — verified.
GameState.LEGENDARY_POOL = [144, 145, 146, 150, 151, 243, 244, 245, 249, 250];
GameState.LEGENDARY_SPAWN_CHANCE = 0.18;   // per-turn roll when no spawn active
GameState.LEGENDARY_LIFETIME_TURNS = 2;    // despawn this many turns after spawn

GameState.maybeSpawnLegendary = function () {
  if (GameState.legendarySpawn) return; // one active at a time
  if (Math.random() > GameState.LEGENDARY_SPAWN_CHANCE) return;
  // Find all pokemon/specific tiles the spawn can attach to.
  const wildTiles = (GameData.board && GameData.board.tiles || [])
    .filter(t => t.type === 'pokemon' || t.type === 'specific');
  if (wildTiles.length === 0) return;
  const tile = wildTiles[Math.floor(Math.random() * wildTiles.length)];
  const speciesId = GameState.LEGENDARY_POOL[Math.floor(Math.random() * GameState.LEGENDARY_POOL.length)];
  GameState.legendarySpawn = {
    tileIdx: tile.i,
    speciesId,
    spawnedAtTurn: GameState.turnCount,
    expiresAtTurn: GameState.turnCount + GameState.LEGENDARY_LIFETIME_TURNS,
  };
  const poke = GameData.getPokemon(speciesId);
  if (window.GameUI && GameUI.log) {
    GameUI.log(`<span class="crit">⚡ A wild <strong>${poke.name}</strong> has appeared on tile ${tile.displayLabel || tile.i}! It will flee in ${GameState.LEGENDARY_LIFETIME_TURNS} turn${GameState.LEGENDARY_LIFETIME_TURNS === 1 ? '' : 's'}.</span>`, 'crit');
  }
  if (window.GameAudio && GameAudio.sfx && GameAudio.sfx.fanfare) GameAudio.sfx.fanfare();
};

GameState.expireLegendaryIfStale = function () {
  if (!GameState.legendarySpawn) return;
  if (GameState.turnCount > GameState.legendarySpawn.expiresAtTurn) {
    const poke = GameData.getPokemon(GameState.legendarySpawn.speciesId);
    if (window.GameUI && GameUI.log) {
      GameUI.log(`<span class="lose">${poke.name} has fled.</span>`, 'lose');
    }
    GameState.legendarySpawn = null;
  }
};

GameState.makePlayer = function (idx, name, starterSpeciesId) {
  const p = GameData.getPokemon(starterSpeciesId);
  const starter = {
    speciesId: starterSpeciesId,
    name: p.name,
    types: p.types.slice(),
    hp: p.hp,
    maxHp: p.hp,
    moves: GameState.cloneMoves(p.moves),
    fainted: false,
    instanceId: 'inst-' + Math.random().toString(36).slice(2, 8),
  };
  return {
    id: 'player-' + idx,
    idx,
    name: name || `Trainer ${idx + 1}`,
    color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
    party: [starter],
    items: {},
    balls: { pokeball: 0 },
    tile: 0,
    badges: [],
    flags: { luckyEgg: false, escapeRope: false, maxRepel: false, xAttack: false, xDefend: false },
    // Active Egg items, each { instanceId, speciesId, turnsLeft }. Hatch into a
    // shiny single-stage Pokemon after EGG_HATCH_TURNS of this player's turns.
    eggs: [],
    // Pocket money for the Poké Mart (buy / sell).
    money: GameState.STARTING_MONEY,
    completed: false,
  };
};

// Number of the OWNER's turns before an Egg item hatches.
GameState.EGG_HATCH_TURNS = 5;
// Cash every trainer starts with (small — top up by selling + gym wins).
GameState.STARTING_MONEY = 800;

// ============== SHOP / MONEY ==============
GameState.buyPrice = function (kind, id) {
  const def = kind === 'ball' ? GameData.getPokeball(id) : GameData.getItem(id);
  return (def && def.price) || 0;
};
// Selling pays about half the buy price (floored, min 1).
GameState.sellPrice = function (kind, id) {
  return Math.max(1, Math.floor(GameState.buyPrice(kind, id) / 2));
};
GameState.buy = function (player, kind, id) {
  const price = GameState.buyPrice(kind, id);
  if (!price || (player.money || 0) < price) return false;
  player.money = (player.money || 0) - price;
  if (kind === 'ball') GameState.giveBall(player, id);
  else GameState.giveItem(player, id); // routes 'egg' to the egg tracker
  return price;
};
GameState.sell = function (player, kind, id) {
  const bag = kind === 'ball' ? player.balls : player.items;
  if (!bag || (bag[id] || 0) <= 0) return 0;
  const price = GameState.sellPrice(kind, id);
  bag[id]--;
  if (bag[id] <= 0) delete bag[id];
  player.money = (player.money || 0) + price;
  return price;
};

GameState.currentPlayer = function () {
  return GameState.players[GameState.activePlayerIdx];
};

GameState.giveItem = function (player, itemId) {
  // Eggs are stateful (countdown + pre-rolled species) so they live in
  // player.eggs, NOT the flat items bag. Routing here means every draw site
  // (item tiles, gym rewards, releases, tile events, catch streaks) handles
  // Eggs automatically — and they can never be traded as plain items.
  if (itemId === 'egg') { GameState.giveEgg(player); return; }
  player.items[itemId] = (player.items[itemId] || 0) + 1;
};

// Create a new Egg for the player. The hatch species (a shiny single-stage
// Pokemon) is rolled NOW and stored, so save/load and the eventual reveal are
// deterministic.
GameState.giveEgg = function (player) {
  if (!Array.isArray(player.eggs)) player.eggs = [];
  const speciesId = (window.GameItems && GameItems.randomSingleStageSpeciesId)
    ? GameItems.randomSingleStageSpeciesId() : 128; // Tauros fallback
  player.eggs.push({
    instanceId: 'egg-' + Math.random().toString(36).slice(2, 8),
    speciesId,
    turnsLeft: GameState.EGG_HATCH_TURNS,
  });
  player.eggsReceived = (player.eggsReceived || 0) + 1;
};

// Build a hatched Pokemon: always shiny, with the same +25% HP / +25% move
// power bonus shiny wild catches get (see encounter.js), so it survives every
// code path that later reads mon.moves.
GameState.makeHatchling = function (player, speciesId) {
  const mon = GameState.addPokemonToParty(player, speciesId);
  if (mon) {
    mon.isShiny = true;
    mon.fromEgg = true;
    mon.maxHp = Math.round(mon.maxHp * 1.25);
    mon.hp = mon.maxHp;
    mon.moves.forEach(mv => { mv.power = Math.round((mv.power || 0) * 1.25); });
  }
  return mon;
};

// Advance every Egg's countdown by one at the START of the owner's turn, and
// return the Eggs that are ready to hatch (turnsLeft 0) AND have party room.
// Eggs are spliced out atomically so they can never double-hatch; ready Eggs
// with no party room stay parked at 0 until a slot frees up. A per-turn guard
// stops any double endTurn from decrementing twice.
GameState.tickEggsTurnStart = function (player) {
  if (!player || !Array.isArray(player.eggs) || player.eggs.length === 0) return [];
  if (player._lastEggTickTurn === GameState.turnCount) return [];
  player._lastEggTickTurn = GameState.turnCount;
  player.eggs.forEach(egg => { egg.turnsLeft = Math.max(0, (egg.turnsLeft || 0) - 1); });
  const hatched = [];
  let i = 0;
  while (i < player.eggs.length && (player.party.length + hatched.length) < 6) {
    if (player.eggs[i].turnsLeft <= 0) {
      hatched.push(player.eggs.splice(i, 1)[0]);
    } else {
      i++;
    }
  }
  return hatched;
};

GameState.giveBall = function (player, ballId) {
  player.balls[ballId] = (player.balls[ballId] || 0) + 1;
};

GameState.consumeItem = function (player, itemId) {
  if (!player.items[itemId]) return false;
  player.items[itemId]--;
  if (player.items[itemId] <= 0) delete player.items[itemId];
  // Per-run usage tally — surfaced in the Hall of Fame "career report".
  player.itemsUsed = player.itemsUsed || {};
  player.itemsUsed[itemId] = (player.itemsUsed[itemId] || 0) + 1;
  return true;
};

GameState.consumeBall = function (player, ballId) {
  if (!player.balls[ballId]) return false;
  player.balls[ballId]--;
  if (player.balls[ballId] <= 0) delete player.balls[ballId];
  player.ballsUsed = player.ballsUsed || {};
  player.ballsUsed[ballId] = (player.ballsUsed[ballId] || 0) + 1;
  return true;
};

GameState.addPokemonToParty = function (player, speciesId, replacingInstance) {
  const data = GameData.getPokemon(speciesId);
  if (!data) return false;
  const newMon = {
    speciesId,
    name: data.name,
    types: data.types.slice(),
    hp: data.hp,
    maxHp: data.hp,
    moves: GameState.cloneMoves(data.moves),
    fainted: false,
    instanceId: 'inst-' + Math.random().toString(36).slice(2, 8),
  };
  if (replacingInstance) {
    const idx = player.party.findIndex(m => m.instanceId === replacingInstance);
    if (idx >= 0) player.party[idx] = newMon;
  } else {
    player.party.push(newMon);
  }
  return newMon;
};

GameState.advanceTurn = function () {
  GameState.activePlayerIdx = (GameState.activePlayerIdx + 1) % GameState.players.length;
  if (GameState.activePlayerIdx === 0) GameState.turnCount++;
  GameState.pendingTileResolution = false;
  GameState.candiedInstancesThisTurn = {};
};

GameState.findLastPokecentreTile = function (currentTileIdx) {
  for (let i = currentTileIdx; i >= 0; i--) {
    const t = GameData.getTile(i);
    if (t && t.type === 'pokecentre') return i;
  }
  return 0;
};

GameState.healPlayer = function (player) {
  player.party.forEach(m => { m.hp = m.maxHp; m.fainted = false; GameState.resetMoves(m); });
};

// Clone moves and tag each with maxPp + current pp. Weak (non-gated) move = 20 uses,
// strong (gated) move = 3 uses. Older saves without pp fields fall back to maxPp on read.
GameState.cloneMoves = function (moves) {
  return moves.map(mv => {
    const maxPp = mv.gated ? 3 : 20;
    return Object.assign({}, mv, { pp: maxPp, maxPp });
  });
};

// Reset PP on every move of a mon (called when fully restored, fainted, or evolved).
GameState.resetMoves = function (mon) {
  if (!mon || !mon.moves) return;
  mon.moves.forEach(mv => {
    const maxPp = mv.maxPp != null ? mv.maxPp : (mv.gated ? 3 : 20);
    mv.maxPp = maxPp;
    mv.pp = maxPp;
  });
};

GameState.partyAllFainted = function (player) {
  return player.party.length > 0 && player.party.every(m => m.fainted);
};

GameState.save = function () {
  const snap = {
    players: GameState.players,
    activePlayerIdx: GameState.activePlayerIdx,
    turnCount: GameState.turnCount,
    options: GameState.options,
    timestamp: Date.now(),
  };
  localStorage.setItem('pbg.savegame', JSON.stringify(snap));
  return true;
};

GameState.load = function () {
  try {
    const raw = localStorage.getItem('pbg.savegame');
    if (!raw) return false;
    const snap = JSON.parse(raw);
    GameState.players = snap.players;
    GameState.activePlayerIdx = snap.activePlayerIdx;
    GameState.turnCount = snap.turnCount;
    GameState.options = snap.options || GameState.options;
    // Backward-compat: older saves predate the Egg system / new flags.
    GameState.players.forEach(p => {
      if (!Array.isArray(p.eggs)) p.eggs = [];
      if (!p.flags) p.flags = {};
      if (typeof p.money !== 'number') p.money = GameState.STARTING_MONEY;
    });
    return true;
  } catch (e) { return false; }
};

GameState.loadHallOfFame = function () {
  try {
    const raw = localStorage.getItem('pbg.hof');
    GameState.hallOfFame = raw ? JSON.parse(raw) : [];
  } catch (e) { GameState.hallOfFame = []; }
  return GameState.hallOfFame;
};

GameState.addToHallOfFame = function (player) {
  GameState.loadHallOfFame();
  const entry = {
    name: player.name,
    color: player.color,
    trainerSprite: player.trainerSprite || null,
    // Save the full mon record (moves/HP/shiny/boost flags) so the Hall of
    // Fame detail view can show exactly what beat Giovanni.
    party: player.party.map(m => ({
      name: m.name,
      speciesId: m.speciesId,
      types: (m.types || []).slice(),
      hp: m.hp, maxHp: m.maxHp,
      moves: (m.moves || []).map(mv => ({
        name: mv.name, power: mv.power, type: mv.type, gated: !!mv.gated,
        pp: mv.pp, maxPp: mv.maxPp,
      })),
      isShiny: !!m.isShiny,
      boostCount: m.boostCount || 0,
      fainted: !!m.fainted,
    })),
    // Career report — full per-run item / ball tally + headline stats.
    itemsUsed: player.itemsUsed || {},
    ballsUsed: player.ballsUsed || {},
    badges: (player.badges || []).slice(),
    bestCatchStreak: player.bestCatchStreak || 0,
    turns: GameState.turnCount,
    date: new Date().toISOString(),
  };
  GameState.hallOfFame.unshift(entry);
  if (GameState.hallOfFame.length > 50) GameState.hallOfFame.length = 50;
  localStorage.setItem('pbg.hof', JSON.stringify(GameState.hallOfFame));
  return entry;
};

// ============== HALL OF FAME SCORING / RANKING ==============
// Champions are ranked by team strength × a speed bonus, so a quick clear with
// a good team outranks a 100-turn grind with a slightly stronger one.

// Total team stats = sum of (maxHp + total move power) across the saved party.
GameState.hofTeamStats = function (entry) {
  if (!entry || !Array.isArray(entry.party)) return 0;
  return entry.party.reduce((sum, m) => {
    const movePower = (m.moves || []).reduce((s, mv) => s + (mv.power || 0), 0);
    return sum + (m.maxHp || 0) + movePower;
  }, 0);
};

// Speed bonus: decays from ~2.5× for a very fast finish toward 1.1× for a long
// grind. HOF_SPEED_REF is the turn count that yields a ~2× multiplier.
GameState.HOF_SPEED_REF = 50;
GameState.hofTurnMultiplier = function (turns) {
  const t = Math.max(1, turns || 999);
  return Math.max(1.1, Math.min(2.5, 1 + GameState.HOF_SPEED_REF / t));
};

// Final leaderboard score.
GameState.hofScore = function (entry) {
  return Math.round(GameState.hofTeamStats(entry) * GameState.hofTurnMultiplier(entry && entry.turns));
};

// 1-based rank of `entry` among all champions by hofScore (ties share the
// better rank). Returns { rank, total, score }.
GameState.rankInHallOfFame = function (entry) {
  const list = GameState.hallOfFame || [];
  const myScore = GameState.hofScore(entry);
  let higher = 0;
  list.forEach(e => { if (e !== entry && GameState.hofScore(e) > myScore) higher++; });
  return { rank: higher + 1, total: list.length, score: myScore };
};

// True random 1-6 via crypto (rejection-sampled for unbiased modulo).
// Falls back to Math.random if crypto is unavailable.
GameState.rollD6 = function () {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(1);
    let n;
    // 252 = 42 * 6. Reject 252-255 to keep distribution uniform.
    do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= 252);
    return (n % 6) + 1;
  }
  return 1 + Math.floor(Math.random() * 6);
};

// Anti-streak guard: never return the same value 3 times in a row.
// Real PRNGs do throw streaks; this just caps perceived streaks at 2.
GameState._lastRolls = [];
GameState.rollDice = function () {
  let n = GameState.rollD6();
  const last = GameState._lastRolls;
  if (last.length >= 2 && last[0] === n && last[1] === n) {
    // Re-roll once if it would extend a streak to 3+.
    let attempts = 0;
    while (attempts++ < 6 && n === last[0]) n = GameState.rollD6();
  }
  GameState._lastRolls = [n, last[0]].filter(v => v !== undefined);
  if (GameState._lastRolls.length > 2) GameState._lastRolls.length = 2;
  return n;
};
