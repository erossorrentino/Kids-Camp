'use strict';
/* ============================================================
   Simulation core: game state, ball physics, player actions,
   rules. No DOM or renderer access in here, so the same code
   runs headless for balance testing.
   ============================================================ */

const EV = [];
function emit(type, data) { const e = data || {}; e.type = type; EV.push(e); }

function mkInput() {
  return { mx: 0, mz: 0, sprint: false, shoot: false, pShoot: false, pPass: false, pMove: false, pAlt: false };
}
const G = { state: 'none', input: mkInput(), players: [], teams: [], time: 0 };

function mkStats() {
  return { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0 };
}
function mkTac() {
  return { actT: 2.2, helper: null, helpT: 0, mirror: 1, spots: [null, null, null, null, null], screenCD: 0, screener: null };
}
function mkPlayer(T, slot, d) {
  const hgt = d.h / 12;
  return {
    team: T, slot, d, id: T.idx * 5 + slot,
    x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, face: 0,
    act: 'none', actT: 0, actDur: 0, stam: 100,
    in: { mx: 0, mz: 0, sprint: false, face: null },
    hasBall: false, dribPhase: 0, dribHand: 1, holdT: 0, gather: false, shot: null, mv: null, sbT: 0,
    expectPass: false, catchX: 0, catchZ: 0, handsUp: false, anchored: false,
    moveCD: 0, stealCD: 0, jumpCD: 0, noGrabT: 0, stealDone: false,
    hgt, sc: hgt / 6.5, reach: hgt * 1.335,
    ai: { mark: null, px: 0, pz: 0, task: null, plan: 'bring', thinkT: 0, holdT: 0, driveT: 0, side: 1, freezeT: 0,
      stealT: 1, contestT: 0, jumpDecided: false, fast: false, assistFrom: null, assistT: -99, stallT: 0, finishD: 7.5 },
    st: mkStats(), celebT: 0,
  };
}
function mkTeam(def, idx, dir) {
  const T = { def, idx, dir, score: 0, fouls: 0, players: [], tac: mkTac(), q: [0, 0, 0, 0] };
  def.roster.forEach((d, i) => T.players.push(mkPlayer(T, i, d)));
  return T;
}
function mkBall() {
  return { x: 0, y: 4, z: 0, vx: 0, vy: 0, vz: 0, state: 'dead', holder: null, t: 0, visible: true,
    shooter: null, shotLive: false, reb: false, hitRim: false, three: false, ft: false, plan: null, dunk: false,
    passer: null, passTo: null, passT: 0, passDur: 0, tgtX: 0, tgtZ: 0, safe: false, rolled: {},
    lastTouch: null, lostBy: null, pokedBy: null, assist: null, scoredSide: 0, tip: false, floorHits: 0, noBlock: false, val: 1 };
}

function newGame(o) {
  RNG = mulberry32((o.seed != null ? o.seed : Date.now()) >>> 0);
  EV.length = 0;
  G.opts = o; G.mode = o.mode || 'game';
  G.diff = DIFFS[o.difficulty || 'pro'];
  G.qLen = o.qLen || 180;
  G.userTeam = o.userTeam == null ? 0 : o.userTeam;
  G.autoSwitch = o.autoSwitch !== false;
  G.auto = !!o.auto;
  G.teams = [mkTeam(o.home, 0, 1), mkTeam(o.away, 1, -1)];
  G.players = G.teams[0].players.concat(G.teams[1].players);
  G.ball = mkBall(); G.xballs = [];
  G.quarter = 1; G.clock = G.qLen; G.shotClock = 24; G.time = 0;
  G.offense = 0; G.ctrl = null; G.stT = 0; G.next = null; G.whDur = 0;
  G.dead = null; G.ft = null; G.pendingFT = null; G.crossedHalf = false; G.clockExpired = false;
  G.tipWinner = 0; G.tp = null; G.lastRelease = null; G.passTarget = null; G.tip = null;
  G.input = mkInput();
  if (G.mode === 'threept') setupThreePt(); else setupTip();
}

/* ---------- small helpers ---------- */
function hoopX(T) { return T.dir * CT.RIM_X; }
function distRim(p) { return hyp(hoopX(p.team) - p.x, p.z); }
function isThreeAt(x, z, dir) {
  const a = dir * x;
  if (a > CT.CORNER_X) return Math.abs(z) > CT.CORNER_Z;
  return hyp(CT.RIM_X - a, z) > CT.THREE_R;
}
function markerOf(m) {
  for (const p of G.teams[1 - m.team.idx].players) if (p.ai.mark === m) return p;
  return null;
}
function placeP(p, x, z, face) {
  p.x = x; p.z = z; p.y = 0; p.vx = p.vz = p.vy = 0;
  if (face != null) p.face = face;
  p.act = 'none'; p.actT = 0; p.shot = null; p.mv = null;
  p.in.mx = p.in.mz = 0; p.in.sprint = false; p.in.face = null;
  p.expectPass = false; p.handsUp = false; p.ai.task = null; p.anchored = false; p.gather = false; p.holdT = 0;
}
function userHas(p) { return p === G.ctrl && G.userTeam === p.team.idx; }

/* Where the ball sits relative to the player holding it. */
function holdPos(p, out) {
  const cf = Math.cos(p.face), sf = Math.sin(p.face);
  let fwd, side, up;
  const S = p.shot;
  if (p.act === 'shoot' && S) {
    if (S.type === 'jump' || S.type === 'ft') {
      const u = smooth(clamp(p.actT / S.ideal, 0, 1));
      fwd = lerp(0.85, 0.5, u); side = 0.3 * p.dribHand * (1 - u * 0.4); up = lerp(3.6 * p.sc, p.hgt + 0.8, u);
    } else {
      const u = smooth(clamp((p.actT - S.tg * 0.6) / Math.max(0.05, S.tRel - S.tg * 0.6), 0, 1));
      if (S.type === 'layup') { fwd = lerp(0.8, 1.0, u); side = 0.45 * p.dribHand; up = lerp(3.4 * p.sc, p.reach - 0.15, u); }
      else { fwd = lerp(0.8, 1.15, u); side = 0.35 * p.dribHand * (1 - u); up = lerp(3.6 * p.sc, p.reach + 0.2, u); }
    }
  } else if (p.act === 'pass') { fwd = 1.2; side = 0; up = 4.1 * p.sc; }
  else if (p.gather || p.holdT > 0) { fwd = 0.8; side = 0.32 * p.dribHand; up = 3.55 * p.sc; }
  else {
    const sp = hyp(p.vx, p.vz);
    const hH = (2.7 + sp * 0.025) * p.sc;
    fwd = 0.7 + sp * 0.035; side = 0.95 * p.dribHand;
    up = CT.BALL_R + (hH - CT.BALL_R) * Math.abs(Math.cos(Math.PI * p.dribPhase));
    if (p.act === 'move' && p.mv) {
      const u = clamp(p.actT / p.actDur, 0, 1);
      if (p.mv.kind === 'cross' || p.mv.kind === 'spin') side = lerp(-0.95 * p.dribHand, 0.95 * p.dribHand, smooth(u));
      if (p.mv.kind === 'stepback') fwd = 0.9;
    }
  }
  out.x = p.x + cf * fwd - sf * side;
  out.z = p.z + sf * fwd + cf * side;
  out.y = p.y + up;
}

