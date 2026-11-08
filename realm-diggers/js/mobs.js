'use strict';
// ============================================================
// Creatures, physics, projectiles, particles, boss
// ============================================================

// ---------------- shared AABB physics ----------------
function boxCollides(world, x, y, z, w, h) {
  const hw = w / 2;
  const x0 = Math.floor(x - hw + 1e-4), x1 = Math.floor(x + hw - 1e-4);
  const y0 = Math.floor(y + 1e-4), y1 = Math.floor(y + h - 1e-4);
  const z0 = Math.floor(z - hw + 1e-4), z1 = Math.floor(z + hw - 1e-4);
  for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
    const id = world.getBlock(bx, by, bz);
    if (id < 0) return true;
    if (!SOLID[id]) continue;
    if (BLOCK_H[id] < 1 && y >= by + BLOCK_H[id] - 1e-4) continue;
    return true;
  }
  return false;
}
// top of the floor under an entity's feet (handles low blocks like beds)
function floorTop(world, e) {
  const hw = e.w / 2, r = Math.floor(e.y + 1e-4);
  let best = -Infinity;
  for (let bz = Math.floor(e.z - hw + 1e-4); bz <= Math.floor(e.z + hw - 1e-4); bz++) for (let bx = Math.floor(e.x - hw + 1e-4); bx <= Math.floor(e.x + hw - 1e-4); bx++) {
    const id = world.getBlock(bx, r, bz);
    if (id >= 0 && !SOLID[id]) continue;
    const top = r + (id < 0 ? 1 : BLOCK_H[id]);
    if (top > e.y - 1e-4 && top > best) best = top;
  }
  return best > -Infinity ? best : Math.floor(e.y) + 1;
}
function physMove(world, e, dx, dy, dz) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.35));
  dx /= steps; dy /= steps; dz /= steps;
  e.hitX = false; e.hitZ = false; e.hitCeil = false;
  let landed = false;
  const hw = e.w / 2;
  if (boxCollides(world, e.x, e.y, e.z, e.w, e.h)) { e.y += 0.05; }
  for (let s = 0; s < steps; s++) {
    if (dy) {
      e.y += dy;
      if (boxCollides(world, e.x, e.y, e.z, e.w, e.h)) {
        if (dy < 0) { e.y = floorTop(world, e); landed = true; e.impact = -e.vy; } else { e.y = Math.floor(e.y + e.h) - e.h - 0.001; e.hitCeil = true; }
        e.vy = 0; dy = 0;
      }
    }
    if (dx) {
      e.x += dx;
      if (boxCollides(world, e.x, e.y, e.z, e.w, e.h)) {
        e.x = dx > 0 ? Math.floor(e.x + hw) - hw - 0.001 : Math.floor(e.x - hw) + 1 + hw + 0.001;
        e.hitX = true; e.vx = 0; dx = 0;
      }
    }
    if (dz) {
      e.z += dz;
      if (boxCollides(world, e.x, e.y, e.z, e.w, e.h)) {
        e.z = dz > 0 ? Math.floor(e.z + hw) - hw - 0.001 : Math.floor(e.z - hw) + 1 + hw + 0.001;
        e.hitZ = true; e.vz = 0; dz = 0;
      }
    }
  }
  e.onGround = landed;
  return landed;
}

// ---------------- model builders ----------------
function part(x, y, z, w, h, d, col, anim, pivot, emissive) {
  col = col || '#ff00ff';
  return { x, y, z, w, h, d, c: hexRgb(col).map(v => v / 255), anim: anim || null, pivot: pivot || [x, y, z], em: !!emissive };
}
function eyes(P, y, zf, s, col, glow, piv, sep = 0.22) {
  const e = Math.max(0.06, s * 0.16);
  P.push(part(-s * sep, y, zf + 0.012, e, e, 0.03, col || '#161616', 'head', piv, glow));
  P.push(part(s * sep, y, zf + 0.012, e, e, 0.03, col || '#161616', 'head', piv, glow));
}
function biped(o) {
  const P = [], lh = o.legH, lw = o.legW;
  P.push(part(-lw * 0.6, lh / 2, 0, lw, lh, lw, o.legs || o.body, 'legA', [-lw * 0.6, lh, 0]));
  P.push(part(lw * 0.6, lh / 2, 0, lw, lh, lw, o.legs || o.body, 'legB', [lw * 0.6, lh, 0]));
  P.push(part(0, lh + o.bodyH / 2, 0, o.bodyW, o.bodyH, o.bodyD, o.body));
  if (o.armH) {
    const ax = o.bodyW / 2 + o.armW / 2, ay = lh + o.bodyH - o.armH / 2;
    P.push(part(-ax, ay, 0, o.armW, o.armH, o.armW, o.arms || o.body, 'legB', [-ax, lh + o.bodyH, 0]));
    P.push(part(ax, ay, 0, o.armW, o.armH, o.armW, o.arms || o.body, 'legA', [ax, lh + o.bodyH, 0]));
  }
  const hs = o.headS, hy = lh + o.bodyH + hs / 2, piv = [0, lh + o.bodyH, 0];
  P.push(part(0, hy, 0, hs, hs, hs, o.head, 'head', piv));
  eyes(P, hy + hs * 0.08, hs / 2, hs, o.eye, o.glow, piv);
  return { P, hy, hs, piv, top: lh + o.bodyH + hs };
}
function quad(o) {
  const P = [], lx = o.bodyW / 2 - o.legW / 2, lz = o.bodyL / 2 - o.legW / 2, lh = o.legH;
  for (const [x, z, a] of [[-lx, lz, 'legA'], [lx, lz, 'legB'], [-lx, -lz, 'legB'], [lx, -lz, 'legA']]) P.push(part(x, lh / 2, z, o.legW, lh, o.legW, o.legs || o.body, a, [x, lh, z]));
  const by = lh + o.bodyH / 2;
  P.push(part(0, by, 0, o.bodyW, o.bodyH, o.bodyL, o.body));
  const [hw, hh, hd] = o.head, hy = by + (o.headY !== undefined ? o.headY : o.bodyH * 0.3), hz = o.bodyL / 2 + hd / 2 - 0.04;
  const piv = [0, hy, o.bodyL / 2];
  P.push(part(0, hy, hz, hw, hh, hd, o.headCol || o.body, 'head', piv));
  eyes(P, hy + hh * 0.12, hz + hd / 2, hw, o.eye, o.glow, piv, 0.3);
  return { P, by, hy, hz, hd, hw, hh, piv };
}
function blob(s, col, eye, glow) {
  const P = [part(0, s / 2, 0, s, s, s, col)];
  P.push(part(-s * 0.22, s * 0.62, s / 2 + 0.01, s * 0.16, s * 0.2, 0.03, eye || '#161616', null, null, glow));
  P.push(part(s * 0.22, s * 0.62, s / 2 + 0.01, s * 0.16, s * 0.2, 0.03, eye || '#161616', null, null, glow));
  P.push(part(0, s * 0.32, s / 2 + 0.01, s * 0.3, s * 0.06, 0.03, '#2a1a1a'));
  return P;
}
function spider(o) {
  const P = [], by = o.legY;
  P.push(part(0, by, -0.1, o.bodyW, o.bodyH, o.bodyL, o.body));
  const piv = [0, by, o.bodyL / 2 - 0.1];
  P.push(part(0, by, o.bodyL / 2 + o.head / 2 - 0.12, o.head, o.head * 0.85, o.head, o.body, 'head', piv));
  const zf = o.bodyL / 2 + o.head - 0.12;
  for (const [x, y] of [[-0.12, 0.08], [0.12, 0.08], [-0.06, -0.02], [0.06, -0.02]]) P.push(part(x, by + y, zf + 0.01, 0.07, 0.07, 0.03, o.eye, 'head', piv, true));
  const n = o.legs / 2;
  for (let i = 0; i < n; i++) {
    const z = (i / (n - 1) - 0.5) * o.bodyL * 0.9, len = o.legLen;
    for (const sx of [-1, 1]) {
      const px = sx * o.bodyW / 2;
      P.push(part(px + sx * len / 2, by - 0.05, z, len, 0.07, 0.07, o.legCol || o.body, (i + (sx > 0 ? 1 : 0)) % 2 ? 'swA' : 'swB', [px, by, z]));
      P.push(part(px + sx * (len - 0.03), by - 0.25, z, 0.07, 0.4, 0.07, o.legCol || o.body, (i + (sx > 0 ? 1 : 0)) % 2 ? 'swA' : 'swB', [px, by, z]));
    }
  }
  return P;
}
function theropod(o) {
  const P = [], lh = o.legH;
  P.push(part(-0.14, lh / 2, -0.05, 0.14, lh, 0.16, o.legs || o.body, 'legA', [-0.14, lh, -0.05]));
  P.push(part(0.14, lh / 2, -0.05, 0.14, lh, 0.16, o.legs || o.body, 'legB', [0.14, lh, -0.05]));
  const by = lh + o.bodyH / 2;
  P.push(part(0, by, 0, o.bodyW, o.bodyH, o.bodyL, o.body));
  P.push(part(0, by + o.bodyH / 2 + 0.01, 0, o.bodyW * 0.4, 0.04, o.bodyL * 0.8, o.stripe || o.body));
  P.push(part(0, by + 0.05, -o.bodyL / 2 - o.tailL / 2, o.bodyW * 0.5, o.bodyH * 0.45, o.tailL, o.body, 'tail', [0, by, -o.bodyL / 2]));
  const hy = by + o.bodyH / 2 + o.headH / 2 + 0.05, hz = o.bodyL / 2 + o.headD / 2 - 0.1, piv = [0, by + o.bodyH / 2, o.bodyL / 2 - 0.1];
  P.push(part(0, by + o.bodyH * 0.35, o.bodyL / 2 + 0.02, o.bodyW * 0.5, o.bodyH * 0.6, 0.25, o.body, 'head', piv));
  P.push(part(0, hy, hz, o.headW, o.headH, o.headD, o.body, 'head', piv));
  eyes(P, hy + o.headH * 0.15, hz + o.headD / 2 - 0.12, o.headW, o.eye || '#ffcf3a', false, piv, 0.5);
  if (o.teeth) P.push(part(0, hy - o.headH * 0.38, hz + 0.05, o.headW * 0.9, 0.05, o.headD * 0.8, '#f4f0e0', 'head', piv));
  P.push(part(-0.12, by - 0.05, o.bodyL / 2, 0.06, 0.2, 0.06, o.body, 'legB', [-0.12, by, o.bodyL / 2]));
  P.push(part(0.12, by - 0.05, o.bodyL / 2, 0.06, 0.2, 0.06, o.body, 'legA', [0.12, by, o.bodyL / 2]));
  return P;
}
function swimmer(o) {
  const P = [part(0, o.h / 2, 0, o.w, o.h, o.l, o.body)];
  P.push(part(0, o.h / 2, -o.l / 2 - o.l * 0.15, 0.04, o.h * 1.1, o.l * 0.3, o.fin || o.body, 'tail', [0, o.h / 2, -o.l / 2]));
  if (o.topFin) P.push(part(0, o.h + 0.15, -0.05, 0.06, 0.3, 0.35, o.fin || o.body));
  if (o.belly) P.push(part(0, 0.04, 0, o.w * 0.8, 0.05, o.l * 0.8, o.belly));
  P.push(part(-o.w / 2 - 0.01, o.h * 0.62, o.l * 0.32, 0.03, 0.07, 0.07, '#111111'));
  P.push(part(o.w / 2 + 0.01, o.h * 0.62, o.l * 0.32, 0.03, 0.07, 0.07, '#111111'));
  return P;
}
function flyer(o) {
  const P = [part(0, o.s / 2, 0, o.s, o.s * 0.8, o.s * 1.1, o.body, 'bob')];
  P.push(part(-o.s / 2 - o.wing / 2, o.s * 0.55, 0, o.wing, 0.04, o.s * 0.8, o.wingCol, 'wingL', [-o.s / 2, o.s * 0.55, 0], o.glowWings));
  P.push(part(o.s / 2 + o.wing / 2, o.s * 0.55, 0, o.wing, 0.04, o.s * 0.8, o.wingCol, 'wingR', [o.s / 2, o.s * 0.55, 0], o.glowWings));
  if (o.beak) P.push(part(0, o.s * 0.45, o.s * 0.62, o.s * 0.25, o.s * 0.15, o.s * 0.2, o.beak, 'bob'));
  if (o.tailGlow) P.push(part(0, o.s * 0.45, -o.s * 0.75, o.s * 0.7, o.s * 0.6, o.s * 0.5, o.tailGlow, 'bob', null, true));
  P.push(part(-o.s * 0.22, o.s * 0.6, o.s * 0.56, 0.06, 0.06, 0.03, o.eye || '#111111', 'bob', null, o.glowEye));
  P.push(part(o.s * 0.22, o.s * 0.6, o.s * 0.56, 0.06, 0.06, 0.03, o.eye || '#111111', 'bob', null, o.glowEye));
  return P;
}

