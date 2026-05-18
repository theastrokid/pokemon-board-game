#!/usr/bin/env node
// Fill in the 66 Gen 2 Pokemon missing from data/pokemon.json. Uses a
// consistent stat / move template keyed off type so the added mons match
// the existing dex style (one weak basic move + one strong gated move).
//
// Run from project root:  node scripts/add-missing-gen2.js

const fs = require('fs');
const path = require('path');

const DEX_PATH = path.join(__dirname, '..', 'data', 'pokemon.json');

// Move templates by type — { weak: [name, power], strong: [name, power] }
const MOVES = {
  normal:   { weak: ['Tackle', 20],       strong: ['Body Slam', 45] },
  fire:     { weak: ['Ember', 25],        strong: ['Flamethrower', 50] },
  water:    { weak: ['Water Gun', 25],    strong: ['Surf', 50] },
  grass:    { weak: ['Vine Whip', 25],    strong: ['Razor Leaf', 45] },
  electric: { weak: ['Spark', 25],        strong: ['Thunderbolt', 50] },
  ice:      { weak: ['Powder Snow', 25],  strong: ['Ice Beam', 50] },
  fighting: { weak: ['Karate Chop', 25],  strong: ['Cross Chop', 50] },
  poison:   { weak: ['Poison Sting', 20], strong: ['Sludge Bomb', 45] },
  ground:   { weak: ['Mud Slap', 20],     strong: ['Earthquake', 55] },
  flying:   { weak: ['Gust', 25],         strong: ['Aerial Ace', 45] },
  psychic:  { weak: ['Confusion', 25],    strong: ['Psychic', 55] },
  bug:      { weak: ['Bug Bite', 20],     strong: ['Signal Beam', 40] },
  rock:     { weak: ['Rock Throw', 25],   strong: ['Rock Slide', 50] },
  ghost:    { weak: ['Lick', 20],         strong: ['Shadow Ball', 50] },
  dragon:   { weak: ['Twister', 25],      strong: ['Dragon Pulse', 55] },
  dark:     { weak: ['Bite', 25],         strong: ['Crunch', 50] },
  steel:    { weak: ['Metal Claw', 25],   strong: ['Iron Tail', 50] },
  fairy:    { weak: ['Fairy Wind', 25],   strong: ['Dazzling Gleam', 50] },
};

// Build a mon entry from {name, types, hp, primaryMoveType?}
function build(name, types, hp, opts = {}) {
  const primary = opts.primaryMoveType || types[0];
  const secondary = opts.secondaryMoveType || (types[1] && types[1] !== primary ? types[1] : null);
  const weak = MOVES[primary] || MOVES.normal;
  const strong = secondary ? (MOVES[secondary] || MOVES[primary] || MOVES.normal) : weak;
  const moves = [
    { name: weak.weak[0], power: weak.weak[1], type: primary },
    { name: strong.strong[0], power: strong.strong[1], type: secondary || primary, gated: true },
  ];
  return { name, types, hp, moves };
}

