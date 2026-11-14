'use strict';
/* ============================================================
   Team and player AI: spacing, cuts, screens, drives, kick-outs,
   man-to-man defense with help, closeouts, rebounding.
   ============================================================ */

function isUserNow(p) { return p === G.ctrl && G.userTeam === p.team.idx && G.state === 'live'; }

function goTo(p, x, z, sprint, stopR) {
  const dx = x - p.x, dz = z - p.z, d = hyp(dx, dz);
  if (d < (stopR == null ? 0.6 : stopR)) { p.in.mx = 0; p.in.mz = 0; p.in.sprint = false; return true; }
  const k = d < 3.5 ? clamp(d / 3.5, 0.3, 1) : 1;
  p.in.mx = dx / d * k; p.in.mz = dz / d * k; p.in.sprint = !!sprint && d > 4;
  return false;
}

/* ---------- formation ---------- */
function assignSpots(T) {
  const m = T.tac.mirror, P = T.players;
  T.tac.spots = [
    [SPOTS.top[0], 0],
    [SPOTS.wingR[0], SPOTS.wingR[1] * m],
    [SPOTS.wingL[0], SPOTS.wingL[1] * m],
    P[3].d.tpt >= 72 ? [SPOTS.cornerR[0], SPOTS.cornerR[1] * m] : [SPOTS.dunkR[0], SPOTS.dunkR[1] * m],
    P[4].d.tpt >= 72 ? [SPOTS.slotL[0], SPOTS.slotL[1] * m] : [SPOTS.postL[0], SPOTS.postL[1] * m],
  ];
}
function spotW(T, p) { const a = T.tac.spots[p.slot]; return [T.dir * a[0], T.dir * a[1]]; }

/* ---------- evaluation helpers ---------- */
function evalShot(m, closing) {
  const T = m.team, d = distRim(m), c = contestOn(m, closing);
  const three = isThreeAt(m.x, m.z, T.dir);
  const type = d < 9.5 && !three ? 'layup' : 'jump';
  const prob = baseProb(m.d, d, three, type) * contestMult(type, c);
  let ev = Math.max(0, prob) * (three ? 3 : 2);
  if (three) ev *= m.d.tpt < 66 ? 0.55 : m.d.tpt < 74 ? 0.85 : 1.04;
  if (!three && d > 10) ev *= 0.97;
  return { prob, ev, three, d, c };
}
function laneOpen(p, skip) {
  const T = p.team, hx = hoopX(T);
  let open = 1;
  for (const o of G.teams[1 - T.idx].players) {
    if (o.act === 'stumble' || o === skip) continue;
    const r = distSeg(o.x, o.z, p.x, p.z, hx, 0);
    if (r.t < 0.04) continue;
    const blk = clamp((3.3 - r.d) / 2.3, 0, 1) * (0.75 + 0.4 * rt(o.d.def));
    open *= 1 - Math.min(1, blk) * 0.85;
  }
  return open;
}
function passRisk(p, m) {
  let risk = 0;
  const d = hyp(m.x - p.x, m.z - p.z);
  for (const o of G.teams[1 - p.team.idx].players) {
    if (o.act === 'stumble') continue;
    const r = distSeg(o.x + o.vx * 0.25, o.z + o.vz * 0.25, p.x, p.z, m.x, m.z);
    if (r.t < 0.08) continue;
    let k = clamp((3.8 - r.d) / 2.4, 0, 1);
    if (r.t > 0.92) k *= 0.8;
    if (k > risk) risk = k;
  }
  if (d > 40) risk = Math.max(risk, 0.45); else if (d > 30) risk = Math.max(risk, 0.2);
  return risk;
}