// ---------------- creature definitions ----------------
const MOBS = {};
function mobDef(key, o) {
  MOBS[key] = Object.assign({ key, hostile: 0, hp: 10, speed: 1.6, w: 0.7, h: 0.9, dmg: 2, drops: [], pitch: 1, scale: 1, weight: 10, when: 'day', group: [1, 2], on: null, burnsInSun: o.when === 'night' && o.hostile === 1 }, o);
  return MOBS[key];
}
const V = (fn, n = 1) => { const cache = []; for (let i = 0; i < n; i++) cache.push(fn(i)); return cache; };

mobDef('fluffalo', { name: 'Fluffalo', hp: 10, speed: 1.4, w: 0.9, h: 1.3, drops: [['wool', 1, 2, 1], ['raw_meat', 1, 2, 1]], on: ['grass', 'grass_snow'], group: [2, 4], pitch: 0.6,
  models: V(() => { const q = quad({ legH: .45, legW: .24, bodyW: .95, bodyH: .75, bodyL: 1.25, head: [.5, .48, .42], headY: .15, body: '#efe8da', legs: '#5a4434', headCol: '#6a5040' });
    q.P.push(part(-.32, q.hy + .16, q.hz - .02, .18, .1, .1, '#e8dcc0', 'head', q.piv), part(.32, q.hy + .16, q.hz - .02, .18, .1, .1, '#e8dcc0', 'head', q.piv), part(0, q.hy + .27, q.hz - .06, .38, .1, .3, '#efe8da', 'head', q.piv), part(0, q.by + .1, -.66, .12, .3, .1, '#efe8da', 'tail', [0, q.by + .3, -.62]));
    return q.P; }) });
mobDef('boar', { name: 'Bristleboar', hp: 10, speed: 1.6, w: 0.7, h: 0.9, drops: [['raw_meat', 1, 3, 1]], on: ['grass', 'dirt'], group: [1, 3], pitch: 0.8,
  models: V(() => { const q = quad({ legH: .32, legW: .18, bodyW: .62, bodyH: .55, bodyL: .95, head: [.46, .42, .4], headY: .05, body: '#7a4e30', legs: '#5a3820' });
    q.P.push(part(0, q.hy - .06, q.hz + .24, .24, .18, .1, '#d8907a', 'head', q.piv), part(-.16, q.hy - .14, q.hz + .2, .05, .12, .05, '#f4f0e0', 'head', q.piv), part(.16, q.hy - .14, q.hz + .2, .05, .12, .05, '#f4f0e0', 'head', q.piv), part(0, q.by + .3, 0, .1, .08, .8, '#4a2e1a'));
    return q.P; }) });
mobDef('bunny', { name: 'Hopbun', hp: 3, speed: 3, w: 0.4, h: 0.5, drops: [['raw_meat', 1, 1, .5]], on: ['grass', 'grass_snow'], group: [1, 3], pitch: 1.8,
  models: V(() => { const q = quad({ legH: .1, legW: .1, bodyW: .3, bodyH: .28, bodyL: .42, head: [.26, .26, .26], headY: .12, body: '#d8c8b0' });
    q.P.push(part(-.06, q.hy + .24, q.hz - .02, .06, .26, .05, '#e8d8c0', 'head', q.piv), part(.06, q.hy + .24, q.hz - .02, .06, .26, .05, '#e8d8c0', 'head', q.piv), part(0, q.by + .05, -.24, .12, .12, .08, '#ffffff'));
    return q.P; }) });
mobDef('gloomling', { name: 'Gloomling', hostile: 1, hp: 16, speed: 2.6, w: 0.6, h: 1.8, dmg: 3, drops: [['bone', 0, 2, 1], ['coal', 0, 1, .5]], when: 'night', group: [1, 2], weight: 12, pitch: 0.7,
  models: V(() => { const b = biped({ legH: .65, legW: .2, bodyW: .5, bodyH: .65, bodyD: .28, armW: .17, armH: .62, headS: .5, body: '#3b2a5c', legs: '#2a1e44', head: '#4a3870', eye: '#ff5ad8', glow: true });
    b.P.push(part(0, b.hy + .3, 0, .1, .14, .1, '#2a1e44', 'head', b.piv), part(-.18, b.hy + .27, 0, .08, .1, .08, '#2a1e44', 'head', b.piv), part(.18, b.hy + .27, 0, .08, .1, .08, '#2a1e44', 'head', b.piv));
    return b.P; }) });
mobDef('spitter', { name: 'Gloop Spitter', hostile: 1, hp: 12, speed: 1.8, w: 0.75, h: 0.95, dmg: 2, ranged: { dmg: 2, speed: 11, rate: 2.4, color: '#8aff4a' }, drops: [['slime_ball', 1, 2, 1]], when: 'night', weight: 7, pitch: 1.1,
  models: V(() => { const q = quad({ legH: .3, legW: .16, bodyW: .7, bodyH: .6, bodyL: .7, head: [.5, .45, .3], headY: .1, body: '#5a7a3a', legs: '#3a5226', headCol: '#6a8a44', eye: '#ffe45a', glow: true });
    q.P.push(part(0, q.hy - .1, q.hz + .16, .3, .12, .02, '#1a1a10', 'head', q.piv)); return q.P; }) });
mobDef('cinder_slime', { name: 'Cinder Slime', hostile: 1, hp: 14, speed: 2, w: 0.85, h: 0.85, dmg: 3, hop: true, fireproof: true, drops: [['slime_ball', 0, 1, 1], ['coal', 1, 2, 1]], when: 'any', weight: 10, pitch: 0.7,
  models: V(() => { const P = blob(.85, '#5a1e10', '#ffd04a', true); P.push(part(.2, .3, .43, .25, .05, .02, '#ff7a2a', null, null, true), part(-.25, .6, -.43, .2, .05, .02, '#ff7a2a', null, null, true), part(.43, .5, 0, .02, .05, .3, '#ff7a2a', null, null, true)); return P; }) });
mobDef('fire_imp', { name: 'Fire Imp', hostile: 1, hp: 12, speed: 2.4, w: 0.5, h: 1.0, fly: true, hover: 3, fireproof: true, ranged: { dmg: 3, speed: 12, rate: 2.2, color: '#ff8a2a' }, drops: [['coal', 1, 2, 1], ['fire_opal', 1, 1, .12]], when: 'any', weight: 6, pitch: 1.5,
  models: V(() => { const b = biped({ legH: .3, legW: .12, bodyW: .34, bodyH: .36, bodyD: .22, armW: .1, armH: .32, headS: .36, body: '#c8402a', legs: '#8a2a1a', head: '#d8502a', eye: '#ffe45a', glow: true });
    b.P.push(part(-.12, b.hy + .22, 0, .06, .14, .06, '#2a1a1a', 'head', b.piv), part(.12, b.hy + .22, 0, .06, .14, .06, '#2a1a1a', 'head', b.piv), part(-.35, .55, -.1, .4, .04, .3, '#6a1a10', 'wingL', [-.17, .55, -.1]), part(.35, .55, -.1, .4, .04, .3, '#6a1a10', 'wingR', [.17, .55, -.1]));
    return b.P; }) });
mobDef('ember_beetle', { name: 'Ember Beetle', hp: 8, speed: 1.2, w: 0.8, h: 0.55, fireproof: true, drops: [['coal', 1, 2, 1]], when: 'any', on: ['ash', 'scorch_moss', 'ashstone'], weight: 6, pitch: 1.3,
  models: V(() => { const P = spider({ legY: .32, bodyW: .6, bodyH: .32, bodyL: .8, head: .32, legs: 6, legLen: .3, body: '#2a1a2a', eye: '#ffb03a' }); P.push(part(0, .49, -.1, .12, .03, .7, '#ff7a2a', null, null, true)); return P; }) });
