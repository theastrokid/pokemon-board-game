const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// Build sorted list of existing tile IDs
const existingIds = board.tiles.map(t => t.i).sort((a, b) => a - b);
console.log('Existing IDs:', existingIds);
console.log('Gaps:');
for (let i = 0; i < existingIds[existingIds.length - 1]; i++) {
  if (!existingIds.includes(i)) console.log(`  gap at ${i}`);
}

// Build old → new mapping (sequential 0, 1, 2, ...)
const oldToNew = {};
existingIds.forEach((oldId, newIdx) => {
  oldToNew[oldId] = newIdx;
});

console.log('\nRenumber mapping (only shifts shown):');
Object.entries(oldToNew).forEach(([oldId, newId]) => {
  if (Number(oldId) !== newId) console.log(`  ${oldId} → ${newId}`);
});

// Apply: update tile.i, branchTo, joinNext, and tilePositions
board.tiles.forEach(t => {
  t.i = oldToNew[t.i];
  if (Array.isArray(t.branchTo)) {
    t.branchTo = t.branchTo.map(b => oldToNew[b] != null ? oldToNew[b] : b);
  }
  if (t.joinNext != null) {
    t.joinNext = oldToNew[t.joinNext] != null ? oldToNew[t.joinNext] : t.joinNext;
  }
  if (t.returnTo != null) {
    t.returnTo = oldToNew[t.returnTo] != null ? oldToNew[t.returnTo] : t.returnTo;
  }
});

// Renumber tilePositions keys
const newPositions = {};
Object.entries(board.tilePositions || {}).forEach(([oldId, pos]) => {
  const newId = oldToNew[oldId];
  if (newId != null) newPositions[newId] = pos;
});
board.tilePositions = newPositions;

// Sort tiles by new ID
board.tiles.sort((a, b) => a.i - b.i);

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

// Verify no gaps remain
const newIds = board.tiles.map(t => t.i);
const gaps = [];
for (let i = 0; i < newIds[newIds.length - 1]; i++) {
  if (!newIds.includes(i)) gaps.push(i);
}
console.log('\n=== AFTER ===');
console.log('Total tiles:', board.tiles.length);
console.log('Max tile.i:', Math.max(...newIds));
console.log('Gaps remaining:', gaps.length === 0 ? 'none ✓' : gaps);

// New gym positions
console.log('\nGym positions:');
board.tiles.filter(t => t.type === 'gym').forEach(t => console.log(`  ${t.i}: ${t.leader}`));
// New branch positions
console.log('\nBranch positions:');
board.tiles.filter(t => t.type === 'branch').forEach(t => console.log(`  ${t.i}: branchTo ${JSON.stringify(t.branchTo)}`));
