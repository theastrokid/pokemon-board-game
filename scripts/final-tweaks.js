const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// ===== Rename tile 103 → 89, tile 104 → 90 =====
const renameMap = { 103: 89, 104: 90 };
board.tiles.forEach(t => {
  if (renameMap[t.i] != null) t.i = renameMap[t.i];
  if (Array.isArray(t.branchTo)) t.branchTo = t.branchTo.map(b => renameMap[b] != null ? renameMap[b] : b);
  if (t.joinNext != null && renameMap[t.joinNext] != null) t.joinNext = renameMap[t.joinNext];
  if (t.returnTo != null && renameMap[t.returnTo] != null) t.returnTo = renameMap[t.returnTo];
});
const newPos = {};
Object.entries(board.tilePositions).forEach(([id, p]) => {
  const newId = renameMap[id] != null ? renameMap[id] : Number(id);
  newPos[newId] = p;
});
board.tilePositions = newPos;

// ===== Change tile 0 to a dedicated "start" type (no encounter) =====
// Already exists at position (85, 1130), to the left of tile 1.
const t0 = board.tiles.find(t => t.i === 0);
if (t0) {
  t0.type = 'start';
  t0.label = 'Start';
  delete t0.speciesId;
  delete t0.joinNext;  // natural progression to tile 1
}

// Sort
board.tiles.sort((a, b) => a.i - b.i);
fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

console.log('Total tiles:', board.tiles.length);
console.log('Max tile.i:', Math.max(...board.tiles.map(t => t.i)));
console.log('Tile 0:', board.tiles.find(t => t.i === 0));
console.log('Tile 89:', board.tiles.find(t => t.i === 89));
console.log('Tile 90:', board.tiles.find(t => t.i === 90));
console.log('Gyms:', board.tiles.filter(t => t.type === 'gym').map(t => `${t.i}: ${t.leader}`));
