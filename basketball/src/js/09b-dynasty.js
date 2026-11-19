'use strict';
/* ============================================================
   Dynasty: build a squad from player cards. Open packs (rarer
   packs, better cards), win games for coins, buy more packs,
   set your starting five. Cards show live 3D portraits of the
   actual player models.
   ============================================================ */

const TIERS = [
  { id: 'bronze', name: 'Bronze', min: 56, max: 64, sell: 30 },
  { id: 'silver', name: 'Silver', min: 65, max: 72, sell: 90 },
  { id: 'gold', name: 'Gold', min: 73, max: 79, sell: 300 },
  { id: 'emerald', name: 'Emerald', min: 80, max: 84, sell: 800 },
  { id: 'sapphire', name: 'Sapphire', min: 85, max: 89, sell: 2000 },
  { id: 'ruby', name: 'Ruby', min: 90, max: 94, sell: 5000 },
  { id: 'onyx', name: 'Onyx', min: 95, max: 99, sell: 12000 },
];
const TIER_GLOW = { bronze: '#e3a066', silver: '#e6eef8', gold: '#ffd86e', emerald: '#3cffb4', sapphire: '#5aa8ff', ruby: '#ff3b5c', onyx: '#c9a7ff' };
function tierOf(ovr) { for (let i = TIERS.length - 1; i >= 0; i--) if (ovr >= TIERS[i].min) return TIERS[i]; return TIERS[0]; }
function tierIdx(id) { return TIERS.findIndex((t) => t.id === id); }

const PACKS = [
  { id: 'rookie', name: 'Rookie Pack', price: 600, n: 5, odds: { bronze: 70, silver: 26, gold: 4 }, blurb: 'Mostly Bronze and Silver. Where every dynasty starts.' },
  { id: 'pro', name: 'Pro Pack', price: 2500, n: 5, first: { gold: 85, emerald: 13, sapphire: 2 }, odds: { bronze: 30, silver: 45, gold: 22, emerald: 3 }, blurb: 'One guaranteed Gold or better.' },
  { id: 'allstar', name: 'All-Star Pack', price: 7500, n: 5, first: { emerald: 70, sapphire: 25, ruby: 5 }, odds: { silver: 30, gold: 50, emerald: 17, sapphire: 3 }, blurb: 'One guaranteed Emerald or better.' },
  { id: 'legend', name: 'Legend Pack', price: 20000, n: 3, first: { sapphire: 65, ruby: 30, onyx: 5 }, odds: { gold: 30, emerald: 50, sapphire: 17, ruby: 3 }, blurb: 'One guaranteed Sapphire or better, with a shot at Onyx.' },
];
const DY_CHAL = [
  { id: 'rookie', name: 'Rookie', tiers: ['bronze', 'silver'], diff: 'rookie', win: 700, loss: 150, note: 'Bronze and Silver squads' },
  { id: 'pro', name: 'Pro', tiers: ['silver', 'gold'], diff: 'pro', win: 1400, loss: 300, note: 'Silver and Gold squads' },
  { id: 'allstar', name: 'All-Star', tiers: ['gold', 'emerald', 'sapphire'], diff: 'allstar', win: 2400, loss: 500, note: 'Gold to Sapphire squads' },
  { id: 'legend', name: 'Legend', tiers: ['sapphire', 'ruby', 'onyx'], diff: 'legend', win: 4000, loss: 800, note: 'Sapphire to Onyx squads' },
];
const DY_COLORS = [
  { c1: '#d4202c', c2: '#1a1a1e', c3: '#f2c94c', label: 'Crimson' },
  { c1: '#1f5fd1', c2: '#0b1a33', c3: '#f2f2f2', label: 'Royal' },
  { c1: '#0f8a5f', c2: '#0b231a', c3: '#e8d48b', label: 'Forest' },
  { c1: '#6c2bd9', c2: '#160b2e', c3: '#39e6c4', label: 'Violet' },
  { c1: '#f07a12', c2: '#1d1208', c3: '#ffffff', label: 'Blaze' },
  { c1: '#16171b', c2: '#000000', c3: '#d6b04a', label: 'Midnight' },
];
const LEGENDS_DEF = { id: 'LGD', city: 'All-Time', name: 'Legends', c1: '#141418', c2: '#050506', c3: '#d4af37' };

