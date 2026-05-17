const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// Safari upper branch is at tiles 200-206. Should have labels 57b-63b (position-based).
const safariUpper = [200, 201, 202, 203, 204, 205, 206];
safariUpper.forEach((id, idx) => {
  const t = board.tiles.find(x => x.i === id);
  if (t) t.displayLabel = `${57 + idx}b`;
});

// Also fix: safari upper last tile (206) should joinNext to 65 (the new Snorlax convergence)
const t206 = board.tiles.find(x => x.i === 206);
if (t206) t206.joinNext = 65;

// Verify lower safari path joinNext: 64 (64a) → 65 (Snorlax convergence)
const t64 = board.tiles.find(x => x.i === 64);
if (t64) t64.joinNext = 65;

// Convergence 65 (Snorlax) → 66 (item), naturally sequential, but need joinNext to skip past upper
// Actually safari upper is at 200+ so no skip needed. tile 65 → 66 naturally.
const t65 = board.tiles.find(x => x.i === 65);
if (t65) delete t65.joinNext;  // natural progression 65 → 66

// Branch 56 branchTo: lower starts at 57, upper starts at 200
const b56 = board.tiles.find(x => x.i === 56);
if (b56) b56.branchTo = [57, 200];

// For temple branch (now at 86, branchTo [87, 98] from earlier):
// Lower path was 87-91 in old IDs (94, 106-109). After -7 shift: 87, 99-102 → 87, 92-95.
// Wait let me re-check. Original lower was [94, 106, 107, 108, 109], all >= 72 so all shift -7:
//   94 → 87, 106 → 99, 107 → 100, 108 → 101, 109 → 102.
// Original upper was [105, 110, 111, 112], all >= 72 so all -7:
//   105 → 98, 110 → 103, 111 → 104, 112 → 105.
// Convergence 113 → 106. Giovanni 114 → 107.

// Verify branch 86 (was 93):
const b86 = board.tiles.find(x => x.i === 86);
if (b86) {
  console.log('Branch 86 branchTo:', b86.branchTo);
  b86.branchTo = [87, 98];  // lower starts 87, upper starts 98
}

// Update temple branch path labels to match new tile IDs
// Lower: 87, 99, 100, 101, 102 — labels should be position-based starting from branch+1 = 87
const tLower = [87, 99, 100, 101, 102];
tLower.forEach((id, idx) => {
  const t = board.tiles.find(x => x.i === id);
  if (t) {
    t.displayLabel = `${87 + idx}a`;
    if (idx === tLower.length - 1) t.joinNext = 106;
    else if (idx < tLower.length - 1 && tLower[idx+1] !== id + 1) t.joinNext = tLower[idx+1];
    else delete t.joinNext;
  }
});
// Upper: 98, 103, 104, 105 — labels position-based starting 87b (branch+1)
const tUpper = [98, 103, 104, 105];
tUpper.forEach((id, idx) => {
  const t = board.tiles.find(x => x.i === id);
  if (t) {
    t.displayLabel = `${87 + idx}b`;
    if (idx === tUpper.length - 1) t.joinNext = 106;
    else if (idx < tUpper.length - 1 && tUpper[idx+1] !== id + 1) t.joinNext = tUpper[idx+1];
    else delete t.joinNext;
  }
});

// Convergence 106 → 107 (Giovanni), natural progression
const t106 = board.tiles.find(x => x.i === 106);
if (t106) delete t106.joinNext;

// Branch 75 (was 82) lower 76, 77, 78 (was 83, 84, 85) labels 76a, 77a, 78a
// Upper now 82, 83, 84 (was 89, 90, 91) labels — user wanted these to follow IDs
// Actually wait, what does user want for branch 75 upper labels?
// They said "84a → 77a" which is the lower path of branch 82 (now 75).
// For upper (was 89/90/91 → now 82/83/84), label would follow tile ID per user's pattern: 82b, 83b, 84b
const b75 = board.tiles.find(x => x.i === 75);
if (b75) b75.branchTo = [76, 82];
// Lower 76, 77, 78:
[76, 77, 78].forEach((id, idx) => {
  const t = board.tiles.find(x => x.i === id);
  if (t) {
    t.displayLabel = `${76 + idx}a`;
    if (idx === 2) t.joinNext = 81;
    else delete t.joinNext;
  }
});
// Upper 82, 83, 84:
[82, 83, 84].forEach((id, idx) => {
  const t = board.tiles.find(x => x.i === id);
  if (t) {
    t.displayLabel = `${82 + idx}b`;
    if (idx === 2) t.joinNext = 81;
    else delete t.joinNext;
  }
});
// Convergence 81 — joinNext to 85 to skip past upper
const t81 = board.tiles.find(x => x.i === 81);
if (t81) t81.joinNext = 85;

// Branch 32 — lower 33-38, upper 40-45 (unchanged, all < 72)
// Convergence 39 → joinNext 46 already set

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

console.log('Total tiles:', board.tiles.length);
console.log('Max tile.i:', Math.max(...board.tiles.map(t => t.i)));
console.log('\nLabels on safari upper:', safariUpper.map(id => `${id}=${board.tiles.find(t => t.i === id)?.displayLabel}`).join(', '));
console.log('Labels on branch 75 (formerly 82) lower:', [76,77,78].map(id => `${id}=${board.tiles.find(t => t.i === id)?.displayLabel}`).join(', '));
console.log('Labels on branch 75 upper:', [82,83,84].map(id => `${id}=${board.tiles.find(t => t.i === id)?.displayLabel}`).join(', '));
console.log('Labels on branch 86 lower:', [87,99,100,101,102].map(id => `${id}=${board.tiles.find(t => t.i === id)?.displayLabel}`).join(', '));
console.log('Labels on branch 86 upper:', [98,103,104,105].map(id => `${id}=${board.tiles.find(t => t.i === id)?.displayLabel}`).join(', '));