mobDef('penguin', { name: 'Waddler', hp: 6, speed: 1.3, w: 0.45, h: 0.9, drops: [['raw_fish', 1, 1, 1]], on: ['snow', 'packed_ice', 'ice', 'blue_ice'], group: [2, 4], pitch: 1.6,
  models: V(() => { const b = biped({ legH: .12, legW: .14, bodyW: .42, bodyH: .55, bodyD: .36, armW: .08, armH: .38, headS: .32, body: '#1e2430', legs: '#ffa21f', head: '#1e2430' });
    b.P.push(part(0, .38, .19, .3, .45, .02, '#f4f4f4'), part(0, b.hy - .02, .2, .1, .06, .12, '#ffa21f', 'head', b.piv)); return b.P; }) });
mobDef('frost_wisp', { name: 'Frost Wisp', hostile: 1, hp: 10, speed: 2.2, w: 0.5, h: 0.6, fly: true, hover: 3.5, ranged: { dmg: 2, speed: 13, rate: 2.0, color: '#bff4ff' }, drops: [['ice', 1, 1, 1], ['glacite', 1, 1, .15]], when: 'any', weight: 6, pitch: 2,
  models: V(() => [part(0, .3, 0, .42, .42, .42, '#c8f4ff', 'bob', null, true), part(0, .3, 0, .6, .12, .12, '#7ad8ff', 'spin', [0, .3, 0], true), part(0, .3, 0, .12, .12, .6, '#7ad8ff', 'spin', [0, .3, 0], true), part(-.1, .36, .22, .07, .07, .02, '#1a3a5a', 'bob'), part(.1, .36, .22, .07, .07, .02, '#1a3a5a', 'bob')]) });
mobDef('yeti', { name: 'Yeti', hostile: 1, hp: 40, speed: 2.2, w: 1.1, h: 2.6, dmg: 6, drops: [['glacite', 1, 2, 1], ['raw_meat', 2, 3, 1]], when: 'any', weight: 1.5, group: [1, 1], pitch: 0.4, aggro: 20,
  models: V(() => { const b = biped({ legH: .8, legW: .34, bodyW: 1.0, bodyH: 1.0, bodyD: .62, armW: .3, armH: 1.05, headS: .65, body: '#eef2f8', legs: '#dfe6ee', head: '#6a88b8' });
    b.P.push(part(0, b.hy + .3, 0, .7, .18, .7, '#eef2f8', 'head', b.piv), part(0, b.hy - .2, .33, .3, .08, .02, '#f4f4f4', 'head', b.piv)); return b.P; }) });
mobDef('puffbird', { name: 'Puffbird', hp: 4, speed: 2, w: 0.5, h: 0.5, fly: true, hover: 4, drops: [['skyshard', 1, 1, .06]], when: 'any', group: [2, 4], weight: 10, pitch: 2.2,
  models: V(i => flyer({ s: .5, body: ['#ffe07a', '#ffb0d8', '#a8e0ff'][i], wing: .4, wingCol: '#fff6d8', beak: '#ff8a3a' }), 3) });
mobDef('storm_sprite', { name: 'Storm Sprite', hostile: 1, hp: 14, speed: 2.4, w: 0.8, h: 0.8, fly: true, hover: 3, ranged: { dmg: 3, speed: 14, rate: 2.2, color: '#ffe45a' }, drops: [['skyshard', 1, 1, .2]], when: 'any', weight: 4, pitch: 0.9,
  models: V(() => [part(0, .4, 0, .7, .5, .6, '#6a7088', 'bob'), part(-.25, .55, .1, .35, .35, .35, '#7a8098', 'bob'), part(.22, .5, -.12, .35, .3, .35, '#5a6078', 'bob'), part(-.14, .45, .31, .1, .08, .02, '#e8f4ff', 'bob', null, true), part(.14, .45, .31, .1, .08, .02, '#e8f4ff', 'bob', null, true), part(0, .2, 0, .5, .06, .06, '#ffe45a', 'spin', [0, .4, 0], true)]) });
mobDef('gloomcrawler', { name: 'Gloomcrawler', hostile: 1, hp: 14, speed: 3.1, w: 0.9, h: 0.6, dmg: 3, drops: [['slime_ball', 0, 1, 1], ['glowquartz', 1, 1, .08]], when: 'night', weight: 12, group: [1, 2], pitch: 1.2,
  models: V(() => spider({ legY: .38, bodyW: .7, bodyH: .42, bodyL: .9, head: .42, legs: 8, legLen: .45, body: '#2a2238', legCol: '#1e1828', eye: '#5ae0ff' })) });
mobDef('glowbug', { name: 'Glowbug', hp: 2, speed: 1.6, w: 0.3, h: 0.3, fly: true, hover: 2.5, drops: [], when: 'any', group: [2, 5], weight: 10, pitch: 2.5,
  models: V(() => flyer({ s: .22, body: '#3a4a2a', wing: .2, wingCol: '#e0f0ff', tailGlow: '#d8ff5a' })) });
mobDef('moon_hopper', { name: 'Moon Hopper', hp: 6, speed: 1.8, w: 0.6, h: 0.6, hop: true, hopV: 5, drops: [['moon_cheese', 1, 1, 1]], when: 'any', group: [1, 3], weight: 10, pitch: 1.7,
  models: V(() => { const P = blob(.6, '#c8b8f0', '#1a1a2a'); P.push(part(0, .7, 0, .04, .2, .04, '#9a8ac8'), part(0, .82, 0, .1, .1, .1, '#ffe45a', null, null, true)); return P; }) });
mobDef('zorbling', { name: 'Zorbling', hostile: 2, hp: 12, speed: 2.2, w: 0.5, h: 1.2, dmg: 3, drops: [['moonstone', 1, 1, .25]], when: 'any', group: [1, 3], weight: 8, pitch: 1.9,
  models: V(() => { const b = biped({ legH: .3, legW: .1, bodyW: .3, bodyH: .35, bodyD: .2, armW: .08, armH: .32, headS: .55, body: '#5ac05a', legs: '#4aa04a', head: '#7ae07a', eye: '#0a0a0a' }); b.P.push(part(0, b.hy + .35, 0, .04, .18, .04, '#4aa04a', 'head', b.piv), part(0, b.hy + .46, 0, .08, .08, .08, '#ff5ad8', 'head', b.piv, true)); return b.P; }) });
mobDef('fish', { name: 'Reef Fish', hp: 2, speed: 2.2, w: 0.4, h: 0.3, swim: true, drops: [['raw_fish', 1, 1, 1]], when: 'any', group: [3, 6], weight: 14, pitch: 2,
  models: V(i => swimmer({ w: .2, h: .22, l: .45, body: ['#ff8a3a', '#3ab4ff', '#ffe45a', '#ff5aa8'][i], fin: ['#ffd0a0', '#a8e0ff', '#fff0a8', '#ffc0e0'][i] }), 4) });
mobDef('shark', { name: 'Reef Shark', hostile: 1, hp: 20, speed: 3.4, w: 0.9, h: 0.7, dmg: 4, swim: true, drops: [['raw_fish', 2, 3, 1]], when: 'any', weight: 2, group: [1, 1], pitch: 0.5,
  models: V(() => swimmer({ w: .6, h: .55, l: 1.8, body: '#7a8a9a', fin: '#6a7a8a', topFin: true, belly: '#d8e0e8' })) });
mobDef('turtle', { name: 'Sea Turtle', hp: 10, speed: 0.9, w: 0.8, h: 0.5, drops: [['pearl', 1, 1, .25]], on: ['sand'], group: [1, 2], weight: 5, pitch: 0.9,
  models: V(() => { const q = quad({ legH: .12, legW: .16, bodyW: .8, bodyH: .3, bodyL: .9, head: [.24, .22, .26], headY: -.02, body: '#3a8a4a', legs: '#8ab060', headCol: '#8ab060' }); q.P.push(part(0, .44, 0, .6, .1, .7, '#2a6a3a')); return q.P; }) });
mobDef('jellyfish', { name: 'Jellyfish', hostile: 0, hp: 4, speed: 0.8, w: 0.6, h: 0.8, swim: true, contact: 1, drops: [['slime_ball', 1, 1, 1]], when: 'any', group: [1, 3], weight: 6, pitch: 2.4,
  models: V(() => [part(0, .62, 0, .6, .35, .6, '#ff9ad8', 'bob', null, true), part(-.15, .3, -.15, .05, .4, .05, '#ffb8e8', 'tail', [0, .45, 0]), part(.15, .3, .15, .05, .4, .05, '#ffb8e8', 'tail', [0, .45, 0]), part(.15, .25, -.15, .05, .45, .05, '#ffb8e8', 'tail', [0, .45, 0]), part(-.15, .28, .15, .05, .42, .05, '#ffb8e8', 'tail', [0, .45, 0])]) });
mobDef('gummy_bear', { name: 'Gummy Bear', hp: 8, speed: 1.5, w: 0.5, h: 1.0, drops: [['candy', 1, 2, 1]], on: ['frosting', 'icing'], group: [2, 4], weight: 10, pitch: 1.4,
  models: V(i => { const col = ['#ff4a6a', '#5ad85a', '#ffd23a', '#ff9a3a'][i]; const b = biped({ legH: .25, legW: .16, bodyW: .46, bodyH: .48, bodyD: .36, armW: .13, armH: .3, headS: .4, body: col, legs: col, head: col }); b.P.push(part(-.15, b.hy + .22, 0, .1, .1, .06, col, 'head', b.piv), part(.15, b.hy + .22, 0, .1, .1, .06, col, 'head', b.piv)); return b.P; }, 4) });
mobDef('jelly_slime', { name: 'Jelly Slime', hostile: 1, hp: 10, speed: 2, w: 0.8, h: 0.8, dmg: 2, hop: true, drops: [['candy', 1, 1, 1], ['slime_ball', 0, 1, 1]], when: 'any', weight: 5, pitch: 1.2,
  models: V(() => blob(.8, '#ff7ac0', '#3a1a2a')) });
mobDef('raptor', { name: 'Raptor', hostile: 1, hp: 16, speed: 4.0, w: 0.6, h: 1.3, dmg: 4, dino: true, drops: [['dino_meat', 1, 2, 1]], when: 'any', group: [2, 3], weight: 7, pitch: 1.1,
  models: V(() => theropod({ legH: .55, bodyW: .42, bodyH: .45, bodyL: .95, tailL: .9, headW: .3, headH: .3, headD: .5, body: '#6a8a3a', stripe: '#3a5a22', eye: '#ffcf3a' })) });