/* ---------------- card pool (deterministic, so saved collections stay valid) ---------------- */
const FIRSTS = ['Adrian', 'Bennett', 'Calvin', 'Darnell', 'Elijah', 'Felix', 'Gideon', 'Harlan', 'Jasper', 'Keon', 'Lionel', 'Marlon', 'Nolan', 'Orlando', 'Percy', 'Quentin', 'Rashad', 'Silas', 'Tobias', 'Vernon', 'Wendell', 'Xavier', 'Yusuf', 'Zane', 'Amos', 'Brock', 'Cyrus', 'Desmond', 'Emeka', 'Fabian', 'Garrett', 'Hollis', 'Jerome', 'Kasim', 'Leland', 'Montel', 'Nash', 'Otis', 'Quincy', 'Roland', 'Sterling', 'Thaddeus', 'Vince', 'Wyatt', 'Arlo', 'Booker', 'Cassius', 'Dorian', 'Everett', 'Grady', 'Jett', 'Kellan', 'Lamont', 'Mekhi', 'Niko', 'Royce', 'Tariq', 'Ulrich', 'Bram', 'Caden'];
const LASTS = ['Abernathy', 'Ballard', 'Castellanos', 'Dunmore', 'Ellsworth', 'Faulkner', 'Galloway', 'Hargrove', 'Jessup', 'Kincaid', 'Lockhart', 'Mayfield', 'Northcutt', 'Ogletree', 'Pendergast', 'Quarles', 'Rutledge', 'Satterfield', 'Thibault', 'Underwood', 'Whitaker', 'Yancey', 'Blackwood', 'Crenshaw', 'Delacroix', 'Eberhardt', 'Fairbanks', 'Hawthorne', 'Lomax', 'Merriweather', 'Nkemelu', 'Pruitt', 'Ransome', 'Treadwell', 'Upshaw', 'Varnell', 'Yardley', 'Bramwell', 'Dorsey', 'Easterling', 'Fontaine', 'Goodwin', 'Holloway', 'Ivey', 'Kettering', 'Langston', 'Mabry', 'Oyelowo', 'Prescott', 'Rourke', 'Sandoval', 'Tolliver', 'Vasquez', 'Wakefield', 'Zamora', 'Achebe', 'Brightwater', 'Coltrane', 'Duvall', 'Everly'];
const LEGEND_NAMES = ['Thaddeus "Sky" Holloway', 'Cassius Monroe', 'Big Emeka Achebe', 'Royce "Glide" Langston', 'Dorian Kettering', 'Montel "Iceman" Mabry', 'Silas Brightwater', 'Jett Coltrane'];
const ARCH = {
  PG: { tpt: 0.82, mid: 0.82, ins: 0.72, dnk: 0.45, hnd: 0.96, pas: 0.95, spd: 0.95, def: 0.66, stl: 0.82, blk: 0.2, reb: 0.32 },
  SG: { tpt: 0.92, mid: 0.86, ins: 0.74, dnk: 0.62, hnd: 0.82, pas: 0.7, spd: 0.86, def: 0.7, stl: 0.72, blk: 0.3, reb: 0.4 },
  SF: { tpt: 0.76, mid: 0.8, ins: 0.84, dnk: 0.8, hnd: 0.72, pas: 0.66, spd: 0.8, def: 0.84, stl: 0.66, blk: 0.55, reb: 0.62 },
  PF: { tpt: 0.6, mid: 0.72, ins: 0.88, dnk: 0.84, hnd: 0.5, pas: 0.56, spd: 0.66, def: 0.86, stl: 0.46, blk: 0.76, reb: 0.88 },
  C: { tpt: 0.3, mid: 0.56, ins: 0.93, dnk: 0.88, hnd: 0.36, pas: 0.5, spd: 0.52, def: 0.9, stl: 0.36, blk: 0.94, reb: 0.96 },
};
const HEIGHTS = { PG: [72, 76], SG: [75, 79], SF: [78, 81], PF: [80, 83], C: [82, 87] };
const POSL = ['PG', 'SG', 'SF', 'PF', 'C'];
const STATK = ['tpt', 'mid', 'ins', 'dnk', 'hnd', 'pas', 'spd', 'def', 'stl', 'blk', 'reb'];
function genRatings(pos, target, rng) {
  const a = ARCH[pos], noise = {};
  for (const k of STATK) noise[k] = (rng() - 0.5) * 12;
  const r = { pos };
  let off = target - 10;
  for (let it = 0; it < 40; it++) {
    for (const k of STATK) r[k] = Math.round(clamp(off + (a[k] - 0.72) * 62 + noise[k], 25, 99));
    const o = playerOvr(r);
    if (o === target) break;
    off += (target - o) * 0.9;
  }
  return r;
}
function buildPool() {
  const rng = mulberry32(424242), pool = [];
  let uid = 1;
  for (const T of TEAMS) for (const p of T.roster) {
    pool.push({ id: 'L' + uid++, n: p.n, pos: p.pos, h: p.h, num: p.num, skin: p.skin, hair: p.hair, acc: p.acc, team: T, ovr: p.ovr, r: Object.fromEntries(STATK.map((k) => [k, p[k]])) });
  }
  const plan = { bronze: 46, silver: 46, gold: 42, emerald: 18, sapphire: 14, ruby: 9, onyx: 8 };
  let li = 0;
  for (const t of TIERS) {
    for (let i = 0; i < plan[t.id]; i++) {
      const pos = POSL[(i + tierIdx(t.id)) % 5];
      const target = t.min + Math.floor(rng() * (t.max - t.min + 1));
      const hr = HEIGHTS[pos], h = hr[0] + Math.floor(rng() * (hr[1] - hr[0] + 1));
      const r = genRatings(pos, target, rng);
      const legend = t.id === 'onyx';
      const n = legend ? LEGEND_NAMES[li++ % LEGEND_NAMES.length] : FIRSTS[Math.floor(rng() * FIRSTS.length)] + ' ' + LASTS[Math.floor(rng() * LASTS.length)];
      const card = { id: 'G' + uid++, n, pos, h, num: Math.floor(rng() * 55), skin: Math.floor(rng() * 6), hair: Math.floor(rng() * 5), acc: rng() < 0.25 ? 1 + Math.floor(rng() * 2) : 0,
        team: legend ? LEGENDS_DEF : TEAMS[Math.floor(rng() * TEAMS.length)], r: {} };
      for (const k of STATK) card.r[k] = r[k];
      card.ovr = playerOvr(Object.assign({ pos }, card.r));
      pool.push(card);
    }
  }
  for (const c of pool) c.tier = tierOf(c.ovr).id;
  return pool;
}
const POOL = buildPool();
const CARD = Object.fromEntries(POOL.map((c) => [c.id, c]));
const BY_TIER = {};
for (const t of TIERS) BY_TIER[t.id] = POOL.filter((c) => c.tier === t.id);
function cardD(c) {
  return Object.assign({ cid: c.id, n: c.n, pos: c.pos, h: c.h, num: c.num, skin: c.skin, hair: c.hair, acc: c.acc, ovr: c.ovr }, c.r);
}