/* ---------- ball physics ---------- */
function hoopCollide(b, s, py, ev) {
  const R = CT.BALL_R;
  // backboard (only the court-facing side)
  if (Math.abs(b.z) < CT.BB_HW + R * 0.4 && b.y > CT.BB_BOT - R * 0.4 && b.y < CT.BB_TOP + R * 0.4) {
    const pen = s * b.x + R - CT.BB_X;
    if (pen > 0 && s * b.x < CT.BB_X + 0.15 && b.vx * s > 0) {
      b.x = s * (CT.BB_X - R);
      const v = Math.abs(b.vx);
      b.vx = -b.vx * 0.62; b.vy *= 0.96; b.vz *= 0.94;
      b.hitRim = true;
      if (ev && v > 1.5) emit('backboard', { v });
    }
  }
  // rim ring
  const rx = s * CT.RIM_X;
  const dx = b.x - rx, dz = b.z;
  const hd = Math.sqrt(dx * dx + dz * dz);
  const minD = R + CT.RIM_TUBE;
  if (hd > 1e-4 && Math.abs(b.y - CT.RIM_Y) < minD && hd < CT.RIM_R + minD && hd > CT.RIM_R - minD) {
    const nx = rx + dx / hd * CT.RIM_R, nz = dz / hd * CT.RIM_R;
    const ex = b.x - nx, ey = b.y - CT.RIM_Y, ez = b.z - nz;
    const dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (dist < minD && dist > 1e-5) {
      const ux = ex / dist, uy = ey / dist, uz = ez / dist;
      b.x = nx + ux * minD; b.y = CT.RIM_Y + uy * minD; b.z = nz + uz * minD;
      const vn = b.vx * ux + b.vy * uy + b.vz * uz;
      if (vn < 0) {
        const e = 0.52;
        b.vx -= (1 + e) * vn * ux; b.vy -= (1 + e) * vn * uy; b.vz -= (1 + e) * vn * uz;
        b.vx *= 0.97; b.vz *= 0.97;
        b.hitRim = true;
        if (ev && vn < -1.2) emit('rim', { v: -vn });
      }
    }
  }
  // through the net
  if (py > CT.RIM_Y && b.y <= CT.RIM_Y && b.vy < 0 && hd < CT.RIM_R - 0.18) {
    b.scoredSide = s;
    b.vx *= 0.3; b.vz *= 0.3; b.vy *= 0.72;
  }
}
function physStep(b, dt, ev) {
  const g = CT.G, R = CT.BALL_R, n = 4, h = dt / n;
  for (let i = 0; i < n; i++) {
    const py = b.y;
    b.vy -= g * h;
    b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
    if (b.y < R) {
      b.y = R;
      if (b.vy < 0) {
        const sp = -b.vy;
        b.vy = sp > 2.4 ? sp * 0.74 : 0;
        b.vx *= 0.93; b.vz *= 0.93;
        b.floorHits = (b.floorHits || 0) + 1;
        if (ev && sp > 2.4) emit('bounce', { v: sp, x: b.x, z: b.z });
      }
    }
    if (b.x > 36) hoopCollide(b, 1, py, ev); else if (b.x < -36) hoopCollide(b, -1, py, ev);
  }
  if (b.y <= R + 0.001 && b.vy === 0) { const k = Math.exp(-1.3 * dt); b.vx *= k; b.vz *= k; }
}
function aimBall(b, tx, ty, tz, angleDeg, apex) {
  const g = CT.G;
  const dx = tx - b.x, dz = tz - b.z;
  const d = hyp(dx, dz) || 0.001, h = ty - b.y;
  if (apex) {
    const top = Math.max(apex, b.y + 0.4, ty + 0.4);
    const vy = Math.sqrt(2 * g * (top - b.y));
    const t = vy / g + Math.sqrt(2 * (top - ty) / g);
    b.vx = dx / t; b.vz = dz / t; b.vy = vy;
    return t;
  }
  let th = angleDeg * Math.PI / 180;
  while (d * Math.tan(th) - h < 0.6 && th < 1.45) th += 0.04;
  const c = Math.cos(th);
  const v = Math.sqrt(g * d * d / (2 * c * c * (d * Math.tan(th) - h)));
  const vh = v * c;
  b.vx = dx / d * vh; b.vz = dz / d * vh; b.vy = v * Math.sin(th);
  return d / vh;
}
/* Fly a copy of the ball forward to see whether this launch goes in and where a miss comes down. */
function simShot(src) {
  const b = { x: src.x, y: src.y, z: src.z, vx: src.vx, vy: src.vy, vz: src.vz, hitRim: false, scoredSide: 0, floorHits: 0 };
  let t = 0, reb = null;
  for (let i = 0; i < 300; i++) {
    physStep(b, DT, false); t += DT;
    if (b.scoredSide) return { made: true, t };
    if (!reb && b.vy < 0 && b.y < 8.7) { reb = { x: b.x, z: b.z, t }; break; }
  }
  return { made: false, rebX: reb ? reb.x : b.x, rebZ: reb ? reb.z : b.z, rebT: reb ? reb.t : t, hit: b.hitRim };
}
/* Pick a launch whose simulated outcome matches the make/miss we already rolled. */
function planShot(b, s, wantMake, quality, angle, apex) {
  const hx = s * CT.RIM_X;
  const sx = b.x, sy = b.y, sz = b.z;
  const dx = hx - sx, dz = -sz, d = hyp(dx, dz) || 0.01;
  const ux = dx / d, uz = dz / d;
  let r = null;
  for (let i = 0; i < 40; i++) {
    let along, lat;
    if (wantMake) {
      const k = quality === 'perfect' ? 0.03 : i < 14 ? 0.1 : 0.04;
      along = randRange(-k, k); lat = randRange(-k * 1.7, k * 1.7);
      if (i > 30) { along = 0; lat = 0; }
    } else if (quality === 'bad' && i < 10) {
      along = -randRange(1.3, 2.6); lat = randRange(-1.3, 1.3);
    } else {
      const a = rand() * TAU, rr = randRange(0.5, 1.0) + i * 0.02;
      along = Math.cos(a) * rr; lat = Math.sin(a) * rr * 0.9;
    }
    const tx = hx + ux * along - uz * lat, tz = uz * along + ux * lat;
    b.x = sx; b.y = sy; b.z = sz;
    aimBall(b, tx, CT.RIM_Y, tz, angle, apex);
    r = simShot(b);
    if (r.made === wantMake) return r;
  }
  return r;
}

/* ---------- contest / shot quality ---------- */
/* How bothered is this shooter? 0 = wide open, 1 = smothered.
   `antic` (feet) lets the AI assume the defense will close that much ground before the release. */
function contestOn(p, antic) {
  const T = p.team, hx = hoopX(T);
  let ux = hx - p.x, uz = -p.z;
  const dl = hyp(ux, uz) || 1; ux /= dl; uz /= dl;
  let c = 0, c2 = 0;
  for (const o of G.teams[1 - T.idx].players) {
    const dx = o.x - p.x, dz = o.z - p.z;
    let d = hyp(dx, dz);
    if (d > 9.5) continue;
    const front = d > 0.01 ? (dx * ux + dz * uz) / d : 1;
    if (antic) d = Math.max(1.8, d - antic);
    if (d > 6) continue;
    const prox = clamp((6 - d) / 4.5, 0, 1);
    const ang = 0.4 + 0.6 * clamp((front + 0.3) / 1.3, 0, 1);
    let hands = o.y > 0.4 ? 1.12 : (o.handsUp || antic) ? 1 : 0.6;
    if (o.act === 'stumble') hands = 0.15;
    const hgt = 1 + (o.d.h - p.d.h) * 0.012;
    const ci = prox * ang * hands * hgt * (0.8 + 0.3 * rt(o.d.def));
    if (ci > c) { c2 = c; c = ci; } else if (ci > c2) c2 = ci;
  }
  return clamp(c + c2 * 0.25, 0, 1);
}
function baseProb(r, d, three, type) {
  if (type === 'dunk') return 0.97;
  if (type === 'layup') return lerp(0.58, 0.86, rt(r.ins));
  if (three) { let b = lerp(0.30, 0.52, rt(r.tpt)); const deep = d - 24.6; if (deep > 0) b -= deep * 0.035; return b; }
  if (d > 10) return lerp(0.36, 0.56, rt(r.mid));
  return lerp(0.42, 0.64, rt((r.mid + r.ins) / 2));
}
function contestMult(type, c) { return type === 'dunk' ? 1 - 0.3 * c * c : type === 'layup' ? 1 - 0.3 * c : 1 - 0.34 * c; }
function shotChance(p, S, c) {
  if (S.type === 'ft') return clamp(0.52 + 0.42 * rt(p.d.mid), 0.4, 0.95);
  let base = baseProb(p.d, S.dist, S.three, S.type) * contestMult(S.type, c);
  if (S.type === 'jump' && S.moving) base *= 0.9;
  if (p.stam < 25) base *= 0.9;
  return clamp(base, 0.01, 0.97);
}

/* ---------- possession ---------- */
function setOffense(ti) {
  G.offense = ti; G.crossedHalf = false;
  const O = G.teams[ti], D = G.teams[1 - ti];
  for (const p of D.players) {
    const m = O.players[p.slot];
    p.ai.mark = m; p.ai.px = m.x; p.ai.pz = m.z; p.ai.task = null; p.anchored = false;
    p.ai.jumpDecided = false; p.ai.contestT = 0; p.ai.freezeT = 0; p.ai.wasOn = false; p.ai.closeT = 0;
  }
  for (const p of O.players) {
    p.ai.plan = 'bring'; p.ai.task = null; p.ai.thinkT = randRange(0.1, 0.3); p.ai.holdT = 0;
    p.ai.fast = false; p.anchored = false; p.handsUp = false; p.ai.mark = null;
  }
  O.tac = mkTac(); D.tac = mkTac(); O.tac.mirror = randSign();
  assignSpots(O);
}
function changePossession(p, how) {
  const T = p.team, O = G.teams[1 - T.idx];
  setOffense(T.idx);
  G.shotClock = 24;
  let back = 0;
  for (const o of O.players) if (T.dir * (o.x - p.x) > 3) back++;
  const brk = how === 'steal' ? back <= 2 : back <= 1 && rand() < 0.55;
  for (const q of T.players) q.ai.fast = brk;
  emit('possession', { team: T.idx, how });
}
function updateCtrl(how) {
  if (G.userTeam < 0) { G.ctrl = null; return; }
  const b = G.ball, h = b.holder;
  if (!h) return;
  if (h.team.idx === G.userTeam) G.ctrl = h;
  else if (how !== 'catch' || G.autoSwitch || !G.ctrl || G.ctrl.team.idx !== G.userTeam) G.ctrl = markerOf(h) || G.ctrl;
}
function switchCtrl() {
  if (G.userTeam < 0) return;
  const U = G.teams[G.userTeam], b = G.ball;
  const h = b.holder && b.holder.team !== U ? b.holder : null;
  let tx = b.x, tz = b.z;
  if (b.state === 'pass') { tx = b.tgtX; tz = b.tgtZ; }
  if (h) { const m = markerOf(h); if (m && m !== G.ctrl) { G.ctrl = m; emit('switch'); return; } }
  let best = null, bd = 1e9;
  for (const p of U.players) {
    if (p === G.ctrl) continue;
    const d = hyp(p.x - tx, p.z - tz);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) { G.ctrl = best; emit('switch'); }
}
function giveBall(p, how) {
  const b = G.ball;
  const hit = b.hitRim;
  for (const q of G.players) { q.hasBall = false; q.expectPass = false; }
  b.state = 'held'; b.holder = p; p.hasBall = true; b.visible = true;
  b.shotLive = false; b.reb = false; b.plan = null; b.tip = false; b.ft = false; b.dunk = false;
  b.lastTouch = p; b.lostBy = null; b.pokedBy = null; b.floorHits = 0;
  p.dribPhase = 0; p.holdT = 0.22; p.gather = how === 'catch' || how === 'rebound';
  p.ai.holdT = 0; p.ai.thinkT = 0.1 + rand() * 0.18; p.ai.task = null; p.anchored = false;
  if (how !== 'catch') G.crossedHalf = false;
  if (G.state === 'live') {
    if (p.team.idx !== G.offense) changePossession(p, how);
    else if (how === 'rebound' && hit) G.shotClock = Math.max(G.shotClock, 14);
    updateCtrl(how);
  }
  holdPos(p, b);
}