mobDef('hornback', { name: 'Hornback', hostile: 2, hp: 36, speed: 1.2, w: 1.3, h: 1.7, dmg: 6, dino: true, drops: [['dino_meat', 3, 4, 1]], on: ['jungle_grass', 'mud'], group: [1, 3], weight: 7, pitch: 0.45,
  models: V(() => { const q = quad({ legH: .6, legW: .34, bodyW: 1.2, bodyH: .95, bodyL: 1.7, head: [.8, .7, .6], headY: -.05, body: '#a8784a', legs: '#8a6038' });
    q.P.push(part(0, q.hy + .28, q.hz - .32, 1.2, .9, .12, '#d8a050', 'head', q.piv), part(-.25, q.hy + .4, q.hz + .1, .1, .1, .5, '#f4ecd8', 'head', q.piv), part(.25, q.hy + .4, q.hz + .1, .1, .1, .5, '#f4ecd8', 'head', q.piv), part(0, q.hy + .05, q.hz + .4, .1, .2, .1, '#f4ecd8', 'head', q.piv), part(0, q.by, -1.1, .3, .3, .6, '#a8784a', 'tail', [0, q.by, -.85]));
    return q.P; }) });
mobDef('treetop', { name: 'Treetop', hp: 50, speed: 0.9, w: 1.6, h: 2.6, dino: true, drops: [['dino_meat', 4, 6, 1]], on: ['jungle_grass'], group: [1, 2], weight: 4, pitch: 0.3,
  models: V(() => { const q = quad({ legH: 1.0, legW: .42, bodyW: 1.4, bodyH: 1.2, bodyL: 2.2, head: [.01, .01, .01], headY: 0, body: '#7a9a6a', legs: '#6a8a5a' });
    q.P.pop(); q.P.pop(); q.P.pop();
    const by = q.by, piv = [0, by + 2.6, 1.6];
    q.P.push(part(0, by + .6, 1.25, .5, .5, .6, '#7a9a6a'), part(0, by + 1.3, 1.45, .42, 1.0, .42, '#7a9a6a'), part(0, by + 2.1, 1.6, .38, .9, .38, '#7a9a6a'), part(0, by + 2.7, 1.8, .45, .38, .6, '#7a9a6a', 'head', piv));
    eyes(q.P, by + 2.78, 2.1, .45, '#111111', false, piv, .4);
    q.P.push(part(0, by, -1.75, .4, .4, 1.4, '#7a9a6a', 'tail', [0, by, -1.1]), part(0, by + .61, 0, .3, .04, 1.8, '#5a7a4a'));
    return q.P; }) });
mobDef('kingjaw', { name: 'Kingjaw', hostile: 1, hp: 60, speed: 3.3, w: 1.5, h: 2.8, dmg: 8, dino: true, scale: 2.1, drops: [['dino_meat', 3, 4, 1], ['amber', 1, 2, 1]], when: 'any', group: [1, 1], weight: 1, pitch: 0.3, aggro: 22,
  models: V(() => theropod({ legH: .55, bodyW: .5, bodyH: .5, bodyL: .95, tailL: .9, headW: .42, headH: .38, headD: .6, body: '#5a3a2a', stripe: '#8a2a1a', eye: '#ff3a1a', teeth: true })) });
mobDef('crystal_golem', { name: 'Crystal Golem', hostile: 1, hp: 30, speed: 2.0, w: 0.9, h: 2.2, dmg: 5, drops: [['prism_shard', 1, 2, 1]], when: 'any', group: [1, 2], weight: 8, pitch: 0.6,
  models: V(() => { const b = biped({ legH: .7, legW: .32, bodyW: .9, bodyH: .9, bodyD: .5, armW: .3, armH: .95, headS: .5, body: '#8a6ac8', legs: '#6a4aa8', head: '#c8a0ff', eye: '#ffffff', glow: true });
    b.P.push(part(-.45, 1.75, 0, .18, .35, .18, '#5affa0', null, null, true), part(.45, 1.75, 0, .18, .35, .18, '#ff5ad8', null, null, true), part(0, 1.15, .26, .26, .26, .04, '#ffe45a', null, null, true)); return b.P; }) });
mobDef('prism_moth', { name: 'Prism Moth', hp: 4, speed: 1.8, w: 0.5, h: 0.4, fly: true, hover: 3, drops: [], when: 'any', group: [1, 3], weight: 8, pitch: 2.2,
  models: V(i => flyer({ s: .26, body: '#e8e0ff', wing: .45, wingCol: ['#ff8ad8', '#8ad8ff', '#ffe08a'][i], glowWings: true }), 3) });

// ---- more creatures to find ----
function foxModel(body, legs, tip) {
  const q = quad({ legH: .22, legW: .12, bodyW: .34, bodyH: .3, bodyL: .62, head: [.32, .28, .3], headY: .12, body, legs });
  q.P.push(part(0, q.hy - .06, q.hz + .18, .14, .1, .12, '#f4ece0', 'head', q.piv), part(-.1, q.hy + .18, q.hz - .04, .08, .12, .05, body, 'head', q.piv), part(.1, q.hy + .18, q.hz - .04, .08, .12, .05, body, 'head', q.piv),
    part(0, q.by + .05, -.47, .14, .14, .36, body, 'tail', [0, q.by, -.31]), part(0, q.by + .05, -.69, .14, .14, .1, tip, 'tail', [0, q.by, -.31]));
  return q.P;
}
mobDef('shimmerwing', { name: 'Shimmerwing', hp: 2, speed: 1.4, w: 0.4, h: 0.3, fly: true, hover: 2, flap: 0.6, drops: [], when: 'day', group: [2, 4], weight: 7, pitch: 2.6,
  models: V(i => flyer({ s: .16, body: '#2a2a3a', wing: .34, wingCol: ['#ff7ad8', '#7ad8ff', '#ffd84a'][i], glowWings: true }), 3) });
mobDef('bramble_fox', { name: 'Bramble Fox', hp: 6, speed: 2.8, w: 0.45, h: 0.6, shy: 6, drops: [['berries', 0, 1, 1]], on: ['grass'], group: [1, 2], weight: 6, pitch: 1.7,
  models: V(() => foxModel('#e2762a', '#3a2a20', '#f4ece0')) });
mobDef('frost_fox', { name: 'Frost Fox', hp: 6, speed: 2.8, w: 0.45, h: 0.6, shy: 6, drops: [['raw_meat', 0, 1, 1]], on: ['snow', 'grass_snow'], group: [1, 2], weight: 6, pitch: 1.8,
  models: V(() => foxModel('#eef2f8', '#b8c4d4', '#a8d0ff')) });
mobDef('shade_bat', { name: 'Shade Bat', hostile: 1, hp: 6, speed: 3.2, w: 0.5, h: 0.4, dmg: 2, fly: true, hover: 3, flap: 1.4, drops: [['coal', 0, 1, 1]], when: 'night', group: [1, 2], weight: 3, pitch: 2.8,
  models: V(() => flyer({ s: .3, body: '#2a2238', wing: .45, wingCol: '#3a2e52', eye: '#ff4a6a', glowEye: true })) });
mobDef('golden_hopbun', { name: 'Golden Hopbun', hp: 4, speed: 3.6, w: 0.4, h: 0.5, shy: 9, drops: [['gold_ingot', 1, 2, 1]], on: ['grass'], group: [1, 1], weight: 0.6, pitch: 2,
  models: V(() => { const q = quad({ legH: .1, legW: .1, bodyW: .3, bodyH: .28, bodyL: .42, head: [.26, .26, .26], headY: .12, body: '#ffd23f' });
    q.P.push(part(-.06, q.hy + .24, q.hz - .02, .06, .26, .05, '#ffe27a', 'head', q.piv), part(.06, q.hy + .24, q.hz - .02, .06, .26, .05, '#ffe27a', 'head', q.piv), part(0, q.by + .05, -.24, .12, .12, .08, '#fff8d8', null, null, true));
    return q.P; }) });
mobDef('cinder_golem', { name: 'Cinder Golem', hostile: 1, hp: 36, speed: 1.6, w: 1.0, h: 2.4, dmg: 6, fireproof: true, drops: [['coal', 2, 3, 1], ['fire_opal', 1, 1, .15]], when: 'any', group: [1, 1], weight: 3, pitch: 0.4,
  models: V(() => { const b = biped({ legH: .8, legW: .34, bodyW: 1.0, bodyH: 1.0, bodyD: .6, armW: .32, armH: 1.0, headS: .55, body: '#2e2422', legs: '#241a18', head: '#3a2a26', eye: '#ff9a2a', glow: true });
    b.P.push(part(.2, 1.35, .31, .32, .06, .02, '#ff6a1a', null, null, true), part(-.25, 1.05, .31, .06, .34, .02, '#ff6a1a', null, null, true), part(.05, 1.0, .31, .4, .05, .02, '#ffb03a', null, null, true), part(0, 1.3, -.31, .5, .06, .02, '#ff6a1a', null, null, true));
    return b.P; }) });
mobDef('emberling', { name: 'Emberling', hp: 4, speed: 1.6, w: 0.35, h: 0.5, fly: true, hover: 2, fireproof: true, drops: [['coal', 1, 1, .5]], when: 'any', group: [2, 3], weight: 6, pitch: 2.4,
  models: V(() => [part(0, .3, 0, .3, .3, .3, '#ffb03a', 'bob', null, true), part(0, .52, 0, .16, .2, .16, '#ff6a1a', 'bob', null, true), part(0, .66, 0, .07, .1, .07, '#fff07a', 'bob', null, true),
    part(-.07, .33, .16, .05, .06, .02, '#3a1a0a', 'bob'), part(.07, .33, .16, .05, .06, .02, '#3a1a0a', 'bob')]) });
mobDef('tusker', { name: 'Woolly Tusker', hostile: 2, hp: 30, speed: 1.2, w: 1.3, h: 1.9, dmg: 5, drops: [['wool', 2, 3, 1], ['raw_meat', 2, 3, 1]], on: ['snow'], group: [1, 2], weight: 4, pitch: 0.4,
  models: V(() => { const q = quad({ legH: .7, legW: .34, bodyW: 1.2, bodyH: 1.0, bodyL: 1.6, head: [.7, .65, .55], headY: .05, body: '#8a6a4a', legs: '#6a5038' });
    q.P.push(part(0, q.by + .56, 0, 1.1, .15, 1.4, '#a8845a'), part(0, q.hy - .38, q.hz + .24, .16, .55, .16, '#8a6a4a', 'head', q.piv), part(-.2, q.hy - .3, q.hz + .3, .08, .08, .42, '#f4ecd8', 'head', q.piv), part(.2, q.hy - .3, q.hz + .3, .08, .08, .42, '#f4ecd8', 'head', q.piv),
      part(-.42, q.hy, q.hz - .1, .1, .42, .32, '#7a5a3a', 'head', q.piv), part(.42, q.hy, q.hz - .1, .1, .42, .32, '#7a5a3a', 'head', q.piv));
    return q.P; }) });