/* ---------------- profile ---------------- */
const DY = { p: null, slot: -1, filter: 'ALL', sellArm: null, pack: null, lastResult: null };
function dyLoad() {
  try { const s = JSON.parse(localStorage.getItem('hk-dynasty-v1') || 'null'); if (s && Array.isArray(s.cards)) DY.p = s; } catch (e) { /* storage unavailable */ }
  if (DY.p) DY.p.cards = DY.p.cards.filter((c) => CARD[c.id]);
}
function dySave() { try { localStorage.setItem('hk-dynasty-v1', JSON.stringify(DY.p)); } catch (e) { /* ignore */ } }
function dyCreate(city, name, col) {
  const cw = city.trim().split(/\s+/).filter(Boolean);
  const abbr = (cw.length >= 2 ? cw.map((w) => w[0]).join('') + name.trim()[0] : (cw[0] || name)).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  DY.p = { v: 1, city, name, abbr, c1: col.c1, c2: col.c2, c3: col.c3, coins: 0, packs: { rookie: 3 }, cards: [], lineup: [null, null, null, null, null], next: 1, w: 0, l: 0, opened: 0 };
  dySave();
}
function dyOwned(uid) { return DY.p.cards.find((c) => c.u === uid); }
function dyAdd(id) { const u = DY.p.next++; DY.p.cards.push({ u, id }); return u; }
function dyLineupCards() { return DY.p.lineup.map((u) => (u == null ? null : dyOwned(u))).map((o) => (o ? CARD[o.id] : null)); }
function dyTeamOvr() {
  const cs = dyLineupCards().filter(Boolean);
  if (!cs.length) return 0;
  return Math.round(cs.reduce((a, c) => a + c.ovr, 0) / 5);
}
/* fill empty or invalid lineup slots with the best available card for each position */
function dyAutoFill(replaceAll) {
  const used = new Set(), usedIds = new Set();
  const L = replaceAll ? [null, null, null, null, null] : DY.p.lineup.map((u) => (u != null && dyOwned(u) ? u : null));
  L.forEach((u) => { if (u != null) { used.add(u); usedIds.add(dyOwned(u).id); } });
  const sorted = DY.p.cards.slice().sort((a, b) => CARD[b.id].ovr - CARD[a.id].ovr);
  for (let s = 0; s < 5; s++) {
    if (L[s] != null) continue;
    let pickC = sorted.find((c) => !used.has(c.u) && !usedIds.has(c.id) && CARD[c.id].pos === POSL[s]);
    if (!pickC) pickC = sorted.find((c) => !used.has(c.u) && !usedIds.has(c.id));
    if (pickC) { L[s] = pickC.u; used.add(pickC.u); usedIds.add(pickC.id); }
  }
  DY.p.lineup = L;
  dySave();
}
function dyTeamDef() {
  dyAutoFill(false);
  const roster = dyLineupCards().map((c) => cardD(c));
  const def = { id: DY.p.abbr, city: DY.p.city, name: DY.p.name, c1: DY.p.c1, c2: DY.p.c2, c3: DY.p.c3, style: 'Your Dynasty squad', roster };
  for (const p of def.roster) p.ovr = playerOvr(p);
  def.rt = teamRatings(def);
  return def;
}
function dyOpponent(ch) {
  const base = TEAMS[Math.floor(Math.random() * TEAMS.length)];
  const roster = POSL.map((pos) => {
    const tier = ch.tiers[Math.floor(Math.random() * ch.tiers.length)];
    let list = BY_TIER[tier].filter((c) => c.pos === pos);
    if (!list.length) list = BY_TIER[tier];
    return cardD(list[Math.floor(Math.random() * list.length)]);
  });
  const def = { id: base.id, city: base.city, name: base.name, c1: base.c1, c2: base.c2, c3: base.c3, style: ch.name + ' challenge', roster };
  for (const p of def.roster) p.ovr = playerOvr(p);
  def.rt = teamRatings(def);
  return def;
}
function rollTier(odds) {
  const tot = Object.values(odds).reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  for (const k in odds) { r -= odds[k]; if (r <= 0) return k; }
  return Object.keys(odds)[0];
}
function dyOpenPack(packId) {
  const P = PACKS.find((q) => q.id === packId);
  const got = [];
  for (let i = 0; i < P.n; i++) {
    const tier = i === 0 && P.first ? rollTier(P.first) : rollTier(P.odds);
    const list = BY_TIER[tier];
    const c = list[Math.floor(Math.random() * list.length)];
    got.push({ u: dyAdd(c.id), id: c.id });
  }
  got.sort((a, b) => CARD[a.id].ovr - CARD[b.id].ovr);
  DY.p.opened++;
  dySave();
  return got;
}
function dyReward(ch, my, opp) {
  const won = my > opp;
  const base = won ? ch.win : ch.loss;
  const margin = won ? Math.min(400, (my - opp) * 10) : 0;
  DY.p.coins += base + margin;
  if (won) DY.p.w++; else DY.p.l++;
  dySave();
  return { won, base, margin, total: base + margin };
}