/* ---------- actions ---------- */
function startShot(p) {
  if (!p.hasBall || (p.act !== 'none' && p.act !== 'move')) return false;
  if (G.state !== 'live' && G.state !== 'tp') return false;
  const T = p.team, s = T.dir, hx = s * CT.RIM_X;
  const dx = hx - p.x, dz = -p.z, d = hyp(dx, dz) || 0.01;
  const sp = hyp(p.vx, p.vz), toward = (p.vx * dx + p.vz * dz) / d;
  const behind = s * p.x > CT.RIM_X + 0.3;
  const user = userHas(p);
  let type = 'jump';
  if (G.state === 'live' && !behind && d < 11.5 && (toward > 3.5 || d < 5.5)) {
    const c = contestOn(p);
    const canDunk = p.d.dnk >= 62 && d < 10.5 && d > 2.4;
    let want = canDunk && (user ? (p.in.sprint || p.d.dnk >= 88 || toward > 12) : (c < 0.55 && rand() < 0.08 + 0.6 * rt(p.d.dnk)));
    if (want && c > 0.8) want = false;
    type = want ? 'dunk' : 'layup';
  }
  const S = { type, dist: d, three: false, released: false, relT: 0, timed: false, ideal: 0, win: 0, moving: sp > 7, made: false };
  p.face = Math.atan2(dz, dx);
  if (type === 'jump') {
    S.three = isThreeAt(p.x, p.z, s);
    S.ideal = 0.57 - 0.1 * rt(Math.max(p.d.tpt, p.d.mid));
    S.tJump = S.ideal * 0.42; S.vy0 = CT.G * (S.ideal + 0.06 - S.tJump); S.jumped = false;
    if (user) { S.timed = true; S.win = G.diff.win * (0.85 + 0.4 * rt(S.three ? p.d.tpt : p.d.mid)); }
    else S.tRel = S.ideal + randRange(-0.03, 0.03);
  } else {
    const ux = dx / d, uz = dz / d;
    const stop = type === 'dunk' ? 1.2 : 1.9;
    S.relX = hx - ux * stop; S.relZ = -uz * stop;
    const travel = Math.max(0, d - stop);
    S.air = type === 'dunk' ? 0.68 : 0.62; S.uRel = type === 'dunk' ? 0.56 : 0.5;
    const airD = Math.min(travel, type === 'dunk' ? 6.5 : 5.5);
    S.runSp = Math.max(sp, 13);
    S.tg = (travel - airD) / S.runSp + 0.05;
    S.takeX = S.relX - ux * airD; S.takeZ = S.relZ - uz * airD;
    S.H = type === 'dunk' ? Math.max(1.9, (CT.RIM_Y + 0.45 - p.reach) / (4 * S.uRel * (1 - S.uRel))) : lerp(2.0, 2.8, rt(p.d.dnk));
    S.tRel = S.tg + S.air * S.uRel; S.jumped = false;
  }
  p.act = 'shoot'; p.actT = 0; p.shot = S; p.gather = false; p.mv = null;
  emit('shootStart', { p, shotType: type });
  return true;
}
function beginFT(p, timed) {
  p.act = 'shoot'; p.actT = 0; p.gather = false;
  p.shot = { type: 'ft', dist: hyp(hoopX(p.team) - p.x, p.z), three: false, released: false, relT: 0, timed,
    ideal: 0.62, win: G.diff.win * 1.2, tRel: 0.62 + randRange(-0.02, 0.02), tJump: 99, vy0: 0, jumped: false, moving: false, made: false };
}
function shootingFoulCheck(p, S) {
  let best = null, bd = 9;
  for (const o of G.teams[1 - p.team.idx].players) { const d = hyp(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; best = o; } }
  if (!best || bd > 2.4) return null;
  const o = best;
  const air = o.y > 0.3 || o.act === 'jump';
  const closing = (o.vx * (p.x - o.x) + o.vz * (p.z - o.z)) / (bd || 1) > 4;
  if (!air && !closing && o.act !== 'steal') return null;
  let P = S.type === 'jump' ? 0.07 : 0.32;
  if (o === G.ctrl) P *= 1.3; else if (G.userTeam >= 0 && o.team.idx !== G.userTeam) P *= G.diff.cpuFoul;
  return rand() < P ? o : null;
}
function releaseBlockCheck(p, S) {
  if (S.type === 'jump' || S.type === 'ft') return null;
  const b = G.ball;
  for (const o of G.teams[1 - p.team.idx].players) {
    if (o.y < 0.6) continue;
    const hx = o.x + Math.cos(o.face) * 0.7, hz = o.z + Math.sin(o.face) * 0.7, hy = o.y + o.reach;
    if (hyp(b.x - hx, b.z - hz) > 2.2 || hy < b.y - 1.2) continue;
    const P = (0.12 + 0.3 * rt(o.d.blk)) * (S.type === 'dunk' ? 0.5 : 1);
    if (rand() < P) return o;
  }
  return null;
}
function applyBlock(o, shooter) {
  const b = G.ball, s = shooter.team.dir;
  b.state = 'loose'; b.shotLive = false; b.reb = true; b.plan = null; b.hitRim = false;
  b.vx = -s * randRange(5, 13); b.vy = randRange(2, 7); b.vz = randRange(-10, 10);
  b.lastTouch = o; o.st.blk++; o.noGrabT = 0.3; shooter.noGrabT = 0.5;
  emit('block', { by: o, on: shooter });
}
function registerFoul(o, victim, kind) {
  o.st.pf++; o.team.fouls++;
  emit('foul', { by: o, on: victim, kind });
}
function releaseShot(p) {
  const S = p.shot, b = G.ball, T = p.team, s = T.dir;
  if (!S || S.released) return;
  S.released = true; S.relT = p.actT;
  const user = userHas(p);
  const c = S.type === 'ft' || G.state === 'tp' ? 0 : contestOn(p);
  let prob = shotChance(p, S, c), grade = 'auto', err = 0;
  if (S.timed) {
    err = p.actT - S.ideal;
    const w = S.win * (1 - 0.4 * c), ae = Math.abs(err);
    const lvl = ae <= w ? 0 : ae <= w * 2.7 ? 1 : ae <= w * 5.5 ? 2 : 3;
    grade = lvl === 0 ? 'perfect' : (err < 0 ? 'early' : 'late') + lvl;
    if (S.type === 'ft') prob = lvl === 0 ? 0.995 : lvl === 1 ? Math.min(0.97, prob + 0.12) : lvl === 2 ? prob * 0.6 : 0.08;
    else if (lvl === 0) prob = prob + (1 - prob) * G.diff.boost * (1 - 0.5 * c);
    else if (lvl === 1) prob *= 1.1; else if (lvl === 2) prob *= 0.55; else prob *= 0.1;
  } else if (G.userTeam >= 0 && T.idx !== G.userTeam && S.type !== 'ft') prob *= G.diff.cpuShot;
  prob = clamp(prob, 0.005, 0.995);
  let made = rand() < prob;
  let foul = null, blocker = null;
  if (S.type !== 'ft' && G.state === 'live') {
    foul = shootingFoulCheck(p, S);
    if (foul && made && rand() < 0.45) made = false;
    if (!foul) blocker = releaseBlockCheck(p, S);
  }
  holdPos(p, b);
  p.hasBall = false; b.holder = null; b.state = 'shot'; b.t = 0; b.visible = true;
  b.shooter = p; b.shotLive = true; b.reb = true; b.hitRim = false; b.three = S.three; b.ft = S.type === 'ft';
  b.lastTouch = p; b.rolled = {}; b.noBlock = !!foul || S.type !== 'jump'; b.floorHits = 0; b.dunk = false;
  b.lostBy = null; b.pokedBy = null; b.scoredSide = 0; b.val = 1;
  b.assist = (G.time - p.ai.assistT < 5 && p.ai.assistFrom && p.ai.assistFrom.team === T) ? p.ai.assistFrom : null;
  if (S.type === 'ft') p.st.fta++;
  else if (!(foul && !made)) { p.st.fga++; if (S.three) p.st.tpa++; }
  if (blocker) {
    emit('release', { p, grade, err, contest: c, shotType: S.type, three: S.three, user, prob, made: false });
    applyBlock(blocker, p);
    return;
  }
  if (S.type === 'dunk') {
    const hx = s * CT.RIM_X;
    if (made) {
      b.x = hx; b.z = 0; b.y = CT.RIM_Y + 0.42; b.vx = 0; b.vz = 0; b.vy = -20; b.dunk = true; b.plan = { made: true };
      emit('dunk', { p });
    } else {
      b.x = hx - s * 0.5; b.y = CT.RIM_Y + 0.55; b.z = 0;
      b.vx = -s * randRange(5, 11); b.vy = randRange(7, 12); b.vz = randRange(-7, 7); b.hitRim = true;
      b.plan = { made: false, rebX: b.x + b.vx * 0.8, rebZ: b.vz * 0.8, rebT: 0.8 };
      emit('rim', { v: 14 });
    }
  } else if (S.type === 'layup') {
    b.plan = planShot(b, s, made, 'normal', 0, Math.max(b.y + 0.6, 11.3));
  } else {
    const q = grade === 'perfect' ? 'perfect' : (grade === 'early3' || grade === 'late3') ? 'bad' : 'normal';
    b.plan = planShot(b, s, made, q, S.type === 'ft' ? 50 : lerp(58, 47, clamp((S.dist - 5) / 17, 0, 1)), 0);
  }
  S.made = !!b.plan.made;
  G.lastRelease = { grade, err, c, prob, made: S.made, type: S.type, three: S.three, time: G.time, p };
  emit('release', { p, grade, err, contest: c, shotType: S.type, three: S.three, user, prob, made: S.made });
  if (foul) {
    registerFoul(foul, p, 'shooting');
    G.pendingFT = { shooter: p, n: S.made ? 1 : S.three ? 3 : 2, made: S.made, t: S.made ? 3.2 : 0.55 };
  }
}

