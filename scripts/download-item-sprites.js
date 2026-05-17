// Download item + pokeball sprites from PokeAPI sprites repo.
// Pure Node, no deps. Writes to sprites/items/.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'sprites', 'items');
fs.mkdirSync(DIR, { recursive: true });

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';

// Map our internal item ids to PokeAPI item sprite names.
const ITEMS = {
  rare_candy:    'rare-candy.png',
  potion:        'potion.png',
  super_potion:  'super-potion.png',
  hyper_potion:  'hyper-potion.png',
  revive:        'revive.png',
  max_revive:    'max-revive.png',
  lucky_egg:     'lucky-egg.png',
  x2_attack:     'x-attack.png',
  x2_defense:    'x-defense.png',
  pokeball:      'poke-ball.png',
  greatball:     'great-ball.png',
  ultraball:     'ultra-ball.png',
  masterball:    'master-ball.png',
};

const counters = { downloaded: 0, skipped: 0, failed: 0 };

async function downloadOne(localId, remoteName) {
  const dest = path.join(DIR, `${localId}.png`);
  if (fs.existsSync(dest)) {
    counters.skipped++;
    console.log(`  skip ${localId}`);
    return;
  }
  const url = `${BASE}/${remoteName}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      counters.failed++;
      console.log(`  FAIL ${localId} (${res.status}): ${url}`);
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    counters.downloaded++;
    console.log(`  got  ${localId}  <- ${remoteName}`);
  } catch (err) {
    counters.failed++;
    console.log(`  ERR  ${localId}: ${err.message}`);
  }
}

async function run() {
  console.log(`Downloading ${Object.keys(ITEMS).length} item sprites to ${DIR}\n`);
  const entries = Object.entries(ITEMS);
  for (let i = 0; i < entries.length; i += 5) {
    await Promise.all(entries.slice(i, i + 5).map(([id, remote]) => downloadOne(id, remote)));
  }
  console.log(`\nDone. downloaded=${counters.downloaded} skipped=${counters.skipped} failed=${counters.failed}`);
}

run().catch(err => { console.error('fatal:', err); process.exit(1); });