/* ---------------- 3D portraits of the real player models ---------------- */
const PORTRAIT = { url: {}, queue: [], scene: null };
function requestPortrait(id) { if (!PORTRAIT.url[id] && !PORTRAIT.queue.includes(id)) PORTRAIT.queue.push(id); }
function portraitStep() {
  if (!PORTRAIT.queue.length || !R.ready) return;
  const id = PORTRAIT.queue.shift();
  if (!PORTRAIT.url[id]) { try { PORTRAIT.url[id] = renderPortrait(CARD[id]); } catch (e) { console.error(e); PORTRAIT.url[id] = 'none'; } }
  if (PORTRAIT.url[id] !== 'none') document.querySelectorAll(`img.dc-pt[data-card="${id}"]`).forEach((img) => { img.src = PORTRAIT.url[id]; img.classList.add('in'); });
}
function hydratePortraits(root) {
  (root || document).querySelectorAll('img.dc-pt').forEach((img) => {
    const id = img.dataset.card;
    if (PORTRAIT.url[id] && PORTRAIT.url[id] !== 'none') { img.src = PORTRAIT.url[id]; img.classList.add('in'); } else requestPortrait(id);
  });
}
function renderPortrait(c) {
  const r = R.r, P = PORTRAIT, W = 400, H = 500;
  if (!P.scene) {
    P.scene = new THREE.Scene(); P.scene.environment = R.env;
    P.cam = new THREE.PerspectiveCamera(24, W / H, 0.5, 60);
    P.key = new THREE.DirectionalLight('#fff3e6', 1.7); P.key.position.set(6, 7, 3.5);
    P.hemi = new THREE.HemisphereLight('#d4dcff', '#1a120c', 0.45);
    P.rimA = new THREE.DirectionalLight('#ffffff', 2.2); P.rimA.position.set(-5, 6, -6);
    P.rimB = new THREE.DirectionalLight('#ffffff', 1.6); P.rimB.position.set(-5, 4, 6);
    P.scene.add(P.key, P.hemi, P.rimA, P.rimB);
    P.rt = new THREE.WebGLRenderTarget(W, H, { format: THREE.RGBAFormat });
    P.rt.texture.encoding = THREE.sRGBEncoding;
    P.buf = new Uint8Array(W * H * 4);
    P.canvas = mkCanvas(W, H);
  }
  const glow = new THREE.Color(TIER_GLOW[c.tier]);
  P.rimA.color.copy(glow); P.rimB.color.copy(glow).lerp(new THREE.Color('#ffffff'), 0.4);
  const d = cardD(c), hgt = c.h / 12;
  const pl = { d, team: { def: c.team, idx: 0 }, sc: hgt / 6.5, hgt };
  const h = buildHumanoid(pl, true);
  R.scene.remove(h.root); R.scene.remove(h.blob);
  P.scene.add(h.root);
  // pose: arms folded across the chest, chin up, facing the camera a little off-axis
  h.root.rotation.y = -0.32;
  // folded arms set directly on the bones (an IK solve here bends the elbows back into the body):
  // elbows out to the sides, forearms across the chest, one a touch higher and further forward
  h.armR.sh.rotation.set(-1.0, 1.0, 1.0); h.armR.el.rotation.set(0, 0, 1.7);
  h.armL.sh.rotation.set(0.95, -1.05, 1.08); h.armL.el.rotation.set(0, 0, 1.8);
  h.headG.rotation.set(0, 0.22, 0.06);
  h.torso.rotation.y = 0.05;
  h.root.updateMatrixWorld(true);
  const headY = 6.12 * pl.sc;
  P.cam.position.set(9.6, headY - 0.55, 1.7); P.cam.lookAt(0, headY - 1.05, 0.25);
  const tm = r.toneMapping, ex = r.toneMappingExposure, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha(), sm = r.shadowMap.enabled;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15; r.setClearColor(0x000000, 0); r.shadowMap.enabled = false;
  r.setRenderTarget(P.rt); r.clear(); r.render(P.scene, P.cam);
  r.readRenderTargetPixels(P.rt, 0, 0, W, H, P.buf);
  r.setRenderTarget(null);
  r.toneMapping = tm; r.toneMappingExposure = ex; r.setClearColor(cc, ca); r.shadowMap.enabled = sm;
  P.scene.remove(h.root);
  disposeHumanoid(h);
  const g = P.canvas.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(P.buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  g.putImageData(img, 0, 0);
  return P.canvas.toDataURL('image/png');
}

/* ---------------- card markup ---------------- */
function statLine(c) {
  const r = c.r;
  const pairs = c.pos === 'C' || c.pos === 'PF' ? [['INS', r.ins], ['REB', r.reb], ['BLK', r.blk]] : c.pos === 'PG' ? [['3PT', r.tpt], ['HND', r.hnd], ['PAS', r.pas]] : [['3PT', r.tpt], ['INS', r.ins], ['DEF', r.def]];
  return pairs.map(([k, v]) => `<span><b>${v}</b>${k}</span>`).join('');
}
function cardHTML(c, o) {
  o = o || {};
  const t = TIERS[tierIdx(c.tier)];
  return `<div class="dcard t-${c.tier}${o.cls ? ' ' + o.cls : ''}"${o.uid != null ? ` data-uid="${o.uid}"` : ''}${o.nav ? ' data-nav="1"' : ''} style="--tc:${c.team.c1}">
    <div class="dc-face">
      <div class="dc-bg"></div><div class="dc-team">${c.team.id}</div>
      <img class="dc-pt" data-card="${c.id}" alt="">
      <div class="dc-ovr">${c.ovr}<small>${c.pos}</small></div>
      <div class="dc-tier">${t.name}</div>
      <div class="dc-name">${cardName(c)}</div>
      <div class="dc-stats">${statLine(c)}</div>
      <div class="dc-shine"></div>
    </div>
    ${o.back ? '<div class="dc-back"><div class="dc-logo">HK</div></div>' : ''}
  </div>`;
}
function cardName(c) {
  const q = c.n.match(/"([^"]+)"/);
  if (q) return q[1];
  const parts = c.n.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : c.n;
}
function coinStr(n) { return n.toLocaleString('en-US'); }