function pickPassTarget(p, mx, mz) {
  const T = p.team;
  const im = hyp(mx, mz), hasDir = im > 0.3;
  let best = null, bs = -1e9;
  for (const m of T.players) {
    if (m === p) continue;
    const dx = m.x - p.x, dz = m.z - p.z, d = hyp(dx, dz) || 1;
    let sc;
    if (hasDir) sc = (dx * mx + dz * mz) / (d * im) * 10 - d * 0.03;
    else sc = -contestOn(m, 3) * 6 - d * 0.05 + T.dir * (m.x - p.x) * 0.03;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
function startPass(p, m, o) {
  if (!p.hasBall || !m || m === p) return false;
  if (p.act !== 'none' && p.act !== 'move') return false;
  const b = G.ball;
  p.face = Math.atan2(m.z - p.z, m.x - p.x);
  p.act = 'pass'; p.actT = 0; p.gather = false;
  holdPos(p, b);
  const d0 = hyp(m.x - p.x, m.z - p.z);
  let sp = lerp(34, 46, rt(p.d.pas));
  if (d0 > 38) sp *= 0.82;
  let t = Math.max(0.16, d0 / sp);
  let tx = m.x + m.vx * t * 0.85, tz = m.z + m.vz * t * 0.85;
  if (!(o && o.safe)) { tx = clamp(tx, -CT.HL + 1.5, CT.HL - 1.5); tz = clamp(tz, -CT.HW + 1.5, CT.HW - 1.5); }
  t = Math.max(0.16, hyp(tx - b.x, tz - b.z) / sp);
  const ty = 4.2 * m.sc;
  b.vx = (tx - b.x) / t; b.vz = (tz - b.z) / t; b.vy = (ty - b.y + 0.5 * CT.G * t * t) / t;
  b.state = 'pass'; b.holder = null; p.hasBall = false; b.t = 0;
  b.passer = p; b.passTo = m; b.passT = 0; b.passDur = t; b.tgtX = tx; b.tgtZ = tz;
  b.safe = !!(o && o.safe); b.rolled = {}; b.lastTouch = p; b.shotLive = false; b.reb = false; b.floorHits = 0;
  b.lostBy = null; b.pokedBy = null;
  for (const q of G.players) q.expectPass = false;
  m.expectPass = true; m.catchX = tx; m.catchZ = tz;
  if (G.userTeam === p.team.idx && G.state === 'live') G.ctrl = m;
  emit('pass', { from: p, to: m });
  return true;
}
function dribbleMove(p, mx, mz) {
  if (!p.hasBall || p.act !== 'none' || p.moveCD > 0 || p.stam < 8) return false;
  const fx = Math.cos(p.face), fz = Math.sin(p.face), rx = -fz, rz = fx;
  let ix = mx, iz = mz;
  const im = hyp(ix, iz);
  if (im < 0.3) { ix = rx * -p.dribHand; iz = rz * -p.dribHand; } else { ix /= im; iz /= im; }
  const fwd = ix * fx + iz * fz, side = ix * rx + iz * rz;
  const mk = markerOf(p);
  const md = mk ? hyp(mk.x - p.x, mk.z - p.z) : 99;
  let kind = fwd < -0.5 ? 'stepback' : Math.abs(side) > 0.35 ? 'cross' : 'hesi';
  if (kind === 'cross' && md < 3.4 && fwd > 0.25 && rand() < 0.45) kind = 'spin';
  const top = (15.5 + 5.5 * rt(p.d.spd)) * 0.93;
  let sp = kind === 'stepback' ? 15 : kind === 'spin' ? top * 1.12 : top * 1.28;
  p.act = 'move'; p.actT = 0; p.actDur = kind === 'stepback' ? 0.32 : kind === 'spin' ? 0.42 : 0.26;
  p.mv = { kind, ix, iz, sp, face0: p.face };
  if (kind === 'cross' || kind === 'spin') p.dribHand = side >= 0 ? 1 : -1;
  if (kind === 'stepback') p.sbT = 0.8;
  p.stam -= 8; p.moveCD = 0.7; p.gather = false;
  if (mk && md < 5.5 && mk !== G.ctrl) {
    const edge = rt(p.d.hnd) - rt(mk.d.def);
    let react = G.userTeam >= 0 && mk.team.idx !== G.userTeam ? G.diff.react : 1.1;
    mk.ai.freezeT = clamp((0.14 + 0.28 * edge + rand() * 0.14) * react, 0.04, 0.6);
    const against = (mk.vx * ix + mk.vz * iz) < -2.5;
    if (kind !== 'hesi' && against && rand() < 0.05 + 0.13 * rt(p.d.hnd) - 0.07 * rt(mk.d.def)) {
      mk.act = 'stumble'; mk.actT = 0; mk.actDur = 0.95;
      emit('ankle', { by: p, on: mk });
    }
  }
  emit('move', { p, kind });
  return true;
}
function startSteal(p) {
  if (p.act !== 'none' || p.stealCD > 0 || p.hasBall) return false;
  p.act = 'steal'; p.actT = 0; p.stealDone = false; p.stealCD = 0.9;
  const b = G.ball;
  p.face = Math.atan2(b.z - p.z, b.x - p.x);
  emit('reach', { p });
  return true;
}
function stealCheck(p) {
  const b = G.ball, h = b.holder;
  if (!h || h.team === p.team || G.state !== 'live') return;
  if (h.act === 'shoot' && h.y > 0.4) return;
  const d = hyp(b.x - p.x, b.z - p.z);
  if (d > 3.7 || b.y > p.reach) return;
  let P = 0.16 + 0.22 * rt(p.d.stl) - 0.15 * rt(h.d.hnd);
  if (h.act === 'move') P += 0.05;
  if (h.in.sprint) P += 0.04;
  if (h.gather) P -= 0.04;
  P += d < hyp(h.x - p.x, h.z - p.z) ? 0.06 : -0.05;
  if (p === G.ctrl) P *= G.diff.userSteal; else if (G.userTeam >= 0 && p.team.idx !== G.userTeam) P *= G.diff.cpuSteal; else P *= 0.8;
  if (rand() < P) {
    if (rand() < 0.5) {
      p.st.stl++; h.st.to++;
      emit('steal', { by: p, from: h });
      p.act = 'none';
      giveBall(p, 'steal');
    } else {
      h.hasBall = false; b.holder = null; b.state = 'loose'; b.shotLive = false; b.reb = false;
      const ax = b.x - h.x, az = b.z - h.z, al = hyp(ax, az) || 1;
      b.vx = ax / al * randRange(6, 12) + h.vx * 0.3; b.vz = az / al * randRange(6, 12) + h.vz * 0.3; b.vy = randRange(1, 4);
      b.lostBy = h; b.pokedBy = p; b.lastTouch = p; h.noGrabT = 0.45; b.floorHits = 0;
      emit('poke', { by: p, from: h });
    }
  } else {
    let F = 0.12;
    if (p === G.ctrl) F = 0.15; else if (G.userTeam >= 0 && p.team.idx !== G.userTeam) F *= G.diff.cpuFoul;
    if (d < 3 && rand() < F) reachFoul(p, h);
  }
}
function reachFoul(o, victim) {
  registerFoul(o, victim, 'reach');
  const T = victim.team;
  if (o.team.fouls >= 5) {
    whistle('Foul · bonus free throws', 1.3, () => startFT(victim, 2));
  } else {
    const b = G.ball;
    const sz = (b.z >= 0 ? 1 : -1) * (CT.HW + 1.6);
    const sx = clamp(b.x, -40, 40);
    const sc = Math.max(G.shotClock, 14);
    whistle('Reach-in foul', 1.2, () => startDead(T.idx, sx, sz, { minT: 1.0, shotClock: sc }));
  }
}
function startJump(p) {
  if (p.act !== 'none' || p.jumpCD > 0 || p.y > 0.01) return false;
  p.act = 'jump'; p.actT = 0; p.jumpCD = 0.75; p.handsUp = true;
  p.vy = lerp(12.3, 15.6, rt(Math.max(p.d.blk, p.d.reb, p.d.dnk * 0.9)));
  p.y = 0.02; p.vx *= 0.55; p.vz *= 0.55;
  emit('jump', { p });
  return true;
}

/* ---------- player stepping ---------- */
function topSpeed(p) { return 15.5 + 5.5 * rt(p.d.spd); }
function stepShoot(p, dt) {
  const S = p.shot, T = p.team;
  if (!S) { p.act = 'none'; return; }
  if (S.type === 'jump' || S.type === 'ft') {
    const hx = hoopX(T);
    p.face = turnToward(p.face, Math.atan2(-p.z, hx - p.x), 14 * dt);
    const k = Math.exp(-5 * dt); p.vx *= k; p.vz *= k;
    if (!S.jumped && p.actT >= S.tJump) { S.jumped = true; p.vy = S.vy0; p.y = 0.02; }
    if (!S.released) {
      if (!S.timed) { if (p.actT >= S.tRel) releaseShot(p); }
      else if (p.actT > S.ideal * 1.5) releaseShot(p);
    } else if (p.y <= 0 && p.actT > S.relT + (S.type === 'ft' ? 0.45 : 0.14)) { p.act = 'none'; p.shot = null; }
  } else {
    const t = p.actT;
    if (!S.jumped) {
      const dx = S.takeX - p.x, dz = S.takeZ - p.z, d = hyp(dx, dz);
      if (t >= S.tg || d < 0.6) {
        S.jumped = true; S.tg = t; S.tRel = t + S.air * S.uRel;
        const tr = S.air * S.uRel;
        p.vx = (S.relX - p.x) / tr; p.vz = (S.relZ - p.z) / tr;
        const sp = hyp(p.vx, p.vz);
        if (sp > 22) { p.vx *= 22 / sp; p.vz *= 22 / sp; }
      } else { p.vx = dx / d * S.runSp; p.vz = dz / d * S.runSp; }
      p.face = turnToward(p.face, Math.atan2(S.relZ - p.z, S.relX - p.x), 12 * dt);
    } else {
      const u = (t - S.tg) / S.air;
      if (u < 1) {
        p.y = Math.max(0.02, S.H * 4 * u * (1 - u)); p.vy = 0;
        if (!S.released && u >= S.uRel) { releaseShot(p); p.vx *= 0.45; p.vz *= 0.45; }
      } else { p.y = 0; p.vy = 0; p.act = 'none'; p.shot = null; }
    }
  }
}
function stepPlayer(p, dt) {
  p.actT += dt;
  if (p.moveCD > 0) p.moveCD -= dt;
  if (p.stealCD > 0) p.stealCD -= dt;
  if (p.jumpCD > 0) p.jumpCD -= dt;
  if (p.noGrabT > 0) p.noGrabT -= dt;
  if (p.holdT > 0) p.holdT -= dt;
  if (p.sbT > 0) p.sbT -= dt;
  if (p.celebT > 0) p.celebT -= dt;
  if (p.ai.freezeT > 0) p.ai.freezeT -= dt;
  let loco = true, scripted = false;
  switch (p.act) {
    case 'shoot': stepShoot(p, dt); loco = false; scripted = p.shot && p.shot.type !== 'jump' && p.shot.type !== 'ft' && p.shot.jumped; break;
    case 'pass': if (p.actT > 0.24) p.act = 'none'; break;
    case 'steal': {
      loco = false;
      const fx = Math.cos(p.face), fz = Math.sin(p.face);
      if (p.actT < 0.14) { p.vx = fx * 9; p.vz = fz * 9; } else { const k = Math.exp(-9 * dt); p.vx *= k; p.vz *= k; }
      if (!p.stealDone && p.actT >= 0.1) { p.stealDone = true; stealCheck(p); }
      if (p.act === 'steal' && p.actT > 0.42) p.act = 'none';
      break;
    }
    case 'jump': loco = false; if (p.y <= 0 && p.actT > 0.1) { p.act = 'land'; p.actT = 0; p.handsUp = false; } break;
    case 'land': { loco = false; const k = Math.exp(-8 * dt); p.vx *= k; p.vz *= k; if (p.actT > 0.1) p.act = 'none'; break; }
    case 'stumble': { loco = false; const k = Math.exp(-6 * dt); p.vx *= k; p.vz *= k; if (p.actT > p.actDur) p.act = 'none'; break; }
    case 'move': {
      loco = false;
      const m = p.mv, u = p.actT / p.actDur;
      const sp = m.sp * (u < 0.7 ? 1 : lerp(1, 0.75, (u - 0.7) / 0.3));
      p.vx = m.ix * sp; p.vz = m.iz * sp;
      if (m.kind === 'spin') p.face = m.face0 + TAU * smooth(clamp(u, 0, 1)) * p.dribHand;
      else if (m.kind !== 'stepback') p.face = turnToward(p.face, Math.atan2(m.iz, m.ix), 6 * dt);
      if (p.actT >= p.actDur) { p.act = 'none'; p.mv = null; if (m.kind === 'spin') p.face = m.face0; }
      break;
    }
  }
  const I = p.in;
  if (loco) {
    const im = hyp(I.mx, I.mz);
    let top = topSpeed(p);
    let sp = top * (I.sprint ? 1 : 0.62);
    if (p.hasBall) sp *= 0.93;
    if (p.act === 'pass') sp *= 0.5;
    if (p.stam < 25) sp *= 0.8 + 0.2 * (p.stam / 25);
    let dvx = 0, dvz = 0;
    if (im > 0.05) {
      const k = Math.min(1, im);
      const nx = I.mx / im, nz = I.mz / im;
      if (I.face != null && !I.sprint && Math.cos(p.face) * nx + Math.sin(p.face) * nz < 0.2) sp *= 0.84;
      dvx = nx * sp * k; dvz = nz * sp * k;
    }
    const ax = dvx - p.vx, az = dvz - p.vz, al = hyp(ax, az);
    const acc = (im > 0.05 ? 52 : 64) * (p.y > 0 ? 0.15 : 1);
    if (al > 1e-6) { const st = Math.min(al, acc * dt); p.vx += ax / al * st; p.vz += az / al * st; }
    const spd = hyp(p.vx, p.vz);
    if (I.sprint && spd > top * 0.7) p.stam = Math.max(0, p.stam - 6.5 * dt);
    else p.stam = Math.min(100, p.stam + (spd < 3 ? 9 : 5) * dt);
    let tf = I.face;
    if (tf == null) {
      if (spd > 1.6) tf = Math.atan2(p.vz, p.vx);
      else if (p.hasBall) tf = Math.atan2(-p.z, hoopX(p.team) - p.x);
      else tf = Math.atan2(G.ball.z - p.z, G.ball.x - p.x);
    }
    p.face = turnToward(p.face, tf, 11 * dt);
    if (p.gather && spd > 2.2) p.gather = false;
  }
  if (!scripted && (p.y > 0 || p.vy > 0)) {
    p.vy -= CT.G * dt; p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; }
  }
  p.x += p.vx * dt; p.z += p.vz * dt;
  p.x = clamp(p.x, -CT.HL - 5, CT.HL + 5); p.z = clamp(p.z, -CT.HW - 4.5, CT.HW + 4.5);
  if (p.hasBall && !p.gather && p.holdT <= 0 && p.act !== 'shoot' && p.act !== 'pass') {
    const sp = hyp(p.vx, p.vz);
    const before = Math.floor(p.dribPhase + 0.5);
    p.dribPhase += dt * (1.75 + sp * 0.07);
    if (Math.floor(p.dribPhase + 0.5) !== before) emit('dribble', { v: 6 + sp * 0.4, x: p.x, z: p.z });
  }
}
function massOf(p) {
  let m = 1 + (p.d.h - 72) * 0.03;
  if (p.anchored) m *= 4;
  if (p.hasBall) m *= 0.75;
  if (p.act === 'stumble') m *= 0.5;
  if (hyp(p.vx, p.vz) < 2) m *= 1.4;
  return m;
}
function collidePlayers() {
  const P = G.players, n = P.length, R = 1.8;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = P[i], c = P[j];
    if (a.y > 1.2 || c.y > 1.2) continue;
    const dx = c.x - a.x, dz = c.z - a.z, d2 = dx * dx + dz * dz;
    if (d2 >= R * R || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), ov = R - d, nx = dx / d, nz = dz / d;
    const wa = massOf(a), wc = massOf(c), ta = wc / (wa + wc), tc = wa / (wa + wc);
    a.x -= nx * ov * ta; a.z -= nz * ov * ta; c.x += nx * ov * tc; c.z += nz * ov * tc;
    const rel = (a.vx - c.vx) * nx + (a.vz - c.vz) * nz;
    if (rel > 0) { a.vx -= nx * rel * ta; a.vz -= nz * rel * ta; c.vx += nx * rel * tc; c.vz += nz * rel * tc; }
  }
}

