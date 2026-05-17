const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// ============== BRANCH 82 RESTRUCTURE ==============
// Move upper path from [86, 87] to [89, 90, 91]. Delete 86, 87. Keep 89/90/91 types.
// joinNext on 88 = 92 so after convergence we skip the upper-branch tiles.
{
  // Delete tiles 86 and 87 + their positions
  board.tiles = board.tiles.filter(t => t.i !== 86 && t.i !== 87);
  delete board.tilePositions[86];
  delete board.tilePositions[87];

  // Update branch 82
  const b82 = board.tiles.find(t => t.i === 82);
  if (b82) b82.branchTo = [83, 89];

  // Lower path labels (83-85) stay as 83a, 84a, 85a
  // Set joinNext on 85 = 88 (lower last)
  const t85 = board.tiles.find(t => t.i === 85);
  if (t85) t85.joinNext = 88;

  // Upper path: 89 (83b), 90 (84b), 91 (85b) — keep existing types
  const t89 = board.tiles.find(t => t.i === 89);
  const t90 = board.tiles.find(t => t.i === 90);
  const t91 = board.tiles.find(t => t.i === 91);
  if (t89) { t89.displayLabel = '83b'; delete t89.joinNext; }
  if (t90) { t90.displayLabel = '84b'; delete t90.joinNext; }
  if (t91) { t91.displayLabel = '85b'; t91.joinNext = 88; }

  // Convergence is tile 88. joinNext on 88 = 92 to skip past upper branch.
  const t88 = board.tiles.find(t => t.i === 88);
  if (t88) t88.joinNext = 92;
}

// ============== RENUMBER 72 -> 64 ==============
// Delete old tile 64 (the 64a lower-end of safari branch), rename 72 -> 64.
// Safari branch 56 lower becomes 57-63 (7 tiles), convergence becomes 64 (Snorlax).
{
  // Delete old tile 64 and its position
  board.tiles = board.tiles.filter(t => t.i !== 64);
  delete board.tilePositions[64];

  // Rename tile 72 to 64
  const t72 = board.tiles.find(t => t.i === 72);
  if (t72) {
    t72.i = 64;
    // Move position
    if (board.tilePositions[72]) {
      board.tilePositions[64] = board.tilePositions[72];
      delete board.tilePositions[72];
    }
  }

  // Last lower tile (63) joinNext = 64 (new convergence)
  const t63 = board.tiles.find(t => t.i === 63);
  if (t63) t63.joinNext = 64;
  // 64 is now convergence. Natural next would be 65 (upper branch), so joinNext = 73 to skip
  const t64 = board.tiles.find(t => t.i === 64);
  if (t64) t64.joinNext = 73;
  // Last upper tile (71) joinNext = 64
  const t71 = board.tiles.find(t => t.i === 71);
  if (t71) t71.joinNext = 64;
}

// ============== RENUMBER 113 -> 99, 114 -> 100 ==============
{
  // No collision since 99 and 100 are unused (95-104 were deleted earlier)
  const renameMap = { 113: 99, 114: 100 };
  Object.entries(renameMap).forEach(([oldId, newId]) => {
    const t = board.tiles.find(x => x.i === Number(oldId));
    if (t) {
      t.i = Number(newId);
      if (board.tilePositions[oldId]) {
        board.tilePositions[newId] = board.tilePositions[oldId];
        delete board.tilePositions[oldId];
      }
    }
  });

  // Update any joinNext or branchTo pointers to renamed tiles
  board.tiles.forEach(t => {
    if (t.joinNext === 113) t.joinNext = 99;
    if (t.joinNext === 114) t.joinNext = 100;
    if (Array.isArray(t.branchTo)) {
      t.branchTo = t.branchTo.map(b => b === 113 ? 99 : b === 114 ? 100 : b);
    }
  });
}

// ============== ADJUST AREA BOUNDARIES ==============
// Temple now ends at 100 (Giovanni). Update area for tiles 105-112 (still in temple range).
// They were already temple; just verify.

// Sort tiles by ID for cleaner JSON
board.tiles.sort((a, b) => a.i - b.i);

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

// Verification
console.log('Total tiles:', board.tiles.length);
console.log('Max tile.i:', Math.max(...board.tiles.map(t => t.i)));
console.log('\nBranches:');
board.tiles.filter(t => t.type === 'branch').forEach(t => console.log(`  ${t.i}: branchTo ${JSON.stringify(t.branchTo)}`));
console.log('\nGyms:');
board.tiles.filter(t => t.type === 'gym').forEach(t => console.log(`  ${t.i}: ${t.leader}`));
console.log('\nTiles with joinNext:');
board.tiles.filter(t => t.joinNext != null).forEach(t => console.log(`  ${t.i} (${t.displayLabel || '-'}) → ${t.joinNext}`));
console.log('\nDisplayLabels on relabeled tiles:');
[89, 90, 91, 64, 99, 100].forEach(i => {
  const t = board.tiles.find(x => x.i === i);
  console.log(`  tile ${i}: type=${t?.type}, label=${t?.displayLabel || 'none'}, ${t?.leader ? 'leader=' + t.leader : ''}${t?.speciesId ? ' species=' + t.speciesId : ''}`);
});