/* ---------------- screens ---------------- */
function dyEnter() {
  if (!DY.p) dyLoad();
  if (!DY.p) { dyRenderCreate(); showScreen('dycreate', 'home'); return; }
  dyRenderHub(); showScreen('dyhub', 'home');
}
function dyRenderCreate() {
  $('#dyColors').innerHTML = DY_COLORS.map((c, i) => `<button class="swatch${i === (DY.colIdx || 0) ? ' on' : ''}" data-act="dy-col" data-i="${i}" style="--a:${c.c1};--b:${c.c3}" aria-label="${c.label}"><i></i><span>${c.label}</span></button>`).join('');
}
function dyRenderHub() {
  const p = DY.p;
  dyAutoFill(false);
  $('#dyTeamName').innerHTML = `<span style="color:${p.c1 === '#16171b' ? p.c3 : p.c1}">${p.city}</span> ${p.name}`;
  $('#dyCoins').textContent = coinStr(p.coins);
  $('#dyRecord').textContent = `${p.w}–${p.l}`;
  $('#dyOvr').textContent = dyTeamOvr() || '—';
  const L = dyLineupCards();
  $('#dyLineup').innerHTML = L.map((c, i) => (c ? cardHTML(c, { cls: 'sm' }) : `<div class="dcard empty sm"><span>${POSL[i]}</span></div>`)).join('');
  hydratePortraits($('#dyLineup'));
  const owned = Object.values(p.packs).reduce((a, b) => a + b, 0);
  $('#dyPackCount').textContent = owned ? `${owned} unopened` : 'None yet';
  $('#dyOpenBtn').classList.toggle('dim', !owned);
  $('#dyChal').innerHTML = DY_CHAL.map((ch) => `<button class="chal" data-act="dy-play" data-ch="${ch.id}"><span class="cn">${ch.name}</span><span class="cr"><i class="coin"></i>${coinStr(ch.win)} win · ${coinStr(ch.loss)} loss</span><span class="cs">${ch.note}</span></button>`).join('');
  const full = L.every(Boolean);
  $('#dyNeed').hidden = full;
}
function dyRenderTeam() {
  const p = DY.p;
  const L = dyLineupCards();
  $('#dySlots').innerHTML = L.map((c, i) => `<div class="slot${DY.slot === i ? ' on' : ''}" data-act="dy-slot" data-i="${i}"><span class="sp">${POSL[i]}</span>${c ? cardHTML(c, { cls: 'sm' }) : '<div class="dcard empty sm"><span>Empty</span></div>'}</div>`).join('');
  $('#dyTeamOvr').textContent = dyTeamOvr() || '—';
  const inLine = new Set(p.lineup.filter((u) => u != null));
  let list = p.cards.slice().sort((a, b) => CARD[b.id].ovr - CARD[a.id].ovr);
  if (DY.filter !== 'ALL') list = list.filter((o) => CARD[o.id].pos === DY.filter);
  $('#dyFilters').innerHTML = ['ALL'].concat(POSL).map((f) => `<button class="chip${DY.filter === f ? ' on' : ''}" data-act="dy-filter" data-f="${f}">${f === 'ALL' ? 'All' : f}</button>`).join('');
  $('#dyCount').textContent = `${p.cards.length} card${p.cards.length === 1 ? '' : 's'}`;
  $('#dyGrid').innerHTML = list.length ? list.map((o) => {
    const c = CARD[o.id], used = inLine.has(o.u), armed = DY.sellArm === o.u;
    return `<div class="gcell${used ? ' used' : ''}">${cardHTML(c, { uid: o.u, cls: 'pick' })}
      <div class="gact">${used ? '<span class="tag">Starting</span>' : `<button class="mini" data-act="dy-assign" data-u="${o.u}">${DY.slot >= 0 ? 'Put in ' + POSL[DY.slot] : 'Start'}</button><button class="mini ghost${armed ? ' arm' : ''}" data-act="dy-sell" data-u="${o.u}">${armed ? 'Confirm' : 'Sell ' + coinStr(TIERS[tierIdx(c.tier)].sell)}</button>`}</div></div>`;
  }).join('') : '<p class="muted">No cards here yet. Open a pack.</p>';
  hydratePortraits($('#dyteam'));
}
function packArt(P, big) {
  return `<div class="dpack p-${P.id}${big ? ' big' : ''}"><div class="dp-foil"></div><div class="dp-top"></div><div class="dp-logo">HK</div><div class="dp-name">${P.name.replace(' Pack', '')}</div><div class="dp-sub">${P.n} cards</div><div class="dp-shine"></div></div>`;
}
function oddsHTML(P) {
  const rows = [];
  if (P.first) rows.push(`<li><b>Card 1:</b> ${Object.entries(P.first).map(([k, v]) => `<span class="ot t-${k}">${TIERS[tierIdx(k)].name} ${v}%</span>`).join(' ')}</li>`);
  rows.push(`<li><b>${P.first ? 'Others' : 'Each card'}:</b> ${Object.entries(P.odds).map(([k, v]) => `<span class="ot t-${k}">${TIERS[tierIdx(k)].name} ${v}%</span>`).join(' ')}</li>`);
  return `<ul class="odds">${rows.join('')}</ul>`;
}
function dyRenderStore() {
  const p = DY.p;
  $('#dyStoreCoins').textContent = coinStr(p.coins);
  $('#dyStoreGrid').innerHTML = PACKS.map((P) => {
    const own = p.packs[P.id] || 0, can = p.coins >= P.price;
    return `<div class="scell">${packArt(P)}<div class="sinfo"><h3>${P.name}</h3><p>${P.blurb}</p>${oddsHTML(P)}
      <div class="sbtns"><button class="btn${can ? '' : ' ghost dim'}" data-act="dy-buy" data-p="${P.id}"><i class="coin"></i>${coinStr(P.price)}</button>
      ${own ? `<button class="btn ghost" data-act="dy-open" data-p="${P.id}">Open (${own})</button>` : ''}</div></div></div>`;
  }).join('');
}
function dyToast(msg) {
  const t = $('#dyToast'); t.textContent = msg; t.classList.remove('go'); void t.offsetWidth; t.classList.add('go');
}