mobDef('sky_whale', { name: 'Sky Whale', hp: 60, speed: 1.2, w: 2.8, h: 2.2, fly: true, cruise: 10, flap: 0.22, drops: [['skyshard', 1, 1, .5]], when: 'any', group: [1, 1], weight: 2.5, pitch: 0.2,
  models: V(() => [part(0, 1.2, 0, 2.6, 2.0, 5.5, '#7aa8e8', 'bob'), part(0, .26, .3, 2.2, .3, 4.6, '#e8f0ff', 'bob'), part(0, 1.25, -3.6, .6, .5, 1.7, '#6a98d8', 'tail', [0, 1.3, -2.75]),
    part(0, 1.3, -4.5, 2.2, .15, .7, '#6a98d8', 'tail', [0, 1.3, -2.75]), part(-1.75, .9, 1.0, 1.5, .12, .8, '#6a98d8', 'wingL', [-1.3, .9, 1.0]), part(1.75, .9, 1.0, 1.5, .12, .8, '#6a98d8', 'wingR', [1.3, .9, 1.0]),
    part(-1.31, 1.45, 1.9, .03, .2, .2, '#101828', 'bob'), part(1.31, 1.45, 1.9, .03, .2, .2, '#101828', 'bob'), part(-1.31, 1.05, 2.05, .03, .14, .3, '#ffa8c8', 'bob'), part(1.31, 1.05, 2.05, .03, .14, .3, '#ffa8c8', 'bob'),
    part(0, 2.21, .8, .5, .03, .5, '#c8e8ff', 'bob', null, true)]) });
mobDef('shroomling', { name: 'Shroomling', hp: 5, speed: 1.4, w: 0.5, h: 0.65, hop: true, hopV: 5, drops: [['glowshroom', 1, 1, 1]], on: ['deep_moss'], group: [2, 4], weight: 8, pitch: 2.2,
  models: V(() => [part(0, .2, 0, .3, .4, .3, '#e8e0d0'), part(0, .52, 0, .62, .26, .62, '#3ad8ff', null, null, true), part(.14, .66, .14, .1, .03, .1, '#e8ffff', null, null, true),
    part(-.18, .66, -.08, .1, .03, .1, '#e8ffff', null, null, true), part(-.07, .28, .16, .05, .07, .02, '#151515'), part(.07, .28, .16, .05, .07, .02, '#151515')]) });
mobDef('crater_crab', { name: 'Crater Crab', hostile: 2, hp: 10, speed: 1.8, w: 0.8, h: 0.5, dmg: 2, drops: [['moon_cheese', 1, 1, 1], ['moonstone', 1, 1, .12]], on: ['regolith', 'lunar_ice'], group: [1, 3], weight: 7, pitch: 1.4,
  models: V(() => { const P = [part(0, .27, 0, .8, .3, .55, '#c8b8a8')];
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { const z = -.15 + i * .15; P.push(part(sx * .55, .14, z, .3, .06, .06, '#a89888', (i + (sx > 0 ? 1 : 0)) % 2 ? 'swA' : 'swB', [sx * .4, .25, z])); }
    for (const sx of [-1, 1]) P.push(part(sx * .32, .3, .42, .22, .16, .26, '#e85a3a', sx < 0 ? 'legA' : 'legB', [sx * .32, .3, .3]), part(sx * .12, .5, .22, .05, .16, .05, '#c8b8a8'), part(sx * .12, .6, .22, .08, .08, .08, '#111111'));
    return P; }) });
mobDef('octopus', { name: 'Inkwell Octopus', hp: 6, speed: 1.4, w: 0.6, h: 0.8, swim: true, drops: [['pearl', 1, 1, .15]], when: 'any', group: [1, 2], weight: 6, pitch: 1.6,
  models: V(() => { const P = [part(0, .5, 0, .6, .6, .6, '#c85ab8'), part(-.15, .55, .31, .1, .1, .02, '#111111'), part(.15, .55, .31, .1, .1, .02, '#111111')];
    for (const [x, z] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) P.push(part(x, .12, z, .1, .45, .1, '#b84aa8', 'tail', [x, .3, z]));
    return P; }) });
mobDef('puffmallow', { name: 'Puffmallow', hp: 8, speed: 1.3, w: 0.8, h: 1.1, drops: [['cotton_candy', 1, 2, 1]], on: ['frosting', 'icing'], group: [2, 3], weight: 8, pitch: 1.3,
  models: V(() => { const q = quad({ legH: .3, legW: .16, bodyW: .8, bodyH: .65, bodyL: .95, head: [.42, .4, .36], headY: .15, body: '#fff4fa', legs: '#ffb8d8', headCol: '#ffc8e0' });
    q.P.push(part(0, q.by + .38, 0, .7, .15, .8, '#ffffff'), part(-.24, q.hy + .2, q.hz - .05, .12, .1, .08, '#ffb8d8', 'head', q.piv), part(.24, q.hy + .2, q.hz - .05, .12, .1, .08, '#ffb8d8', 'head', q.piv));
    return q.P; }) });
mobDef('glidewing', { name: 'Glidewing', hp: 10, speed: 2.2, w: 0.7, h: 0.5, fly: true, hover: 7, flap: 0.5, dino: true, drops: [['dino_meat', 1, 1, .5]], when: 'any', group: [1, 2], weight: 5, pitch: 1.2,
  models: V(() => [part(0, .3, 0, .3, .25, .7, '#a87a5a', 'bob'), part(0, .38, .48, .22, .18, .3, '#a87a5a', 'bob'), part(0, .36, .74, .08, .06, .34, '#e8c87a', 'bob'), part(0, .52, .38, .06, .22, .28, '#d85a3a', 'bob'),
    part(-.77, .35, 0, 1.24, .04, .5, '#8a5a3a', 'wingL', [-.15, .35, 0]), part(.77, .35, 0, 1.24, .04, .5, '#8a5a3a', 'wingR', [.15, .35, 0]), part(-.1, .42, .6, .04, .05, .05, '#111111', 'bob'), part(.1, .42, .6, .04, .05, .05, '#111111', 'bob')]) });
mobDef('spikeback', { name: 'Spikeback', hostile: 2, hp: 32, speed: 1.0, w: 1.1, h: 1.6, dmg: 5, dino: true, drops: [['dino_meat', 2, 3, 1]], on: ['jungle_grass', 'mud'], group: [1, 2], weight: 5, pitch: 0.5,
  models: V(() => { const q = quad({ legH: .55, legW: .32, bodyW: 1.0, bodyH: .85, bodyL: 1.8, head: [.4, .38, .45], headY: -.2, body: '#6a8a5a', legs: '#5a7a4a' });
    for (let i = 0; i < 4; i++) q.P.push(part(0, q.by + .62 + (i % 2) * .08, -.6 + i * .4, .1, .45, .35, '#d86a3a'));
    q.P.push(part(0, q.by, -1.25, .25, .25, .8, '#6a8a5a', 'tail', [0, q.by, -.9]), part(-.18, q.by + .1, -1.5, .3, .06, .06, '#e8e0c8', 'tail', [0, q.by, -.9]), part(.18, q.by + .1, -1.5, .3, .06, .06, '#e8e0c8', 'tail', [0, q.by, -.9]));
    return q.P; }) });
mobDef('starhorn', { name: 'Starhorn', hp: 14, speed: 2.4, w: 0.6, h: 1.8, shy: 7, drops: [['prism_shard', 1, 2, 1]], on: ['prism_grass'], group: [1, 2], weight: 2, pitch: 1.5,
  models: V(() => { const q = quad({ legH: .8, legW: .16, bodyW: .5, bodyH: .55, bodyL: 1.2, head: [.32, .36, .55], headY: .55, body: '#f4f0ff', legs: '#e0d8f4' });
    q.P.push(part(0, q.by + .42, .5, .26, .62, .3, '#f4f0ff'), part(0, q.by + .62, .38, .08, .55, .45, '#ff8ad8'), part(0, q.hy + .3, q.hz + .1, .07, .34, .07, '#7ae8ff', 'head', q.piv, true),
      part(0, q.by + .12, -.72, .12, .5, .12, '#c8a0ff', 'tail', [0, q.by + .3, -.6]));
    return q.P; }) });
mobDef('modling', { name: 'Modling', hp: 3, speed: 4.2, w: 0.4, h: 0.4, fly: true, hover: 2.5, shy: 10, lifetime: 80, givesMod: true, drops: [], when: 'any', group: [1, 1], weight: 0.5, pitch: 3,
  models: V(() => { const P = flyer({ s: .24, body: '#ffffff', wing: .3, wingCol: '#ff8ad8', glowWings: true, tailGlow: '#fff07a', eye: '#5a3aff' }); P[0].em = true; return P; }) });

// ---- villagers (spawned by villages, not randomly) ----
function villagerModel(i) {
  const [cl, hat, legs] = [['#4a8a3a', '#e2c26a', '#2a4a22'], ['#c85a2a', '#3a3a40', '#4a3020'], ['#7a4ac8', '#5a2a9a', '#3a2060'], ['#3a6ac8', '#8a6238', '#283a60'], ['#e85aa8', '#7a3ac8', '#6a2a5a']][i];
  const b = biped({ legH: .42, legW: .18, bodyW: .58, bodyH: .6, bodyD: .4, armW: .16, armH: .52, headS: .52, body: cl, legs, arms: cl, head: '#f0c49a', eye: '#2a1a10' });
  const top = b.top, piv = b.piv, P = b.P;
  P.push(part(0, b.hy - .13, .265, .18, .04, .02, '#9a4a3a', 'head', piv));
  if (i === 0) P.push(part(0, top + .03, 0, .84, .05, .84, hat, 'head', piv), part(0, top + .12, 0, .5, .14, .5, hat, 'head', piv));
  if (i === 1) P.push(part(0, top + .06, 0, .56, .12, .56, hat, 'head', piv), part(0, top + .01, .32, .5, .04, .14, hat, 'head', piv), part(0, .72, .21, .42, .46, .02, '#5a3a24'));
  if (i === 2) P.push(part(0, top + .05, 0, .6, .1, .6, hat, 'head', piv), part(0, top + .18, 0, .38, .16, .38, hat, 'head', piv), part(0, top + .32, 0, .18, .14, .18, hat, 'head', piv), part(0, top + .14, .2, .1, .1, .02, '#ffe45a', 'head', piv, true));
  if (i === 3) P.push(part(0, top + .03, 0, .9, .04, .9, hat, 'head', piv), part(0, top + .13, 0, .54, .16, .54, hat, 'head', piv), part(0, top + .07, 0, .56, .04, .56, '#c83a3a', 'head', piv), part(.2, .9, -.22, .3, .4, .14, '#7a5a3a'));
  if (i === 4) P.push(part(0, top + .06, 0, .58, .12, .58, hat, 'head', piv), part(0, top + .2, 0, .3, .2, .3, hat, 'head', piv), part(0, top + .36, 0, .14, .14, .14, '#fff07a', 'head', piv, true));
  return P;
}
mobDef('villager', { name: 'Villager', hp: 20, speed: 1.0, w: 0.6, h: 1.7, trader: true, village: true, drops: [], when: 'any', weight: 0, pitch: 1.1, models: V(villagerModel, 5) });

