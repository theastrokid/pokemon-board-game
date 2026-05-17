const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// Master spec from user. Maps tile.i → { type, speciesId?, leader?, returnTo? }
// Branch tiles (32, 56, 82, 93) are kept as branch type regardless of user's listing,
// because the a/b parallel paths require a branch tile to fork from.
const SPEC = {
  // Pallet Town 1-20
  1: 'wild', 2: 'wild', 3: 'wild', 4: 'wild', 5: 'wild',
  6: 'item', 7: 'pokeball', 8: 'wild', 9: 'item', 10: 'wild',
  11: 'wild', 12: 'wild', 13: 'wild', 14: 'item', 15: 'trade',
  16: 'wild', 17: 'item', 18: 'wild', 19: 'wild',
  20: { type: 'gym', leader: 'brock' },
  // Seafoam 21-46
  21: 'wild', 22: 'pokecentre', 23: 'item', 24: 'trade', 25: 'wild',
  26: 'wild', 27: 'pokeball', 28: 'wild', 29: 'item', 30: 'fainted',
  31: 'wild',
  // 32 stays branch (kept below)
  33: 'wild', 34: 'wild', 35: 'wild',
  36: { type: 'specific', speciesId: 143 }, // Snorlax (33a path)
  37: 'wild', 38: 'wild', 39: 'wild',
  40: 'item', 41: 'pokeball', 42: 'trade', 43: 'item',
  44: 'masterball', 45: 'item',
  46: { type: 'gym', leader: 'misty' },
  // Safari 47-76
  47: 'wild', 48: 'wild', 49: 'item', 50: 'wild', 51: 'wild',
  52: 'pokecentre', 53: 'wild', 54: 'wild', 55: 'trade',
  // 56 stays branch
  57: 'masterball', 58: { type: 'fainted', returnTo: 53 },
  59: 'pokeball', 60: { type: 'fainted', returnTo: 53 },
  61: 'pokeball', 62: { type: 'fainted', returnTo: 53 },
  63: 'masterball',
  // 64 not specified -> keep as wild
  64: 'wild',
  65: 'wild', 66: 'wild', 67: 'wild', 68: 'wild',
  69: 'wild', 70: 'wild', 71: 'wild',
  72: { type: 'specific', speciesId: 143 }, // Snorlax (convergence)
  73: 'item', 74: 'trade', 75: 'item',
  76: { type: 'gym', leader: 'blaine' },
  // Ancient Temple 77-114
  77: 'item', 78: 'wild', 79: 'pokeball', 80: 'wild', 81: 'wild',
  // 82 stays branch
  83: 'wild', 84: 'item', 85: 'wild',
  86: 'wild', 87: 'masterball',
  88: 'trade', 89: 'wild', 90: 'battle', 91: 'pokecentre',
  92: 'fainted',
  // 93 stays branch
  94: 'wild',  // 94a
  105: 'fainted', // 94b
  106: 'wild', // 95a
  107: 'wild', // 96a
  108: 'trade', // 97a
  109: 'item', // 98a
  110: 'wild', // 95b
  111: 'item', // 96b
  112: 'pokeball', // 97b
  113: 'fainted',
  114: { type: 'gym', leader: 'giovanni' },
};

// Apply spec, preserving branch and structural fields (joinNext, branchTo, displayLabel)
board.tiles.forEach(tile => {
  const i = tile.i;
  const spec = SPEC[i];
  // Branch tiles stay as branch
  const isBranchTile = [32, 56, 82, 93].includes(i);
  if (isBranchTile) {
    return; // keep branch config untouched
  }
  if (!spec) return;
  // Wipe content fields that may no longer apply
  delete tile.speciesId;
  delete tile.leader;
  delete tile.returnTo;
  if (typeof spec === 'string') {
    if (spec === 'wild') tile.type = 'pokemon';
    else tile.type = spec;
  } else {
    tile.type = spec.type;
    if (spec.speciesId != null) tile.speciesId = spec.speciesId;
    if (spec.leader) tile.leader = spec.leader;
    if (spec.returnTo != null) tile.returnTo = spec.returnTo;
  }
});

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

// Verification: summarise per area
const areas = ['pallet', 'seafoam', 'safari', 'temple'];
areas.forEach(area => {
  const tiles = board.tiles.filter(t => t.area === area);
  const summary = tiles.reduce((acc, t) => {
    const key = t.type === 'specific' ? `specific:${t.speciesId}` : t.type === 'gym' ? `gym:${t.leader}` : t.type;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  console.log(`${area} (${tiles.length} tiles):`, summary);
});
