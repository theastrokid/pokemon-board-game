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
  // Current weather: { type, expiresAtTurn }. Modifies move power per type.
  weather: null,
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
  GameState.weather = null;
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

// ============== WEATHER ==============
// Each turn there's a small chance the weather changes. Types modify type-
// matching damage by +25%.
GameState.WEATHER_CHANGE_CHANCE = 0.22;
GameState.WEATHER_DURATION_TURNS = 3;
GameState.WEATHER_TYPES = [
  { id: 'rain',      label: '🌧️  Rain',      boostType: 'water',    msg: 'It started to rain. Water moves stronger.' },
  { id: 'sun',       label: '☀️  Harsh Sun',  boostType: 'fire',     msg: 'The sunlight turned harsh. Fire moves stronger.' },
  { id: 'sandstorm', label: '🌪️  Sandstorm', boostType: 'rock',     msg: 'A sandstorm kicked up. Rock moves stronger.' },
  { id: 'fog',       label: '🌫️  Fog',       boostType: 'ghost',    msg: 'A thick fog rolled in. Ghost moves stronger.' },
];

GameState.maybeChangeWeather = function () {
  // Don't change while existing weather is still active
  if (GameState.weather && GameState.turnCount <= GameState.weather.expiresAtTurn) return;
  if (Math.random() > GameState.WEATHER_CHANGE_CHANCE) {
    // Clear stale weather quietly
    if (GameState.weather && GameState.turnCount > GameState.weather.expiresAtTurn) {
      GameState.weather = null;
    }
    return;
  }
  const w = GameState.WEATHER_TYPES[Math.floor(Math.random() * GameState.WEATHER_TYPES.length)];
  GameState.weather = {
    type: w.id,
    label: w.label,
    boostType: w.boostType,
    expiresAtTurn: GameState.turnCount + GameState.WEATHER_DURATION_TURNS,
  };
  if (window.GameUI && GameUI.log) {
    GameUI.log(`<span class="crit">${w.label} — ${w.msg}</span>`, 'crit');
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
    completed: false,
  };
};

GameState.currentPlayer = function () {
  return GameState.players[GameState.activePlayerIdx];
};

GameState.giveItem = function (player, itemId) {
  player.items[itemId] = (player.items[itemId] || 0) + 1;
};

GameState.giveBall = function (player, ballId) {
  player.balls[ballId] = (player.balls[ballId] || 0) + 1;
};

GameState.consumeItem = function (player, itemId) {
  if (!player.items[itemId]) return false;
  player.items[itemId]--;
  if (player.items[itemId] <= 0) delete player.items[itemId];
  return true;
};

GameState.consumeBall = function (player, ballId) {
  if (!player.balls[ballId]) return false;
  player.balls[ballId]--;
  if (player.balls[ballId] <= 0) delete player.balls[ballId];
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
  GameState.hallOfFame.unshift({
    name: player.name,
    color: player.color,
    party: player.party.map(m => ({ name: m.name, speciesId: m.speciesId })),
    date: new Date().toISOString(),
  });
  if (GameState.hallOfFame.length > 50) GameState.hallOfFame.length = 50;
  localStorage.setItem('pbg.hof', JSON.stringify(GameState.hallOfFame));
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