/* ---------- offense ---------- */
function callScreen(T) {
  const tac = T.tac, h = G.ball.holder;
  if (!h || h.team !== T || tac.screenCD > 0 || G.state !== 'live') return false;
  let sc = T.players[4];
  if (sc === h || sc.ai.task) sc = T.players[3];
  if (sc === h || isUserNow(sc) || sc.ai.task) return false;
  const hx = hoopX(T);
  let ux = hx - h.x, uz = -h.z;
  const l = hyp(ux, uz) || 1; ux /= l; uz /= l;
  const side = ((sc.x - h.x) * -uz + (sc.z - h.z) * ux) >= 0 ? 1 : -1;
  sc.ai.task = { type: 'screen', t: 0, side, set: false, setT: 0 };
  tac.screener = sc; tac.screenCD = 6;
  emit('screen', { p: sc });
  return true;
}
function startOffAction(T, h) {
  const tac = T.tac;
  const free = T.players.filter((p) => p !== h && !p.ai.task && !p.expectPass && !isUserNow(p) && p.act === 'none');
  if (!free.length) return;
  const r = rand();
  if (r < 0.32 && tac.screenCD <= 0 && callScreen(T)) return;
  const perim = free.filter((p) => p.slot <= 3);
  if (r < 0.74) {
    const cands = perim.filter((p) => distRim(p) > 16);
    if (cands.length) {
      const p = pick(cands);
      p.ai.task = { type: 'cut', t: 0, z: randRange(-2.5, 2.5) };
      const others = perim.filter((q) => q !== p);
      if (others.length) {
        const o = pick(others), old = tac.spots[p.slot];
        tac.spots[p.slot] = tac.spots[o.slot]; tac.spots[o.slot] = old;
        o.ai.task = { type: 'clear', t: 0 };
      }
      return;
    }
  }
  if (perim.length >= 2) {
    const a = pick(perim);
    const c = pick(perim.filter((q) => q !== a));
    const old = tac.spots[a.slot];
    tac.spots[a.slot] = tac.spots[c.slot]; tac.spots[c.slot] = old;
    a.ai.task = { type: 'clear', t: 0 }; c.ai.task = { type: 'clear', t: 0 };
  }
}
function offBall(p, T, h, dt) {
  const s = T.dir, tk = p.ai.task, b = G.ball;
  const bx = h ? h.x : b.x, bz = h ? h.z : b.z;
  p.in.face = null;
  if (tk) {
    tk.t += dt;
    if (tk.type === 'cut') {
      if (goTo(p, s * 38.3, s * tk.z, true, 1.6) || tk.t > 2.0) p.ai.task = { type: 'clear', t: 0 };
      return;
    }
    if (tk.type === 'roll') {
      if (goTo(p, s * 37.6, s * tk.z, true, 1.5) || tk.t > 2.2) p.ai.task = { type: 'clear', t: 0 };
      return;
    }
    if (tk.type === 'clear') {
      const w = spotW(T, p);
      if (goTo(p, w[0], w[1], false, 1.2) || tk.t > 3.5) p.ai.task = null;
      return;
    }
    if (tk.type === 'screen') {
      const mk = h ? markerOf(h) : null;
      if (!h || !mk || tk.t > 3.4) { p.anchored = false; p.ai.task = null; T.tac.screener = null; return; }
      if (!tk.set) {
        const hx = hoopX(T);
        let ux = hx - h.x, uz = -h.z;
        const l = hyp(ux, uz) || 1; ux /= l; uz /= l;
        const tx = mk.x - uz * tk.side * 2.0, tz = mk.z + ux * tk.side * 2.0;
        if (goTo(p, tx, tz, true, 0.9)) { tk.set = true; tk.setT = 0; p.anchored = true; }
      } else {
        p.in.mx = p.in.mz = 0; tk.setT += dt;
        p.in.face = Math.atan2(mk.z - p.z, mk.x - p.x);
        if (hyp(h.x - p.x, h.z - p.z) > 9 || tk.setT > 1.7) {
          p.anchored = false; T.tac.screener = null;
          p.ai.task = (p.d.tpt >= 76 && rand() < 0.6) ? { type: 'clear', t: 0 } : { type: 'roll', t: 0, z: randRange(-3, 3) };
        }
      }
      return;
    }
  }
  const w = spotW(T, p);
  let tx = w[0], tz = w[1];
  if (h) {
    const dx = tx - h.x, dz = tz - h.z, d = hyp(dx, dz);
    if (d < 10 && d > 0.01) { tx += dx / d * (10 - d); tz += dz / d * (10 - d); }
  }
  tx = clamp(tx, -45.5, 45.5); tz = clamp(tz, -23.6, 23.6);
  const far = hyp(tx - p.x, tz - p.z);
  goTo(p, tx, tz, far > 14 || (p.ai.fast && far > 6), 1.0);
  if (far < 1.6) p.in.face = Math.atan2(bz - p.z, bx - p.x);
}
function beginDrive(p, mk, md) {
  const A = p.ai, T = p.team;
  A.plan = 'drive'; A.driveT = 0; A.stallT = 0;
  A.finishD = 7.2 + rand() * 1.4 + (p.d.dnk > 80 ? 1 : 0);
  const sc = T.tac.screener;
  const hx = hoopX(T);
  let ux = hx - p.x, uz = -p.z;
  const l = hyp(ux, uz) || 1; ux /= l; uz /= l;
  if (sc && sc.ai.task && sc.ai.task.set) A.side = sc.ai.task.side;
  else if (mk) A.side = ((mk.x - p.x) * -uz + (mk.z - p.z) * ux) >= 0 ? -1 : 1;
  else A.side = randSign();
  if (mk && md < 4.6 && p.moveCD <= 0 && rand() < 0.3 + 0.45 * rt(p.d.hnd)) {
    dribbleMove(p, -uz * A.side + ux * 0.6, ux * A.side + uz * 0.6);
  }
}
function aiDecide(p, mk, md, dRim) {
  const T = p.team, A = p.ai, s = T.dir;
  const sc = G.shotClock;
  let u = clamp((7 - sc) / 6, 0, 1);
  if (G.clock < 4.5) u = Math.max(u, 0.85);
  const noise = (G.userTeam >= 0 && T.idx !== G.userTeam) ? G.diff.noise : 1;
  const nz = () => randRange(-0.09, 0.09) * noise;
  const driving = A.plan === 'drive';
  const me = evalShot(p, 2), lane = laneOpen(p);
  if (dRim < 8.5 && (me.ev >= 0.86 || u > 0.5 || (lane > 0.5 && me.c < 0.7))) { startShot(p, true); return; }
  let bm = null, bev = -9, bsafe = null, bs = 9;
  for (const m of T.players) {
    if (m === p) continue;
    const risk = passRisk(p, m);
    if (risk < bs && s * m.x > -5) { bs = risk; bsafe = m; }
    if (risk > 0.5) continue;
    const e = evalShot(m, 3);
    let ev = e.ev * (1 - risk * 0.7) - 0.06;
    const tk = m.ai.task;
    if (tk && (tk.type === 'cut' || tk.type === 'roll') && e.d < 10 && e.c < 0.55) ev += 0.3;
    if (s * (m.x - p.x) < -14) ev -= 0.25;
    if (ev > bev) { bev = ev; bm = m; }
  }
  let early = clamp((sc - 11) / 8, 0, 1);              // patience while the clock is fresh
  if (T.tac.setT > 0 && !A.fast) early = 1;
  const shootEV = me.ev + nz();
  const thresh = lerp(driving ? 0.92 : 0.96, 0.45, u) + early * 0.3;
  const fin = lerp(0.56, 0.84, rt(p.d.ins));
  // drive value: help defense in the lane, and how likely I am to beat my own man
  let beat = 0.55 + 0.3 * (rt(p.d.hnd) + rt(p.d.spd)) / 2 - (mk ? 0.28 * rt(mk.d.def) : -0.3);
  if (mk && (md > 4.5 || mk.ai.freezeT > 0 || mk.act === 'stumble')) beat += 0.25;
  if (T.tac.screener && T.tac.screener.ai.task && T.tac.screener.ai.task.set) beat += 0.15;
  const help = laneOpen(p, mk);
  const driveEV = (!driving && dRim > 9 && dRim < 36 && A.driveCD <= 0)
    ? clamp(beat, 0.2, 1) * (0.3 + 0.7 * help) * fin * 1.6 + nz() : -9;
  const passEV = bev + nz() - (A.holdT < 0.4 ? 0.25 : 0);
  if (shootEV >= thresh && shootEV >= passEV - 0.04 && shootEV >= driveEV - 0.1) { startShot(p, dRim < 9.5); return; }
  if (bm && passEV > lerp(0.98, 0.5, u) + early * 0.12 && passEV > shootEV + 0.08 && passEV >= driveEV - 0.05) { startPass(p, bm); return; }
  if (driveEV > lerp(0.95, 0.4, u) + early * 0.6 && (A.holdT > 0.8 || beat > 0.85)) { beginDrive(p, mk, md); return; }
  if (driving) return;
  if (u > 0.75) {
    if (bm && passEV > shootEV + 0.15 && sc > 1.6) startPass(p, bm);
    else if (dRim > 26 && sc > 2.2 && G.clock > 2.2) beginDrive(p, mk, md);
    else startShot(p);
    return;
  }
  // use a set screen when one is there
  const scr = T.tac.screener;
  if (scr && scr.ai.task && scr.ai.task.set && A.driveCD <= 0) { beginDrive(p, mk, md); return; }
  if (dRim < 15) { const w = spotW(T, p); A.sx = w[0]; A.sz = w[1]; }      // stuck inside: back it out
  const r = rand();
  if (r < 0.12 && T.tac.screenCD <= 0) callScreen(T);
  else if (r < (early > 0.5 ? 0.5 : 0.3) && bsafe && bs < 0.25 && A.holdT > 1.2) startPass(p, bsafe);
  else if (r < 0.75 && md < 5.5 && p.moveCD <= 0 && A.holdT > 0.9 && A.driveCD <= 0) beginDrive(p, mk, md);
}
function aiHandler(p, dt) {
  const T = p.team, A = p.ai, s = T.dir;
  const hx = hoopX(T), dRim = hyp(hx - p.x, p.z), pa = s * p.x;
  A.holdT += dt; A.thinkT -= dt;
  if (A.driveCD > 0) A.driveCD -= dt;
  const mk = markerOf(p);
  const md = mk ? hyp(mk.x - p.x, mk.z - p.z) : 99;
  if ((G.shotClock < 1.0 || G.clock < 0.9) && pa > -22) { startShot(p); return; }
  if (A.plan === 'bring') {
    const w = spotW(T, p);
    let tx = w[0], tz = w[1];
    if (pa < 0) { tx = s * 10; tz = clamp(p.z, -12, 12) * 0.6; }
    goTo(p, tx, tz, A.fast || (md < 5 && pa < 6), 1.5);
    p.in.face = null;
    if (A.fast && pa > -10 && dRim < 44 && laneOpen(p) > 0.62) { beginDrive(p, mk, md); return; }
    if (pa > 7) { if (!A.fast) T.tac.setT = randRange(4, 9); A.plan = 'survey'; A.sx = tx; A.sz = tz; A.thinkT = Math.min(A.thinkT, 0.2); A.fast = false; }
    return;
  }
  if (A.plan === 'drive') {
    A.driveT += dt;
    let ux = hx - s * 3 - p.x, uz = -p.z;
    const l = hyp(ux, uz) || 1; ux /= l; uz /= l;
    let bd = 99, blat = 0, blocked = false;
    for (const o of G.teams[1 - T.idx].players) {
      const dx = o.x - p.x, dz = o.z - p.z;
      const f = dx * ux + dz * uz;
      if (f < 0.3 || f > 6) continue;
      const lat = dx * -uz + dz * ux;
      if (Math.abs(lat) < 2.6 && f < bd) { bd = f; blat = lat; blocked = true; }
    }
    let mx = ux, mz = uz;
    if (blocked) {
      const side = Math.abs(blat) < 0.5 ? A.side : blat > 0 ? -1 : 1;
      mx = ux * 0.75 - uz * side * 0.85; mz = uz * 0.75 + ux * side * 0.85;
      const ml = hyp(mx, mz); mx /= ml; mz /= ml;
    }
    p.in.mx = mx; p.in.mz = mz; p.in.sprint = true; p.in.face = null;
    if (dRim < A.finishD) { startShot(p, true); return; }
    if (hyp(p.vx, p.vz) < 5 && A.driveT > 0.5) A.stallT += dt; else A.stallT = 0;
    if (A.stallT > 0.45 || A.driveT > 2.6) {
      A.plan = 'survey'; A.thinkT = 0; A.stallT = 0; A.driveCD = 1.4;
      if (dRim < 17) { const w = spotW(T, p); A.sx = w[0]; A.sz = w[1]; } else { A.sx = p.x; A.sz = p.z; }
    }
  } else {
    if (A.sx == null) { A.sx = p.x; A.sz = p.z; }
    goTo(p, A.sx, A.sz, false, 1.3);
    p.in.face = Math.atan2(-p.z, hx - p.x);
  }
  if (A.thinkT <= 0 && p.act === 'none') {
    const cpu = G.userTeam >= 0 && T.idx !== G.userTeam;
    A.thinkT = (cpu ? G.diff.think : 0.38) * randRange(0.8, 1.25);
    aiDecide(p, mk, md, dRim);
  }
}
function offenseAI(T, dt) {
  const b = G.ball, tac = T.tac;
  const h = b.holder && b.holder.team === T ? b.holder : null;
  if (tac.screenCD > 0) tac.screenCD -= dt;
  if (tac.setT > 0) tac.setT -= dt;
  if (h && T.dir * h.x > 6 && h.act !== 'shoot') {
    tac.actT -= dt;
    if (tac.actT <= 0) { tac.actT = randRange(2.4, 4.4); startOffAction(T, h); }
  }
  for (const p of T.players) {
    if (p.expectPass) {
      if (p.act === 'none') { goTo(p, p.catchX, p.catchZ, true, 0.5); p.in.face = Math.atan2(b.z - p.z, b.x - p.x); }
      continue;
    }
    if (isUserNow(p)) continue;
    if (p.act !== 'none') continue;
    p.handsUp = false;
    if (p.hasBall) aiHandler(p, dt); else offBall(p, T, h, dt);
  }
}