/* ---------- ball stepping ---------- */
function looseBall(b) {
  b.state = 'loose';
  for (const q of G.players) q.expectPass = false;
}
function stepPass(b) {
  const m = b.passTo;
  const cy = m.y + 4.2 * m.sc;
  if (b.passT > 0.05 && hyp(b.x - m.x, b.z - m.z, (b.y - cy) * 0.6) < 2.3) {
    const passer = b.passer;
    giveBall(m, 'catch');
    m.ai.assistFrom = passer; m.ai.assistT = G.time;
    emit('catch', { p: m });
    return;
  }
  if (!b.safe && G.state === 'live') {
    for (const o of G.teams[1 - b.passer.team.idx].players) {
      if (b.rolled[o.id] || o.act === 'stumble' || o.act === 'land') continue;
      if (hyp(b.x - o.x, b.z - o.z) < 2.4 && b.y < o.y + o.reach + 0.3 && b.y > o.y + 0.8) {
        b.rolled[o.id] = 1;
        let P = 0.22 + 0.34 * rt(o.d.stl) - 0.12 * rt(b.passer.d.pas);
        if (b.passT < 0.12) P *= 0.5;
        if (o === G.ctrl) P *= 1.5 * G.diff.userSteal; else if (G.userTeam >= 0 && o.team.idx !== G.userTeam) P *= G.diff.cpuSteal; else P *= 0.85;
        if (o.handsUp || o.act === 'jump') P *= 1.2;
        if (rand() < P) {
          if (rand() < 0.7) {
            o.st.stl++; b.passer.st.to++;
            emit('steal', { by: o, from: b.passer, pass: true });
            giveBall(o, 'steal');
          } else {
            looseBall(b);
            b.vx = b.vx * 0.3 + randRange(-5, 5); b.vz = b.vz * 0.3 + randRange(-5, 5); b.vy = randRange(2, 6);
            b.lostBy = b.passer; b.pokedBy = o; b.lastTouch = o; o.noGrabT = 0.2;
            emit('deflect', { by: o });
          }
          return;
        }
      }
    }
  }
  if (b.passT > b.passDur + 0.3 || b.floorHits > 0) { b.lostBy = b.passer; looseBall(b); }
}
function stepShotBall(b) {
  if (b.t < 0.34 && !b.noBlock && b.shooter) {
    for (const o of G.teams[1 - b.shooter.team.idx].players) {
      if (b.rolled[o.id]) continue;
      if (!(o.act === 'jump' || (o.handsUp && o.y > 0.2))) continue;
      const hx = o.x + Math.cos(o.face) * 0.7, hz = o.z + Math.sin(o.face) * 0.7, hy = o.y + o.reach + 0.1;
      if (hyp(b.x - hx, b.y - hy, b.z - hz) < 1.25) {
        b.rolled[o.id] = 1;
        if (rand() < 0.3 + 0.4 * rt(o.d.blk)) { applyBlock(o, b.shooter); return; }
      }
    }
  }
  if (b.hitRim || (b.vy < 0 && b.y < 8.7)) b.state = 'loose';
}
function canGrab(b) {
  if (b.tip) return false;
  if (b.state === 'loose') {
    if (b.shotLive) {
      const s = b.x > 0 ? 1 : -1;
      if (b.y > 9.3 && hyp(b.x - s * CT.RIM_X, b.z) < 1.9) return false;
    }
    return true;
  }
  return false;
}
function tryGrab(b) {
  let cand = null, cw = 0;
  for (const p of G.players) {
    if (p.noGrabT > 0 || p.act === 'stumble' || p.act === 'steal' || p.act === 'shoot' || p.act === 'land') continue;
    if (p.z < -100) continue;
    const hd = hyp(b.x - p.x, b.z - p.z);
    const R = 1.75 + 0.5 * rt(p.d.reb) + (p.y > 0.3 ? 0.3 : 0);
    if (hd > R) continue;
    const top = p.y + p.reach + 0.4;
    if (b.y > top || b.y < p.y - 0.3) continue;
    const w = (1 + 2.2 * rt(p.d.reb) + (p.d.h - 76) * 0.04 + (p.y > 0.3 ? 0.6 : 0)) * randRange(0.4, 1);
    if (w > cw || !cand) { cw = w; cand = p; }
  }
  if (cand) onGrab(cand);
}
function onGrab(p) {
  const b = G.ball, sh = b.shooter;
  if (b.reb && sh) {
    p.st.reb++;
    const off = p.team === sh.team;
    if (off) p.st.oreb++;
    emit('rebound', { p, off });
    giveBall(p, 'rebound');
  } else {
    if (b.lostBy && b.lostBy.team !== p.team) {
      b.lostBy.st.to++; (b.pokedBy || p).st.stl++;
      emit('steal', { by: b.pokedBy || p, from: b.lostBy });
    }
    giveBall(p, 'loose');
  }
}
function stepBall(dt) {
  const b = G.ball;
  if (b.state === 'held') { const h = b.holder; holdPos(h, b); b.vx = h.vx; b.vz = h.vz; b.vy = 0; return; }
  if (b.state === 'dead') return;
  physStep(b, dt, true);
  b.t += dt;
  if (b.scoredSide) { const s = b.scoredSide; b.scoredSide = 0; onScore(s); }
  if (b.state === 'pass') { b.passT += dt; stepPass(b); }
  else if (b.state === 'shot') stepShotBall(b);
  if (b.shotLive && b.state === 'loose' && ((b.vy < 0 && b.y < CT.RIM_Y - 1.7) || b.floorHits > 0)) {
    b.shotLive = false;
    if (b.shooter) emit('miss', { p: b.shooter, three: b.three, ft: b.ft });
  }
  if (b.state === 'loose' && b.hitRim && b.y > 9.4 && hyp(b.vx, b.vy, b.vz) < 0.6) {
    const s = b.x > 0 ? 1 : -1; b.vx -= s * 2; b.vz += randRange(-1, 1);
  }
  if (G.state === 'live' && canGrab(b)) tryGrab(b);
}

