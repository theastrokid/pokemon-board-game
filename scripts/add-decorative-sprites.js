const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

// Decorative animated sprites placed on top of the board at positions where the
// original board art had static Pokemon sprites. Pokemon chosen to match the
// region the sprite sits in. Positions in image-pixel space (1200x1200).
// Sprite is rendered ~80x80 centered on (x, y).
board.decorativeSprites = [
  // === ANCIENT TEMPLE (top) — legendaries and rare dragons ===
  { x: 670, y: 80,  speciesId: 149, region: 'temple' }, // Dragonite (top)
  { x: 1100, y: 80, speciesId: 250, region: 'temple' }, // Ho-Oh (top right)
  { x: 990, y: 175, speciesId: 144, region: 'temple' }, // Articuno (ice tile area)
  { x: 370, y: 175, speciesId: 146, region: 'temple' }, // Moltres (lava tile area)
  { x: 580, y: 280, speciesId: 150, region: 'temple' }, // Mewtwo (middle)
  { x: 870, y: 280, speciesId: 151, region: 'temple' }, // Mew (next to Mewtwo)
  { x: 1100, y: 280, speciesId: 249, region: 'temple' },// Lugia (top right area)
  { x: 1130, y: 425, speciesId: 244, region: 'temple' },// Entei (Blaine area)

  // === SAFARI ZONE (middle, sand) — wild creatures ===
  { x: 540, y: 540, speciesId: 15,  region: 'safari' }, // Beedrill
  { x: 620, y: 540, speciesId: 113, region: 'safari' }, // Chansey
  { x: 700, y: 540, speciesId: 107, region: 'safari' }, // Hitmonchan
  { x: 780, y: 540, speciesId: 115, region: 'safari' }, // Kangaskhan
  { x: 855, y: 540, speciesId: 1,   region: 'safari' }, // Bulbasaur (wild appearance)
  { x: 1090, y: 480, speciesId: 41, region: 'safari' }, // Zubat
  { x: 1100, y: 760, speciesId: 95, region: 'safari' }, // Onix
  { x: 310, y: 660, speciesId: 54,  region: 'safari' }, // Psyduck on sand
  { x: 460, y: 690, speciesId: 74,  region: 'safari' }, // Geodude

  // === SEAFOAM ISLANDS (lower middle, water) ===
  { x: 385, y: 870, speciesId: 116, region: 'seafoam' }, // Horsea
  { x: 465, y: 870, speciesId: 73,  region: 'seafoam' }, // Tentacruel
  { x: 545, y: 870, speciesId: 62,  region: 'seafoam' }, // Poliwrath
  { x: 625, y: 870, speciesId: 9,   region: 'seafoam' }, // Blastoise
  { x: 780, y: 950, speciesId: 120, region: 'seafoam' }, // Staryu
  { x: 870, y: 1020,speciesId: 98,  region: 'seafoam' }, // Krabby
  { x: 1100, y: 940,speciesId: 130, region: 'seafoam' }, // Gyarados
  { x: 700, y: 1020,speciesId: 7,   region: 'seafoam' }, // Squirtle

  // === PALLET TOWN (bottom, green grass) ===
  { x: 95,  y: 1180, speciesId: 25,  region: 'pallet' }, // Pikachu
  { x: 230, y: 1180, speciesId: 4,   region: 'pallet' }, // Charmander
  { x: 320, y: 1180, speciesId: 133, region: 'pallet' }, // Eevee
  { x: 1080, y: 1180,speciesId: 15,  region: 'pallet' }, // Beedrill
  { x: 1175, y: 1180,speciesId: 113, region: 'pallet' }, // Chansey
  { x: 940, y: 1180, speciesId: 1,   region: 'pallet' }, // Bulbasaur
];

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));
console.log(`Added ${board.decorativeSprites.length} decorative sprite positions`);
console.log('By region:');
const byRegion = {};
board.decorativeSprites.forEach(s => { byRegion[s.region] = (byRegion[s.region] || 0) + 1; });
Object.entries(byRegion).forEach(([r, c]) => console.log(`  ${r}: ${c}`));
