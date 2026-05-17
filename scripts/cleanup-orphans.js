const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// Delete tiles 95-104 (orphan path tiles - user's new tiles 105-114 cover the same area)
const toDelete = [95, 96, 97, 98, 99, 100, 101, 102, 103, 104];
board.tiles = board.tiles.filter(t => !toDelete.includes(t.i));
toDelete.forEach(i => delete board.tilePositions[i]);

// Rewire branch 93 paths using only the user's new tiles 105-114
function wirePathTransitions(pathIds, convergeId) {
  pathIds.forEach((tileId, idx) => {
    const t = board.tiles.find(x => x.i === tileId);
    if (!t) return;
    if (idx === pathIds.length - 1) {
      t.joinNext = convergeId;
    } else {
      const next = pathIds[idx + 1];
      if (next !== tileId + 1) t.joinNext = next;
      else delete t.joinNext;
    }
  });
}

// Clear path data
[93, 94, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114].forEach(i => {
  const t = board.tiles.find(x => x.i === i);
  if (!t) return;
  if (i !== 93 && i !== 114) {
    if (t.type === 'branch') t.type = 'pokemon';
    delete t.branchTo;
    delete t.labels;
    delete t.displayLabel;
    delete t.joinNext;
  }
});

// Branch 93 → [94, 105]
const b93 = board.tiles.find(t => t.i === 93);
b93.type = 'branch';
b93.branchTo = [94, 105];
b93.labels = ['Lower path', 'Upper path'];

// Lower: 94, 106, 107, 108, 109 (5 tiles)
const lower = [94, 106, 107, 108, 109];
lower.forEach((id, idx) => {
  const t = board.tiles.find(x => x.i === id);
  if (t) t.displayLabel = `${94 + idx}a`;
});
wirePathTransitions(lower, 113);

// Upper: 105, 110, 111, 112 (4 tiles)
const upper = [105, 110, 111, 112];
upper.forEach((id, idx) => {
  const t = board.tiles.find(x => x.i === id);
  if (t) t.displayLabel = `${94 + idx}b`;
});
wirePathTransitions(upper, 113);

// 113 -> 114
const t113 = board.tiles.find(t => t.i === 113);
if (t113) { delete t113.joinNext; delete t113.displayLabel; }
const t114 = board.tiles.find(t => t.i === 114);
if (t114) {
  t114.type = 'gym';
  t114.leader = 'giovanni';
  delete t114.displayLabel;
  delete t114.joinNext;
}

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));
console.log('Deleted orphan tiles:', toDelete);
console.log('Total tiles now:', board.tiles.length);
console.log('Max tile.i:', Math.max(...board.tiles.map(t => t.i)));
console.log('\nLower path:', lower.map((id, i) => `${id} (${94+i}a)`).join(' → '), '→ 113');
console.log('Upper path:', upper.map((id, i) => `${id} (${94+i}b)`).join(' → '), '→ 113');
console.log('113 → 114 (Giovanni)');
