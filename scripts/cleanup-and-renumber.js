const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// 1) Delete orphan tiles
const toDelete = [95, 100, 101, 102];
board.tiles = board.tiles.filter(t => !toDelete.includes(t.i));
toDelete.forEach(i => delete board.tilePositions[i]);

// 2) Build renumber map: shift tile IDs >= 75 down by 1 (excluding 200+ upper which also shift)
// Range to shift: 75-99 and 200-211. After delete of 95, 100-102, remaining IDs in 75-99 are 75-90, 96-99.
// Goal: 75→74, 76→75, ..., 90→89, 96→95, 97→96, 98→97, 99→98
// For 209-211 (now that 200-208 was just 200-206 + 209-211): shift to 208, 209, 210
const ids = board.tiles.map(t => t.i).sort((a, b) => a - b);
const map = {};
ids.forEach(id => {
  if (id >= 75 && id <= 199) {
    map[id] = id - 1;
  } else if (id >= 209 && id <= 211) {
    map[id] = id - 1;
  }
});

// Apply
board.tiles.forEach(t => {
  if (map[t.i] != null) t.i = map[t.i];
  if (Array.isArray(t.branchTo)) t.branchTo = t.branchTo.map(b => map[b] != null ? map[b] : b);
  if (t.joinNext != null && map[t.joinNext] != null) t.joinNext = map[t.joinNext];
  if (t.returnTo != null && map[t.returnTo] != null) t.returnTo = map[t.returnTo];
});
const newPos = {};
Object.entries(board.tilePositions).forEach(([id, p]) => {
  const newId = map[id] != null ? map[id] : Number(id);
  newPos[newId] = p;
});
board.tilePositions = newPos;

// 3) Re-label branch paths with new IDs
// Branch 74 (was 75): lower 75-79 (was 76-80), upper 208-210 (was 209-211)
const b74 = board.tiles.find(t => t.i === 74);
if (b74 && b74.type === 'branch') {
  b74.branchTo = [75, 208];
  // Lower path: tiles 75, 76, 77, 78, 79 — sequential, labels match IDs
  [75, 76, 77, 78, 79].forEach((id, idx) => {
    const t = board.tiles.find(x => x.i === id);
    if (t) t.displayLabel = `${75 + idx}a`;
  });
  // Set joinNext on tile 79 → 80 (convergence trade tile, was 81→80)
  const t79 = board.tiles.find(x => x.i === 79);
  if (t79) t79.joinNext = 80;
  // Upper path: tiles 208, 209, 210 — labels position-based (75b, 76b, 77b)
  [208, 209, 210].forEach((id, idx) => {
    const t = board.tiles.find(x => x.i === id);
    if (t) t.displayLabel = `${75 + idx}b`;
  });
  // Last upper tile 210 joinNext → 80 (convergence)
  const t210 = board.tiles.find(x => x.i === 210);
  if (t210) t210.joinNext = 80;
}

// 4) Convergence at 80 (was 81, trade) → joinNext 81 (was 82 fainted) — preserved by shift
// Tile 83 (was 84 with label 84a) is now after the branch path, no longer in a/b labeling
const t83 = board.tiles.find(x => x.i === 83);
if (t83) { delete t83.displayLabel; delete t83.joinNext; }
// Lower-83 group (tiles 95-98 after shift, was 96-99) — they're not part of any branch anymore
// since 95-102 orphans were deleted. They're just sequential temple tiles now.
[95, 96, 97, 98].forEach(id => {
  const t = board.tiles.find(x => x.i === id);
  if (t) { delete t.displayLabel; }
});
// Tile 98 (was 99, had joinNext 89 → now 88)
const t98 = board.tiles.find(x => x.i === 98);
if (t98 && t98.joinNext != null) t98.joinNext = 88;

// Tile 73 still has joinNext bridge to 75 — should now bridge to 74
const t73 = board.tiles.find(x => x.i === 73);
if (t73 && t73.joinNext === 75) t73.joinNext = 74;

// Sort
board.tiles.sort((a, b) => a.i - b.i);
fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

// Report
console.log('Total tiles:', board.tiles.length);
console.log('Max tile.i:', Math.max(...board.tiles.map(t => t.i)));
console.log('\nBranches:');
board.tiles.filter(t => t.type === 'branch').forEach(t => console.log(`  ${t.i}: branchTo ${JSON.stringify(t.branchTo)}`));
console.log('\nGyms:');
board.tiles.filter(t => t.type === 'gym').forEach(t => console.log(`  ${t.i}: ${t.leader}`));
console.log('\nFainted with returnTo:');
board.tiles.filter(t => t.type === 'fainted' && t.returnTo != null).forEach(t => console.log(`  ${t.i} → returns to ${t.returnTo}`));

// Gap check
const ids2 = board.tiles.map(t => t.i).sort((a, b) => a - b);
const gaps = [];
for (let i = 0; i < ids2[ids2.length - 1]; i++) {
  if (!ids2.includes(i)) gaps.push(i);
}
console.log('\nGaps remaining:', gaps.join(', ') || 'none');
