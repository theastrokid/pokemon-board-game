const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// For each path, set joinNext on every tile that doesn't naturally flow to the next path tile.
// joinNext is only needed when the next path tile is NOT (current + 1).

function wirePathTransitions(pathIds, convergeId) {
  pathIds.forEach((tileId, idx) => {
    const t = board.tiles.find(x => x.i === tileId);
    if (!t) return;
    const nextIdx = idx + 1;
    if (nextIdx < pathIds.length) {
      // Not the last tile; set joinNext if next isn't sequential
      const next = pathIds[nextIdx];
      if (next !== tileId + 1) {
        t.joinNext = next;
      } else {
        delete t.joinNext;
      }
    } else {
      // Last tile in path → converge
      t.joinNext = convergeId;
    }
  });
}

// Branch 32 → converge 39 (skip to 46 after)
wirePathTransitions([33, 34, 35, 36, 37, 38], 39);
wirePathTransitions([40, 41, 42, 43, 44, 45], 39);
const conv39 = board.tiles.find(t => t.i === 39); if (conv39) conv39.joinNext = 46;

// Branch 56 → converge 72
wirePathTransitions([57, 58, 59, 60, 61, 62, 63, 64], 72);
wirePathTransitions([65, 66, 67, 68, 69, 70, 71], 72);

// Branch 82 → converge 88
wirePathTransitions([83, 84, 85], 88);
wirePathTransitions([86, 87], 88);

// Branch 93 → converge 113
wirePathTransitions([94, 95, 96, 97, 98, 103, 106, 107, 108, 109], 113);
wirePathTransitions([99, 100, 101, 102, 105, 110, 111, 112], 113);

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));
console.log('Wired joinNext on all non-sequential branch path transitions.');
console.log('\nTiles with joinNext now:');
board.tiles.filter(t => t.joinNext != null).forEach(t => {
  console.log(`  tile ${t.i} (${t.displayLabel || '-'}) → ${t.joinNext}`);
});
