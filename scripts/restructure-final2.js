const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// Move Giovanni from old position to tile 114
board.tiles.forEach(t => {
  if (t.type === 'gym' && t.leader === 'giovanni' && t.i !== 114) {
    delete t.leader;
    t.type = 'pokemon';
  }
});
const newGiovanni = board.tiles.find(t => t.i === 114);
if (newGiovanni) {
  newGiovanni.type = 'gym';
  newGiovanni.leader = 'giovanni';
  delete newGiovanni.displayLabel;
  delete newGiovanni.joinNext;
}

// Clear branch zone tiles' joinNext / displayLabels for re-application
for (let i = 94; i <= 113; i++) {
  const t = board.tiles.find(x => x.i === i);
  if (t) {
    delete t.displayLabel;
    delete t.joinNext;
    if (t.type === 'branch') {
      delete t.branchTo;
      delete t.labels;
      t.type = 'pokemon';
    }
  }
}

// Branch 93 → converge at 113 (longer parallel paths now)
const branch93 = board.tiles.find(t => t.i === 93);
branch93.type = 'branch';
branch93.branchTo = [94, 99];
branch93.labels = ['Lower path', 'Upper path'];

// Lower path: 94, 95, 96, 97, 98, 103, 106, 107, 108, 109 (10 tiles)
const lowerPath = [94, 95, 96, 97, 98, 103, 106, 107, 108, 109];
lowerPath.forEach((tileId, idx) => {
  const t = board.tiles.find(x => x.i === tileId);
  if (!t) return;
  t.displayLabel = `${94 + idx}a`;
  if (idx === lowerPath.length - 1) t.joinNext = 113;
});

// Upper path: 99, 100, 101, 102, 105, 110, 111, 112 (8 tiles)
const upperPath = [99, 100, 101, 102, 105, 110, 111, 112];
upperPath.forEach((tileId, idx) => {
  const t = board.tiles.find(x => x.i === tileId);
  if (!t) return;
  t.displayLabel = `${94 + idx}b`;
  if (idx === upperPath.length - 1) t.joinNext = 113;
});

// 113 is the convergence point. Normal next → 114 (Giovanni)
const conv = board.tiles.find(t => t.i === 113);
if (conv) {
  delete conv.displayLabel;
  delete conv.joinNext;
}

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

console.log('Branch 93 → converge 113, then 114 (Giovanni game end)');
console.log(`Lower path (${lowerPath.length} tiles):`, lowerPath.map((id, i) => `${id} (${94+i}a)`).join(' → '), '→ 113');
console.log(`Upper path (${upperPath.length} tiles):`, upperPath.map((id, i) => `${id} (${94+i}b)`).join(' → '), '→ 113');
console.log('113 → 114 (Giovanni)');
