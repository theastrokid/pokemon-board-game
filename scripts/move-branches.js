const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// Branches the user wants
const BRANCH_TILES = [32, 56, 82, 93];

// Sensible default branchTo for each — user will fine-tune via editor.
// Each branch points to the next 2 plausible tiles within the same area.
const BRANCH_DEFAULTS = {
  32: { branchTo: [33, 38], labels: ['Lower path', 'Upper path'] },
  56: { branchTo: [57, 62], labels: ['Lower path', 'Upper path'] },
  82: { branchTo: [83, 88], labels: ['Lower path', 'Upper path'] },
  93: { branchTo: [94, 94], labels: ['Path A', 'Path B'] },
};

// Clear existing branches
board.tiles.forEach(t => {
  if (t.type === 'branch') {
    delete t.branchTo;
    delete t.labels;
    t.type = 'pokemon';
  }
  // Also clear joinNext on tiles that were joining the old branches
  if (t.joinNext != null) {
    delete t.joinNext;
  }
});

// Apply new branches
BRANCH_TILES.forEach(i => {
  const t = board.tiles.find(x => x.i === i);
  if (!t) {
    console.warn(`No tile ${i} found`);
    return;
  }
  // Don't overwrite gym tiles
  if (t.type === 'gym') {
    console.warn(`Tile ${i} is a gym, skipping branch assignment`);
    return;
  }
  // Don't overwrite specifics — convert them away
  delete t.speciesId;
  t.type = 'branch';
  t.branchTo = BRANCH_DEFAULTS[i].branchTo;
  t.labels = BRANCH_DEFAULTS[i].labels;
});

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

const branches = board.tiles.filter(t => t.type === 'branch');
console.log(`Branches now at:`, branches.map(t => `tile ${t.i} → ${JSON.stringify(t.branchTo)} (${t.labels.join(' / ')})`).join('\n'));
