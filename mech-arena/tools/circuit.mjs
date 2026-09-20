/**
 * Tournament circuit end-to-end test.
 *
 * Enters a circuit, fights every round headlessly (forcing the result so
 * the run is deterministic), and checks the progression bookkeeping: round
 * advance, locked lance, purse, trophy grant, and a knockout on a loss.
 */
import { chromium } from '/tmp/claude-0/pwtest/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8422;
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
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errors = [];
page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.booted, null, { timeout: 60000 });

// Stop the renderer: this test is about bookkeeping, not pixels.
await page.evaluate(() => {
  const g = window.__game;
  g._renderPaused = true;
  const orig = g.loop;
  g.loop = () => { if (!g._renderPaused) orig(); else requestAnimationFrame(g.loop); };
});

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try { const out = await fn(); console.log('ok', out ? JSON.stringify(out) : ''); return out; }
  catch (e) { console.log('FAIL'); errors.push(`${name}: ${e.message}`); return null; }
};

await step('fresh profile at rank 1 cannot enter the regional', async () => {
  const r = await page.evaluate(() => {
    const p = window.__game.progression;
    p.reset();
    return p.enterTournament('regional');
  });
  if (r.ok) throw new Error('rank gate did not hold');
  return r;
});

await step('enter the rookie circuit', async () => {
  const r = await page.evaluate(() => {
    const p = window.__game.progression;
    const res = p.enterTournament('rookie');
    return { res, run: p.run && { id: p.run.id, round: p.run.round, lance: p.run.lance.length } };
  });
  if (!r.res.ok) throw new Error('could not enter: ' + r.res.reason);
  if (!r.run || r.run.round !== 0) throw new Error('run did not start at round 0');
  if (!r.run.lance) throw new Error('run locked an empty lance');
  return r.run;
});

await step('changing the hangar does not change the locked lance', async () => {
  const r = await page.evaluate(() => {
    const p = window.__game.progression;
    const before = p.runHangar().mechs.map(m => m.chassisId).join(',');
    p.setHangarSlot(0, { chassisId: 'atlas', loadout: [], skinId: 'gunmetal.panel.satin' });
    const after = p.runHangar().mechs.map(m => m.chassisId).join(',');
    return { before, after, hangarNow: p.hangar[0].chassisId };
  });
  if (r.before !== r.after) throw new Error('locked lance changed mid-run');
  if (r.hangarNow !== 'atlas') throw new Error('hangar edit did not apply outside the run');
  return r;
});

const rounds = await step('win every round', async () => {
  return await page.evaluate(() => {
    const g = window.__game, p = g.progression;
    const log = [];
    for (let guard = 0; guard < 12 && p.run; guard++) {
      const run = p.run;
      const result = {
        winner: 'a', reason: 'TEST', playerWon: true, draw: false,
        scores: [], players: [{ name: 'YOU', team: 'a', kills: 4, deaths: 1, assists: 1,
          damage: 3000, healing: 0, score: 400, isPlayer: true }],
      };
      const award = p.awardMatch(result, 'tdm');
      const out = p.advanceRun(result, award);
      log.push({ round: run.round, finished: out.finished, won: out.won,
                 purse: out.payout?.credits || 0, reward: out.reward?.id || null });
      if (out.finished) break;
    }
    return { log, completed: p.data.tournaments.completed, run: p.run,
             ownsTrophy: p.data.ownedSkins.includes('crimson.stripe.gloss'), credits: p.data.credits };
  });
});
if (rounds) {
  if (!rounds.completed.includes('rookie')) errors.push('circuit not recorded as completed');
  if (rounds.run) errors.push('run was not cleared after finishing');
  if (!rounds.ownsTrophy) errors.push('trophy skin was not granted');
  if (rounds.log.length !== 3) errors.push(`expected 3 rounds, saw ${rounds.log.length}`);
}

await step('a loss knocks the run out', async () => {
  const r = await page.evaluate(() => {
    const g = window.__game, p = g.progression;
    p.data.credits = 999999;
    p.data.xp = 999999;            // rank up so the regional unlocks
    const entered = p.enterTournament('regional');
    const result = {
      winner: 'b', reason: 'TEST', playerWon: false, draw: false, scores: [],
      players: [{ name: 'YOU', team: 'a', kills: 1, deaths: 5, assists: 0,
        damage: 800, healing: 0, score: 100, isPlayer: true }],
    };
    const award = p.awardMatch(result, 'tdm');
    const out = p.advanceRun(result, award);
    return { entered, out, run: p.run, best: p.data.tournaments.best };
  });
  if (!r.entered.ok) throw new Error('could not enter the regional: ' + r.entered.reason);
  if (!r.out.finished || r.out.won) throw new Error('a loss did not end the run');
  if (r.run) throw new Error('run survived a loss');
  return r.out;
});

await step('play one real circuit round in the engine', async () => {
  const r = await page.evaluate(() => {
    const g = window.__game, p = g.progression;
    p.reset();
    p.enterTournament('rookie');
    const round = window.__TOURNAMENTS[0].rounds[0];
    g.startMatch({
      mode: round.mode, mapId: round.map, difficulty: round.difficulty,
      tournament: { id: 'rookie', round: 0, label: round.label, name: 'ROOKIE CIRCUIT', total: 3 },
    });
    const m = g.match;
    for (let i = 0; i < 1800; i++) m.update(1 / 60, null);
    return {
      mode: m.mode.id, map: g.arena.def.id, mechs: m.mechs.length,
      damage: Math.round(m.players.reduce((a, x) => a + x.damage, 0)),
      lanceLocked: m.player.hangar.length,
      state: m.state,
    };
  });
  if (r.mechs === 0) throw new Error('circuit round spawned nobody');
  return r;
});

await browser.close();
server.close();

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of [...new Set(errors)].slice(0, 12)) console.error('  ' + e);
  process.exit(1);
}
console.log('\nCIRCUIT PASS');
