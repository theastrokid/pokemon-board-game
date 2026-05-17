const fs = require('fs');
const board = JSON.parse(fs.readFileSync('data/board.json', 'utf8'));

const LEGENDARIES = [144, 145, 146, 147, 148, 149, 150, 151, 243, 244, 245, 248, 249, 250, 251];

// PALLET: remove Spearow(21), Clefairy(35), Cleffa(173). Add Geodude(74).
// Weights: Bulbasaur(1), Charmander(4), Squirtle(7), Pikachu(25), Pichu(172), Togepi(175) → 100 (2x baseline of 50)
// Eevee(133) → 150 (3x baseline)
// All others → 50 baseline
// Legendaries → 1 each (wildcard ~1% total)
const palletBase = [10, 13, 16, 19, 23, 27, 39, 52, 56, 69, 74, 161, 163, 167]; // 14 species at 50
const palletDoubled = [1, 4, 7, 25, 172, 175]; // 6 species at 100
const palletTriple = [133]; // Eevee at 150
const palletEncounters = [
  ...palletDoubled.map(id => ({ id, weight: 100 })),
  ...palletTriple.map(id => ({ id, weight: 150 })),
  ...palletBase.map(id => ({ id, weight: 50 })),
  ...LEGENDARIES.map(id => ({ id, weight: 1 })),
];
board.areas.pallet.encounters = palletEncounters;

// SEAFOAM: keep current 19 species at 100 each + legendaries 1 each
const seafoamSpecies = [7, 8, 98, 116, 120, 72, 60, 61, 129, 86, 87, 90, 91, 118, 54, 79, 81, 134, 230];
board.areas.seafoam.encounters = [
  ...seafoamSpecies.map(id => ({ id, weight: 100 })),
  ...LEGENDARIES.map(id => ({ id, weight: 1 })),
];

// SAFARI: keep current 22 species at 100 each + legendaries 1 each
const safariSpecies = [15, 113, 106, 107, 115, 111, 112, 128, 127, 123, 214, 234, 190, 196, 197, 41, 42, 74, 95, 104, 108, 217];
board.areas.safari.encounters = [
  ...safariSpecies.map(id => ({ id, weight: 100 })),
  ...LEGENDARIES.map(id => ({ id, weight: 1 })),
];

// TEMPLE: unchanged (already all legendaries, uniform)
board.areas.temple.encounters = LEGENDARIES.map(id => ({ id, weight: 100 }));

fs.writeFileSync('data/board.json', JSON.stringify(board, null, 2));

// Verification
function computePcts(encounters) {
  const total = encounters.reduce((s, e) => s + e.weight, 0);
  return encounters.map(e => ({ id: e.id, weight: e.weight, pct: (e.weight / total * 100).toFixed(2) + '%' }));
}

console.log('=== PALLET (' + board.areas.pallet.encounters.length + ' species) ===');
const palletPcts = computePcts(board.areas.pallet.encounters);
palletPcts.forEach(p => console.log(`  ${p.id}: w=${p.weight} → ${p.pct}`));
const legTotal = palletPcts.filter(p => LEGENDARIES.includes(p.id)).reduce((s, p) => s + parseFloat(p.pct), 0);
console.log(`  Combined legendary: ${legTotal.toFixed(2)}%`);
console.log('\n=== SEAFOAM legendary total ===');
const seaPcts = computePcts(board.areas.seafoam.encounters);
console.log('  Combined legendary:', seaPcts.filter(p => LEGENDARIES.includes(p.id)).reduce((s, p) => s + parseFloat(p.pct), 0).toFixed(2) + '%');
console.log('=== SAFARI legendary total ===');
const safPcts = computePcts(board.areas.safari.encounters);
console.log('  Combined legendary:', safPcts.filter(p => LEGENDARIES.includes(p.id)).reduce((s, p) => s + parseFloat(p.pct), 0).toFixed(2) + '%');