// 66 missing Gen 2 entries
const ENTRIES = {
  '152': build('Chikorita',    ['grass'],            45),
  '153': build('Bayleef',      ['grass'],            60),
  '154': build('Meganium',     ['grass'],            80),
  '156': build('Quilava',      ['fire'],             58),
  '159': build('Croconaw',     ['water'],            65),
  '165': build('Ledyba',       ['bug','flying'],     40, { secondaryMoveType:'flying' }),
  '166': build('Ledian',       ['bug','flying'],     55, { secondaryMoveType:'flying' }),
  '170': build('Chinchou',     ['water','electric'], 75, { secondaryMoveType:'electric' }),
  '171': build('Lanturn',      ['water','electric'], 95, { secondaryMoveType:'electric' }),
  '174': build('Igglybuff',    ['normal','fairy'],   90, { secondaryMoveType:'fairy' }),
  '177': build('Natu',         ['psychic','flying'], 40, { secondaryMoveType:'flying' }),
  '178': build('Xatu',         ['psychic','flying'], 65, { secondaryMoveType:'flying' }),
  '180': build('Flaaffy',      ['electric'],         70),
  '182': build('Bellossom',    ['grass'],            75),
  '183': build('Marill',       ['water','fairy'],    70, { secondaryMoveType:'fairy' }),
  '184': build('Azumarill',    ['water','fairy'],   100, { secondaryMoveType:'fairy' }),
  '185': build('Sudowoodo',    ['rock'],             70),
  '186': build('Politoed',     ['water'],            90),
  '187': build('Hoppip',       ['grass','flying'],   35, { secondaryMoveType:'flying' }),
  '188': build('Skiploom',     ['grass','flying'],   55, { secondaryMoveType:'flying' }),
  '189': build('Jumpluff',     ['grass','flying'],   75, { secondaryMoveType:'flying' }),
  '191': build('Sunkern',      ['grass'],            30),
  '192': build('Sunflora',     ['grass'],            75),
  '193': build('Yanma',        ['bug','flying'],     65, { secondaryMoveType:'flying' }),
  '194': build('Wooper',       ['water','ground'],   55, { secondaryMoveType:'ground' }),
  '195': build('Quagsire',     ['water','ground'],   95, { secondaryMoveType:'ground' }),
  '198': build('Murkrow',      ['dark','flying'],    60, { secondaryMoveType:'flying' }),
  '200': build('Misdreavus',   ['ghost'],            60),
  '201': build('Unown',        ['psychic'],          48),
  '202': build('Wobbuffet',    ['psychic'],         190),
  '203': build('Girafarig',    ['normal','psychic'], 70, { secondaryMoveType:'psychic' }),
  '204': build('Pineco',       ['bug'],              50),
  '205': build('Forretress',   ['bug','steel'],      75, { secondaryMoveType:'steel' }),
  '206': build('Dunsparce',    ['normal'],          100),
  '207': build('Gligar',       ['ground','flying'],  65, { secondaryMoveType:'flying' }),
  '208': build('Steelix',      ['steel','ground'],   75, { secondaryMoveType:'ground' }),
  '209': build('Snubbull',     ['fairy'],            60),
  '210': build('Granbull',     ['fairy'],            90),
  '211': build('Qwilfish',     ['water','poison'],   65, { secondaryMoveType:'poison' }),
  '213': build('Shuckle',      ['bug','rock'],       20, { secondaryMoveType:'rock' }),
  '215': build('Sneasel',      ['dark','ice'],       55, { secondaryMoveType:'ice' }),
  '216': build('Teddiursa',    ['normal'],           60),
  '218': build('Slugma',       ['fire'],             40),
  '219': build('Magcargo',     ['fire','rock'],      60, { secondaryMoveType:'rock' }),
  '220': build('Swinub',       ['ice','ground'],     50, { secondaryMoveType:'ground' }),
  '221': build('Piloswine',    ['ice','ground'],     90, { secondaryMoveType:'ground' }),
  '222': build('Corsola',      ['water','rock'],     65, { secondaryMoveType:'rock' }),
  '223': build('Remoraid',     ['water'],            35),
  '224': build('Octillery',    ['water'],            75),
  '225': build('Delibird',     ['ice','flying'],     45, { secondaryMoveType:'flying' }),
  '226': build('Mantine',      ['water','flying'],   85, { secondaryMoveType:'flying' }),
  '227': build('Skarmory',     ['steel','flying'],   65, { secondaryMoveType:'flying' }),
  '228': build('Houndour',     ['dark','fire'],      45, { secondaryMoveType:'fire' }),
  '231': build('Phanpy',       ['ground'],           90),
  '232': build('Donphan',      ['ground'],           90),
  '233': build('Porygon2',     ['normal'],           85),
  '235': build('Smeargle',     ['normal'],           55),
  '236': build('Tyrogue',      ['fighting'],         35),
  '237': build('Hitmontop',    ['fighting'],         50),
  '238': build('Smoochum',     ['ice','psychic'],    45, { secondaryMoveType:'psychic' }),
  '239': build('Elekid',       ['electric'],         45),
  '240': build('Magby',        ['fire'],             45),
  '241': build('Miltank',      ['normal'],           95),
  '242': build('Blissey',      ['normal'],          255),
  '246': build('Larvitar',     ['rock','ground'],    50, { secondaryMoveType:'ground' }),
  '247': build('Pupitar',      ['rock','ground'],    70, { secondaryMoveType:'ground' }),
};

// Patch the file
const raw = fs.readFileSync(DEX_PATH, 'utf8');
const data = JSON.parse(raw);
data.pokemon = data.pokemon || {};

let added = 0;
for (const [id, entry] of Object.entries(ENTRIES)) {
  if (data.pokemon[id]) {
    console.log(`skip #${id} ${entry.name} — already present`);
    continue;
  }
  data.pokemon[id] = entry;
  added++;
}

// Re-sort by numeric id so the file stays browseable
const sorted = {};
Object.keys(data.pokemon)
  .map(Number)
  .sort((a, b) => a - b)
  .forEach(k => { sorted[String(k)] = data.pokemon[String(k)]; });
data.pokemon = sorted;

fs.writeFileSync(DEX_PATH, JSON.stringify(data, null, 2) + '\n');
console.log(`\n✓ Added ${added} missing Gen 2 Pokemon to data/pokemon.json`);
console.log(`  Total dex size: ${Object.keys(data.pokemon).length}`);