// ---------------- Mob ----------------
let _mobId = 1;
class Mob {
  constructor(def, x, y, z) {
    this.def = def; this.uid = _mobId++;
    this.x = x; this.y = y; this.z = z; this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = Math.random() * 6.28; this.hp = def.hp; this.w = def.w; this.h = def.h;
    this.variant = Math.floor(Math.random() * def.models.length);
    this.timer = Math.random() * 2; this.wander = null; this.attackCD = 1; this.shootCD = 1 + Math.random() * 2; this.hopT = Math.random();
    this.hurtT = 0; this.fleeT = 0; this.angry = false; this.walk = 0; this.moveAmt = 0; this.age = 0; this.burnT = 0; this.burnTick = 0; this.lavaT = 0; this.dryT = 0;
    this.homeY = y + (def.cruise || 0); this.frozenT = 0;
  }
  damage(amount, fromPlayer, kx = 0, kz = 0) {
    if (this.dead) return;
    this.hp -= amount; this.hurtT = 0.3;
    Sound.play('mobhurt', this.def.pitch);
    this.vx += kx; this.vz += kz; if (!this.def.fly && !this.def.swim) this.vy = Math.max(this.vy, 4.5);
    if (fromPlayer) { if (this.def.hostile === 2) this.angry = true; if (this.def.hostile === 0) this.fleeT = 4; }
    Particles.burst(this.x, this.y + this.h * 0.6, this.z, [1, 0.3, 0.3], 5, 2.5, 0.08);
    if (this.hp <= 0) { this.dead = true; Game.onMobDeath(this, fromPlayer); }
  }
  update(dt) {
    const d = this.def, w = Game.world, p = Game.player, realm = Game.realm;
    this.age += dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (d.lifetime && this.age > d.lifetime) { this.dead = true; this.despawned = true; Particles.burst(this.x, this.y + .3, this.z, [1, .8, 1], 14, 3, 0.08, true); return; }
    if (this.frozenT > 0) { this.frozenT -= dt; return; }
    if (this.attackCD > 0) this.attackCD -= dt;
    this.shootCD -= dt;
    if (d.burnsInSun && realm.sky.mode === 'cycle' && !this.inWater && Game.dayFactor() > 0.6 && w.skyAt(this.x, this.y + this.h * d.scale + 0.2, this.z) >= 0.99) {
      if (this.burnT <= 0.5) { this.burnT = 1.5; this.sunBurn = true; }
    }
    if (this.burnT > 0) {
      this.burnT -= dt; this.burnTick -= dt;
      if (Math.random() < (this.sunBurn ? 0.6 : 0.3)) Particles.add(this.x + (Math.random() - .5) * this.w, this.y + Math.random() * this.h * d.scale, this.z + (Math.random() - .5) * this.w, 0, 1.5, 0, 0.5, 0.07, 1, 0.45 + Math.random() * 0.4, 0.1, 1, 0, true);
      if (this.burnTick <= 0) {
        this.burnTick = 0.8;
        if (this.sunBurn) this.damage(2, false); else this.damage(1 + Game.stats.flamefist * 0.5, true);
        Particles.burst(this.x, this.y + this.h / 2, this.z, [1, .5, .1], 4, 1.5, 0.1, true);
      }
      if (this.burnT <= 0) this.sunBurn = false;
    }
    const dx = p.x - this.x, dz = p.z - this.z, dy = (p.y + 0.9) - (this.y + this.h / 2);
    const dist = Math.hypot(dx, dz) || 0.001, dist3 = Math.hypot(dx, dy, dz);
    const friendly = Game.creative || p.dead || (Game.stats.dinofriend && (d.dino || Game.stats.dinofriend >= 2 && d.hostile !== 1 || Game.stats.dinofriend >= 3)) || Settings.data.difficulty === 'peaceful';
    const hostile = (d.hostile === 1 || this.angry) && !friendly && dist3 < (d.aggro || 16) * (Game.player.sneaking ? 0.6 : 1);
    const fb = w.blockAt(Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z));
    this.inWater = LIQ[fb] === 1 || LIQ[fb] === 3 || WLOG[fb] === 1; this.inLava = LIQ[fb] === 2;
    let mvx = 0, mvz = 0, speed = d.speed;
    if (d.shy && dist3 < d.shy && !p.dead) this.fleeT = Math.max(this.fleeT, 1.5);
    if (this.fleeT > 0) {
      this.fleeT -= dt; const a = Math.atan2(-dx, -dz); mvx = Math.sin(a); mvz = Math.cos(a); speed *= 1.7; this.yaw = a;
    } else if (hostile) {
      this.yaw = Math.atan2(dx, dz);
      if (d.ranged) {
        if (dist > 9) { mvx = dx / dist; mvz = dz / dist; } else if (dist < 5) { mvx = -dx / dist; mvz = -dz / dist; }
        if (this.shootCD <= 0 && dist3 < 20) { this.shootCD = d.ranged.rate * (0.8 + Math.random() * 0.4); Projectiles.fire(this, d.ranged); }
      } else if (dist > d.w / 2 * d.scale + 0.5) { mvx = dx / dist; mvz = dz / dist; speed *= 1.2; }
      if (!d.ranged && dist3 < (d.w / 2) * d.scale + 1.1 && Math.abs(dy) < this.h * d.scale + 0.5 && this.attackCD <= 0) { this.attackCD = 1.1; Game.hurtPlayer(d.dmg, this); }
    } else if (d.trader && dist3 < 4) {
      this.yaw = Math.atan2(dx, dz); this.wander = null;
    } else {
      this.timer -= dt;
      if (this.timer <= 0) { this.timer = 2 + Math.random() * 4; this.wander = Math.random() < 0.6 ? Math.random() * 6.28 : null; }
      if (this.homePos && Math.hypot(this.x - this.homePos[0], this.z - this.homePos[1]) > 12) { this.wander = Math.atan2(this.homePos[0] - this.x, this.homePos[1] - this.z); this.timer = Math.max(this.timer, 1.5); }
      if (this.wander !== null) { mvx = Math.sin(this.wander); mvz = Math.cos(this.wander); speed *= 0.5; this.yaw = this.wander; }
    }
    if (d.contact && dist3 < d.w / 2 + 0.7 && this.attackCD <= 0 && !friendly) { this.attackCD = 1; Game.hurtPlayer(d.contact, this); }
    const g = 26 * realm.gravity;
    if (d.fly) {
      const gy = groundBelow(w, this.x, this.y, this.z, 16);
      let ty = hostile ? p.y + 1.6 + (d.ranged ? 1.5 : 0) : (d.cruise ? this.homeY : gy + (d.hover || 3)) + Math.sin(this.age * 0.7 + this.uid) * 1.2;
      this.vy += clamp(ty - this.y, -3, 3) * 3 * dt; this.vy *= Math.pow(0.4, dt);
      this.vx = mvx * speed; this.vz = mvz * speed;
      physMove(w, this, this.vx * dt, this.vy * dt, this.vz * dt);
      if (this.hitX || this.hitZ) { this.vy += 3; if (!hostile) this.wander = Math.random() * 6.28; }
    } else if (d.swim) {
      if (this.inWater) {
        const above = w.blockAt(Math.floor(this.x), Math.floor(this.y + this.h + 0.4), Math.floor(this.z));
        let ty = hostile && Game.player.inWater ? p.y + 0.4 : this.y + Math.sin(this.age * 0.8 + this.uid) * 0.6;
        if (LIQ[above] !== 1 && !WLOG[above]) ty = Math.min(ty, this.y - 0.6);
        this.vy += clamp(ty - this.y, -1, 1) * 4 * dt; this.vy *= Math.pow(0.3, dt);
        if (!(hostile && Game.player.inWater) && !this.wander && this.fleeT <= 0) { mvx = Math.sin(this.yaw) * 0.4; mvz = Math.cos(this.yaw) * 0.4; }
        this.vx = mvx * speed; this.vz = mvz * speed;
        const ahead = w.blockAt(Math.floor(this.x + mvx * 0.9), Math.floor(this.y + this.h * 0.5), Math.floor(this.z + mvz * 0.9));
        if (LIQ[ahead] !== 1 && !WLOG[ahead]) { this.vx = -this.vx; this.vz = -this.vz; this.wander = (this.wander || this.yaw) + Math.PI; this.yaw += Math.PI; }
        physMove(w, this, this.vx * dt, this.vy * dt, this.vz * dt);
        this.dryT = 0;
      } else {
        this.vy -= g * dt;
        if (this.onGround && Math.random() < 0.04) { this.vy = 4; this.vx = (Math.random() - .5) * 3; this.vz = (Math.random() - .5) * 3; }
        physMove(w, this, this.vx * dt, this.vy * dt, this.vz * dt);
        this.dryT += dt; if (this.dryT > 5) { this.dryT = 3; this.damage(1, false); }
      }
    } else {
      if (this.inWater) { this.vy += (6 - this.vy) * Math.min(1, dt * 3); if (this.vy > 2.4) this.vy = 2.4; }
      else this.vy -= g * dt;
      if (d.hop) {
        if (this.onGround) {
          this.vx *= 0.4; this.vz *= 0.4; this.hopT -= dt;
          if (this.hopT <= 0 && (mvx || mvz)) { this.vy = (d.hopV || 7.5) * Math.sqrt(realm.gravity); this.vx = mvx * speed * 1.6; this.vz = mvz * speed * 1.6; this.hopT = hostile ? 0.5 : 1 + Math.random(); }
        }
      } else {
        const acc = this.onGround || this.inWater ? 10 : 2;
        this.vx += (mvx * speed - this.vx) * Math.min(1, acc * dt);
        this.vz += (mvz * speed - this.vz) * Math.min(1, acc * dt);
      }
      if (!hostile && this.onGround && (mvx || mvz)) {
        const ax = Math.floor(this.x + mvx * (d.w / 2 + 0.5)), az = Math.floor(this.z + mvz * (d.w / 2 + 0.5)), fy = Math.floor(this.y + 0.01);
        const b0 = w.blockAt(ax, fy, az), b1 = w.blockAt(ax, fy - 1, az), b2 = w.blockAt(ax, fy - 2, az), b3 = w.blockAt(ax, fy - 3, az);
        if ((!SOLID[b1] && !SOLID[b2] && !SOLID[b3] && !LIQ[b1]) || LIQ[b0] === 2 || LIQ[b1] === 2 || (LIQ[b1] && !d.swim && !this.inWater && Math.random() < 0.7)) {
          this.vx = 0; this.vz = 0; this.wander = Math.random() * 6.28; this.timer = 1.5;
        }
      }
      physMove(w, this, this.vx * dt, this.vy * dt, this.vz * dt);
      if ((this.hitX || this.hitZ) && (this.onGround || this.inWater) && !d.hop) this.vy = 8.3 * Math.sqrt(realm.gravity);
    }
    if (this.inLava && !d.fireproof) { this.lavaT -= dt; if (this.lavaT <= 0) { this.lavaT = 0.5; this.damage(2, false); } }
    const sp = Math.hypot(this.vx, this.vz);
    this.walk += sp * dt * 3.2; this.moveAmt = Math.min(1, sp / Math.max(0.5, d.speed * 0.5));
    if (this.y < -24) this.dead = true;
  }
}
function groundBelow(w, x, y, z, max) {
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let k = 0; k < max; k++) { const id = w.getBlock(bx, Math.floor(y) - k, bz); if (id < 0 || SOLID[id] || LIQ[id]) return Math.floor(y) - k + 1; }
  return Math.floor(y) - max;
}