/* ---------------- pack opening ---------------- */
function dyStartPack(packId) {
  const p = DY.p;
  if (!p.packs[packId]) return;
  p.packs[packId]--; if (!p.packs[packId]) delete p.packs[packId];
  const P = PACKS.find((q) => q.id === packId);
  const got = dyOpenPack(packId);
  got.forEach((g) => requestPortrait(g.id));
  DY.pack = { P, got, stage: 'sealed', flipped: 0 };
  const best = got.reduce((a, g) => Math.max(a, tierIdx(CARD[g.id].tier)), 0);
  const el = $('#dypack');
  el.className = 'screen on dypack-' + TIERS[best].id;
  $('#dpStage').innerHTML = `<div class="dp-wrap">${packArt(P, true)}</div>`;
  $('#dpCards').innerHTML = '';
  $('#dpHint').textContent = 'Tap the pack to open it';
  $('#dpActions').innerHTML = '<button class="btn" data-act="dy-tear">Open pack</button>';
  showScreen('dypack', 'dyhub');
  $('#dypack').className = 'screen on dypack-' + TIERS[best].id;
  $('#dpStage .dpack').addEventListener('click', dyTearPack, { once: true });
  if (AU.on) SFX.ui('ok');
}
function dyTearPack() {
  const D = DY.pack;
  if (!D || D.stage !== 'sealed') return;
  D.stage = 'tearing';
  const pk = $('#dpStage .dpack');
  pk.classList.add('shake');
  $('#dpHint').textContent = '';
  if (AU.on) { const t = now(); noiseHit(t, 'bandpass', 900, 0.6, 0.5, 0.25, AU.sfx, 0.25); }
  setTimeout(() => {
    pk.classList.add('torn');
    $('#dypack').classList.add('burst');
    if (AU.on) { const t = now(); noiseHit(t, 'highpass', 2500, 0.5, 0.35, 0.35, AU.sfx); tone('sine', 220, 880, t, 0.5, 0.15, AU.sfx); }
  }, 900);
  setTimeout(() => {
    $('#dpStage').innerHTML = '';
    $('#dpCards').innerHTML = D.got.map((g, i) => `<div class="flip" style="--i:${i};--n:${D.got.length}">${cardHTML(CARD[g.id], { back: true, cls: 'big' })}</div>`).join('');
    hydratePortraits($('#dpCards'));
    D.stage = 'reveal';
    $('#dpHint').textContent = 'Tap a card to flip it';
    $('#dpActions').innerHTML = '<button class="btn ghost" data-act="dy-flipall">Reveal all</button>';
    $$('#dpCards .flip').forEach((f, i) => f.addEventListener('click', () => dyFlip(i)));
  }, 1500);
}
function dyFlip(i) {
  const D = DY.pack;
  if (!D || D.stage !== 'reveal') return;
  const f = $$('#dpCards .flip')[i];
  if (!f || f.classList.contains('open') || f.classList.contains('charging')) return;
  const c = CARD[D.got[i].id], ti = tierIdx(c.tier);
  const go = () => {
    f.classList.remove('charging'); f.classList.add('open');
    D.flipped++;
    if (AU.on) { const t = now(); tone('triangle', 500 + ti * 120, 900 + ti * 160, t, 0.25, 0.12, AU.sfx); if (ti >= 3) { tone('sine', 660 + ti * 80, 660 + ti * 80, t + 0.05, 0.6, 0.1, AU.sfx); tone('sine', 990 + ti * 80, 990 + ti * 80, t + 0.12, 0.7, 0.08, AU.sfx); } }
    if (ti >= 5) { $('#dypack').classList.add('walkout'); crowdRoar(1, 3); setTimeout(() => $('#dypack').classList.remove('walkout'), 2600); }
    if (D.flipped === D.got.length) dyPackDone();
  };
  if (ti >= 3) { f.classList.add('charging', 'c-' + c.tier); if (AU.on) tone('sine', 120, 480, now(), 0.7, 0.12, AU.sfx); setTimeout(go, ti >= 5 ? 1300 : 650); }
  else go();
}
function dyFlipAll() {
  const D = DY.pack; if (!D) return;
  $$('#dpCards .flip').forEach((f, i) => setTimeout(() => dyFlip(i), i * 420));
}
function dyPackDone() {
  const D = DY.pack;
  D.stage = 'done';
  const value = D.got.reduce((a, g) => a + TIERS[tierIdx(CARD[g.id].tier)].sell, 0);
  $('#dpHint').textContent = `Added to your collection · quick-sell value ${coinStr(value)} coins`;
  const more = Object.values(DY.p.packs).reduce((a, b) => a + b, 0);
  $('#dpActions').innerHTML = `${more ? `<button class="btn ghost" data-act="dy-nextpack">Open next pack (${more})</button>` : ''}<button class="btn" data-act="dy-team">Set lineup</button><button class="btn ghost" data-act="dy-hub">Done</button>`;
  dyAutoFill(false);
}