/* ---------- rules ---------- */
function onScore(side) {
  const b = G.ball;
  if (G.mode === 'threept') { tpScore(b); return; }
  if (!b.shotLive || !b.shooter) return;
  const sh = b.shooter, T = sh.team;
  if (T.dir !== side) return;
  const pts = b.ft ? 1 : b.three ? 3 : 2;
  T.score += pts; sh.st.pts += pts;
  T.q[Math.min(3, G.quarter - 1)] += pts;
  if (b.ft) sh.st.ftm++; else { sh.st.fgm++; if (b.three) sh.st.tpm++; }
  if (b.assist && !b.ft) b.assist.st.ast++;
  b.shotLive = false; b.reb = false; b.state = 'loose';
  sh.celebT = 1.4;
  emit('score', { p: sh, pts, three: b.three, ft: b.ft, dunk: b.dunk, assist: b.ft ? null : b.assist, swish: !b.hitRim, team: T.idx });
  if (G.state === 'ft') { if (G.ft) G.ft.made++; return; }
  if (G.state !== 'live') return;
  if (G.pendingFT && G.pendingFT.made) {
    const sh2 = G.pendingFT.shooter; G.pendingFT = null;
    whistle('And one!', 1.5, () => startFT(sh2, 1));
    return;
  }
  if (G.clock <= 0) { endPeriod(); return; }
  startDead(1 - T.idx, side * (CT.HL + 1.8), b.z >= 0 ? 6 : -6, { fetch: true, minT: 0.5 });
}
function whistle(reason, dur, next) {
  G.state = 'whistle'; G.stT = 0; G.whDur = dur; G.next = next;
  for (const p of G.players) {
    p.expectPass = false; p.handsUp = false; p.ai.task = null; p.anchored = false;
    if (p.act === 'shoot' && p.shot && !p.shot.released) { p.act = 'none'; p.shot = null; }
  }
  emit('whistle', { reason });
}
function oobSpot(x, z) {
  if (Math.abs(x) - CT.HL > Math.abs(z) - CT.HW) {
    let sz = clamp(z, -20, 20);
    if (Math.abs(sz) < 7) sz = sz >= 0 ? 7 : -7;
    return { x: Math.sign(x) * (CT.HL + 1.6), z: sz };
  }
  return { x: clamp(x, -40, 40), z: Math.sign(z || 1) * (CT.HW + 1.6) };
}
function outOfBounds(ti, x, z, reason) {
  const sp = oobSpot(x, z);
  const sc = ti === G.offense ? (G.ball.hitRim ? Math.max(G.shotClock, 14) : G.shotClock) : 24;
  whistle(reason, 0.9, () => startDead(ti, sp.x, sp.z, { minT: 0.9, shotClock: sc }));
}
function checkRules() {
  const b = G.ball;
  if (b.state === 'held') {
    const h = b.holder;
    if (Math.abs(h.x) > CT.HL + 0.3 || Math.abs(h.z) > CT.HW + 0.3) {
      if (!(h.act === 'shoot' && h.y > 0)) { h.st.to++; emit('turnover', { p: h, why: 'oob' }); outOfBounds(1 - h.team.idx, h.x, h.z, 'Out of bounds'); return; }
    }
    if (h.team.idx === G.offense) {
      const a = h.team.dir * h.x;
      if (a > 1.5) G.crossedHalf = true;
      else if (G.crossedHalf && a < -1 && h.act !== 'shoot') {
        h.st.to++; emit('turnover', { p: h, why: 'backcourt' });
        const sz = (h.z >= 0 ? 1 : -1) * (CT.HW + 1.6);
        whistle('Backcourt violation', 1.0, () => startDead(1 - h.team.idx, 0, sz, { minT: 0.9 }));
        return;
      }
    }
  } else if (b.state !== 'dead') {
    const out = Math.abs(b.x) > CT.HL + 0.2 || Math.abs(b.z) > CT.HW + 0.2;
    if (out && (b.y <= CT.BALL_R + 0.05 || Math.abs(b.x) > CT.HL + 6 || Math.abs(b.z) > CT.HW + 6)) {
      const lt = b.lastTouch;
      const ti = lt ? 1 - lt.team.idx : 1 - G.offense;
      if (b.state === 'pass' && b.passer) { b.passer.st.to++; emit('turnover', { p: b.passer, why: 'oob' }); }
      else if (b.lostBy && lt && lt.team === b.lostBy.team) b.lostBy.st.to++;
      b.shotLive = false; b.reb = false;
      outOfBounds(ti, b.x, b.z, 'Out of bounds');
      return;
    }
  }
  if (G.shotClock <= 0 && (b.state === 'held' || b.state === 'pass')) {
    const O = G.teams[G.offense];
    const h = b.holder || b.passer || O.players[0];
    h.st.to++; emit('turnover', { p: h, why: 'shotclock' });
    const sz = (b.z >= 0 ? 1 : -1) * (CT.HW + 1.6);
    const sx = clamp(b.x, -40, 40);
    G.shotClock = 0;
    whistle('Shot clock violation', 1.1, () => startDead(1 - O.idx, sx, sz, { minT: 0.9 }));
  }
}
function startDead(ti, sx, sz, o) {
  o = o || {};
  const b = G.ball, T = G.teams[ti];
  G.state = 'dead'; G.pendingFT = null; G.clockExpired = false; G.ft = null;
  if (G.offense !== ti) setOffense(ti);
  else { for (const p of G.players) { p.ai.task = null; p.anchored = false; p.ai.plan = 'bring'; } G.crossedHalf = false; }
  G.shotClock = o.shotClock != null ? o.shotClock : 24;
  for (const p of G.players) { p.expectPass = false; p.handsUp = false; p.ai.fast = false; p.gather = false; }
  let inb = null, bd = 1e9;
  for (const i of (o.fetch ? [2, 3, 4] : [1, 2, 3, 4])) {
    const p = T.players[i];
    const d = o.fetch ? hyp(p.x - b.x, p.z - b.z) : hyp(p.x - sx, p.z - sz);
    if (d < bd) { bd = d; inb = p; }
  }
  const recv = T.players[0];
  let rx, rz;
  if (Math.abs(sx) > CT.HL) { rx = sx - Math.sign(sx) * 12; rz = sz * 0.5; }
  else { rz = sz - Math.sign(sz) * 11; rx = sx - T.dir * 5; }
  rx = clamp(rx, -43, 43); rz = clamp(rz, -21, 21);
  G.dead = { team: ti, sx, sz, inb, recv, rx, rz, phase: o.fetch ? 'fetch' : 'walk', t: 0, pt: 0, minT: o.minT || 1.0 };
  if (o.fetch) { b.state = 'loose'; b.shotLive = false; b.reb = false; }
  else {
    if (b.holder) b.holder.hasBall = false;
    for (const p of G.players) p.hasBall = false;
    b.holder = null; b.state = 'dead'; b.visible = false; b.shotLive = false; b.reb = false; b.vx = b.vy = b.vz = 0;
  }
  if (G.userTeam >= 0) G.ctrl = G.userTeam === ti ? recv : markerOf(recv);
  emit('dead', { team: ti });
}
function attachBall(p) {
  const b = G.ball;
  for (const q of G.players) q.hasBall = false;
  b.state = 'held'; b.holder = p; p.hasBall = true; b.visible = true; b.shotLive = false; b.reb = false;
  b.lastTouch = p; p.gather = true; p.holdT = 0.3;
  holdPos(p, b);
}
function goLive() {
  G.state = 'live'; G.dead = null;
  emit('live');
}
function stepDead(dt) {
  const D = G.dead, b = G.ball, inb = D.inb;
  D.t += dt;
  if (D.phase === 'fetch') {
    if ((hyp(b.x - inb.x, b.z - inb.z) < 2.4 && b.y < 7) || D.t > 2.4) { attachBall(inb); D.phase = 'walk'; }
  } else if (D.phase === 'walk') {
    const arrived = hyp(inb.x - D.sx, inb.z - D.sz) < 1.1;
    if ((arrived && D.t >= D.minT) || D.t > D.minT + 3.2) {
      if (!arrived) { inb.x = D.sx; inb.z = D.sz; inb.vx = inb.vz = 0; }
      if (b.holder !== inb) attachBall(inb);
      D.phase = 'ready'; D.pt = 0;
    }
  } else if (D.phase === 'ready') {
    D.pt += dt;
    inb.gather = true;
    const r = D.recv;
    const near = hyp(r.x - D.rx, r.z - D.rz) < 4;
    if ((D.pt > 0.4 && near) || D.pt > 2.2) {
      if (!near && D.pt > 2.2) { r.x = D.rx; r.z = D.rz; }
      inb.act = 'none';
      startPass(inb, r, { safe: true });
      D.phase = 'pass'; D.pt = 0;
    }
  } else if (D.phase === 'pass') {
    D.pt += dt;
    if (b.state === 'held' && b.holder !== inb) {
      G.state = 'live'; G.dead = null;
      updateCtrl('inbound');
      emit('live');
    } else if (b.state === 'loose' || D.pt > 2.5) {
      attachBall(D.recv); D.recv.gather = true;
      G.state = 'live'; G.dead = null; updateCtrl('inbound'); emit('live');
    }
  }
}

