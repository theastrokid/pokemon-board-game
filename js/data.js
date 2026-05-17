// =============================================================
// data.js  ·  loads pokemon, items, board data on boot
// =============================================================
window.GameData = {
  pokemon: null,
  items: null,
  pokeballs: null,
  board: null,
  loaded: false,
};

GameData.load = async function () {
  const [pokeRes, itemRes, boardRes] = await Promise.all([
    fetch('data/pokemon.json'),
    fetch('data/items.json'),
    fetch('data/board.json'),
  ]);
  const pokeJson = await pokeRes.json();
  const itemJson = await itemRes.json();
  const boardJson = await boardRes.json();

  GameData.pokemon = pokeJson.pokemon;
  GameData.items = itemJson.items;
  GameData.pokeballs = itemJson.pokeballs;
  GameData.board = boardJson;

  // Merge in any older calibrated positions, but DON'T overwrite positions
  // that already exist in board.json (newer tiles take precedence).
  try {
    const posRes = await fetch('data/tile-positions.json');
    if (posRes.ok) {
      const olderPositions = await posRes.json();
      GameData.board.tilePositions = Object.assign({}, olderPositions, GameData.board.tilePositions || {});
    }
  } catch (e) { /* ignore - use defaults */ }

  GameData.loaded = true;
  return true;
};

// Sprite helpers. Pre-downloaded Gen 5 BW animated GIFs in sprites/ folder.
GameData.spriteFront = function (speciesId) {
  return `sprites/front/${speciesId}.gif`;
};
GameData.spriteBack = function (speciesId) {
  return `sprites/back/${speciesId}.gif`;
};
GameData.spriteStatic = function (speciesId) {
  return `sprites/static/${speciesId}.png`;
};
GameData.spriteIcon = function (speciesId) {
  return `sprites/static/${speciesId}.png`;
};
GameData.spriteItem = function (itemId) {
  return `sprites/items/${itemId}.png`;
};
GameData.spriteBall = function (ballId) {
  return `sprites/items/${ballId}.png`;
};

GameData.getPokemon = function (id) {
  const p = GameData.pokemon[String(id)];
  if (!p) return null;
  return Object.assign({}, p, { id: Number(id) });
};

GameData.getItem = function (itemId) {
  return GameData.items.find(i => i.id === itemId);
};

GameData.getPokeball = function (ballId) {
  return GameData.pokeballs.find(b => b.id === ballId);
};

GameData.getArea = function (areaId) {
  return GameData.board.areas[areaId];
};

GameData.getGymLeader = function (leaderId) {
  return GameData.board.gymLeaders[leaderId];
};

GameData.getTile = function (i) {
  return GameData.board.tiles.find(t => t.i === i);
};

// Weighted pick helpers.
GameData.weightedPick = function (list, weightKey) {
  const total = list.reduce((s, x) => s + (x[weightKey] || 1), 0);
  let r = Math.random() * total;
  for (const x of list) {
    r -= (x[weightKey] || 1);
    if (r <= 0) return x;
  }
  return list[list.length - 1];
};

GameData.pickEncounterSpeciesId = function (areaId) {
  const pool = GameData.board.areas[areaId].encounters;
  if (!pool || pool.length === 0) return 1;
  // Support both legacy plain-ID arrays and new weighted {id, weight} objects.
  if (typeof pool[0] === 'number') {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const total = pool.reduce((s, x) => s + (x.weight || 1), 0);
  let r = Math.random() * total;
  for (const x of pool) {
    r -= (x.weight || 1);
    if (r <= 0) return x.id;
  }
  return pool[pool.length - 1].id;
};

GameData.pickItemCard = function () {
  return GameData.weightedPick(GameData.items, 'weight');
};

GameData.pickPokeballCard = function () {
  return GameData.weightedPick(GameData.pokeballs, 'weight');
};
