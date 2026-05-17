const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// Branch zones: { branchTileId, converge, lowerTiles, upperTiles }
const BRANCHES = [
  {
    branch: 32, converge: 39, postBranchSkipTo: 46,
    lower: [33, 34, 35, 36, 37, 38],
    upper: [40, 41, 42, 43, 44, 45],
    labels: ['Lower path', 'Upper path'],
  },
  {
    branch: 56, converge: 72,
    lower: [57, 58, 59, 60, 61, 62, 63, 64],
    upper: [65, 66, 67, 68, 69, 70, 71],
    labels: ['Lower path', 'Upper path'],
  },
  {
    branch: 82, converge: 88,
    lower: [83, 84, 85],
    upper: [86, 87],
    labels: ['Lower path', 'Upper path'],
  },
];

// Clear existing branches first
board.tiles.forEach(t => {
  if (t.type === 'branch') {
    delete t.branchTo;
    delete t.labels;
    t.type = 'pokemon';
  }
  delete t.joinNext;
  delete t.displayLabel;
});

BRANCHES.forEach(b => {
  const branchTile = board.tiles.find(t => t.i === b.branch);
  if (!branchTile) { console.warn(`No tile ${b.branch}`); return; }
  if (branchTile.type === 'gym') { console.warn(`Tile ${b.branch} is gym`); return; }

  // Set branch tile
  branchTile.type = 'branch';
  branchTile.branchTo = [b.lower[0], b.upper[0]];
  branchTile.labels = b.labels;
  delete branchTile.speciesId;

  // Label lower path tiles: (branch+1)a, (branch+2)a, ...
  b.lower.forEach((tileId, idx) => {
    const t = board.tiles.find(x => x.i === tileId);
    if (!t) return;
    t.displayLabel = `${b.branch + 1 + idx}a`;
    // Last tile of lower path joins converge
    if (idx === b.lower.length - 1) t.joinNext = b.converge;
  });

  // Label upper path tiles: (branch+1)b, (branch+2)b, ...
  b.upper.forEach((tileId, idx) => {
    const t = board.tiles.find(x => x.i === tileId);
    if (!t) return;
    t.displayLabel = `${b.branch + 1 + idx}b`;
    if (idx === b.upper.length - 1) t.joinNext = b.converge;
  });

  // Convergence tile: if postBranchSkipTo defined, joinNext skips upper branch tiles
  if (b.postBranchSkipTo) {
    const conv = board.tiles.find(t => t.i === b.converge);
    if (conv) conv.joinNext = b.postBranchSkipTo;
  }
});

// Tile 93 branch: per user it's still listed as a branch but no convergence given.
// Default: both paths lead to 94 (Giovanni) since 93 is right before the end.
const tile93 = board.tiles.find(t => t.i === 93);
if (tile93 && tile93.type !== 'gym') {
  tile93.type = 'branch';
  tile93.branchTo = [94, 94];
  tile93.labels = ['Approach A', 'Approach B'];
  delete tile93.speciesId;
  delete tile93.joinNext;
  delete tile93.displayLabel;
}

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

// Report
console.log('=== Branch zones ===');
BRANCHES.forEach(b => {
  console.log(`\nBranch tile ${b.branch} → converge ${b.converge}${b.postBranchSkipTo ? ` (then skip to ${b.postBranchSkipTo})` : ''}`);
  console.log(`  Lower path: ${b.lower.map((id, i) => `${id} (${b.branch + 1 + i}a)`).join(', ')} → ${b.converge}`);
  console.log(`  Upper path: ${b.upper.map((id, i) => `${id} (${b.branch + 1 + i}b)`).join(', ')} → ${b.converge}`);
});
console.log(`\nBranch 93 → [94, 94] (both lead to Giovanni)`);
