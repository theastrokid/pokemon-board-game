const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// Helper to remap tile IDs using a mapping table
function applyMap(map) {
  board.tiles.forEach(t => {
    if (map[t.i] != null) t.i = map[t.i];
    if (Array.isArray(t.branchTo)) t.branchTo = t.branchTo.map(b => map[b] != null ? map[b] : b);
    if (t.joinNext != null && map[t.joinNext] != null) t.joinNext = map[t.joinNext];
    if (t.returnTo != null && map[t.returnTo] != null) t.returnTo = map[t.returnTo];
  });
  const newPositions = {};
  Object.entries(board.tilePositions).forEach(([id, pos]) => {
    const newId = map[id] != null ? map[id] : Number(id);
    newPositions[newId] = pos;
  });
  board.tilePositions = newPositions;
}

// =============== STEP 1: Delete tile 64 (64a) ===============
board.tiles = board.tiles.filter(t => t.i !== 64);
delete board.tilePositions[64];

// =============== STEP 2: Shift 65-74 down by 1 ===============
const shift1 = {};
for (let i = 65; i <= 74; i++) shift1[i] = i - 1;
applyMap(shift1);
// 64 (Snorlax) joinNext was 65; after shift, 65 became 64. So joinNext on 64 self-pointing is bad.
// The Snorlax convergence's joinNext was set to skip past upper safari. Let me reset.
const tile64 = board.tiles.find(t => t.i === 64);
if (tile64) delete tile64.joinNext;  // 64 → 65 naturally (next sequential)

// =============== STEP 3: Move upper branch 75 tiles to 209-211 ===============
// Currently after shift: tile 75 is branch, lower 76,77,78, upper was 82,83,84
// Move upper 82,83,84 to 209,210,211 with labels 76b/77b/78b
const moveUpper = { 82: 209, 83: 210, 84: 211 };
applyMap(moveUpper);

// Update branch 75 branchTo to point to new upper start
const b75 = board.tiles.find(t => t.i === 75);
if (b75) b75.branchTo = [76, 209];

// Update labels on the moved upper tiles
const u209 = board.tiles.find(t => t.i === 209);
const u210 = board.tiles.find(t => t.i === 210);
const u211 = board.tiles.find(t => t.i === 211);
if (u209) { u209.displayLabel = '76b'; delete u209.joinNext; }
if (u210) { u210.displayLabel = '77b'; delete u210.joinNext; }
if (u211) { u211.displayLabel = '78b'; u211.joinNext = 81; }  // last upper joins convergence

// =============== STEP 4: Rename 207 -> 79, 208 -> 80 (extend lower path) ===============
const renameNew = { 207: 79, 208: 80 };
applyMap(renameNew);

// Update labels and joinNext for the extended lower path
const t79 = board.tiles.find(t => t.i === 79);
const t80 = board.tiles.find(t => t.i === 80);
if (t79) { t79.displayLabel = '79a'; t79.area = 'temple'; delete t79.joinNext; }
if (t80) { t80.displayLabel = '80a'; t80.area = 'temple'; t80.joinNext = 81; }  // last lower joins convergence

// Lower path 76,77,78,79,80 - update existing labels and joinNexts
const t76 = board.tiles.find(t => t.i === 76);
const t77 = board.tiles.find(t => t.i === 77);
const t78 = board.tiles.find(t => t.i === 78);
if (t76) { t76.displayLabel = '76a'; delete t76.joinNext; }
if (t77) { t77.displayLabel = '77a'; delete t77.joinNext; }
if (t78) { t78.displayLabel = '78a'; delete t78.joinNext; }  // now sequential to 79

// =============== STEP 5: Shift 85+ down by 3 (to fill upper branch gap 82-84) ===============
// Currently tiles 85-107 (after earlier shifts, 207/208 already renamed).
// After shifting 85+ down by 3: tile 85 (fainted) → 82, etc.
const shift3 = {};
board.tiles.forEach(t => {
  if (t.i >= 85 && t.i < 200) shift3[t.i] = t.i - 3;
});
applyMap(shift3);

// =============== STEP 6: Update branch 83 (was 86) and its paths ===============
// Branch 83 (was 86): lower was 87, 99-102; upper was 98, 103-105
// After -3 shift: lower 84, 96-99; upper 95, 100-102
// Convergence was 106 → now 103
// Giovanni was 107 → now 104

const b83 = board.tiles.find(t => t.i === 83);
if (b83 && b83.type === 'branch') {
  b83.branchTo = [84, 95];
}

// Update labels for branch 83 paths (position-based starting at branch+1 = 84)
const lowerB83 = [84, 96, 97, 98, 99];
lowerB83.forEach((id, idx) => {
  const t = board.tiles.find(x => x.i === id);
  if (t) {
    t.displayLabel = `${84 + idx}a`;
    if (idx === 0) t.joinNext = 96;  // 84 (pokemon) → joinNext 96 (next lower)
    else if (idx === lowerB83.length - 1) t.joinNext = 103;
    else delete t.joinNext;
  }
});

const upperB83 = [95, 100, 101, 102];
upperB83.forEach((id, idx) => {
  const t = board.tiles.find(x => x.i === id);
  if (t) {
    t.displayLabel = `${84 + idx}b`;
    if (idx === 0) t.joinNext = 100;  // 95 (fainted) → joinNext 100
    else if (idx === upperB83.length - 1) t.joinNext = 103;
    else delete t.joinNext;
  }
});

// Sort tiles
board.tiles.sort((a, b) => a.i - b.i);

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

// Verification
console.log('Total tiles:', board.tiles.length);
console.log('Max tile.i:', Math.max(...board.tiles.map(t => t.i)));
console.log('\nGyms:');
board.tiles.filter(t => t.type === 'gym').forEach(t => console.log(`  ${t.i}: ${t.leader}`));
console.log('\nBranches:');
board.tiles.filter(t => t.type === 'branch').forEach(t => console.log(`  ${t.i}: branchTo ${JSON.stringify(t.branchTo)}`));

console.log('\nSpot checks (user spec):');
[64, 75, 79, 80, 82, 209, 210, 211].forEach(i => {
  const t = board.tiles.find(x => x.i === i);
  console.log(`  tile ${i}: ${t ? `type=${t.type}${t.displayLabel ? ', label='+t.displayLabel : ''}${t.leader ? ', leader='+t.leader : ''}${t.speciesId ? ', species='+t.speciesId : ''}` : 'MISSING'}`);
});

// Gaps
const ids = board.tiles.map(t => t.i);
const gaps = [];
for (let i = 0; i <= Math.max(...ids); i++) {
  if (!ids.includes(i)) gaps.push(i);
}
console.log('\nGaps:', gaps);