// ---------------- Entity manager ----------------
const Mobs = {
  list: [], spawnT: 0,
  clear() { this.list = []; },
  update(dt) {
    const p = Game.player;
    for (const m of this.list) {
      if (Math.hypot(m.x - p.x, m.z - p.z) > 26 * 4 && !m.isBoss) { m.dead = true; m.despawned = true; continue; }
      if (!Game.world.isLoaded(Math.floor(m.x), Math.floor(m.z))) continue;
      m.update(dt);
    }
    this.list = this.list.filter(m => !m.dead);
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.5; this.trySpawn(); }
  },
  trySpawn() {
    const realm = Game.realm, p = Game.player, w = Game.world;
    if (!realm.mobs || p.dead) return;
    let hostileN = 0, passiveN = 0;
    const perType = {};
    for (const m of this.list) { if (m.def.hostile === 1) hostileN++; else passiveN++; perType[m.def.key] = (perType[m.def.key] || 0) + 1; }
    const sun = Game.sunLevel();
    const peaceful = Settings.data.difficulty === 'peaceful';
    const defs = realm.mobs.map(k => MOBS[k]).filter(d => {
      if (d.hostile === 1 && (peaceful || hostileN >= 9)) return false;
      if (d.hostile !== 1 && passiveN >= 12) return false;
      if ((perType[d.key] || 0) >= (d.weight <= 2.5 ? 1 : d.hostile === 1 ? 4 : 6)) return false;
      return true;
    });
    if (!defs.length) return;
    let tot = defs.reduce((a, d) => a + d.weight, 0), r = Math.random() * tot, def = defs[0];
    for (const d of defs) { r -= d.weight; if (r <= 0) { def = d; break; } }
    for (let attempt = 0; attempt < 4; attempt++) {
      const ang = Math.random() * 6.28, dist = 18 + Math.random() * 28;
      const x = Math.floor(p.x + Math.cos(ang) * dist), z = Math.floor(p.z + Math.sin(ang) * dist);
      if (!w.isLoaded(x, z)) continue;
      const spot = findSpawnSpot(w, def, x, z, p.y);
      if (spot === null) continue;
      const sky = w.skyAt(x + .5, spot + 1, z + .5);
      if (def.when === 'day' && !realm.hasCeiling && (sun < 0.45 || sky < 0.5)) continue;
      if (def.when === 'night' && !realm.hasCeiling && !(sun < 0.42 && sky > 0.4) && sky > 0.25) continue;
      const n = def.group[0] + Math.floor(Math.random() * (def.group[1] - def.group[0] + 1));
      for (let i = 0; i < n; i++) {
        const ox = i ? (Math.random() - .5) * 4 : 0, oz = i ? (Math.random() - .5) * 4 : 0;
        const m = new Mob(def, x + .5 + ox, spot + (def.fly ? 1 : 0.01), z + .5 + oz);
        if (boxCollides(w, m.x, m.y, m.z, m.w, m.h)) { if (i === 0) break; continue; }
        this.list.push(m);
      }
      return;
    }
  },
};
function findSpawnSpot(w, def, x, z, py) {
  const y0 = Math.min(HEIGHT - 3, Math.floor(py) + 18), y1 = Math.max(1, Math.floor(py) - 22);
  const hh = Math.ceil(def.h * def.scale);
  if (def.swim) {
    for (let y = y0; y >= y1; y--) { const a = w.blockAt(x, y, z), b = w.blockAt(x, y + 1, z); if ((LIQ[a] === 1 || WLOG[a]) && (LIQ[b] === 1 || WLOG[b])) return y; }
    return null;
  }
  for (let y = y0; y >= y1; y--) {
    const below = w.getBlock(x, y - 1, z);
    if (below < 0 || !SOLID[below]) continue;
    let ok = true;
    for (let k = 0; k < hh; k++) { const id = w.blockAt(x, y + k, z); if (SOLID[id] || LIQ[id]) { ok = false; break; } }
    if (!ok) continue;
    if (def.on && !def.on.some(k => B[k] === below)) return null;
    if (def.fly) return y + 1 + Math.floor(Math.random() * 3);
    return y;
  }
  return null;
}

// ---------------- projectiles ----------------
const Projectiles = {
  list: [],
  fire(from, r, target) {
    const p = Game.player, tg = target || [p.x, p.y + 1.2, p.z];
    const sx = from.x, sy = from.y + from.h * 0.6 * (from.def ? from.def.scale : 1), sz = from.z;
    let dx = tg[0] - sx, dy = tg[1] - sy, dz = tg[2] - sz;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    this.list.push({ x: sx, y: sy, z: sz, vx: dx * r.speed, vy: dy * r.speed, vz: dz * r.speed, dmg: r.dmg, c: hexRgb(r.color).map(v => v / 255), life: 4, size: r.size || 0.22 });
    Sound.play('shoot');
  },
  update(dt) {
    const w = Game.world, p = Game.player;
    for (const b of this.list) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
      if (Math.random() < 0.5) Particles.add(b.x, b.y, b.z, 0, 0.3, 0, 0.35, 0.08, b.c[0], b.c[1], b.c[2], 0.8, 0, true);
      if (w.solidAt(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z))) { b.life = 0; Particles.burst(b.x, b.y, b.z, b.c, 6, 2, 0.08, true); continue; }
      if (b.fromPlayer) {
        for (const m of Game.boss ? [...Mobs.list, Game.boss] : Mobs.list) {
          const hw = m.w * (m.def.scale || 1) / 2 + 0.2;
          if (m.dead || Math.abs(b.x - m.x) > hw || Math.abs(b.z - m.z) > hw || b.y < m.y - 0.2 || b.y > m.y + m.h * (m.def.scale || 1) + 0.2) continue;
          b.life = 0; m.damage(b.dmg, true, b.vx * 0.2, b.vz * 0.2);
          if (b.freeze && !m.isBoss) m.frozenT = b.freeze;
          Particles.burst(b.x, b.y, b.z, b.c, 12, 3, 0.09, true); break;
        }
        continue;
      }
      if (!p.dead && Math.abs(b.x - p.x) < 0.5 && Math.abs(b.z - p.z) < 0.5 && b.y > p.y && b.y < p.y + 1.8) {
        b.life = 0; Game.hurtPlayer(b.dmg, null); Particles.burst(b.x, b.y, b.z, b.c, 8, 2.5, 0.08, true);
      }
    }
    this.list = this.list.filter(b => b.life > 0);
  },
};

// ---------------- particles ----------------
const Particles = {
  list: [],
  add(x, y, z, vx, vy, vz, life, size, r, g, b, a, grav, em) {
    if (this.list.length > 900) this.list.shift();
    this.list.push({ x, y, z, vx, vy, vz, life, max: life, size, r, g, b, a, grav, em });
  },
  burst(x, y, z, c, n, sp, size = 0.1, em = false, grav = 12) {
    for (let i = 0; i < n; i++) this.add(x, y, z, (Math.random() - .5) * sp, Math.random() * sp * 0.8, (Math.random() - .5) * sp, 0.5 + Math.random() * 0.5, size * (0.6 + Math.random() * 0.8), c[0], c[1], c[2], 1, em ? 0 : grav, em);
  },
  blockBreak(x, y, z, id) {
    const c = AVG_COLOR[id] || [200, 200, 200];
    for (let i = 0; i < 14; i++) {
      const k = 0.75 + Math.random() * 0.4;
      this.add(x + .2 + Math.random() * .6, y + .2 + Math.random() * .6, z + .2 + Math.random() * .6, (Math.random() - .5) * 4, Math.random() * 4, (Math.random() - .5) * 4, 0.6 + Math.random() * 0.5, 0.08 + Math.random() * 0.08, c[0] / 255 * k, c[1] / 255 * k, c[2] / 255 * k, 1, 16, EMIT[id] === 1);
    }
  },
  update(dt) {
    const w = Game.world;
    for (const p of this.list) {
      p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
      if (p.grav && w.solidAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) { p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; p.y = Math.floor(p.y) + 1.001; }
    }
    this.list = this.list.filter(p => p.life > 0);
  },
};