/* ---------------- game flow ---------------- */
function dyPlay(chId) {
  const ch = DY_CHAL.find((c) => c.id === chId);
  if (!DY.p.cards.length) { dyToast('Open your free packs first'); return; }
  DY.chal = ch;
  const me = dyTeamDef(), opp = dyOpponent(ch);
  startGame({ mode: 'dynasty', home: me, away: opp, userTeam: 0, difficulty: ch.diff });
}
function dyResult() {
  const T0 = G.teams[0], T1 = G.teams[1];
  const res = dyReward(DY.chal, T0.score, T1.score);
  DY.lastResult = res;
  $('#dyResTitle').textContent = res.won ? 'Victory' : 'Defeat';
  $('#dyResTitle').className = 'h-display ' + (res.won ? 'win' : 'loss');
  $('#dyResScore').innerHTML = [T0, T1].map((T) => `<div class="ts"><span class="sw" style="background:${T.def.c1}"></span>${T.def.id} ${T.score}</div>`).join('<span class="muted">–</span>');
  $('#dyResRows').innerHTML = `<div><span>${res.won ? 'Win' : 'Played'} · ${DY.chal.name}</span><b>+${coinStr(res.base)}</b></div>${res.margin ? `<div><span>Margin bonus</span><b>+${coinStr(res.margin)}</b></div>` : ''}`;
  const el = $('#dyResCoins'), from = DY.p.coins - res.total, to = DY.p.coins, t0 = performance.now();
  const anim = () => { const u = Math.min(1, (performance.now() - t0) / 1400); el.textContent = coinStr(Math.round(from + (to - from) * (1 - Math.pow(1 - u, 3)))); if (u < 1) requestAnimationFrame(anim); };
  anim();
  showScreen('dyresult');
  if (AU.on && res.won) SFX.ui('perfect');
}

