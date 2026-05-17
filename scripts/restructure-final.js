const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// Move Giovanni from tile 94 to tile 104
const oldGiovanni = board.tiles.find(t => t.i === 94);
const newGiovanni = board.tiles.find(t => t.i === 104);
delete oldGiovanni.leader;
oldGiovanni.type = 'pokemon';
newGiovanni.type = 'gym';
newGiovanni.leader = 'giovanni';
delete newGiovanni.displayLabel;
delete newGiovanni.joinNext;

// Set up branch 93 → converge 103
const branch93 = board.tiles.find(t => t.i === 93);
branch93.type = 'branch';
branch93.branchTo = [94, 99];
branch93.labels = ['Lower path', 'Upper path'];
delete branch93.speciesId;
delete branch93.joinNext;
delete branch93.displayLabel;

// Clear any existing labels/joinNext on tiles 94-103
for (let i = 94; i <= 103; i++) {
  const t = board.tiles.find(x => x.i === i);
  if (t) {
    delete t.displayLabel;
    delete t.joinNext;
  }
}

// Lower path: 94, 95, 96, 97, 98 → converge 103
const lowerPath = [94, 95, 96, 97, 98];
lowerPath.forEach((tileId, idx) => {
  const t = board.tiles.find(x => x.i === tileId);
  if (!t) return;
  t.displayLabel = `${93 + 1 + idx}a`;  // 94a, 95a, 96a, 97a, 98a
  if (idx === lowerPath.length - 1) t.joinNext = 103;
});

// Upper path: 99, 100, 101, 102 → converge 103
const upperPath = [99, 100, 101, 102];
upperPath.forEach((tileId, idx) => {
  const t = board.tiles.find(x => x.i === tileId);
  if (!t) return;
  t.displayLabel = `${93 + 1 + idx}b`;  // 94b, 95b, 96b, 97b
  if (idx === upperPath.length - 1) t.joinNext = 103;
});

// 103 normal flow → 104 (Giovanni). No special joinNext needed.

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

console.log('Branch 93 → converge 103, then 104 (Giovanni game end)');
console.log('Lower: 94(94a) → 95(95a) → 96(96a) → 97(97a) → 98(98a) → 103');
console.log('Upper: 99(94b) → 100(95b) → 101(96b) → 102(97b) → 103');
console.log('103 → 104 (Giovanni)');
