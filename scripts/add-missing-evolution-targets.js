// Adds the missing intermediate / target Pokemon needed so every encounterable
// species in this dex has a working evolution chain. Also downloads their sprites.
// Pure Node. Idempotent: skips entries that already exist.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'pokemon.json');
const FRONT_DIR = path.join(ROOT, 'sprites', 'front');
const BACK_DIR  = path.join(ROOT, 'sprites', 'back');
const STATIC_DIR = path.join(ROOT, 'sprites', 'static');
const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

// Hand-tuned entries matching the dex format (weak + strong move, strong gated).
// HP/power numbers are roughly aligned with neighboring species.
const ADDITIONS = {
  // Gen 1 mids/finals missing
  31: { name: 'Nidoqueen', types: ['poison','ground'], hp: 110, moves: [
    { name: 'Tail Whip', power: 22, type: 'normal' },
    { name: 'Body Slam', power: 50, type: 'normal', gated: true },
  ]},
  34: { name: 'Nidoking', types: ['poison','ground'], hp: 110, moves: [
    { name: 'Horn Attack', power: 22, type: 'normal' },
    { name: 'Megahorn', power: 50, type: 'bug', gated: true },
  ]},
  44: { name: 'Gloom', types: ['grass','poison'], hp: 70, moves: [
    { name: 'Absorb', power: 22, type: 'grass' },
    { name: 'Acid', power: 40, type: 'poison', gated: true },
  ]},
  45: { name: 'Vileplume', types: ['grass','poison'], hp: 95, moves: [
    { name: 'Petal Dance', power: 28, type: 'grass' },
    { name: 'Solar Beam', power: 50, type: 'grass', gated: true },
  ]},
  47: { name: 'Parasect', types: ['bug','grass'], hp: 80, moves: [
    { name: 'Leech Life', power: 24, type: 'bug' },
    { name: 'Spore', power: 42, type: 'grass', gated: true },
  ]},
  49: { name: 'Venomoth', types: ['bug','poison'], hp: 80, moves: [
    { name: 'Gust', power: 22, type: 'flying' },
    { name: 'Psychic', power: 50, type: 'psychic', gated: true },
  ]},
  51: { name: 'Dugtrio', types: ['ground'], hp: 70, moves: [
    { name: 'Scratch', power: 22, type: 'normal' },
    { name: 'Earthquake', power: 50, type: 'ground', gated: true },
  ]},
  55: { name: 'Golduck', types: ['water'], hp: 90, moves: [
    { name: 'Water Gun', power: 24, type: 'water' },
    { name: 'Hydro Pump', power: 50, type: 'water', gated: true },
  ]},
  57: { name: 'Primeape', types: ['fighting'], hp: 85, moves: [
    { name: 'Karate Chop', power: 25, type: 'fighting' },
    { name: 'Cross Chop', power: 50, type: 'fighting', gated: true },
  ]},
  59: { name: 'Arcanine', types: ['fire'], hp: 110, moves: [
    { name: 'Ember', power: 26, type: 'fire' },
    { name: 'Flare Blitz', power: 55, type: 'fire', gated: true },
  ]},
  78: { name: 'Rapidash', types: ['fire'], hp: 90, moves: [
    { name: 'Tackle', power: 25, type: 'normal' },
    { name: 'Fire Blast', power: 52, type: 'fire', gated: true },
  ]},
  89: { name: 'Muk', types: ['poison'], hp: 105, moves: [
    { name: 'Pound', power: 22, type: 'normal' },
    { name: 'Sludge Bomb', power: 50, type: 'poison', gated: true },
  ]},
  97: { name: 'Hypno', types: ['psychic'], hp: 90, moves: [
    { name: 'Confusion', power: 25, type: 'psychic' },
    { name: 'Psychic', power: 50, type: 'psychic', gated: true },
  ]},
  101: { name: 'Electrode', types: ['electric'], hp: 70, moves: [
    { name: 'Spark', power: 24, type: 'electric' },
    { name: 'Explosion', power: 55, type: 'normal', gated: true },
  ]},
  103: { name: 'Exeggutor', types: ['grass','psychic'], hp: 105, moves: [
    { name: 'Egg Bomb', power: 25, type: 'normal' },
    { name: 'Solar Beam', power: 50, type: 'grass', gated: true },
  ]},
  110: { name: 'Weezing', types: ['poison'], hp: 90, moves: [
    { name: 'Tackle', power: 22, type: 'normal' },
    { name: 'Sludge Bomb', power: 48, type: 'poison', gated: true },
  ]},
  139: { name: 'Omastar', types: ['rock','water'], hp: 85, moves: [
    { name: 'Water Gun', power: 24, type: 'water' },
    { name: 'Hydro Pump', power: 50, type: 'water', gated: true },
  ]},
  141: { name: 'Kabutops', types: ['rock','water'], hp: 90, moves: [
    { name: 'Slash', power: 26, type: 'normal' },
    { name: 'Stone Edge', power: 50, type: 'rock', gated: true },
  ]},
  // Gen 2 evolution targets needed for chains
  162: { name: 'Furret', types: ['normal'], hp: 85, moves: [
    { name: 'Scratch', power: 22, type: 'normal' },
    { name: 'Hyper Voice', power: 45, type: 'normal', gated: true },
  ]},
  168: { name: 'Ariados', types: ['bug','poison'], hp: 80, moves: [
    { name: 'Poison Sting', power: 22, type: 'poison' },
    { name: 'Cross Poison', power: 46, type: 'poison', gated: true },
  ]},
  176: { name: 'Togetic', types: ['fairy','flying'], hp: 80, moves: [
    { name: 'Pound', power: 22, type: 'normal' },
    { name: 'Air Slash', power: 48, type: 'flying', gated: true },
  ]},
};

async function downloadOne(url, destPath) {
  if (fs.existsSync(destPath)) return 'skip';
  try {
    const res = await fetch(url);
    if (!res.ok) return 'fail:' + res.status;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    return 'ok';
  } catch (err) { return 'err:' + err.message; }
}

async function run() {
  const json = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const before = Object.keys(json.pokemon).length;
  let added = 0;
  for (const [id, entry] of Object.entries(ADDITIONS)) {
    if (!json.pokemon[id]) { json.pokemon[id] = entry; added++; console.log(`+ ${id} ${entry.name}`); }
    else console.log(`= ${id} ${json.pokemon[id].name} (already present, skipping)`);
  }
  fs.writeFileSync(DATA, JSON.stringify(json, null, 2) + '\n');
  const after = Object.keys(json.pokemon).length;
  console.log(`\nDex: ${before} → ${after} (added ${added})\n`);

  // Download sprites for each new entry
  console.log('Downloading sprites...');
  for (const id of Object.keys(ADDITIONS)) {
    const results = await Promise.all([
      downloadOne(`${BASE}/versions/generation-v/black-white/animated/${id}.gif`, path.join(FRONT_DIR, `${id}.gif`)),
      downloadOne(`${BASE}/versions/generation-v/black-white/animated/back/${id}.gif`, path.join(BACK_DIR, `${id}.gif`)),
      downloadOne(`${BASE}/${id}.png`, path.join(STATIC_DIR, `${id}.png`)),
    ]);
    console.log(`  ${id}: front=${results[0]} back=${results[1]} static=${results[2]}`);
  }
}

run().catch(e => { console.error('fatal:', e); process.exit(1); });