/* ---------- defense ---------- */
function updateHelp(T, h, hx, dt) {
  const tac = T.tac;
  let need = false;
  if (h && h.act !== 'pass') {
    const hd = hyp(hx - h.x, h.z), mk = markerOf(h);
    if (hd < 22 && hd > 3 && mk) {
      const mkd = hyp(hx - mk.x, mk.z);
      const toward = (h.vx * (hx - h.x) + h.vz * -h.z) / (hd || 1);
      const beaten = mkd > hd - 0.3 || hyp(mk.x - h.x, mk.z - h.z) > 6 || mk.act === 'stumble';
      if (beaten && (toward > 5 || hd < 12)) need = true;
    }
  }
  if (need) {
    tac.helpT = 0.5;
    if (!tac.helper || tac.helper.ai.mark === h) {
      let best = null, bs = 1e9;
      for (const p of T.players) {
        if (p.ai.mark === h || isUserNow(p) || p.act === 'stumble') continue;
        const d = hyp(hx - p.x, p.z) + hyp(h.x - p.x, h.z - p.z) * 0.4;
        if (d < bs) { bs = d; best = p; }
      }
      tac.helper = best;
    }
  } else if (tac.helpT > 0) { tac.helpT -= dt; if (tac.helpT <= 0) tac.helper = null; }
}
function defendMan(p, m, h, bx, bz, hx, dt, react, cpu) {
  const A = p.ai, T = p.team;
  if (A.freezeT <= 0) {
    const rate = 1 / ((0.09 + 0.24 * (1 - rt(p.d.def))) * react);
    A.px = damp(A.px, m.x + m.vx * 0.18, rate, dt); A.pz = damp(A.pz, m.z + m.vz * 0.18, rate, dt);
  }
  let mx = A.px, mz = A.pz;
  let dx = hx - mx, dz = -mz, dm = hyp(dx, dz) || 1;
  if (dm > 30) { mx = hx - dx / dm * 30; mz = dz / dm * 30; dx = hx - mx; dz = -mz; dm = 30; }
  const ux = dx / dm, uz = dz / dm;
  let tx, tz, sprint = false;
  const md = hyp(m.x - p.x, m.z - p.z);
  // a defender needs a beat to recognise that his man now has the ball
  const onBall = m === h || (!h && G.ball.state === 'pass' && G.ball.passTo === m);
  if (onBall && !A.wasOn) A.closeT = (0.2 + 0.26 * (1 - rt(p.d.def))) * react;
  A.wasOn = onBall;
  if (A.closeT > 0) A.closeT -= dt;
  const late = A.closeT > 0;
  // contest any shooter within reach
  const sh = !late && h && h.act === 'shoot' && h.shot && !h.shot.released ? h : null;
  let contesting = false;
  if (sh) {
    const ds = hyp(sh.x - p.x, sh.z - p.z);
    if (ds < 6.5 || m === sh) {
      contesting = ds < 9;
      p.handsUp = ds < 6.5;
      A.contestT += dt;
      if (!A.jumpDecided && A.contestT > 0.08 * react) {
        A.jumpDecided = true; A.jumpAt = null;
        const S = sh.shot;
        const jp = (cpu ? G.diff.jump : 0.5) * (0.55 + 0.65 * rt(p.d.blk)) * (S.type === 'jump' ? 1 : 1.2);
        if (ds < 5 && rand() < jp) A.jumpAt = (S.type === 'jump' ? S.ideal : S.tRel) - 0.24 + randRange(-0.1, 0.12) * react;
      }
      if (A.jumpAt != null && sh.actT >= A.jumpAt) { A.jumpAt = null; if (ds < 5.2) { startJump(p); return; } }
    }
  }
  if (!sh) { p.handsUp = false; A.contestT = 0; A.jumpDecided = false; A.jumpAt = null; }
  if (contesting && sh) {
    let cx = hx - sh.x, cz = -sh.z;
    const cl = hyp(cx, cz) || 1;
    tx = sh.x + cx / cl * 1.9; tz = sh.z + cz / cl * 1.9; sprint = true;
    p.in.face = Math.atan2(sh.z - p.z, sh.x - p.x);
  } else if (onBall && !late) {
    let off = 3.5 - 1.0 * rt(Math.max(m.d.tpt, m.d.mid)) + 0.6 * rt(m.d.spd);
    if (dm > 27) off = 5.2;
    if (dm < 10) off = 2.2;
    tx = mx + ux * off; tz = mz + uz * off;
    const myD = hyp(hx - p.x, p.z), hisD = hyp(hx - m.x, m.z);
    if (myD > hisD - 1 && hisD > 2) {
      const k = Math.min(hisD - 1.5, 7);
      tx = m.x + (hx - m.x) / hisD * k; tz = m.z + -m.z / hisD * k; sprint = true;
    }
    sprint = sprint || hyp(tx - p.x, tz - p.z) > 5;
    p.in.face = Math.atan2(m.z - p.z, m.x - p.x);
    if (m === h) {
      A.stealT -= dt;
      if (A.stealT <= 0) {
        A.stealT = randRange(0.7, 1.6);
        if (md < 3.6 && (m.act === 'none' || m.act === 'move') && !m.gather) {
          if (rand() < (cpu ? G.diff.cpuSteal : 0.7) * (0.1 + 0.25 * rt(p.d.stl))) { startSteal(p); return; }
        }
      }
    }
  } else if (T.tac.helper === p && h) {
    const hd = hyp(hx - h.x, h.z) || 1;
    const k = clamp(hd - 2.5, 1.5, 4.5);
    tx = hx + (h.x - hx) / hd * k; tz = h.z / hd * k; sprint = true;
    p.in.face = Math.atan2(h.z - p.z, h.x - p.x);
  } else {
    const dB = hyp(bx - m.x, bz - m.z);
    let f = dB < 20 ? 0.26 : 0.42, g = dB < 20 ? 0.14 : 0.26;
    const tight = 1 - 0.45 * rt(m.d.tpt);
    f *= tight; g *= tight;
    const tk = m.ai.task;
    if ((tk && (tk.type === 'cut' || tk.type === 'roll')) || dm < 12) { f = Math.min(f, 0.2); g = Math.min(g, 0.1); }
    // collapse into the lane when the ball handler is attacking the rim
    if (h) {
      const hd = hyp(hx - h.x, h.z), toward = (h.vx * (hx - h.x) + h.vz * -h.z) / (hd || 1);
      if (hd < 24 && toward > 9 && hyp(hx - p.x, p.z) < 22) { f = Math.max(f, 0.55 - 0.25 * rt(m.d.tpt)); g = 0.1; }
    }
    tx = mx + (hx - mx) * f + (bx - mx) * g; tz = mz + (0 - mz) * f + (bz - mz) * g;
    sprint = hyp(tx - p.x, tz - p.z) > 6;
    p.in.face = Math.atan2(bz - p.z, bx - p.x);
  }
  goTo(p, tx, tz, sprint, 0.5);
}
function defenseAI(T, dt) {
  const O = G.teams[1 - T.idx], b = G.ball;
  const h = b.holder && b.holder.team === O ? b.holder : null;
  const hx = hoopX(O);
  const bx = h ? h.x : b.state === 'pass' ? b.tgtX : b.x, bz = h ? h.z : b.state === 'pass' ? b.tgtZ : b.z;
  const cpu = G.userTeam >= 0 && T.idx !== G.userTeam;
  const react = cpu ? G.diff.react : 1.1;
  updateHelp(T, h, hx, dt);
  for (const p of T.players) {
    if (isUserNow(p) || p.act !== 'none') continue;
    const m = p.ai.mark;
    if (m) defendMan(p, m, h, bx, bz, hx, dt, react, cpu);
  }
}

