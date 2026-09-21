/**
 * Resource leak check.
 *
 * Starts and tears down several matches in a row and watches the renderer's
 * own geometry/texture/program counters. A game that leaks a roster of mech
 * models per match looks fine for one round and dies on the fifth.
 */
import { chromium } from '/tmp/claude-0/pwtest/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8523;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const b = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.booted, null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__game;
  g._renderPaused = true;
  const orig = g.loop;
  g.loop = () => { if (!g._renderPaused) orig(); else requestAnimationFrame(g.loop); };
});

const samples = await page.evaluate(async () => {
  const g = window.__game;
  // Repeat a couple of arenas so the texture caches reach their caps and
  // the tail of the run measures the steady state rather than warm-up.
  const maps = ['refinery', 'duneline', 'downtown', 'station', 'caldera',
                'plaza', 'refinery', 'trench', 'duneline', 'mesa'];
  const out = [];
  for (let i = 0; i < maps.length; i++) {
    g.startMatch({ mode: 'tdm', mapId: maps[i], difficulty: 'regular' });
    const m = g.match;
    m.state = 'live'; m.countdown = 0;
    for (let k = 0; k < 600; k++) m.update(1 / 60, null);
    // The renderer only counts geometry it has actually uploaded, so the
    // match has to be drawn at least once or the counters never move and
    // this test cannot fail.
    g.engine.render();
    // Tear down the way endMatch does.
    g.sky.detach();
    g.match.dispose();
    g.engine.scene.remove(g.arena.group);
    g.arena.dispose();
    g.match = null; g.arena = null;
    const mem = g.engine.renderer.info.memory;
    out.push({ map: maps[i], geometries: mem.geometries, textures: mem.textures });
  }
  return out;
});

await browser.close();
server.close();

for (const s of samples) {
  console.log(`  after ${s.map.padEnd(10)} geometries=${String(s.geometries).padStart(5)} textures=${String(s.textures).padStart(4)}`);
}

// The first couple of matches legitimately grow the caches (skin textures,
// surface maps, shared geometry). What must not happen is growth that keeps
// pace with the number of matches.
// Measure the tail only: the first few matches legitimately fill caches.
const tail = 4;
const early = samples[samples.length - 1 - tail];
const late = samples[samples.length - 1];
const matches = tail;
const geoPerMatch = (late.geometries - early.geometries) / matches;
const texPerMatch = (late.textures - early.textures) / matches;
console.log(`\nafter warm-up, per match: ${geoPerMatch.toFixed(1)} geometries, ${texPerMatch.toFixed(1)} textures`);

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of [...new Set(errors)].slice(0, 8)) console.error('  ' + e);
  process.exit(1);
}
if (geoPerMatch > 40) {
  console.error(`\nLEAK: ${geoPerMatch.toFixed(1)} geometries retained per match`);
  process.exit(1);
}
// Texture caches are deliberately warm, but they are capped, so a long
// session must not keep adding to them.
if (texPerMatch > 4) {
  console.error(`\nLEAK: ${texPerMatch.toFixed(1)} textures retained per match`);
  process.exit(1);
}
console.log('LEAK CHECK PASS');