// ---------------- Boss: the Prism Guardian ----------------
class Boss {
  constructor(x, y, z) {
    this.isBoss = true; this.def = { name: 'Prism Guardian', scale: 1, hostile: 1, w: 2, h: 3, pitch: 0.4 };
    this.x = x; this.y = y; this.z = z; this.vx = this.vy = this.vz = 0; this.w = 2.2; this.h = 3.2;
    this.maxHp = 320; this.hp = this.maxHp; this.t = 0; this.shootT = 3; this.summonT = 14; this.hurtT = 0; this.ang = 0;
  }
  damage(amount, fromPlayer) {
    if (this.dead) return;
    this.hp -= amount; this.hurtT = 0.25; Sound.play('mobhurt', 0.4);
    Particles.burst(this.x, this.y + 1.5, this.z, [0.9, 0.6, 1], 10, 4, 0.12, true);
    if (this.hp <= 0) { this.dead = true; Game.onBossDeath(this); }
  }
  update(dt) {
    const p = Game.player;
    this.t += dt; if (this.hurtT > 0) this.hurtT -= dt;
    const rage = this.hp < this.maxHp / 2;
    this.ang += dt * (rage ? 0.55 : 0.35);
    const tx = Math.cos(this.ang) * 9, tz = Math.sin(this.ang) * 9, ty = 66 + Math.sin(this.t * 0.8) * 2;
    this.x += (tx - this.x) * Math.min(1, dt * 1.5); this.z += (tz - this.z) * Math.min(1, dt * 1.5); this.y += (ty - this.y) * Math.min(1, dt * 1.5);
    if (p.dead || Game.creative) return;
    this.shootT -= dt;
    if (this.shootT <= 0) {
      this.shootT = rage ? 1.6 : 2.6;
      const n = rage ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const sp = (i - (n - 1) / 2) * 0.18;
        const dx = p.x - this.x, dz = p.z - this.z, a = Math.atan2(dz, dx) + sp, l = Math.hypot(dx, dz);
        const tx2 = this.x + Math.cos(a) * l, tz2 = this.z + Math.sin(a) * l;
        const src = { x: this.x, y: this.y, z: this.z, h: 3, def: { scale: 1 } };
        Projectiles.fire(src, { dmg: 3, speed: rage ? 13 : 10, color: ['#ff5a6e', '#ffe45a', '#5ab4ff', '#5affa0', '#c46aff'][i % 5], size: 0.35 }, [tx2, p.y + 1.2, tz2]);
      }
    }
    this.summonT -= dt;
    if (this.summonT <= 0) {
      this.summonT = rage ? 14 : 20;
      for (let i = 0; i < (rage ? 2 : 1); i++) {
        const a = Math.random() * 6.28, x = Math.cos(a) * 8, z = Math.sin(a) * 8;
        const m = new Mob(MOBS.crystal_golem, x, 61.01, z); m.angry = true;
        if (!boxCollides(Game.world, m.x, m.y, m.z, m.w, m.h)) Mobs.list.push(m);
      }
      Particles.burst(this.x, this.y, this.z, [1, 0.8, 1], 30, 8, 0.15, true);
    }
    if (Math.hypot(p.x - this.x, p.z - this.z) < 2.2 && Math.abs(p.y + 1 - (this.y + 1.5)) < 2.5) Game.hurtPlayer(4, this);
  }
}

// ---------------- drawing ----------------
function drawMob(batch, m, t) {
  const d = m.def, sc = d.scale || 1;
  const parts = d.models[m.variant];
  const cy = Math.cos(m.yaw), sy = Math.sin(m.yaw);
  const sky = Game.world.skyAt(m.x, m.y + m.h * 0.7, m.z);
  const swing = Math.sin(m.walk) * 0.7 * m.moveAmt;
  const bob = d.fly ? Math.sin(t * 3 + m.uid) * 0.08 : 0;
  const hurt = m.hurtT > 0, burn = m.burnT > 0;
  for (const pt of parts) {
    let ang = 0, axis = 0;
    switch (pt.anim) {
      case 'legA': ang = swing; axis = 0; break;
      case 'legB': ang = -swing; axis = 0; break;
      case 'head': ang = Math.sin(t * 1.7 + m.uid) * 0.06; axis = 0; break;
      case 'tail': ang = Math.sin(t * 4 + m.uid) * 0.35; axis = 1; break;
      case 'wingL': ang = Math.sin(t * 14 * (d.flap || 1) + m.uid) * 0.7; axis = 2; break;
      case 'wingR': ang = -Math.sin(t * 14 * (d.flap || 1) + m.uid) * 0.7; axis = 2; break;
      case 'spin': ang = t * 2.5; axis = 1; break;
      case 'swA': ang = swing * 0.5; axis = 1; break;
      case 'swB': ang = -swing * 0.5; axis = 1; break;
    }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const hw = pt.w / 2, hh = pt.h / 2, hd = pt.d / 2;
    const C = [];
    for (const [ox, oy, oz] of [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd], [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]]) {
      let x = pt.x + ox, y = pt.y + oy, z = pt.z + oz;
      if (ang) {
        let rx = x - pt.pivot[0], ry = y - pt.pivot[1], rz = z - pt.pivot[2];
        if (axis === 0) { const ny = ry * ca - rz * sa, nz = ry * sa + rz * ca; ry = ny; rz = nz; }
        else if (axis === 1) { const nx = rx * ca + rz * sa, nz = -rx * sa + rz * ca; rx = nx; rz = nz; }
        else { const nx = rx * ca - ry * sa, ny = rx * sa + ry * ca; rx = nx; ry = ny; }
        x = rx + pt.pivot[0]; y = ry + pt.pivot[1]; z = rz + pt.pivot[2];
      }
      x *= sc; y *= sc; z *= sc;
      C.push([m.x + x * cy + z * sy, m.y + y + bob, m.z - x * sy + z * cy]);
    }
    let r = pt.c[0], g = pt.c[1], b = pt.c[2];
    if (hurt) { r = Math.min(1, r * 0.6 + 0.6); g *= 0.5; b *= 0.5; }
    else if (m.frozenT > 0) { r = r * 0.4 + 0.45; g = g * 0.4 + 0.6; b = Math.min(1, b * 0.4 + 0.75); }
    else if (burn) { r = Math.min(1, r + 0.3); g = Math.min(1, g + 0.1); }
    batch.faces(C, r, g, b, 1, sky, pt.em);
  }
}
function drawBoss(batch, bs, t) {
  const hurt = bs.hurtT > 0;
  const hue = (t * 0.2) % 1;
  const col = h => { const k = [Math.abs(h * 6 - 3) - 1, 2 - Math.abs(h * 6 - 2), 2 - Math.abs(h * 6 - 4)].map(v => clamp(v, 0, 1)); return k; };
  const c = hurt ? [1, 0.4, 0.4] : col(hue).map(v => 0.5 + v * 0.5);
  const cx = bs.x, cy = bs.y + 1.5, cz = bs.z;
  const s = 1.1, a = t * 0.8, ca = Math.cos(a), sa = Math.sin(a);
  const pts = [[0, 1.8, 0], [s, 0, 0], [0, 0, s], [-s, 0, 0], [0, 0, -s], [0, -1.8, 0]].map(([x, y, z]) => [cx + x * ca + z * sa, cy + y, cz - x * sa + z * ca]);
  const tri = (A, Bp, Cp, k) => { for (const p of [A, Bp, Cp]) batch.v(p[0], p[1], p[2], c[0] * k, c[1] * k, c[2] * k, 1, 2, 1); };
  for (let i = 1; i <= 4; i++) { const n = i % 4 + 1; tri(pts[0], pts[i], pts[n], i % 2 ? 1 : 0.8); tri(pts[5], pts[n], pts[i], i % 2 ? 0.7 : 0.6); }
  batch.box(cx - .25, cy - .25, cz - .25, cx + .25, cy + .25, cz + .25, 1, 1, 1, 1, 1, true);
  for (let i = 0; i < 4; i++) {
    const ang = t * 1.5 + i * Math.PI / 2, r = 3, x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r, y = cy + Math.sin(t * 2 + i) * 0.6;
    const cc = col((hue + i * 0.25) % 1);
    batch.box(x - .3, y - .6, z - .3, x + .3, y + .6, z + .3, cc[0], cc[1], cc[2], 1, 1, true);
  }
}

// ---------------- creature pictures for the Creature Log ----------------
const MOB_PREVIEW = {};
function mobPreview(def, dark, size = 96, variant = 0) {
  const key = def.key + (dark ? ':d' : '') + size + ':' + variant;
  if (MOB_PREVIEW[key]) return MOB_PREVIEW[key];
  const parts = def.models[variant] || def.models[0], sc = def.scale || 1;
  const yaw = 2.45, cy = Math.cos(yaw), sy = Math.sin(yaw), pit = 0.38, cp = Math.cos(pit), sp = Math.sin(pit);
  const FACES = [[4, 5, 6, 7, 0.88], [1, 0, 3, 2, 0.72], [5, 1, 2, 6, 0.66], [0, 4, 7, 3, 0.8], [7, 6, 2, 3, 1], [0, 1, 5, 4, 0.5]];
  const faces = []; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const pt of parts) {
    const hw = pt.w / 2, hh = pt.h / 2, hd = pt.d / 2;
    const C = [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd], [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]].map(([ox, oy, oz]) => {
      const x = (pt.x + ox) * sc, y = (pt.y + oy) * sc, z = (pt.z + oz) * sc;
      const rx = x * cy + z * sy, rz = -x * sy + z * cy;
      return [rx, y * cp - rz * sp, y * sp + rz * cp];
    });
    for (const f of FACES) {
      const q = [C[f[0]], C[f[1]], C[f[2]], C[f[3]]];
      const area = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
      if (area <= 0) continue;
      faces.push({ q, z: (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4, c: pt.c, sh: pt.em ? 1.1 : f[4] });
      for (const p of q) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    }
  }
  faces.sort((a, b) => a.z - b.z);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const k = (size * 0.84) / Math.max(x1 - x0, y1 - y0, 0.01), ox = size / 2 - (x0 + x1) / 2 * k, oy = size / 2 + (y0 + y1) / 2 * k;
  ctx.lineJoin = 'round';
  for (const f of faces) {
    ctx.beginPath();
    f.q.forEach((p, i) => { const X = ox + p[0] * k, Y = oy - p[1] * k; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
    ctx.closePath();
    const col = dark ? [0.13, 0.16, 0.3] : f.c.map(v => Math.min(1, v * f.sh));
    ctx.fillStyle = rgbHex(col.map(v => v * 255)); ctx.fill();
    ctx.strokeStyle = rgbHex(col.map(v => v * 255 * 0.7)); ctx.lineWidth = 1; ctx.stroke();
  }
  return (MOB_PREVIEW[key] = cv.toDataURL());
}
// which realms each creature lives in
function mobRealms(key) { return REALMS.filter(r => r.mobs.includes(key)); }