/* ---------- loose balls and rebounds ---------- */
function predictBall(b) {
  let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz, t = 0;
  for (let i = 0; i < 32; i++) {
    const h = 0.05;
    vy -= CT.G * h; x += vx * h; y += vy * h; z += vz * h; t += h;
    if (y < CT.BALL_R) { y = CT.BALL_R; vy = -vy * 0.74; vx *= 0.93; vz *= 0.93; }
    if (vy < 0 && y < 8.2 && t > 0.1) break;
  }
  return { x, z, t };
}
function looseAI(T, dt) {
  const b = G.ball;
  const shot = b.reb && b.shooter;
  let tx, tz, exact = true;
  if (b.state === 'shot' && b.plan) {
    exact = false;
    if (b.plan.made) { const s = b.shooter.team.dir; tx = s * (CT.RIM_X - 2.5); tz = 0; }
    else { tx = b.plan.rebX; tz = b.plan.rebZ; }
  } else { const pr = predictBall(b); tx = pr.x; tz = pr.z; }
  tx = clamp(tx, -CT.HL + 1, CT.HL - 1); tz = clamp(tz, -CT.HW + 1, CT.HW - 1);
  const order = T.players.slice().sort((a, c) => hyp(a.x - tx, a.z - tz) - hyp(c.x - tx, c.z - tz));
  for (let rank = 0; rank < order.length; rank++) {
    const p = order[rank];
    if (isUserNow(p) || p.act !== 'none') continue;
    p.handsUp = false; p.in.face = null;
    if (!shot) {
      if (rank <= 1) goTo(p, tx, tz, true, 0.5); else { p.in.mx = p.in.mz = 0; p.in.sprint = false; }
      continue;
    }
    const s = b.shooter.team.dir, hx = s * CT.RIM_X;
    const offTeam = b.shooter.team === T;
    const dHoop = hyp(hx - p.x, p.z);
    let go;
    if (offTeam) go = p !== b.shooter ? ((p.slot >= 3 && dHoop < 28) || (rank === 0 && dHoop < 16)) : dHoop < 9;
    else go = rank <= 2 || dHoop < 14;
    if (go) {
      const k = exact ? 1 : 0.45 + 0.5 * rt(p.d.reb);
      goTo(p, lerp(hx - s * 3.2, tx, k), lerp(clamp(p.z, -4, 4), tz, k), true, 0.7);
      if (exact) {
        const hd = hyp(b.x - p.x, b.z - p.z);
        if (hd < 3.4 && b.vy < 1 && b.y > p.reach - 0.2 && b.y < p.reach + 3.4) startJump(p);
      }
    } else if (offTeam) goTo(p, s * (4 + p.slot * 3), p.z * 0.6, false, 2);
    else {
      const m = p.ai.mark;
      if (m) goTo(p, lerp(m.x, hx, 0.35), lerp(m.z, 0, 0.35), true, 1);
    }
  }
}

