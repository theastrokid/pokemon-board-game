const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// ============== STEP 1: REVERT MY EARLIER RENAMES ==============
// Reverse compact-renumber: shift everything back to pre-compact IDs.
// Mapping that compact applied:
//   73→72, 74→73, ..., 85→84, 88→85, 89→86, 90→87, 91→88, 92→89, 93→90,
//   94→91, 99→92, 100→93, 105→94, 106→95, 107→96, 108→97, 109→98,
//   110→99, 111→100, 112→101
const reverseCompact = {
  72:73, 73:74, 74:75, 75:76, 76:77, 77:78, 78:79, 79:80, 80:81, 81:82,
  82:83, 83:84, 84:85, 85:88, 86:89, 87:90, 88:91, 89:92, 90:93, 91:94,
  92:99, 93:100, 94:105, 95:106, 96:107, 97:108, 98:109, 99:110, 100:111, 101:112
};

board.tiles.forEach(t => {
  if (reverseCompact[t.i] != null) t.i = reverseCompact[t.i];
  if (Array.isArray(t.branchTo)) t.branchTo = t.branchTo.map(b => reverseCompact[b] != null ? reverseCompact[b] : b);
  if (t.joinNext != null && reverseCompact[t.joinNext] != null) t.joinNext = reverseCompact[t.joinNext];
  if (t.returnTo != null && reverseCompact[t.returnTo] != null) t.returnTo = reverseCompact[t.returnTo];
});
const newPositions = {};
Object.entries(board.tilePositions).forEach(([id, pos]) => {
  const newId = reverseCompact[id] != null ? reverseCompact[id] : Number(id);
  newPositions[newId] = pos;
});
board.tilePositions = newPositions;

// Now reverse rename-tiles.js: 64→72, 99→113, 100→114; restore 86, 87 deletion isn't possible but those slots are free
const reverseRename = { 64:72, 99:113, 100:114 };
board.tiles.forEach(t => {
  if (reverseRename[t.i] != null) t.i = reverseRename[t.i];
  if (Array.isArray(t.branchTo)) t.branchTo = t.branchTo.map(b => reverseRename[b] != null ? reverseRename[b] : b);
  if (t.joinNext != null && reverseRename[t.joinNext] != null) t.joinNext = reverseRename[t.joinNext];
  if (t.returnTo != null && reverseRename[t.returnTo] != null) t.returnTo = reverseRename[t.returnTo];
});
const newPositions2 = {};
Object.entries(board.tilePositions).forEach(([id, pos]) => {
  const newId = reverseRename[id] != null ? reverseRename[id] : Number(id);
  newPositions2[newId] = pos;
});
board.tilePositions = newPositions2;

// Restore safari branch lower path tile 64 (was deleted in rename-tiles).
// Safari branch 56 lower path was originally 57-64 (8 tiles labeled 57a-64a).
// I'll add tile 64 back as 64a in the path before 72 (convergence).
if (!board.tiles.find(t => t.i === 64)) {
  board.tiles.push({
    i: 64, area: 'safari', type: 'pokemon', displayLabel: '64a', joinNext: 72,
  });
  // Position roughly between 63 and 72
  const p63 = board.tilePositions[63];
  const p72 = board.tilePositions[72];
  if (p63 && p72) board.tilePositions[64] = { x: Math.round((p63.x + p72.x) / 2), y: Math.round((p63.y + p72.y) / 2) };
}

// Restore the branch 82 upper at tiles 86, 87 (delete 89-91 from branch use)
// But we deleted 86, 87 earlier. Let's just restore them as basic tiles.
// We left 89, 90, 91 with displayLabels 83b/84b/85b. Need to remove those labels
// and put them back on tiles 86, 87 (only 2 tiles - so 83b, 84b).
// Then redirect branch 82 to [83, 86] and joinNext on 87 = 88.
// Actually let's keep current state: branch 82 upper at 89, 90, 91 (3 tiles). User's pre-revert state had it that way.

