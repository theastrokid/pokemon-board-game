#!/usr/bin/env node
// Balance pass:
//   1. HP audit — boost the canonically-tanky Pokemon that were too low
//      because our system only has HP (no defense stat). Shuckle's 230+230
//      defense should translate to "high HP" in this engine.
//   2. Print which evolutions are missing from items.js for reference.
//
// Run from project root:  node scripts/balance-pass-1.js

const fs = require('fs');
const path = require('path');

const DEX_PATH = path.join(__dirname, '..', 'data', 'pokemon.json');
const dex = JSON.parse(fs.readFileSync(DEX_PATH, 'utf8'));

// HP overrides — id → new HP. Rationale appended in comment.
const HP_FIXES = {
  113: 200, // Chansey: real 250 HP, classic HP wall
  131: 130, // Lapras: real 130 HP
  143: 160, // Snorlax: real 160 HP
  202: 200, // Wobbuffet: real 190 HP — slight bump for special def
  205: 100, // Forretress: real 75 HP + 140 def → ~100 in HP-only system
  208: 120, // Steelix: real 75 HP + 200 def → ~120
  213: 140, // Shuckle: real 20 HP but 460 combined def → high HP tank here
  219:  85, // Magcargo: real 60 HP + 120 def → 85
  227: 100, // Skarmory: real 65 HP + 140 def → 100
};

let changed = 0;
for (const [id, hp] of Object.entries(HP_FIXES)) {
  const p = dex.pokemon[id];
  if (!p) { console.log(`skip #${id} — not in dex`); continue; }
  const before = p.hp;
  p.hp = hp;
  console.log(`#${id.padStart(3,' ')} ${p.name.padEnd(15)} HP ${before} → ${hp}`);
  changed++;
}

fs.writeFileSync(DEX_PATH, JSON.stringify(dex, null, 2) + '\n');
console.log(`\n✓ Updated ${changed} entries in data/pokemon.json`);
