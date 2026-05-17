// Download gym leader trainer sprites (Gen 1 + Giovanni from RBY/FRLG).
// Pure Node. Writes to sprites/trainers/.

const fs = require('node:fs');
const path = require('node:path');

const DIR = path.resolve(__dirname, '..', 'sprites', 'trainers');
fs.mkdirSync(DIR, { recursive: true });

// Pokemon Showdown trainer sprite CDN (Gen 5 BW-style portraits).
const BASE = 'https://play.pokemonshowdown.com/sprites/trainers';

const LEADERS = {
  brock:    'brock.png',
  misty:    'misty.png',
  blaine:   'blaine.png',
  giovanni: 'giovanni.png',
};

async function downloadOne(localId, remoteName) {
  const dest = path.join(DIR, `${localId}.png`);
  if (fs.existsSync(dest)) { console.log(`  skip ${localId}`); return; }
  const url = `${BASE}/${remoteName}`;
  try {
    const res = await fetch(url);
    if (!res.ok) { console.log(`  FAIL ${localId} (${res.status}): ${url}`); return; }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`  got  ${localId}  <- ${remoteName}`);
  } catch (err) { console.log(`  ERR  ${localId}: ${err.message}`); }
}

async function run() {
  for (const [id, remote] of Object.entries(LEADERS)) {
    await downloadOne(id, remote);
  }
}

run().catch(e => { console.error('fatal:', e); process.exit(1); });