/* ---------- free throws ---------- */
function startFT(shooter, n) {
  G.state = 'ftcut'; G.stT = 0; G.pendingFT = null;
  G.ft = { shooter, n, i: 0, phase: 'aim', t: 0, made: 0, placed: false };
  emit('cut', { kind: 'ft' });
  emit('ftStart', { p: shooter, n });
}
function placeFT() {
  const F = G.ft, sh = F.shooter, T = sh.team, s = T.dir, O = G.teams[1 - T.idx], b = G.ball;
  if (G.offense !== T.idx) setOffense(T.idx);
  placeP(sh, s * (CT.FT_X - 1.0), 0, s > 0 ? 0 : Math.PI);
  const offs = T.players.filter((p) => p !== sh).sort((a, c) => c.d.h - a.d.h);
  const defs = O.players.slice().sort((a, c) => c.d.h - a.d.h);
  const laneD = [[38.2, 7.5], [38.2, -7.5], [31.6, 7.5]], laneO = [[34.9, -7.5], [34.9, 7.5]];
  const perO = [[14, 9], [13, -10]], perD = [[18, -15], [11, 1]];
  defs.forEach((p, i) => {
    const a = i < 3 ? laneD[i] : perD[i - 3];
    placeP(p, s * a[0], s * a[1], i < 3 ? Math.atan2(-s * a[1], 0) : Math.atan2(-s * a[1], s * (CT.RIM_X - a[0])));
  });
  offs.forEach((p, i) => {
    const a = i < 2 ? laneO[i] : perO[i - 2];
    placeP(p, s * a[0], s * a[1], i < 2 ? Math.atan2(-s * a[1], 0) : Math.atan2(-s * a[1], s * (CT.RIM_X - a[0])));
  });
  for (const q of G.players) q.hasBall = false;
  b.state = 'held'; b.holder = sh; sh.hasBall = true; sh.gather = true; b.visible = true; b.shotLive = false; b.reb = false;
  holdPos(sh, b);
  if (G.userTeam >= 0) G.ctrl = G.userTeam === T.idx ? sh : defs[0];
  F.placed = true;
}
function stepFT(dt) {
  const F = G.ft, sh = F.shooter, b = G.ball;
  F.t += dt;
  if (F.phase === 'aim') {
    sh.gather = true;
    if (sh.act !== 'shoot' && b.state === 'held') {
      const user = G.userTeam === sh.team.idx && !G.auto;
      if (!user) { if (F.t > 1.1) beginFT(sh, false); }
      else if (F.t > 9) beginFT(sh, false);
    }
    if (b.state !== 'held') {
      F.phase = 'flight'; F.t = 0;
      const last = F.i === F.n - 1;
      if (last && !(b.plan && b.plan.made)) { G.ft = null; G.state = 'live'; updateCtrlLoose(); emit('live'); }
    }
  } else if (F.phase === 'flight') {
    if (F.t > 1.9) {
      F.i++;
      if (F.i >= F.n) {
        const T = sh.team;
        G.ft = null;
        startDead(1 - T.idx, T.dir * (CT.HL + 1.8), b.z >= 0 ? 6 : -6, { fetch: true, minT: 0.5 });
      } else {
        F.phase = 'aim'; F.t = 0;
        sh.act = 'none'; sh.shot = null;
        for (const q of G.players) q.hasBall = false;
        b.state = 'held'; b.holder = sh; sh.hasBall = true; sh.gather = true; b.shotLive = false; b.reb = false;
        holdPos(sh, b);
      }
    }
  }
}
function updateCtrlLoose() {
  if (G.userTeam < 0) return;
  const U = G.teams[G.userTeam], b = G.ball;
  let best = null, bd = 1e9;
  const tx = b.plan && b.plan.rebX != null ? b.plan.rebX : b.x, tz = b.plan && b.plan.rebZ != null ? b.plan.rebZ : b.z;
  for (const p of U.players) { const d = hyp(p.x - tx, p.z - tz); if (d < bd) { bd = d; best = p; } }
  if (best) G.ctrl = best;
}

/* ---------- periods ---------- */
function endPeriod() {
  if (!G.clockExpired) emit('buzzer');
  G.state = 'periodEnd'; G.stT = 0; G.clockExpired = false; G.pendingFT = null;
  for (const p of G.players) { p.in.mx = p.in.mz = 0; p.in.sprint = false; p.handsUp = false; p.expectPass = false; p.ai.task = null; p.anchored = false; }
  emit('periodEnd', { q: G.quarter });
}
function stepPeriodEnd(dt) {
  G.stT += dt;
  if (G.stT < 2.6) return;
  const a = G.teams[0].score, c = G.teams[1].score;
  if (G.quarter >= 4 && a !== c) { G.state = 'final'; emit('final', { winner: a > c ? 0 : 1 }); for (const p of G.teams[a > c ? 0 : 1].players) p.celebT = 6; return; }
  if (G.quarter === 2 && !G.auto) { G.state = 'halftime'; emit('halftime'); return; }
  nextPeriod();
}
function nextPeriod() {
  G.quarter++;
  G.clock = G.quarter > 4 ? Math.max(60, Math.round(G.qLen * 0.4)) : G.qLen;
  for (const T of G.teams) { T.fouls = 0; if (G.quarter > 4) T.q.push(0); }
  if (G.quarter === 3) for (const T of G.teams) T.dir = -T.dir;
  for (const p of G.players) p.stam = Math.min(100, p.stam + 45);
  let ti = (G.quarter === 2 || G.quarter === 3) ? 1 - G.tipWinner : G.tipWinner;
  if (G.quarter > 4) ti = (G.quarter % 2) ? G.tipWinner : 1 - G.tipWinner;
  const O = G.teams[ti], D = G.teams[1 - ti];
  setOffense(ti);
  const spots = [[-8, -12], [8, -17], [14, 10], [26, 16], [30, -6]];
  for (const p of O.players) { const a = spots[p.slot]; placeP(p, O.dir * a[0], a[1], O.dir > 0 ? 0 : Math.PI); }
  for (const p of D.players) {
    const m = p.ai.mark, hx = hoopX(O);
    const dx = hx - m.x, dz = -m.z, d = hyp(dx, dz) || 1;
    placeP(p, m.x + dx / d * 4.5, m.z + dz / d * 4.5, Math.atan2(-dz, -dx));
    p.ai.px = m.x; p.ai.pz = m.z;
  }
  emit('cut', { kind: 'period' });
  emit('periodStart', { q: G.quarter });
  startDead(ti, -O.dir * 2, -(CT.HW + 1.6), { minT: 1.3 });
  const inb = G.dead.inb;
  placeP(inb, G.dead.sx, G.dead.sz, Math.PI / 2);
}

