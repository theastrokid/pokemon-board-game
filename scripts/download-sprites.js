// Download Pokemon sprites (Gen 1 + Gen 2, IDs 1-251) from PokeAPI sprites repo.
// Pure Node (no deps). Uses Node 24 built-in fetch. Parallel batches of 20.
// Skips existing files. Logs 404s and continues.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SPRITES_DIR = path.join(ROOT, 'sprites');
const FRONT_DIR = path.join(SPRITES_DIR, 'front');
const BACK_DIR = path.join(SPRITES_DIR, 'back');
const STATIC_DIR = path.join(SPRITES_DIR, 'static');

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const FRONT_URL = (id) => `${BASE}/versions/generation-v/black-white/animated/${id}.gif`;
const BACK_URL  = (id) => `${BASE}/versions/generation-v/black-white/animated/back/${id}.gif`;
const STATIC_URL = (id) => `${BASE}/${id}.png`;

const MAX_ID = 251;
const BATCH_SIZE = 20;

for (const dir of [SPRITES_DIR, FRONT_DIR, BACK_DIR, STATIC_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const counters = { downloaded: 0, skipped: 0, failed: 0, notFound: 0 };

async function downloadOne(url, destPath, label) {
  if (fs.existsSync(destPath)) {
    counters.skipped++;
    return;
  }
  try {
    const res = await fetch(url);
    if (res.status === 404) {
      counters.notFound++;
      console.log(`  404 ${label}: ${url}`);
      return;
    }
    if (!res.ok) {
      counters.failed++;
      console.log(`  FAIL ${label} status ${res.status}: ${url}`);
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    counters.downloaded++;
  } catch (err) {
    counters.failed++;
    console.log(`  ERR ${label}: ${err.message}`);
  }
}

async function downloadForId(id) {
  await Promise.all([
    downloadOne(FRONT_URL(id),  path.join(FRONT_DIR,  `${id}.gif`), `front #${id}`),
    downloadOne(BACK_URL(id),   path.join(BACK_DIR,   `${id}.gif`), `back  #${id}`),
    downloadOne(STATIC_URL(id), path.join(STATIC_DIR, `${id}.png`), `static #${id}`),
  ]);
}

async function run() {
  const start = Date.now();
  const ids = Array.from({ length: MAX_ID }, (_, i) => i + 1);

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(downloadForId));
    const lastId = batch[batch.length - 1];
    // Progress every 25 Pokemon (or final batch)
    if (lastId % 25 === 0 || lastId === MAX_ID) {
      console.log(
        `Progress: through #${lastId} | downloaded=${counters.downloaded} skipped=${counters.skipped} 404=${counters.notFound} failed=${counters.failed}`
      );
    }
  }

  const seconds = ((Date.now() - start) / 1000).toFixed(1);

  // Compute on-disk size of sprites/
  let totalBytes = 0;
  let totalFiles = 0;
  for (const dir of [FRONT_DIR, BACK_DIR, STATIC_DIR]) {
    for (const f of fs.readdirSync(dir)) {
      const stat = fs.statSync(path.join(dir, f));
      totalBytes += stat.size;
      totalFiles++;
    }
  }
  const mb = (totalBytes / (1024 * 1024)).toFixed(2);

  console.log('\n=== DONE ===');
  console.log(`Elapsed:        ${seconds}s`);
  console.log(`Downloaded:     ${counters.downloaded}`);
  console.log(`Skipped:        ${counters.skipped}`);
  console.log(`404 (missing):  ${counters.notFound}`);
  console.log(`Failed:         ${counters.failed}`);
  console.log(`Files on disk:  ${totalFiles}`);
  console.log(`Disk size:      ${totalBytes} bytes (${mb} MB)`);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
