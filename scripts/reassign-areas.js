const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// User's area ranges (tile.i ranges)
const AREA_RANGES = {
  pallet:  [0, 20],
  seafoam: [21, 46],
  safari:  [47, 76],
  temple:  [77, 94],
};
const GYM_AT_BOUNDARY = {
  20: 'brock',
  46: 'misty',
  76: 'blaine',
  94: 'giovanni',
};

function areaForTile(i) {
  for (const [name, [lo, hi]] of Object.entries(AREA_RANGES)) {
    if (i >= lo && i <= hi) return name;
  }
  return 'pallet';
}

board.tiles.forEach(t => {
  // Reassign area
  t.area = areaForTile(t.i);

  // Boundary tiles become gyms
  if (GYM_AT_BOUNDARY[t.i]) {
    // Wipe any species/branch/joinNext etc, set as gym
    delete t.speciesId;
    delete t.branchTo;
    delete t.labels;
    delete t.joinNext;
    t.type = 'gym';
    t.leader = GYM_AT_BOUNDARY[t.i];
  } else if (t.type === 'gym') {
    // Old gym position that is no longer a boundary — convert to wild Pokemon
    delete t.leader;
    t.type = 'pokemon';
  }
});

// Write back
fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

// Report
const summary = {};
board.tiles.forEach(t => {
  summary[t.area] = summary[t.area] || { count: 0, gyms: [], specifics: [], branches: [] };
  summary[t.area].count++;
  if (t.type === 'gym') summary[t.area].gyms.push(`tile ${t.i}: ${t.leader}`);
  if (t.type === 'specific') summary[t.area].specifics.push(`tile ${t.i}: species ${t.speciesId}`);
  if (t.type === 'branch') summary[t.area].branches.push(`tile ${t.i} → ${t.branchTo}`);
});
console.log(JSON.stringify(summary, null, 2));