/* ---------- dead ball: inbounds ---------- */
function deadAI(T, dt) {
  const D = G.dead, b = G.ball;
  const off = T.idx === D.team, O = G.teams[D.team], hx = hoopX(O);
  for (const p of T.players) {
    p.handsUp = false; p.in.face = null;
    if (p.act !== 'none') continue;
    if (p === D.inb) {
      if (D.phase === 'fetch') goTo(p, b.x, b.z, true, 0.8);
      else if (D.phase === 'walk') goTo(p, D.sx, D.sz, hyp(D.sx - p.x, D.sz - p.z) > 9, 0.5);
      else { p.in.mx = p.in.mz = 0; p.in.sprint = false; p.in.face = Math.atan2(D.recv.z - p.z, D.recv.x - p.x); }
      continue;
    }
    if (p.expectPass) { goTo(p, p.catchX, p.catchZ, true, 0.5); continue; }
    if (p === D.recv) {
      if (goTo(p, D.rx, D.rz, true, 1.0)) p.in.face = Math.atan2(D.inb.z - p.z, D.inb.x - p.x);
      continue;
    }
    if (off) { const w = spotW(T, p); goTo(p, w[0], w[1], false, 1.2); }
    else { const m = p.ai.mark; if (m) defendMan(p, m, null, D.sx, D.sz, hx, dt, 1.1, false); }
  }
}

function aiStep(dt) {
  const st = G.state;
  if (st === 'tp') return;
  if (st === 'live') {
    const b = G.ball;
    for (const T of G.teams) {
      if (b.state === 'loose' || b.state === 'shot') looseAI(T, dt);
      else if (T.idx === G.offense) offenseAI(T, dt);
      else defenseAI(T, dt);
    }
    return;
  }
  if (st === 'dead') { for (const T of G.teams) deadAI(T, dt); return; }
  for (const p of G.players) { p.in.mx = p.in.mz = 0; p.in.sprint = false; p.in.face = null; if (st !== 'tip') p.handsUp = false; }
}