/* ---------------- actions ---------------- */
function dyLeaveGame() {
  if (!APP.running) return;
  APP.running = false; APP.paused = false;
  $('#hud').classList.remove('on');
  startAttract();
}
function dyAction(a, el) {
  const p = DY.p;
  switch (a) {
    case 'dy-col': DY.colIdx = +el.dataset.i; dyRenderCreate(); break;
    case 'dy-create': {
      const city = ($('#dyCity').value || '').trim().slice(0, 16) || 'Hometown';
      const name = ($('#dyName').value || '').trim().slice(0, 16) || 'Hoopers';
      dyCreate(city, name, DY_COLORS[DY.colIdx || 0]);
      dyRenderHub(); showScreen('dyhub', 'home');
      dyToast('3 free Rookie packs are waiting for you');
      break;
    }
    case 'dy-hub': dyLeaveGame(); dyRenderHub(); showScreen('dyhub', 'home'); break;
    case 'dy-team': DY.slot = -1; DY.sellArm = null; dyRenderTeam(); showScreen('dyteam', 'dyhub'); break;
    case 'dy-store': dyLeaveGame(); dyRenderStore(); showScreen('dystore', 'dyhub'); break;
    case 'dy-tear': dyTearPack(); break;
    case 'dy-openany': case 'dy-nextpack': {
      const id = PACKS.map((q) => q.id).find((k) => p.packs[k]);
      if (id) dyStartPack(id); else { dyRenderStore(); showScreen('dystore', 'dyhub'); dyToast('No packs left. Win games to earn coins.'); }
      break;
    }
    case 'dy-open': dyStartPack(el.dataset.p); break;
    case 'dy-buy': {
      const P = PACKS.find((q) => q.id === el.dataset.p);
      if (p.coins < P.price) { dyToast(`You need ${coinStr(P.price - p.coins)} more coins. Win games to earn them.`); break; }
      p.coins -= P.price; p.packs[P.id] = (p.packs[P.id] || 0) + 1; dySave();
      dyStartPack(P.id);
      break;
    }
    case 'dy-flipall': dyFlipAll(); break;
    case 'dy-slot': DY.slot = DY.slot === +el.dataset.i ? -1 : +el.dataset.i; dyRenderTeam(); break;
    case 'dy-filter': DY.filter = el.dataset.f; dyRenderTeam(); break;
    case 'dy-assign': {
      const u = +el.dataset.u, c = CARD[dyOwned(u).id];
      let s = DY.slot >= 0 ? DY.slot : POSL.indexOf(c.pos);
      const dupe = p.lineup.findIndex((x, i) => x != null && i !== s && dyOwned(x) && dyOwned(x).id === c.id);
      if (dupe >= 0) { dyToast(`${c.n} is already in your lineup`); break; }
      p.lineup[s] = u; DY.slot = -1; dySave(); dyRenderTeam();
      break;
    }
    case 'dy-sell': {
      const u = +el.dataset.u;
      if (DY.sellArm !== u) { DY.sellArm = u; dyRenderTeam(); break; }
      const o = dyOwned(u), c = CARD[o.id], v = TIERS[tierIdx(c.tier)].sell;
      p.cards = p.cards.filter((x) => x.u !== u); p.coins += v; DY.sellArm = null; dySave();
      dyToast(`Sold ${c.n} for ${coinStr(v)} coins`); dyRenderTeam();
      break;
    }
    case 'dy-autofill': dyAutoFill(true); dyRenderTeam(); dyToast('Best available lineup set'); break;
    case 'dy-play': dyPlay(el.dataset.ch); break;
    case 'dy-again': dyPlay(DY.chal.id); break;
    case 'dy-reset-arm': { const b = el; if (b.dataset.armed) { try { localStorage.removeItem('hk-dynasty-v1'); } catch (e) { /* ignore */ } DY.p = null; dyRenderCreate(); showScreen('dycreate', 'home'); } else { b.dataset.armed = '1'; b.textContent = 'Tap again to erase your Dynasty'; } break; }
  }
}
