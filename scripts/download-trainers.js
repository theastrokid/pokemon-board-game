const fs = require('fs');
const path = require('path');
const trainers = [
  { name: 'red',     url: 'https://play.pokemonshowdown.com/sprites/trainers/red.png' },
  { name: 'leaf',    url: 'https://play.pokemonshowdown.com/sprites/trainers/leaf.png' },
  { name: 'ethan',   url: 'https://play.pokemonshowdown.com/sprites/trainers/ethan.png' },
  { name: 'lyra',    url: 'https://play.pokemonshowdown.com/sprites/trainers/lyra.png' },
  { name: 'brendan', url: 'https://play.pokemonshowdown.com/sprites/trainers/brendan.png' },
  { name: 'may',     url: 'https://play.pokemonshowdown.com/sprites/trainers/may.png' },
  { name: 'youngster', url: 'https://play.pokemonshowdown.com/sprites/trainers/youngster.png' },
  { name: 'lass',    url: 'https://play.pokemonshowdown.com/sprites/trainers/lass.png' },
];
const outDir = path.join(__dirname, '..', 'sprites', 'trainers');
fs.mkdirSync(outDir, { recursive: true });
(async () => {
  const results = [];
  for (const t of trainers) {
    try {
      const res = await fetch(t.url);
      if (!res.ok) { results.push(`${t.name}: ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(path.join(outDir, `${t.name}.png`), buf);
      results.push(`${t.name}: ${(buf.length/1024).toFixed(1)} KB`);
    } catch (e) {
      results.push(`${t.name}: ERROR ${e.message}`);
    }
  }
  console.log(results.join('\n'));
})();