/* ---------- tip-off ---------- */
function setupTip() {
  G.state = 'tip'; G.stT = 0; G.tip = { phase: 0, jumped: false };
  const L = [[-14, 0], [-4, 11.5], [-4, -11.5], [6, -7.5], [-1.7, 0]];
  for (const T of G.teams) for (const p of T.players) {
    const a = L[p.slot];
    placeP(p, T.dir * a[0], T.dir * a[1], T.dir > 0 ? 0 : Math.PI);
  }
  setOffense(0);
  const b = G.ball;
  b.state = 'dead'; b.visible = true; b.x = 0; b.y = 4.4; b.z = 0; b.vx = b.vy = b.vz = 0; b.holder = null;
  G.ctrl = G.userTeam >= 0 ? G.teams[G.userTeam].players[0] : null;
  emit('cut', { kind: 'tip' });
}
function stepTip(dt) {
  const tp = G.tip, b = G.ball;
  G.stT += dt;
  const c0 = G.teams[0].players[4], c1 = G.teams[1].players[4];
  if (tp.phase === 0 && G.stT > 1.3) {
    tp.phase = 1; b.state = 'loose'; b.tip = true; b.vy = 21.5; b.vx = 0; b.vz = 0; b.t = 0; b.floorHits = 0; b.shotLive = false; b.reb = false;
    emit('tipToss');
  } else if (tp.phase === 1) {
    if (!tp.jumped && b.t > 0.4) { tp.jumped = true; startJump(c0); startJump(c1); }
    if (b.vy < -1.5) {
      const s0 = c0.d.h * 0.7 + c0.d.reb * 0.15 + rand() * 22, s1 = c1.d.h * 0.7 + c1.d.reb * 0.15 + rand() * 22;
      const w = s0 >= s1 ? 0 : 1;
      G.tipWinner = w;
      const T = G.teams[w], pg = T.players[0], c = T.players[4];
      setOffense(w);
      b.tip = false; b.x = 0; b.z = 0;
      const d = hyp(pg.x - b.x, pg.z - b.z), t = Math.max(0.35, d / 26);
      b.vx = (pg.x - b.x) / t; b.vz = (pg.z - b.z) / t; b.vy = (4.2 * pg.sc - b.y + 0.5 * CT.G * t * t) / t;
      b.state = 'pass'; b.passer = c; b.passTo = pg; b.passT = 0; b.passDur = t; b.tgtX = pg.x; b.tgtZ = pg.z; b.safe = true; b.rolled = {}; b.lastTouch = c; b.floorHits = 0;
      pg.expectPass = true; pg.catchX = pg.x; pg.catchZ = pg.z;
      tp.phase = 2; G.stT = 0;
      emit('tipWon', { team: w, p: c });
    }
  } else if (tp.phase === 2) {
    if (b.state === 'held') { G.state = 'live'; G.tip = null; G.shotClock = 24; updateCtrl('tip'); emit('live'); }
    else if (b.state === 'loose' || G.stT > 2.5) { attachBall(G.teams[G.tipWinner].players[0]); G.state = 'live'; G.tip = null; updateCtrl('tip'); emit('live'); }
  }
}

/* ---------- three-point contest ---------- */
const TP_RACKS = [[38.9, -23.2], [24.2, -17.6], [16.9, 0], [24.2, 17.6], [38.9, 23.2]];
function setupThreePt() {
  const T = G.teams[0];
  let sh = T.players[0];
  for (const p of T.players) if (p.d.tpt > sh.d.tpt) sh = p;
  for (const p of G.players) placeP(p, 0, -300 - p.id * 4, 0);
  const r = TP_RACKS[0];
  placeP(sh, r[0], r[1], Math.atan2(-r[1], CT.RIM_X - r[0]));
  G.tp = { sh, rack: 0, ball: 0, score: 0, time: 60, phase: 'intro', t: 0, shots: [], inAir: 0 };
  G.userTeam = 0; G.ctrl = sh; G.state = 'tp'; G.offense = 0;
  attachBall(sh);
  emit('cut', { kind: 'tp' });
}
function tpScore(b) {
  const tp = G.tp;
  if (!b.shotLive) return;
  b.shotLive = false;
  tp.score += b.val;
  if (b.idx != null) tp.shots[b.idx] = b.val;
  emit('score', { p: tp.sh, pts: b.val, three: true, tp: true, money: b.val === 2, swish: !b.hitRim, team: 0 });
}
function stepThreePt(dt) {
  const tp = G.tp, sh = tp.sh, b = G.ball;
  tp.t += dt;
  // balls already in the air
  for (let i = G.xballs.length - 1; i >= 0; i--) {
    const x = G.xballs[i];
    physStep(x, dt, true); x.t += dt;
    if (x.scoredSide) { x.scoredSide = 0; tpScore(x); }
    if (x.shotLive && ((x.vy < 0 && x.y < 8) || x.floorHits > 0)) { x.shotLive = false; if (tp.shots[x.idx] == null) tp.shots[x.idx] = 0; }
    if (x.t > 3.2 || x.floorHits > 2) G.xballs.splice(i, 1);
  }
  if (tp.phase === 'intro') { if (tp.t > 1.6) { tp.phase = 'shoot'; tp.t = 0; emit('tpGo'); } return; }
  if (tp.phase === 'over') return;
  if (tp.phase !== 'final') {
    tp.time -= dt;
    if (tp.time <= 0) { tp.time = 0; tp.phase = 'final'; tp.t = 0; emit('buzzer'); if (sh.act === 'shoot' && sh.shot && !sh.shot.released) { sh.act = 'none'; sh.shot = null; } }
  }
  if (tp.phase === 'shoot') {
    if (b.state !== 'held') {
      // the shot left the hand: hand it to the flight list and reload
      const x = Object.assign({}, b); x.val = (tp.ball % 5 === 4) ? 2 : 1; x.idx = tp.ball; x.rolled = {};
      G.xballs.push(x);
      tp.ball++; tp.phase = 'reload'; tp.t = 0;
      b.state = 'dead'; b.visible = false; b.shotLive = false;
    }
  } else if (tp.phase === 'reload') {
    const moving = tp.ball % 5 === 0;
    if (tp.ball >= 25) { tp.phase = 'final'; tp.t = 0; }
    else if (moving) {
      if (tp.t > 0.3) { tp.rack = Math.floor(tp.ball / 5); tp.phase = 'move'; tp.t = 0; }
    } else if (tp.t > 0.42 && sh.act !== 'shoot') { attachBall(sh); tp.phase = 'shoot'; }
  } else if (tp.phase === 'move') {
    const r = TP_RACKS[tp.rack];
    const arrived = goTo(sh, r[0], r[1], true, 0.5);
    sh.in.face = null;
    if (arrived || tp.t > 2.2) {
      sh.in.mx = sh.in.mz = 0; sh.in.face = Math.atan2(-sh.z, CT.RIM_X - sh.x);
      if (hyp(sh.vx, sh.vz) < 2) { attachBall(sh); tp.phase = 'shoot'; }
    }
  } else if (tp.phase === 'final') {
    if (G.xballs.length === 0 && tp.t > 0.6) {
      tp.phase = 'over'; G.state = 'final';
      emit('tpDone', { score: tp.score });
    }
  }
}

/* ---------- human input ---------- */
function applyUser() {
  const I = G.input, p = G.ctrl;
  G.passTarget = null;
  const clear = () => { I.pShoot = I.pPass = I.pMove = I.pAlt = false; };
  if (!p || G.userTeam < 0) { clear(); return; }
  if (G.state === 'ft') {
    const F = G.ft;
    if (F && F.shooter === p && F.phase === 'aim' && F.placed) {
      if (p.act !== 'shoot' && I.pShoot && G.ball.state === 'held') beginFT(p, true);
      else if (p.act === 'shoot' && p.shot && p.shot.timed && !p.shot.released && !I.shoot && p.actT > 0.12) releaseShot(p);
    }
    clear(); return;
  }
  if (G.state === 'tp') {
    const tp = G.tp;
    if (tp.phase === 'shoot' && p.hasBall && p.act === 'none' && I.pShoot) startShot(p);
    if (p.act === 'shoot' && p.shot && p.shot.timed && !p.shot.released && !I.shoot && p.actT > 0.12) releaseShot(p);
    clear(); return;
  }
  if (G.state !== 'live') { clear(); return; }
  const b = G.ball;
  if (!p.expectPass && (p.act === 'none' || p.act === 'pass')) {
    p.in.mx = I.mx; p.in.mz = I.mz; p.in.sprint = I.sprint && p.stam > 3;
    p.in.face = null;
    if (!p.hasBall && p.team.idx !== G.offense && !I.sprint) {
      const h = b.holder;
      if (h && hyp(h.x - p.x, h.z - p.z) < 16) p.in.face = Math.atan2(h.z - p.z, h.x - p.x);
    }
  }
  if (p.hasBall) {
    G.passTarget = pickPassTarget(p, I.mx, I.mz);
    if (p.act === 'shoot') {
      const S = p.shot;
      if (S && S.timed && !S.released && !I.shoot && p.actT > 0.12) releaseShot(p);
    } else {
      if (I.pShoot) startShot(p);
      else if (I.pPass) { if (G.passTarget) startPass(p, G.passTarget); }
      else if (I.pMove) dribbleMove(p, I.mx, I.mz);
      else if (I.pAlt) callScreen(p.team);
    }
  } else if (!p.expectPass) {
    if (I.pShoot) startJump(p);
    if (I.pPass || I.pAlt) switchCtrl();
    if (I.pMove) { if (p.team.idx !== G.offense) startSteal(p); }
    p.handsUp = p.act === 'jump' || (I.shoot && p.team.idx !== G.offense);
  }
  clear();
}

/* ---------- main step ---------- */
function stepLive(dt) {
  const b = G.ball;
  G.clock -= dt;
  if (b.state === 'held' || b.state === 'pass') G.shotClock -= dt;
  if (G.pendingFT) {
    const F = G.pendingFT; F.t -= dt;
    if (F.t <= 0) {
      const sh = F.shooter, n = F.made ? 2 : F.n;
      G.pendingFT = null;
      b.shotLive = false; b.reb = false;
      whistle('Shooting foul', 1.3, () => startFT(sh, n));
      return;
    }
  }
  if (G.clock <= 0) {
    G.clock = 0;
    if (b.shotLive && b.state !== 'held') { if (!G.clockExpired) { G.clockExpired = true; emit('buzzer'); } }
    else { endPeriod(); return; }
  }
  checkRules();
}
function stepGame(dt) {
  G.time += dt;
  switch (G.state) {
    case 'tip': stepTip(dt); break;
    case 'live': stepLive(dt); break;
    case 'dead': stepDead(dt); break;
    case 'whistle': G.stT += dt; if (G.stT >= G.whDur) { const f = G.next; G.next = null; if (f) f(); } break;
    case 'ftcut': G.stT += dt; if (!G.ft.placed && G.stT > 0.35) placeFT(); if (G.stT > 1.0) { G.state = 'ft'; G.ft.t = 0; } break;
    case 'ft': stepFT(dt); break;
    case 'periodEnd': stepPeriodEnd(dt); break;
    case 'tp': stepThreePt(dt); break;
    case 'none': return;
  }
  aiStep(dt);
  applyUser();
  for (const p of G.players) stepPlayer(p, dt);
  if (G.mode !== 'threept') collidePlayers();
  stepBall(dt);
}
function resumeHalftime() { if (G.state === 'halftime') nextPeriod(); }