// ============== STEP 2: MOVE SAFARI UPPER BRANCH OUT OF WAY ==============
// Safari upper branch tiles are 65-71. Move them to 200-206 to free up 65-71.
const safariUpperShift = { 65:200, 66:201, 67:202, 68:203, 69:204, 70:205, 71:206 };
board.tiles.forEach(t => {
  if (safariUpperShift[t.i] != null) t.i = safariUpperShift[t.i];
  if (Array.isArray(t.branchTo)) t.branchTo = t.branchTo.map(b => safariUpperShift[b] != null ? safariUpperShift[b] : b);
  if (t.joinNext != null && safariUpperShift[t.joinNext] != null) t.joinNext = safariUpperShift[t.joinNext];
});
const newPositions3 = {};
Object.entries(board.tilePositions).forEach(([id, pos]) => {
  const newId = safariUpperShift[id] != null ? safariUpperShift[id] : Number(id);
  newPositions3[newId] = pos;
});
board.tilePositions = newPositions3;

// ============== STEP 3: SUBTRACT 7 FROM TILES >= 72 ==============
const minus7 = {};
board.tiles.forEach(t => {
  if (t.i >= 72 && t.i < 200) minus7[t.i] = t.i - 7;
});

board.tiles.forEach(t => {
  if (minus7[t.i] != null) t.i = minus7[t.i];
  if (Array.isArray(t.branchTo)) t.branchTo = t.branchTo.map(b => minus7[b] != null ? minus7[b] : b);
  if (t.joinNext != null && minus7[t.joinNext] != null) t.joinNext = minus7[t.joinNext];
  if (t.returnTo != null && minus7[t.returnTo] != null) t.returnTo = minus7[t.returnTo];
});
const newPositions4 = {};
Object.entries(board.tilePositions).forEach(([id, pos]) => {
  const newId = minus7[id] != null ? minus7[id] : Number(id);
  newPositions4[newId] = pos;
});
board.tilePositions = newPositions4;

// ============== STEP 4: UPDATE DISPLAY LABELS TO MATCH NEW TILE IDS ==============
// Branch path tiles get displayLabel = `${newTileID}${a|b}` based on which branch arm they're in.
// Determine branch arms from current branchTo structure:
const branches = board.tiles.filter(t => t.type === 'branch');
branches.forEach(branch => {
  const [lowerStart, upperStart] = branch.branchTo;
  // Walk lower path until convergence
  const walkPath = (startId) => {
    const visited = new Set();
    const path = [];
    let cur = startId;
    let safety = 50;
    while (cur != null && !visited.has(cur) && safety-- > 0) {
      visited.add(cur);
      const t = board.tiles.find(x => x.i === cur);
      if (!t) break;
      path.push(t);
      if (t.joinNext != null) break;  // last in path (joins convergence)
      cur = cur + 1;
    }
    return path;
  };
  const lowerPath = walkPath(lowerStart);
  const upperPath = walkPath(upperStart);
  lowerPath.forEach(t => { t.displayLabel = `${t.i}a`; });
  upperPath.forEach(t => { t.displayLabel = `${t.i}b`; });
});

// Sort tiles
board.tiles.sort((a, b) => a.i - b.i);

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

console.log('Total tiles:', board.tiles.length);
console.log('Max tile.i:', Math.max(...board.tiles.map(t => t.i)));
console.log('\nGyms:');
board.tiles.filter(t => t.type === 'gym').forEach(t => console.log(`  ${t.i}: ${t.leader}`));
console.log('\nBranches:');
board.tiles.filter(t => t.type === 'branch').forEach(t => console.log(`  ${t.i}: branchTo ${JSON.stringify(t.branchTo)}`));
console.log('\nSpot check user examples:');
[65, 66, 77].forEach(i => {
  const t = board.tiles.find(x => x.i === i);
  console.log(`  tile ${i}: ${t ? `type=${t.type}, label=${t.displayLabel || 'none'}${t.speciesId ? ', species=' + t.speciesId : ''}${t.leader ? ', leader=' + t.leader : ''}` : 'MISSING'}`);
});
