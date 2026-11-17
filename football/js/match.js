/* Gridiron Kings — American football match engine. Pure logic, fixed timestep, no rendering.
   Units are yards. Team 0 attacks +x, team 1 attacks -x. Goal lines at x = ±50, end lines at ±60,
   sidelines at z = ±26.67. */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});
  const U = FG.util, D = FG.data, P = FG.plays;
  const { clamp, lerp } = U;
  const hyp = Math.hypot;
  const GL = 50, EL = 60, FW = 26.667, HASH = 3.1, GRAV = 10.7;
  const RECV_ORDER = ['X', 'SL', 'TE', 'Z', 'RB'];
  const PRESNAP_ROLES = ['MLB', 'WLB', 'SLB', 'SS', 'FS', 'CB1', 'CB2', 'LE', 'RE', 'DT1', 'DT2'];

  function aiLevel(L) {
    return {
      L,
      react: lerp(0.42, 0.14, L),
      qbErr: lerp(1.45, 0.8, L),
      qbThr: lerp(-0.05, 0.22, L),
      tackle: lerp(0.8, 1.06, L),
      rush: lerp(0.88, 1.1, L),
      block: lerp(0.9, 1.08, L),
      speed: lerp(0.94, 1.0, L),
      cover: lerp(0.84, 1.05, L),
    };
  }

  function mkPlayer(team, i, slot, card) {
    const e = D.effStats(card, slot.pos);
    return {
      team, i, role: slot.role, pos: slot.pos, unit: slot.side, card, e, num: card.num,
      maxSpeed: 5.6 + (e.spd / 99) * 5.0, accel: 9 + (e.agi / 99) * 8,
      x: 0, z: 0, vx: 0, vz: 0, dir: 0, wx: 0, wz: 0, sprint: false, face: null, sx: 0, sz: 0,
      onField: false, job: 'idle', act: null, actT: 0, actDur: 0, dvx: 0, dvz: 0,
      route: null, wp: 0, settle: false, manT: null, zone: null, blk: null, engBy: [], eng: null, engT: 0,
      tackleCd: 0, evadeT: 0, moveCd: 0, shedT: 0, swatT: 0, mashT: 0, biteT: 0, noBlockT: 0, noBlockP: null,
      aiT: 0, aiDx: 0, aiDz: 0, react: 0, estVx: 0, estVz: 0, stance: false, mood: null, manual: false, setDone: false,
      kneel: false, hole: null, moveKind: null, atk: null, lastShed: null,
    };
  }

  class Match {
    /* cfg: { home, away: {name, short, lineup:[23 cards]}, user: 0|-1, quarterSec, level (0..1), seed, autoSwitch } */
    constructor(cfg) {
      this.cfg = cfg;
      this.user = cfg.user == null ? 0 : cfg.user;
      const lv = cfg.level == null ? 0.5 : cfg.level;
      this.rand = U.rng((cfg.seed || Math.floor(Math.random() * 1e9)) >>> 0);
      this.teams = [this.mkTeam(cfg.home, 0, 1, this.user === 0 ? 0.72 : lv), this.mkTeam(cfg.away, 1, -1, lv)];
      this.everyone = this.teams[0].all.concat(this.teams[1].all);
      this.ball = { x: 0, y: 0.15, z: 0, state: 'dead', holder: null, fl: null, vx: 0, vy: 0, vz: 0, snap: null, landed: false };
      this.score = [0, 0];
      this.quarter = 1;
      this.qLen = cfg.quarterSec || 180;
      this.clock = this.qLen;
      this.stats = [0, 1].map(() => ({ passYds: 0, rushYds: 0, firstDowns: 0, turnovers: 0, sacks: 0, comp: 0, att: 0, tds: 0, plays: 0 }));
      this.events = [];
      this.scoring = [];
      this.time = 0; this.t = 0; this.stateT = 0; this.state = 'intro';
      this.basis = { rx: 0, rz: 1, ux: 1, uz: 0 };
      this.fade = 0; this.fadeJob = null; this.slowmo = 0;
      this.defRole = 'MLB';
      this.autoSwitch = cfg.autoSwitch !== false;
      this.call = { off: null, def: null };
      this.play = null; this.dplay = null; this.flip = 1;
      this.ctrl = null; this.switchCd = 0; this.meterV = 0.5; this.kickAcc = 0.8;
      this.firstPoss = 0;
      this.offense = []; this.defense = []; this.field = [];
      this.result = null; this.after = null; this.kick = null;
      this.tmp = { x: 0, z: 0 };
      this.setPoss(0, 25);
      this.baseLineup();
    }

    mkTeam(def, idx, dir, level) {
      const t = { idx, dir, name: def.name, short: def.short, ai: aiLevel(level), units: { O: [], D: [] }, all: [], role: {}, kicker: null };
      D.LINEUP.forEach((slot, i) => {
        const p = mkPlayer(t, i, slot, def.lineup[i]);
        t.all.push(p); t.role[slot.role] = p;
        if (slot.side === 'K') t.kicker = p; else t.units[slot.side].push(p);
      });
      return t;
    }

    emit(type, data) { this.events.push({ type, data: data || {} }); }
    gauss() { return (this.rand() + this.rand() + this.rand() - 1.5) / 0.5; }
    offT() { return this.teams[this.poss]; }
    defT() { return this.teams[1 - this.poss]; }
    get toGo() { return (this.firstX - this.los) * this.offT().dir; }
    yfo(x) { return 50 + x * this.offT().dir; }
    userOnOffense() { return this.user === this.poss; }

    startFade(cb) { this.fadeJob = { t: 0, cb, done: false }; }
    stepFade(dt) {
      const j = this.fadeJob;
      if (!j) { this.fade = Math.max(0, this.fade - dt * 4); return; }
      j.t += dt;
      if (!j.done) { this.fade = Math.min(1, j.t / 0.26); if (j.t >= 0.28) { j.done = true; j.cb(); } }
      else { this.fade = Math.max(0, 1 - (j.t - 0.32) / 0.26); if (this.fade <= 0) this.fadeJob = null; }
    }

    /* ---------------- possession and downs ---------------- */
    setPoss(t, yfo) {
      this.poss = t;
      const d = this.teams[t].dir;
      this.los = (clamp(yfo, 1, 99) - 50) * d;
      this.ballZ = 0;
      this.down = 1;
      this.setFirst();
    }
    setFirst() {
      const d = this.offT().dir;
      this.firstX = this.los + 10 * d;
      this.goalToGo = this.firstX * d >= GL;
      if (this.goalToGo) this.firstX = GL * d;
    }
    downText() {
      const n = ['', '1st', '2nd', '3rd', '4th'][this.down] || '4th';
      const tg = this.toGo;
      return n + ' & ' + (this.goalToGo ? 'Goal' : tg < 0.9 ? 'Inches' : Math.round(tg));
    }
    spotText() {
      const yl = Math.round(50 - Math.abs(this.los));
      if (yl >= 50) return 'Midfield';
      const side = this.los * this.offT().dir < 0 ? this.offT() : this.defT();
      return side.short + ' ' + yl;
    }

    /* ---------------- line up ---------------- */
    place(p, f, s) {
      const d = this.offT().dir;
      p.sx = this.los + f * d;
      p.sz = clamp(this.ballZ + s * d, -FW + 1.2, FW - 1.2);
    }
    resetPlayer(p) {
      p.vx = p.vz = 0; p.wx = p.wz = 0; p.act = null; p.actT = 0; p.sprint = false; p.face = null; p.mood = null;
      p.job = 'idle'; p.route = null; p.manT = null; p.zone = null; p.blk = null; p.engBy = []; p.eng = null; p.engT = 0;
      p.tackleCd = 0; p.evadeT = 0; p.moveCd = 0; p.shedT = 0; p.swatT = 0; p.mashT = 0; p.biteT = 0; p.noBlockT = 0; p.noBlockP = null;
      p.stance = false; p.manual = false; p.setDone = false; p.kneel = false; p.hole = null; p.atk = null; p.lastShed = null;
    }
    alignAll(op, dp, teleport) {
      const OT = this.offT(), DT = this.defT();
      this.everyone.forEach((p) => { p.onField = false; this.resetPlayer(p); });
      const O = OT.units.O.slice();
      if (op && op.special) { O.splice(O.indexOf(OT.role.RB), 1); O.push(OT.kicker); }
      this.offense = O; this.defense = DT.units.D.slice(); this.field = O.concat(this.defense);
      this.field.forEach((p) => (p.onField = true));
      const form = P.FORMS[op ? op.form : 'gun'], flip = this.flip;
      for (const p of O) { const a = form[p.role]; this.place(p, a[0], a[1] * flip); }
      const al = Object.assign({}, P.DFORM, (dp && dp.align) || {});
      for (const p of this.defense) {
        const base = P.DFORM[p.role], a = al[p.role];
        const f = a[0];
        let s = a.length > 1 ? a[1] : base[1];
        if (typeof s === 'string') {
          const rs = (form[s] ? form[s][1] : 0) * flip;
          s = rs - (s === 'X' || s === 'Z' ? 0 : Math.sign(rs) * 0.6);
        }
        this.place(p, op && op.special && f > 6 ? f + 18 : f, s);
      }
      const d = this.offT().dir;
      for (const p of this.field) {
        if (teleport) { p.x = p.sx; p.z = p.sz; }
        p.dir = p.team === OT ? (d > 0 ? 0 : Math.PI) : (d > 0 ? Math.PI : 0);
      }
      const b = this.ball;
      b.state = 'set'; b.holder = null; b.fl = null; b.x = this.los; b.z = this.ballZ; b.y = 0.15; b.landed = false;
    }
    baseLineup() { this.flip = 1; this.alignAll(null, null, true); this.pickCtrl(); }
    allSet() { for (const p of this.field) if (hyp(p.sx - p.x, p.sz - p.z) > 0.7 && !(p === this.ctrl && p.manual)) return false; return true; }

    pickCtrl() {
      if (this.user < 0) { this.ctrl = null; return; }
      if (this.userOnOffense()) this.ctrl = this.offT().role.QB;
      else { const p = this.defT().role[this.defRole]; this.ctrl = p && p.onField ? p : this.defT().role.MLB; }
    }
    setCtrl(p) { if (p && this.user >= 0 && p.team.idx === this.user) this.ctrl = p; }

    /* ---------------- play calling ---------------- */
    toCall() {
      this.state = 'call'; this.stateT = 0;
      this.call = { off: null, def: null };
      if (this.user !== this.poss) this.call.off = this.aiOffense();
      if (this.user !== 1 - this.poss) this.call.def = this.aiDefense();
      const aiOff = this.user !== this.poss;
      this.flip = aiOff && !this.call.off.special && this.rand() < 0.5 ? -1 : 1;
      this.alignAll(aiOff ? this.call.off : null, this.user < 0 ? this.call.def : null, true);
      this.pickCtrl();
      this.emit('call', { side: this.user < 0 ? null : this.userOnOffense() ? 'O' : 'D' });
    }
    choose(id) {
      if (this.state !== 'call') return false;
      const pl = P.byId[id];
      if (!pl) return false;
      if (this.userOnOffense()) { if (pl.rush) return false; this.call.off = pl; }
      else { if (!pl.rush) return false; this.call.def = pl; }
      return true;
    }
    fgDistance() { return Math.round((GL - this.los * this.offT().dir) + 17); }
    fgRange(t) { const k = (t || this.offT()).kicker.e; return 38 + (k.kpw / 99) * 22; }
    aiOffense() {
      const OT = this.offT(), tg = this.toGo, dn = this.down, y = this.yfo(this.los);
      const diff = this.score[this.poss] - this.score[1 - this.poss];
      const late = this.quarter === 4 && this.clock < 90;
      if (dn === 4) {
        const goFor = (late && diff < 0) || (tg <= 1.5 && y > 55) || (tg <= 3 && y > 62 && y < 70);
        if (!goFor) {
          if (this.fgDistance() <= this.fgRange(OT) - 2 && !(late && diff < -3)) return P.byId.fg;
          return P.byId.punt;
        }
      }
      let w;
      if (tg <= 2) w = { dive: 5, toss: 3, slants: 3, mesh: 2, pa: 1, screen: 1, verts: 0.5, postcorner: 0.5 };
      else if (tg >= 9) w = { dive: 1.5, toss: 1, slants: 2, mesh: 2.5, pa: 2, screen: 2, verts: 2.5, postcorner: 2 };
      else w = { dive: 2.5, toss: 2, slants: 2.5, mesh: 2, pa: 1.5, screen: 1.2, verts: 1.2, postcorner: 1.2 };
      if (y > 88) { w.verts = 0.3; w.postcorner = 0.5; w.dive += 2; }
      if (late && diff < 0) { w.dive = 0.3; w.toss = 0.3; w.verts += 2; }
      return this.weighted(w);
    }
    aiDefense() {
      const tg = this.toGo, late = this.quarter === 4 && this.clock < 90;
      const lead = this.score[1 - this.poss] - this.score[this.poss];
      let w;
      if (tg <= 2) w = { runstop: 4, blitz: 2, man: 2, cov2: 1, cov3: 0.5, prevent: 0 };
      else if (tg >= 9) w = { runstop: 0.5, blitz: 1.5, man: 1.5, cov2: 2.5, cov3: 2.5, prevent: 1 };
      else w = { runstop: 1.5, blitz: 1.5, man: 2, cov2: 2, cov3: 2, prevent: 0.3 };
      if (late && lead > 0) w.prevent += 3;
      return this.weighted(w);
    }
    weighted(w) {
      const keys = Object.keys(w), tot = keys.reduce((a, k) => a + w[k], 0);
      let x = this.rand() * tot;
      for (const k of keys) { x -= w[k]; if (x <= 0) return P.byId[k]; }
      return P.byId[keys[0]];
    }

    lineUp() {
      const op = this.call.off, dp = this.call.def;
      this.play = op; this.dplay = dp;
      if (op.special || this.userOnOffense()) this.flip = 1;
      this.alignAll(op, dp, false);
      this.pickCtrl();
      this.state = 'presnap'; this.stateT = 0; this.t = 0;
      this.result = null;
      this.emit('lineup', { play: op.id, def: dp.id });
    }

    /* ---------------- main step ---------------- */
    step(dt, inp) {
      this.time += dt;
      this.stepFade(dt);
      if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.32; }
      this.stateT += dt;
      switch (this.state) {
        case 'intro': this.idle(dt); if (this.stateT > 2.8) this.toCall(); break;
        case 'call': this.idle(dt); if (this.call.off && this.call.def && this.stateT > 0.35) this.lineUp(); break;
        case 'presnap': this.presnap(dt, inp); break;
        case 'live': this.live(dt, inp); break;
        case 'dead': this.deadStep(dt); break;
        case 'score': this.celebrate(dt); break;
        case 'final': this.idle(dt); break;
      }
    }

    idle(dt) {
      for (const p of this.field) { p.wx = p.wz = 0; p.sprint = false; }
      this.movePlayers(dt);
      this.ballFollow();
    }

    presnap(dt, inp) {
      const OT = this.offT(), d = OT.dir;
      for (const p of this.field) {
        if (p === this.ctrl && p.manual) continue;
        const dx = p.sx - p.x, dz = p.sz - p.z, dl = hyp(dx, dz);
        if (dl > 0.15) { const k = Math.min(1, dl / 1.2); p.wx = (dx / dl) * k; p.wz = (dz / dl) * k; p.sprint = dl > 3; }
        else { p.wx = p.wz = 0; p.x += dx * 0.2; p.z += dz * 0.2; }
        p.face = p.team === OT ? (d > 0 ? 0 : Math.PI) : (d > 0 ? Math.PI : 0);
        p.stance = ((p.pos === 'OL' && p.team === OT) || (p.pos === 'DL' && p.team !== OT)) && dl < 0.6;
        if (p.role === 'QB' && this.play.form === 'fg' && p.team === OT) p.kneel = dl < 0.6;
      }
      if (this.user >= 0 && !this.userOnOffense() && this.ctrl) {
        const c = this.ctrl;
        if (inp.a.pressed) {
          const i = PRESNAP_ROLES.indexOf(c.role);
          const nr = PRESNAP_ROLES[(i + 1) % PRESNAP_ROLES.length];
          const np = this.defT().role[nr];
          if (np && np.onField) { c.manual = false; this.ctrl = np; this.defRole = nr; }
        }
        const B = this.basis, wx = inp.mx * B.rx + inp.my * B.ux, wz = inp.mx * B.rz + inp.my * B.uz;
        const c2 = this.ctrl;
        if (hyp(inp.mx, inp.my) > 0.2) { c2.manual = true; c2.wx = wx; c2.wz = wz; c2.sprint = false; c2.stance = false; }
        else if (c2.manual) { c2.wx = c2.wz = 0; }
        if (c2.manual) {
          const lim = this.los + d * 1.2;
          if ((c2.x - lim) * d < 0) c2.x = lim;
          c2.sx = c2.x; c2.sz = c2.z;
        }
      }
      this.movePlayers(dt);
      this.ballFollow();
      const ready = this.stateT > 0.8;
      const userOff = this.userOnOffense();
      if (this.play.id === 'fg') {
        this.meterV = 0.5 + 0.5 * Math.sin(this.stateT * 4.4 - Math.PI / 2);
        if (userOff) { if (ready && inp.b.pressed) { this.kickAcc = 1 - Math.abs(this.meterV - 0.5) * 2; this.snap(); } }
        else if (this.stateT > 1.5) { const k = OT.kicker.e; this.kickAcc = clamp(0.72 + (k.kac / 99) * 0.28 - this.rand() * 0.22, 0, 1); this.snap(); }
      } else if (userOff && !this.play.special) {
        if (ready && inp.b.pressed) this.snap();
      } else if (this.stateT > (this.play.special ? 1.4 : this.user < 0 ? 0.9 : 1.7) && (this.allSet() || this.stateT > 3.5)) this.snap();
    }

    /* ---------------- snap ---------------- */
    snap() {
      const op = this.play, dp = this.dplay, OT = this.offT(), DT = this.defT(), R = OT.role;
      this.state = 'live'; this.stateT = 0; this.t = 0;
      this.passed = false; this.handed = false; this.handT = 0; this.turn = false; this.caught = false; this.qbRun = false; this.released = false;
      this.playKind = op.special ? 'kick' : op.type;
      this.stats[this.poss].plays++;
      for (const p of this.field) { p.stance = false; p.face = null; p.manual = false; p.wx = p.wz = 0; p.kneel = false; }
      this.emit('snap');
      if (op.special) { this.snapSpecial(); return; }
      for (const p of this.offense) {
        if (p.pos === 'OL') { p.job = 'block'; continue; }
        if (p.role === 'QB') { p.job = op.type === 'run' ? 'handoff' : 'qb'; continue; }
        if (p.role === 'RB' && op.type === 'run') { p.job = 'runner'; continue; }
        const rt = op.routes[p.role];
        if (op.type === 'run' || !rt || rt === 'block') { p.job = 'block'; continue; }
        p.job = 'route';
        this.buildRoute(p, P.ROUTES[rt]);
      }
      const rush = new Set(dp.rush);
      for (const p of this.defense) {
        p.react = DT.ai.react * (1.35 - (p.e.awr / 99) * 0.6);
        if (rush.has(p.role)) { p.job = 'rush'; continue; }
        const c = dp.cover[p.role];
        if (c && c[0] === 'man') {
          const tg = R[c[1]];
          if (tg && tg.onField && tg.job === 'route') { p.job = 'man'; p.manT = tg; p.estVx = 0; p.estVz = 0; continue; }
          p.job = 'zone'; p.zone = this.zonePoint(p.pos === 'S' ? 'deepM' : 'mid');
          continue;
        }
        p.job = 'zone'; p.zone = this.zonePoint(c ? c[1] : 'mid');
      }
      if (op.pa) for (const p of this.defense) if (p.job !== 'rush' && (p.pos === 'LB' || p.role === 'SS')) p.biteT = 0.75;
      this.assignBlocks();
      const qb = R.QB;
      if (op.form === 'gun') this.ballSnap(qb, 0.3); else this.give(qb);
    }

    zonePoint(name) {
      const z = P.ZONES[name] || P.ZONES.mid, d = this.offT().dir;
      return { x: this.los + z[0] * d, z: clamp(this.ballZ * 0.5 + z[1] * d, -FW + 2, FW - 2), r: z[2], deep: !!z[3] };
    }

    buildRoute(p, rt) {
      const d = this.offT().dir;
      let side = Math.sign((p.z - this.ballZ) * d) || 1;
      if (p.role === 'RB') side = this.flip;
      p.route = [{ x: p.x, z: p.z }];
      for (const [f, o] of rt.pts) {
        p.route.push({ x: clamp(p.x + f * d, -EL + 1, EL - 1), z: clamp(p.z + o * side * d, -FW + 1.2, FW - 1.2) });
      }
      p.wp = 1; p.settle = !!rt.settle;
    }

    ballSnap(to, dur) {
      const b = this.ball;
      b.state = 'snap'; b.holder = null;
      b.snap = { x0: this.los, z0: this.ballZ, to, t: 0, dur };
    }
    give(p) {
      const b = this.ball;
      b.state = 'held'; b.holder = p; b.fl = null; b.snap = null;
      if (this.user >= 0 && p.team.idx === this.user && p.job !== 'handoff' && p.job !== 'hold' && p.job !== 'kicker') this.setCtrl(p);
    }
    carrier() { return this.ball.state === 'held' ? this.ball.holder : null; }

    assignBlocks() {
      const run = this.play.type === 'run' || this.play.special;
      const blockers = this.offense.filter((p) => p.job === 'block');
      const anchor = this.protectPoint();
      const targets = run ? this.defense.filter((p) => p.pos === 'DL' || p.pos === 'LB' || p.job === 'rush') : this.defense.filter((p) => p.job === 'rush');
      targets.sort((a, b) => hyp(a.x - anchor.x, a.z - anchor.z) - hyp(b.x - anchor.x, b.z - anchor.z));
      const free = blockers.filter((b) => b.pos !== 'WR');
      blockers.forEach((b) => (b.blk = null));
      for (const tg of targets) {
        let best = null, bd = 1e9;
        for (const b of free) { const dd = Math.abs(b.z - tg.z) + Math.abs(b.x - tg.x) * 0.4; if (dd < bd) { bd = dd; best = b; } }
        if (best && bd < 8) { best.blk = tg; free.splice(free.indexOf(best), 1); }
      }
      for (const b of free) {
        let best = null, bd = 1e9;
        for (const tg of targets) { const dd = hyp(b.x - tg.x, b.z - tg.z); if (dd < bd) { bd = dd; best = tg; } }
        b.blk = best;
      }
      for (const b of blockers.filter((x) => x.pos === 'WR')) {
        let best = null, bd = 1e9;
        for (const tg of this.defense) { if (tg.pos !== 'CB' && tg.pos !== 'S') continue; const dd = hyp(b.x - tg.x, b.z - tg.z); if (dd < bd) { bd = dd; best = tg; } }
        b.blk = best;
      }
    }

    protectPoint() {
      const op = this.play, d = this.offT().dir, b = this.ball;
      const c = this.carrier();
      if (c && c.team === this.offT()) return c;
      if (op && op.type === 'run' && !op.special) return { x: this.los - d, z: this.ballZ + (op.hole || 0) * d * this.flip };
      if (b.state === 'air' && b.fl && b.fl.kind === 'pass') return { x: b.fl.x1, z: b.fl.z1 };
      return this.offT().role.QB;
    }
    rushTarget() {
      const b = this.ball;
      if (b.state === 'held' && b.holder) return b.holder;
      if (b.state === 'air' && b.fl) return { x: b.fl.x1, z: b.fl.z1, vx: 0, vz: 0 };
      if (b.state === 'snap' && b.snap) return b.snap.to;
      if (b.state === 'placed') return b;
      return this.offT().role.QB;
    }

    /* ---------------- live play ---------------- */
    live(dt, inp) {
      this.t += dt;
      this.clock = Math.max(0, this.clock - dt);
      for (const p of this.field) {
        p.tackleCd -= dt; p.evadeT -= dt; p.moveCd -= dt; p.shedT -= dt; p.swatT -= dt; p.mashT -= dt; p.biteT -= dt; p.noBlockT -= dt;
      }
      this.switchCd -= dt;
      if (this.play.special) { this.liveSpecial(dt); return; }
      this.ballPre(dt);
      if (this.play.screen && !this.released && this.t > 1.25 && !this.passed) this.releaseScreen();
      if (this.user >= 0) this.userControl(dt, inp);
      this.ai(dt);
      this.engageStep(dt);
      this.movePlayers(dt);
      this.separate();
      this.ballPost(dt);
      if (this.state !== 'live') return;
      this.tackles();
      if (this.state !== 'live') return;
      this.checkCarrier();
    }

    releaseScreen() {
      this.released = true;
      for (const p of this.offense) {
        if (p.pos !== 'OL' || p.role === 'C') continue;
        if (p.eng) { const r = p.eng; r.engBy = r.engBy.filter((b) => b !== p); p.eng = null; }
        p.job = 'screen'; p.noBlockT = 0.8;
      }
    }

    ballPre(dt) {
      const b = this.ball, op = this.play, R = this.offT().role, d = this.offT().dir;
      if (b.state === 'snap') {
        const s = b.snap;
        s.t += dt;
        const u = Math.min(1, s.t / s.dur);
        b.x = lerp(s.x0, s.to.x, u); b.z = lerp(s.z0, s.to.z, u); b.y = 0.5 + Math.sin(u * Math.PI) * 0.6 + u * 0.8;
        if (u >= 1) {
          this.give(s.to);
          if (op.id === 'fg') { b.state = 'placed'; b.x = s.to.x + d * 0.6; b.z = s.to.z; b.y = 0.3; }
        }
      }
      if (op.type === 'run' && !this.handed && b.state === 'held' && b.holder === R.QB) {
        const rb = R.RB;
        if (op.toss) {
          if (this.t > 0.15) {
            const T = 0.45;
            this.launch(R.QB, rb.x + rb.vx * T, 1.1, rb.z + rb.vz * T, T, 0.5, 'pitch', rb);
            this.handed = true; this.handT = this.t;
          }
        } else if (hyp(rb.x - R.QB.x, rb.z - R.QB.z) < 1.25 && this.t > 0.3) {
          this.give(rb); this.handed = true; this.handT = this.t;
          rb.job = 'carry'; rb.hole = { x: this.los + d * 0.5, z: this.ballZ + op.hole * d * this.flip };
          R.QB.job = 'idle';
          this.runRead();
          this.emit('handoff');
        }
      }
    }

    runRead() {
      for (const p of this.defense) {
        if (p.job === 'rush') continue;
        const deep = p.zone && p.zone.deep;
        p.job = 'pursue';
        p.react = p.team.ai.react * (1.2 - (p.e.awr / 99) * 0.5) + (deep ? 0.35 : 0) + (p.pos === 'CB' ? 0.25 : 0);
      }
    }

    launch(from, x1, y1, z1, T, h, kind, target) {
      const b = this.ball;
      b.state = 'air'; b.holder = null; b.landed = false;
      b.fl = { x0: b.x, y0: Math.max(b.y, kind === 'pass' ? 1.9 : 1.1), z0: b.z, x1, y1, z1, T, h, t: 0, kind, target, from, done: false, extra: false };
    }

    ballFollow() {
      const b = this.ball;
      if (b.state === 'held' && b.holder) { b.x = b.holder.x + Math.cos(b.holder.dir) * 0.35; b.z = b.holder.z + Math.sin(b.holder.dir) * 0.35; b.y = 1.15; }
      else if (b.state === 'set') { b.x = this.los; b.z = this.ballZ; b.y = 0.15; }
    }

    ballPost(dt) {
      const b = this.ball;
      if (b.state === 'held' || b.state === 'set') { this.ballFollow(); return; }
      if (b.state === 'loose') {
        this.loosePhysics(dt);
        if (!b.landed && b.y <= 0.13) { b.landed = true; this.endPlay('incomplete'); }
        return;
      }
      if (b.state !== 'air') return;
      const f = b.fl;
      f.t += dt;
      const u = f.t / f.T;
      if (u <= 1) {
        b.x = lerp(f.x0, f.x1, u); b.z = lerp(f.z0, f.z1, u); b.y = lerp(f.y0, f.y1, u) + 4 * f.h * u * (1 - u);
      } else {
        if (!f.extra) { f.extra = true; b.vx = (f.x1 - f.x0) / f.T; b.vz = (f.z1 - f.z0) / f.T; b.vy = (f.y1 - f.y0) / f.T - (4 * f.h) / f.T; }
        b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      }
      if (f.kind === 'pitch') {
        const rb = f.target;
        if ((u > 0.6 && hyp(rb.x - b.x, rb.z - b.z) < 1.6) || b.y <= 0.12) {
          this.give(rb); rb.job = 'carry';
          const d = this.offT().dir;
          rb.hole = { x: this.los + d * 0.5, z: this.ballZ + this.play.hole * d * this.flip };
          this.runRead();
        }
        return;
      }
      if (f.kind === 'pass') {
        if (u >= 0.8 && !f.done) this.catchCheck(u);
        if (this.state !== 'live' || b.state !== 'air') return;
        if (b.y <= 0.12 || Math.abs(b.z) > FW + 3 || Math.abs(b.x) > EL + 2) {
          b.y = 0.12; b.state = 'loose'; b.landed = true; b.vx *= 0.3; b.vz *= 0.3; b.vy = 1.2;
          this.endPlay('incomplete');
        }
      }
    }
    loosePhysics(dt) {
      const b = this.ball;
      b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y <= 0.12) { b.y = 0.12; b.vy = Math.abs(b.vy) * 0.35; b.vx *= 0.6; b.vz *= 0.6; if (b.vy < 1) b.vy = 0; }
    }

    catchCheck(u) {
      const b = this.ball, f = b.fl;
      if (b.y > 3.4 || b.y < 0.25) { if (u > 1.05) f.done = true; return; }
      const OT = this.offT();
      let rec = null, rd = 1e9, def = null, dd = 1e9;
      for (const p of this.field) {
        if (p.act === 'down' || p.act === 'tackled') continue;
        const dist = hyp(p.x - b.x, p.z - b.z);
        if (p.team === OT) {
          if ((p.pos === 'WR' || p.pos === 'TE' || p.pos === 'RB') && dist < 1.3 && b.y < 2.9 && dist < rd) { rd = dist; rec = p; }
        } else {
          const reach = p.swatT > 0 ? 2.0 : 1.15, hmax = p.swatT > 0 ? 3.3 : 2.8;
          if (dist < reach && b.y < hmax && dist < dd) { dd = dist; def = p; }
        }
      }
      if (!rec && !def) { if (u > 1.08) f.done = true; return; }
      f.done = true;
      const r = this.rand();
      const swat = def && def.swatT > 0 ? 0.22 : 0;
      if (rec && !def) {
        const p = 0.62 + (rec.e.cth / 99) * 0.36 - (rd > 0.9 ? 0.08 : 0);
        if (r < p) this.completeCatch(rec); else this.deflect(rec, 'drop');
      } else if (rec && def) {
        const ds = (def.e.cov / 99) * def.team.ai.cover + swat + (dd < rd ? 0.12 : 0);
        const pInt = (0.05 + 0.1 * ds) * (def.pos === 'DL' ? 0.3 : 1);
        const pBreak = clamp(0.18 + 0.34 * ds - 0.22 * (rec.e.cth / 99), 0.05, 0.6);
        if (r < pInt) this.intercept(def);
        else if (r < pInt + pBreak) this.deflect(def, 'breakup');
        else this.completeCatch(rec, true);
      } else {
        const pInt = 0.2 + (def.e.cov / 99) * 0.3 + swat + (def.e.cth / 99) * 0.15;
        if (r < pInt * (def.pos === 'DL' ? 0.4 : 1)) this.intercept(def); else this.deflect(def, 'breakup');
      }
    }
    completeCatch(p, contested) {
      this.give(p);
      p.job = 'carry'; p.act = 'catch'; p.actT = 0; p.actDur = 0.25;
      this.caught = true;
      this.stats[this.poss].comp++;
      this.emit('catch', { name: p.card.name, contested: !!contested, user: p.team.idx === this.user });
      this.afterPossessionChange(false);
    }
    deflect(p, why) {
      const b = this.ball, f = b.fl;
      b.state = 'loose'; b.landed = false;
      const ang = this.rand() * Math.PI * 2;
      b.vx = Math.cos(ang) * 3 + (f ? ((f.x1 - f.x0) / f.T) * 0.15 : 0); b.vz = Math.sin(ang) * 3; b.vy = why === 'drop' ? 1 : 3.5;
      this.emit(why === 'drop' ? 'drop' : 'breakup', { name: p.card.name, user: p.team.idx === this.user });
    }
    intercept(p) {
      this.give(p);
      this.turn = true; this.caught = true;
      p.job = 'carry'; p.act = 'catch'; p.actT = 0; p.actDur = 0.25;
      this.stats[this.poss].turnovers++;
      this.emit('int', { name: p.card.name, user: p.team.idx === this.user });
      this.afterPossessionChange(true);
    }
    afterPossessionChange(turn) {
      const c = this.carrier();
      for (const p of this.field) {
        if (p === c) continue;
        p.engBy = []; p.eng = null;
        if (p.team !== c.team) { p.job = 'pursue'; p.react = turn ? 0.5 : p.team.ai.react * (1.2 - (p.e.awr / 99) * 0.5); }
        else p.job = p.pos === 'QB' ? 'idle' : 'escort';
      }
      if (this.user >= 0 && c.team.idx !== this.user) this.switchCd = 0;
    }

    throwTo(q, rec, away) {
      if (this.passed || this.ball.holder !== q) return;
      const d = this.offT().dir, ai = q.team.ai;
      const v = 16 + (q.e.thp / 99) * 12;
      const P0 = this.tmp;
      let x1, z1, T, dist;
      if (away) {
        x1 = q.x + d * 10; z1 = Math.sign(q.z || 1) * (FW + 5);
        dist = hyp(x1 - q.x, z1 - q.z); T = dist / v;
      } else {
        T = hyp(rec.x - q.x, rec.z - q.z) / v;
        for (let i = 0; i < 3; i++) { this.predict(rec, T, P0); dist = hyp(P0.x - q.x, P0.z - q.z); T = (dist / v) * (1 + Math.max(0, dist - 18) / 55); }
        x1 = P0.x; z1 = P0.z;
        let pressure = 0;
        for (const r of this.defense) if (!r.engBy.length && hyp(r.x - q.x, r.z - q.z) < 2.4) pressure = 1;
        const moving = clamp(hyp(q.vx, q.vz) / 6, 0, 1);
        const err = (0.25 + (1 - q.e.tac / 99) * 1.8 + pressure * 1.2 + moving * 0.6) * (1 + dist / 42) * (q.team.idx === this.user ? 0.9 : ai.qbErr);
        const ux = (x1 - q.x) / (dist || 1), uz = (z1 - q.z) / (dist || 1);
        const ea = this.gauss() * err * 0.55, el = this.gauss() * err * 0.5;
        x1 += ux * ea - uz * el; z1 += uz * ea + ux * el;
        x1 = clamp(x1, -EL + 0.3, EL - 0.3); z1 = clamp(z1, -FW - 1, FW + 1);
        rec.job = 'attack'; rec.atk = { x: x1, z: z1, T };
      }
      this.passed = true;
      this.stats[this.poss].att++;
      q.act = 'throw'; q.actT = 0; q.actDur = 0.35;
      q.dir = Math.atan2(z1 - q.z, x1 - q.x);
      this.ball.x = q.x + Math.cos(q.dir) * 0.3; this.ball.z = q.z + Math.sin(q.dir) * 0.3; this.ball.y = 2.0;
      this.launch(q, x1, 1.35, z1, T, away ? 2 : 0.45 + dist * 0.075, 'pass', rec);
      q.job = 'idle';
      for (const p of this.defense) {
        if (p.engBy.length) continue;
        const rt = p.team.ai.react + (1 - p.e.awr / 99) * 0.3;
        const tReach = hyp(p.x - x1, p.z - z1) / p.maxSpeed;
        if (!away && tReach < T + 0.35 && (p.job === 'man' || p.job === 'zone')) { p.job = 'ball'; p.react = rt; }
        else if (p.job !== 'rush') { p.job = 'pursue'; p.react = rt + 0.2; }
      }
      this.emit('throw', { away: !!away });
    }

    predict(p, T, out) {
      let x = p.x, z = p.z;
      const sp = Math.max(hyp(p.vx, p.vz), p.maxSpeed * 0.85);
      let rem = sp * T;
      if (p.job === 'route' && p.route) {
        let i = p.wp, px = x - p.vx * 0.1, pz = z - p.vz * 0.1;
        while (rem > 0 && i < p.route.length) {
          const w = p.route[i], dx = w.x - x, dz = w.z - z, dl = hyp(dx, dz);
          if (dl <= rem) {
            const ix = x - px, iz = z - pz, il = hyp(ix, iz);
            if (il > 0.05 && dl > 0.05 && (ix * dx + iz * dz) / (il * dl) < 0.7) rem = Math.max(0, rem - sp * 0.12);
            px = x; pz = z; x = w.x; z = w.z; rem -= Math.min(rem, dl); i++;
          } else { x += (dx / dl) * rem; z += (dz / dl) * rem; rem = 0; }
        }
        if (rem > 0 && !p.settle) {
          const n = p.route.length, a = p.route[n - 2], c = p.route[n - 1];
          const l = hyp(c.x - a.x, c.z - a.z) || 1;
          x += ((c.x - a.x) / l) * rem; z += ((c.z - a.z) / l) * rem;
        }
      } else { x += p.vx * T; z += p.vz * T; }
      out.x = clamp(x, -EL + 0.6, EL - 0.6); out.z = clamp(z, -FW + 0.5, FW - 0.5);
      return out;
    }
    openness(q, rec) {
      const v = 16 + (q.e.thp / 99) * 12;
      const P0 = { x: 0, z: 0 };
      let T = hyp(rec.x - q.x, rec.z - q.z) / v, dist = 0;
      for (let i = 0; i < 2; i++) { this.predict(rec, T, P0); dist = hyp(P0.x - q.x, P0.z - q.z); T = (dist / v) * (1 + Math.max(0, dist - 18) / 55); }
      let m = 9;
      for (const p of this.defense) {
        if (p.engBy.length || p.job === 'rush') continue;
        const tD = hyp(p.x - P0.x, p.z - P0.z) / p.maxSpeed + 0.18 - T;
        if (tD < m) m = tD;
      }
      const lane = this.laneBlocked(q, P0) ? 0.6 : 0;
      return m - lane - dist * 0.004 + (rec.settle && rec.route && rec.wp >= rec.route.length ? 0.1 : 0);
    }
    laneBlocked(q, P0) {
      const dx = P0.x - q.x, dz = P0.z - q.z, L2 = dx * dx + dz * dz || 1;
      for (const p of this.defense) {
        const t = ((p.x - q.x) * dx + (p.z - q.z) * dz) / L2;
        if (t < 0.05 || t > 0.5) continue;
        if (hyp(q.x + dx * t - p.x, q.z + dz * t - p.z) < 0.8 && Math.sqrt(L2) * t < 6) return true;
      }
      return false;
    }
    receivers() {
      const R = this.offT().role;
      return RECV_ORDER.map((r) => R[r]).filter((p) => p && p.onField && (p.job === 'route' || p.job === 'attack'));
    }
    routePreview() {
      const op = this.play;
      if (!op || op.special) return [];
      const d = this.offT().dir, R = this.offT().role, out = [];
      const colors = (FG.gfx && FG.gfx.RECV_COLORS) || ['#ffd23f', '#35e0c2', '#ff6b81', '#7fb3ff', '#c792ff'];
      if (op.type === 'run') {
        const rb = R.RB, hz = this.ballZ + op.hole * d * this.flip;
        out.push({ kind: 'run', color: '#ffd23f', pts: [{ x: rb.sx, z: rb.sz }, { x: this.los - d * (op.toss ? 3 : 1.5), z: op.toss ? hz : rb.sz + (hz - rb.sz) * 0.5 }, { x: this.los + d * 5, z: hz }] });
        return out;
      }
      RECV_ORDER.forEach((role, i) => {
        const p = R[role], rt = op.routes[role];
        if (!p || !p.onField || !rt || rt === 'block') return;
        const def = P.ROUTES[rt];
        const side = role === 'RB' ? this.flip : Math.sign((p.sz - this.ballZ) * d) || 1;
        const pts = [{ x: p.sx, z: p.sz }];
        def.pts.forEach(([f, o]) => pts.push({ x: clamp(p.sx + f * d, -EL + 1, EL - 1), z: clamp(p.sz + o * side * d, -FW + 1.2, FW - 1.2) }));
        if (!def.settle) {
          const n = pts.length, a = pts[n - 2], c = pts[n - 1], l = hyp(c.x - a.x, c.z - a.z) || 1;
          const ext = rt === 'go' || rt === 'seam' ? 0 : 5;
          if (ext) pts.push({ x: clamp(c.x + ((c.x - a.x) / l) * ext, -EL + 1, EL - 1), z: clamp(c.z + ((c.z - a.z) / l) * ext, -FW + 1, FW - 1) });
        }
        out.push({ kind: 'route', color: colors[i], idx: i, role, pts });
      });
      return out;
    }
    mostOpen(q) {
      let best = null;
      for (const r of this.receivers()) { const o = this.openness(q, r); if (!best || o > best.o) best = { p: r, o }; }
      return best;
    }

    /* ---------------- user control ---------------- */
    userControl(dt, inp) {
      const B = this.basis;
      const wx = inp.mx * B.rx + inp.my * B.ux, wz = inp.mx * B.rz + inp.my * B.uz;
      const mag = hyp(inp.mx, inp.my), active = mag > 0.2;
      const uT = this.teams[this.user];
      const car = this.carrier();
      const b = this.ball;
      for (const p of this.field) if (p !== this.ctrl) p.manual = false;
      if (car && car.team === uT) {
        if (car.job === 'handoff') return;
        if (this.ctrl !== car) this.setCtrl(car);
        const c = this.ctrl;
        c.manual = active;
        if (active) { c.wx = wx; c.wz = wz; c.sprint = !!inp.sprint || mag > 0.92; }
        if (c.job === 'qb') {
          if (inp.throwTo != null && inp.throwTo >= 0) { const r = this.offT().role[RECV_ORDER[inp.throwTo]]; if (r && r.onField && (r.job === 'route' || r.job === 'attack')) this.throwTo(c, r); }
          else if (inp.b.pressed && this.t > 0.2) { const r = this.mostOpen(c); if (r) this.throwTo(c, r.p); }
          else if (inp.c.pressed && this.t > 0.2) this.throwTo(c, null, true);
          return;
        }
        if (inp.a.pressed) this.doMove(c, 'juke', wx, wz, active);
        else if (inp.b.pressed) this.doMove(c, 'spin', wx, wz, active);
        return;
      }
      if (this.poss === this.user && !this.turn) return;
      if (inp.a.pressed || (this.autoSwitch && this.switchCd <= 0 && this.needsSwitch())) {
        const np = this.bestDefender(inp.a.pressed ? this.ctrl : null);
        if (np) { if (this.ctrl) this.ctrl.manual = false; this.ctrl = np; }
        this.switchCd = inp.a.pressed ? 1.5 : 0.9;
      }
      const c = this.ctrl;
      if (!c || !c.onField) return;
      c.manual = active;
      if (active) { c.wx = wx; c.wz = wz; c.sprint = !!inp.sprint || mag > 0.92; }
      if (inp.b.pressed) {
        if (c.engBy.length) { c.mashT = 0.35; return; }
        if (b.state === 'air' && b.fl && b.fl.kind === 'pass' && hyp(c.x - b.fl.x1, c.z - b.fl.z1) < 4) { c.swatT = 0.6; c.act = 'jump'; c.actT = 0; c.actDur = 0.6; return; }
        this.dive(c);
      }
    }
    needsSwitch() {
      const c = this.ctrl, car = this.carrier();
      if (!c || !car || car.team.idx === this.user) return false;
      const best = this.bestDefender(null);
      if (!best || best === c) return false;
      return hyp(c.x - car.x, c.z - car.z) > hyp(best.x - car.x, best.z - car.z) + 7;
    }
    bestDefender(exclude) {
      const b = this.ball, uT = this.teams[this.user];
      const tgt = b.state === 'air' && b.fl ? { x: b.fl.x1, z: b.fl.z1 } : (this.carrier() || b);
      let best = null, bd = 1e9;
      for (const p of this.field) {
        if (p.team !== uT || p === exclude || p.act === 'down' || p.act === 'tackled') continue;
        const dd = hyp(p.x - tgt.x, p.z - tgt.z) + (p.engBy.length ? 4 : 0);
        if (dd < bd) { bd = dd; best = p; }
      }
      return best;
    }
    dive(c) {
      if (c.act || c.tackleCd > 0) return;
      const car = this.carrier();
      let ang = c.dir;
      if (car && car.team !== c.team) { const dx = car.x + car.vx * 0.2 - c.x, dz = car.z + car.vz * 0.2 - c.z; if (hyp(dx, dz) < 5) ang = Math.atan2(dz, dx); }
      const sp = Math.max(7, hyp(c.vx, c.vz) + 2);
      c.act = 'dive'; c.actT = 0; c.actDur = 0.42; c.dvx = Math.cos(ang) * sp; c.dvz = Math.sin(ang) * sp; c.dir = ang;
    }
    doMove(c, kind, wx, wz, steer) {
      if (c.moveCd > 0 || c.act === 'down' || c.act === 'tackled') return;
      const sp = Math.max(4, hyp(c.vx, c.vz));
      const fx = c.vx / sp || Math.cos(c.dir), fz = c.vz / sp || Math.sin(c.dir);
      let side = this.rand() < 0.5 ? -1 : 1;
      if (steer) side = Math.sign(fx * wz - fz * wx) || side;
      if (kind === 'juke') {
        c.act = 'juke'; c.actT = 0; c.actDur = 0.3;
        c.dvx = fx * 3 - fz * side * 7.5; c.dvz = fz * 3 + fx * side * 7.5;
        c.evadeT = 0.42; c.moveCd = 1.0;
      } else {
        c.act = 'spin'; c.actT = 0; c.actDur = 0.45;
        c.dvx = fx * sp * 0.75; c.dvz = fz * sp * 0.75;
        c.evadeT = 0.48; c.moveCd = 1.2;
      }
      c.moveKind = kind;
      this.emit('move', { kind });
    }

    /* ---------------- AI ---------------- */
    ai(dt) {
      const user = this.ctrl;
      for (const p of this.field) {
        if (p === user && p.manual) continue;
        if (p.act === 'down' || p.act === 'tackled' || p.act === 'dive' || p.act === 'juke' || p.act === 'spin') continue;
        if (p.engBy.length || p.eng) continue;
        p.face = null;
        switch (p.job) {
          case 'qb': this.qbAI(p, dt); break;
          case 'handoff': this.handoffAI(p); break;
          case 'runner': this.runnerAI(p); break;
          case 'route': this.routeAI(p); break;
          case 'attack': this.attackAI(p); break;
          case 'block': this.blockAI(p); break;
          case 'screen': this.screenAI(p); break;
          case 'carry': this.carrierAI(p, dt); break;
          case 'rush': this.rushAI(p); break;
          case 'man': this.manAI(p, dt); break;
          case 'zone': this.zoneAI(p); break;
          case 'ball': this.ballAI(p, dt); break;
          case 'pursue': this.pursueAI(p, dt); break;
          case 'escort': this.escortAI(p); break;
          default: this.idleAI(p); break;
        }
      }
    }
    seek(p, tx, tz, sprint, slow) {
      const dx = tx - p.x, dz = tz - p.z, dl = hyp(dx, dz);
      if (dl < 0.2) { p.wx = p.wz = 0; return; }
      const k = Math.min(1, dl / (slow || 1.2));
      p.wx = (dx / dl) * k; p.wz = (dz / dl) * k; p.sprint = sprint;
    }
    idleAI(p) { p.wx *= 0.9; p.wz *= 0.9; p.sprint = false; }

    qbAI(q, dt) {
      const op = this.play, d = this.offT().dir, b = this.ball;
      if (b.holder !== q) { q.wx = q.wz = 0; q.face = d > 0 ? 0 : Math.PI; return; }
      const setX = this.los - 6.5 * d;
      if (op.pa && this.t < 0.75) { const rb = this.offT().role.RB; this.seek(q, rb.x, rb.z, false); }
      else if (!q.setDone) { this.seek(q, setX, this.ballZ, false, 0.8); if (hyp(q.x - setX, q.z - this.ballZ) < 0.5) q.setDone = true; }
      else {
        let thr = null, td = 9;
        for (const r of this.defense) { if (r.engBy.length) continue; const dd = hyp(r.x - q.x, r.z - q.z); if (dd < td && (r.job === 'rush' || r.job === 'pursue')) { td = dd; thr = r; } }
        if (thr && td < 4) { const ax = q.x - thr.x, az = q.z - thr.z, al = hyp(ax, az) || 1; this.seek(q, q.x + (ax / al) * 3 + d * 0.8, q.z + (az / al) * 3, false); }
        else { q.wx = q.wz = 0; q.face = d > 0 ? 0 : Math.PI; }
      }
      if (q === this.ctrl && this.user === this.poss) return;
      if (this.passed) return;
      const ai = q.team.ai;
      let pressure = 9;
      for (const r of this.defense) if (!r.engBy.length && r.job !== 'man' && r.job !== 'zone') pressure = Math.min(pressure, hyp(r.x - q.x, r.z - q.z));
      if (this.t < op.drop) {
        if (this.t > 0.5 && pressure < 3.4 && this.rand() < dt * (4 + (q.e.awr / 99) * 6)) {
          const mo = this.mostOpen(q);
          if (mo && mo.o > -0.35) this.throwTo(q, mo.p);
        }
        return;
      }
      const tt = this.t - op.drop;
      const thrM = ai.qbThr - tt * 0.22;
      const R = this.offT().role;
      const reads = op.read.map((r) => R[r]).filter((p) => p && p.onField && p.job === 'route');
      if (!reads.length) return;
      const idx = Math.min(reads.length - 1, Math.floor(tt / 0.55));
      let best = null;
      for (let i = 0; i <= idx; i++) { const o = this.openness(q, reads[i]); if (o > thrM && (!best || o > best.o)) best = { p: reads[i], o }; }
      if (best && this.rand() < dt * 9) { this.throwTo(q, best.p); return; }
      if (pressure < 1.9 || tt > 3.2) {
        const mo = this.mostOpen(q);
        if (mo && mo.o > -0.3) { this.throwTo(q, mo.p); return; }
        if (this.rand() < dt * 3) {
          if (this.rand() < 0.4 + (q.e.awr / 99) * 0.4) { this.throwTo(q, null, true); return; }
          if (q.e.spd > 60 && this.rand() < 0.5) { q.job = 'carry'; this.qbRun = true; }
        }
      }
    }
    handoffAI(q) {
      const op = this.play, d = this.offT().dir;
      if (this.handed || this.ball.holder !== q) {
        this.seek(q, this.los - 5 * d, this.ballZ - (op.hole > 0 ? 2.5 : -2.5) * d * this.flip, false, 1.5);
        return;
      }
      if (op.toss) { q.wx = q.wz = 0; return; }
      this.seek(q, this.los - 2.7 * d, this.ballZ + Math.sign(op.hole) * 0.7 * d * this.flip, false, 0.6);
    }
    runnerAI(rb) {
      const op = this.play, d = this.offT().dir, R = this.offT().role;
      if (op.toss) { this.seek(rb, this.los - 4.2 * d + this.t * 2 * d, this.ballZ + op.hole * d * this.flip, true); return; }
      const qb = R.QB;
      if (this.t < 0.45) this.seek(rb, qb.x - d * 0.4, qb.z + Math.sign(op.hole) * 0.4 * d * this.flip, true, 0.5);
      else this.seek(rb, this.los + d, this.ballZ + op.hole * d * this.flip, true);
    }
    routeAI(p) {
      const r = p.route;
      p.sprint = true;
      if (p.wp < r.length) {
        const w = r[p.wp], dx = w.x - p.x, dz = w.z - p.z, dl = hyp(dx, dz);
        if (dl < 0.8) p.wp++;
        let k = 1;
        if (p.wp + 1 < r.length + 1 && p.wp < r.length - 1 && dl < 2.2) {
          const nx = r[p.wp + 1].x - w.x, nz = r[p.wp + 1].z - w.z, nl = hyp(nx, nz) || 1;
          const cos = (dx * nx + dz * nz) / ((dl || 1) * nl);
          if (cos < 0.7) k = 0.62 + 0.38 * (dl / 2.2);
        }
        if (dl > 0.01) { p.wx = (dx / dl) * k; p.wz = (dz / dl) * k; }
        return;
      }
      if (p.settle) { p.wx = p.wz = 0; const q = this.offT().role.QB; p.face = Math.atan2(q.z - p.z, q.x - p.x); return; }
      const n = r.length, a = r[n - 2], c = r[n - 1];
      const l = hyp(c.x - a.x, c.z - a.z) || 1;
      let ux = (c.x - a.x) / l, uz = (c.z - a.z) / l;
      if (Math.abs(p.z) > FW - 2 && Math.sign(uz) === Math.sign(p.z)) uz = 0;
      if (Math.abs(p.x) > EL - 2 && Math.sign(ux) === Math.sign(p.x)) ux = 0;
      p.wx = ux; p.wz = uz;
    }
    attackAI(p) {
      const a = p.atk;
      if (!a) { p.job = 'route'; return; }
      this.seek(p, a.x, a.z, true, 0.4);
      if (hyp(a.x - p.x, a.z - p.z) < 0.4) { const b = this.ball; p.face = Math.atan2(b.z - p.z, b.x - p.x); }
    }
    blockAI(p) {
      let tg = p.blk;
      if (!tg || !tg.onField || tg.act === 'down' || (p.noBlockT > 0 && p.noBlockP === tg) || tg.engBy.length >= 2 || (this.play.type === 'pass' && !this.passed && tg.job !== 'rush' && tg.job !== 'pursue')) tg = this.findBlockTarget(p);
      p.blk = tg;
      const prot = this.protectPoint();
      const d = this.offT().dir;
      if (!tg) {
        const hx = this.play.type === 'pass' ? p.sx - d * 1.5 : p.x + d;
        this.seek(p, hx, p.sz, false, 1.5);
        p.face = d > 0 ? 0 : Math.PI;
        return;
      }
      let dx = prot.x - tg.x, dz = prot.z - tg.z;
      const dl = hyp(dx, dz) || 1; dx /= dl; dz /= dl;
      this.seek(p, tg.x + dx * 0.9, tg.z + dz * 0.9, true, 0.5);
      p.face = Math.atan2(tg.z - p.z, tg.x - p.x);
      if (hyp(p.x - tg.x, p.z - tg.z) < 1.1 && tg.job !== 'carry' && !(tg.shedT > 0 && tg.lastShed === p)) this.engage(p, tg);
    }
    findBlockTarget(p) {
      const prot = this.protectPoint();
      const passPro = this.play.type === 'pass' && !this.passed;
      let best = null, bs = 1e9;
      for (const t of this.defense) {
        if (t.act === 'down' || t.engBy.length >= 2 || (p.noBlockT > 0 && p.noBlockP === t)) continue;
        if (passPro && t.job !== 'rush' && t.job !== 'pursue') continue;
        const dp = hyp(t.x - p.x, t.z - p.z);
        if (dp > 6) continue;
        const s = dp + hyp(t.x - prot.x, t.z - prot.z) * 0.5 + t.engBy.length * 3;
        if (s < bs) { bs = s; best = t; }
      }
      return best;
    }
    screenAI(p) {
      const rb = this.offT().role.RB, d = this.offT().dir;
      const k = ['LT', 'LG', 'RG', 'RT'].indexOf(p.role);
      this.seek(p, rb.x + d * (2.5 + (k % 2) * 2), rb.z + (k - 1.5) * 1.6, true, 0.6);
      if (p.noBlockT > 0) return;
      for (const o of this.defense) {
        if (o.engBy.length || o.act === 'down') continue;
        if (hyp(o.x - p.x, o.z - p.z) < 1.05 && hyp(o.x - rb.x, o.z - rb.z) < 9) { this.engage(p, o); break; }
      }
    }
    engage(b, r) {
      if (r.engBy.includes(b)) return;
      r.engBy.push(b); b.eng = r; r.engT = 0;
      if (r.engBy.length === 1) this.emit('engage');
    }
    escortAI(p) {
      const c = this.carrier();
      if (!c) { this.idleAI(p); return; }
      let best = null, bd = 1e9;
      for (const o of this.field) {
        if (o.team === p.team || o.act === 'down' || o.engBy.length >= 1) continue;
        const dc = hyp(o.x - c.x, o.z - c.z), dp = hyp(o.x - p.x, o.z - p.z);
        if (dc < 9 && dp < 7 && dc + dp < bd) { bd = dc + dp; best = o; }
      }
      if (best) {
        const dx = c.x - best.x, dz = c.z - best.z, dl = hyp(dx, dz) || 1;
        this.seek(p, best.x + (dx / dl) * 0.9, best.z + (dz / dl) * 0.9, true, 0.5);
        if (hyp(p.x - best.x, p.z - best.z) < 1.05 && !(best.shedT > 0 && best.lastShed === p)) this.engage(p, best);
      } else {
        this.seek(p, c.x + c.team.dir * 5, c.z + (p.z > c.z ? 4 : -4), true);
      }
    }
    carrierAI(p, dt) {
      p.aiT -= dt;
      if (p.aiT > 0) { p.wx = p.aiDx; p.wz = p.aiDz; p.sprint = true; return; }
      p.aiT = 0.1;
      const d = p.team.dir;
      const opp = this.field.filter((o) => o.team !== p.team && o.act !== 'down' && o.act !== 'tackled');
      const behindLos = !this.turn && (p.x - this.los) * d < 0.8;
      let best = -1e9, bx = d, bz = 0;
      for (let k = -7; k <= 7; k++) {
        const a = k * 0.19;
        const dx = Math.cos(a) * d, dz = Math.sin(a);
        let sc = Math.cos(a) * 1.2;
        if (behindLos && p.hole) {
          const hx = p.hole.x - p.x, hz = p.hole.z - p.z, hl = hyp(hx, hz) || 1;
          sc += ((dx * hx + dz * hz) / hl) * 1.6;
        }
        for (const s of [1.6, 3.5, 6.5]) {
          const px = p.x + dx * s, pz = p.z + dz * s;
          if (Math.abs(pz) > FW - 0.8) sc -= 3;
          for (const o of opp) {
            const w = o.engBy.length ? 0.25 : 1;
            const od = hyp(o.x + o.vx * 0.3 - px, o.z + o.vz * 0.3 - pz);
            if (od < 3.6) sc -= (3.6 - od) * w * (s < 2 ? 1.0 : s < 4 ? 0.65 : 0.35);
          }
        }
        if (sc > best) { best = sc; bx = dx; bz = dz; }
      }
      p.aiDx = bx; p.aiDz = bz; p.wx = bx; p.wz = bz; p.sprint = true;
      if (p.moveCd <= 0 && p !== this.ctrl) {
        for (const o of opp) {
          if (o.engBy.length) continue;
          const od = hyp(o.x - p.x, o.z - p.z);
          if (od < 2.4 && od > 0.9 && (o.x - p.x) * d > -0.5) {
            if (this.rand() < (p.e.agi / 99) * 0.22) this.doMove(p, this.rand() < 0.6 ? 'juke' : 'spin', 0, 0, false);
            else p.moveCd = 0.5;
            break;
          }
        }
      }
    }
    rushAI(r) {
      const tg = this.rushTarget();
      if (r.biteT > 0) { this.seek(r, r.x - this.offT().dir * 2, r.z, false); return; }
      const qbPocket = tg === this.offT().role.QB && !this.qbRun;
      let tx = tg.x + (tg.vx || 0) * 0.3, tz = tg.z + (tg.vz || 0) * 0.3;
      if (qbPocket && (r.role === 'LE' || r.role === 'RE') && hyp(r.x - tx, r.z - tz) > 4) tz += Math.sign(r.z - this.ballZ || 1) * 2;
      this.seek(r, tx, tz, true, 0.3);
    }
    manAI(p, dt) {
      const r = p.manT, ai = p.team.ai;
      if (p.biteT > 0) { this.seek(p, p.x - this.offT().dir * 1.5, p.z, false); return; }
      if (!r || !r.onField) { p.job = 'zone'; p.zone = this.zonePoint('mid'); return; }
      const lag = clamp((0.36 - (p.e.cov / 99) * 0.24) / ai.cover, 0.08, 0.5);
      const k = 1 - Math.exp(-dt / lag);
      p.estVx += (r.vx - p.estVx) * k; p.estVz += (r.vz - p.estVz) * k;
      const dO = this.offT().dir;
      const cush = lerp(1.6, 0.6, clamp(this.t / 2.2, 0, 1)) * (p.pos === 'LB' ? 0.6 : 1);
      const tx = r.x + p.estVx * 0.3 + dO * cush, tz = r.z + p.estVz * 0.3 - Math.sign(r.z) * 0.3;
      this.seek(p, tx, tz, hyp(tx - p.x, tz - p.z) > 0.8 || hyp(r.vx, r.vz) > 4, 0.6);
      p.face = Math.atan2(this.ball.z - p.z, this.ball.x - p.x);
    }
    zoneAI(p) {
      if (p.biteT > 0) { this.seek(p, p.x - this.offT().dir * 1.5, p.z, false); return; }
      const z = p.zone, dO = this.offT().dir;
      let thr = null, bs = -1e9;
      for (const o of this.offense) {
        if (o.job !== 'route') continue;
        const dd = hyp(o.x - z.x, o.z - z.z);
        if (dd > z.r) continue;
        const sc = z.deep ? o.x * dO - dd * 0.3 : -dd;
        if (sc > bs) { bs = sc; thr = o; }
      }
      let tx = z.x, tz = z.z;
      if (thr) {
        tx = thr.x + thr.vx * 0.35 + dO * (z.deep ? 2.2 : -0.4);
        tz = thr.z + thr.vz * 0.3;
        const ox = tx - z.x, oz = tz - z.z, ol = hyp(ox, oz), lim = z.r + 2;
        if (ol > lim) { tx = z.x + (ox / ol) * lim; tz = z.z + (oz / ol) * lim; }
      }
      this.seek(p, tx, tz, hyp(tx - p.x, tz - p.z) > 2.5, 1);
      p.face = Math.atan2(this.ball.z - p.z, this.ball.x - p.x);
    }
    ballAI(p, dt) {
      const b = this.ball;
      p.react -= dt;
      if (p.react > 0) { this.zoneOrMan(p, dt); return; }
      if (b.state !== 'air' || !b.fl) { p.job = 'pursue'; return; }
      this.seek(p, b.fl.x1, b.fl.z1, true, 0.3);
    }
    zoneOrMan(p, dt) { if (p.manT) this.manAI(p, dt); else if (p.zone) this.zoneAI(p); else this.idleAI(p); }
    pursueAI(p, dt) {
      p.react -= dt;
      const b = this.ball;
      let c = this.carrier();
      if (!c && b.state === 'air' && b.fl && b.fl.target) c = b.fl.target;
      if (!c) { this.idleAI(p); return; }
      if (p.react > 0 && (p.manT || p.zone)) { this.zoneOrMan(p, dt); return; }
      const ip = this.cutoff(p, c);
      this.seek(p, ip.x, ip.z, true, 0.2);
      // close but not quite there: lay out for the tackle
      const dist = hyp(c.x - p.x, c.z - p.z);
      if (c === this.carrier() && dist > 1.05 && dist < 2.1 && !p.act && p.tackleCd <= 0 && this.rand() < dt * 7) this.dive(p);
    }
    cutoff(p, c) {
      const rx = c.x - p.x, rz = c.z - p.z, vx = c.vx || 0, vz = c.vz || 0, s = p.maxSpeed * 0.97;
      const a = vx * vx + vz * vz - s * s, b = 2 * (rx * vx + rz * vz), cc = rx * rx + rz * rz;
      let t = null;
      if (Math.abs(a) < 1e-4) t = b < 0 ? -cc / b : null;
      else {
        const disc = b * b - 4 * a * cc;
        if (disc >= 0) {
          const sq = Math.sqrt(disc), t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
          t = Math.min(t1 > 0 ? t1 : 1e9, t2 > 0 ? t2 : 1e9);
          if (t > 1e8) t = null;
        }
      }
      if (t == null) t = 1.4;
      t = Math.min(t, 2.2);
      return { x: c.x + vx * t, z: c.z + vz * t };
    }

    /* ---------------- blocking ---------------- */
    engageStep(dt) {
      for (const r of this.field) {
        if (!r.engBy.length) continue;
        const bl = r.engBy.filter((b) => b.eng === r && b.onField && b.act !== 'down');
        r.engBy = bl;
        if (!bl.length) continue;
        r.engT += dt;
        const car = this.carrier();
        const runMode = car && car.team !== r.team && car.job === 'carry';
        const tg = this.rushTarget();
        let bp = 0;
        bl.forEach((b, i) => { bp += (b.e.blk * 0.6 + b.e.str * 0.4) * (i === 0 ? 1 : 0.5) * b.team.ai.block; });
        const rp = (r.e.str * 0.55 + r.e.agi * 0.45) * r.team.ai.rush * (r.mashT > 0 ? 1.12 : 1);
        const diff = (rp - bp) / 100;
        let dx = tg.x - r.x, dz = tg.z - r.z;
        const dl = hyp(dx, dz) || 1; dx /= dl; dz /= dl;
        const downfield = r.job === 'pursue' || r.job === 'ball' || r.job === 'man' || r.job === 'zone';
        let v;
        if (this.play.type === 'run' && !this.turn) v = clamp(-0.8 + diff * 5, -2.0, 1.2);
        else if (downfield) v = clamp(0.3 + diff * 4, -0.8, 1.6);
        else v = clamp(0.95 + diff * 5, 0.15, 2.7);
        const wob = Math.sin(this.time * 3 + r.i) * 0.3;
        r.vx = dx * v - dz * wob; r.vz = dz * v + dx * wob;
        r.x += r.vx * dt; r.z += r.vz * dt;
        r.dir = Math.atan2(dz, dx);
        bl.forEach((b, i) => {
          const off = i === 0 ? 0 : i === 1 ? 0.7 : -0.7;
          b.x = r.x + dx * 0.85 - dz * off; b.z = r.z + dz * 0.85 + dx * off;
          b.vx = r.vx; b.vz = r.vz; b.dir = Math.atan2(-dz, -dx);
        });
        let rate = 0.08 + diff * 0.9 + r.engT * 0.07;
        if (runMode) { const dc = hyp(car.x - r.x, car.z - r.z); if (dc < 2.6) rate += 0.65; }
        if (downfield) rate += 0.5;
        if (r.mashT > 0) rate += 0.7;
        rate = clamp(rate, 0.02, 3) * (bl.length > 1 ? 0.45 : 1);
        if (this.rand() < rate * dt) this.shed(r);
      }
    }
    shed(r) {
      r.engBy.forEach((b) => { b.eng = null; b.noBlockT = 1.1; b.noBlockP = r; });
      r.lastShed = r.engBy[0];
      r.engBy = []; r.shedT = 0.6; r.engT = 0;
    }

    /* ---------------- movement ---------------- */
    movePlayers(dt) {
      for (const p of this.field) {
        if (p.engBy.length || p.eng) { p.actT += dt; continue; }
        if (p.act) {
          p.actT += dt;
          if (p.actT >= p.actDur) {
            if (p.act === 'dive') { p.act = 'down'; p.actT = 0; p.actDur = 0.55; }
            else if (p.act === 'tackled') p.actT = p.actDur;
            else p.act = null;
          }
        }
        if (p.act === 'tackled') { p.vx *= 0.9; p.vz *= 0.9; p.x += p.vx * dt; p.z += p.vz * dt; continue; }
        let sp = p.maxSpeed * p.team.ai.speed;
        if (this.user === p.team.idx) sp = p.maxSpeed;
        let mul = p.sprint ? 1 : 0.68;
        if (this.ball.holder === p && this.ball.state === 'held' && p.job === 'carry') mul *= 0.9;
        if (p.act === 'down' || p.act === 'celebrate') mul = 0;
        if (p.act === 'throw' || p.act === 'catch') mul *= 0.6;
        if (p.act === 'dive' || p.act === 'juke' || p.act === 'spin') {
          const k = 1 - (p.actT / p.actDur) * 0.5;
          p.vx = p.dvx * k; p.vz = p.dvz * k;
        } else {
          let wx = p.wx, wz = p.wz;
          const wl = hyp(wx, wz);
          if (wl > 1) { wx /= wl; wz /= wl; }
          const tvx = wx * sp * mul, tvz = wz * sp * mul;
          let ax = tvx - p.vx, az = tvz - p.vz;
          const cut = p.job === 'route' || p.job === 'attack' || p.job === 'carry' ? 1.6 : 1;
          const al = hyp(ax, az), amax = p.accel * cut * (wl < 0.1 ? 1.8 : 1) * dt;
          if (al > amax) { ax *= amax / al; az *= amax / al; }
          p.vx += ax; p.vz += az;
        }
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.x = clamp(p.x, -EL - 4, EL + 4); p.z = clamp(p.z, -FW - 4, FW + 4);
        const v = hyp(p.vx, p.vz);
        let td = null;
        if (p.act === 'spin') td = p.dir + 18 * dt;
        else if (p.face != null && v < 2.5) td = p.face;
        else if (v > 0.8 && p.act !== 'dive') td = Math.atan2(p.vz, p.vx);
        if (td != null) {
          const diff = U.angDiff(td, p.dir), rate = (p.act === 'spin' ? 30 : 12) * dt;
          p.dir += clamp(diff, -rate, rate);
        }
      }
    }
    separate() {
      const ps = this.field, n = ps.length;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = ps[i], c = ps[j];
        if (a.eng === c || c.eng === a || (a.eng && a.eng === c.eng) || a.act === 'tackled' || c.act === 'tackled') continue;
        const dx = c.x - a.x, dz = c.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.5 && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (0.71 - d) * 0.5, nx = dx / d, nz = dz / d;
          const fa = a.engBy.length ? 0.2 : 1, fc = c.engBy.length ? 0.2 : 1;
          a.x -= nx * push * fa; a.z -= nz * push * fa; c.x += nx * push * fc; c.z += nz * push * fc;
        }
      }
    }

    /* ---------------- tackles and the end of a play ---------------- */
    tackles() {
      const c = this.carrier();
      if (!c || c.act === 'tackled') return;
      for (const o of this.field) {
        if (o.team === c.team || o.act === 'down' || o.tackleCd > 0 || o.act === 'tackled') continue;
        const dist = hyp(o.x - c.x, o.z - c.z);
        const reach = o.act === 'dive' ? 1.6 : 1.05;
        if (dist > reach) continue;
        let p = 0.7 + ((o.e.tkl - (c.e.str * 0.5 + c.e.agi * 0.5)) / 100) * 0.9;
        if (o.engBy.length) p *= 0.45;
        if (c.evadeT > 0) p *= c.moveKind === 'spin' ? 0.45 : 0.32;
        if (o.act === 'dive') p += 0.15;
        if (o.team.idx === this.user) p += 0.08; else p *= o.team.ai.tackle;
        if (c.pos === 'QB' && !this.passed && !this.qbRun) p += 0.2;
        p = clamp(p, 0.1, 0.97);
        if (this.rand() < p) { this.tackled(c, o); return; }
        o.tackleCd = 1.1;
        if (!o.engBy.length) { o.act = 'down'; o.actT = 0; o.actDur = 0.65; }
        c.vx *= 0.7; c.vz *= 0.7;
        this.emit('broken', { name: c.card.name, user: c.team.idx === this.user });
      }
    }
    tackled(c, o) {
      const rel = hyp(o.vx - c.vx, o.vz - c.vz);
      c.act = 'tackled'; c.actT = 0; c.actDur = 1.2;
      c.vx = c.vx * 0.4 + o.vx * 0.5; c.vz = c.vz * 0.4 + o.vz * 0.5;
      if (o.act !== 'dive') { o.act = 'dive'; o.actT = 0.2; o.actDur = 0.42; o.dvx = o.vx * 0.6; o.dvz = o.vz * 0.6; }
      const big = rel > 9.5;
      if (big) this.slowmo = 0.45;
      this.emit('tackle', { big, name: o.card.name, user: o.team.idx === this.user });
      const d = c.team.dir;
      const sack = c.pos === 'QB' && !this.passed && !this.qbRun && !this.turn && (c.x - this.los) * d < 0;
      this.endPlay(sack ? 'sack' : 'tackle', c, o);
    }
    checkCarrier() {
      const c = this.carrier();
      if (!c) return;
      const d = c.team.dir;
      if (c.pos === 'QB' && c.job === 'qb' && !this.turn && (c.x - this.los) * d > 0.4) { c.job = 'carry'; this.qbRun = true; }
      if (c.x * d > GL) { this.endPlay('td', c); return; }
      if (Math.abs(c.z) > FW || Math.abs(c.x) > EL) this.endPlay('out', c);
    }

    endPlay(kind, c, tackler) {
      if (this.state !== 'live') return;
      this.state = 'dead'; this.stateT = 0;
      const OT = this.offT(), d = OT.dir, oi = this.poss, st = this.stats[oi];
      for (const p of this.field) { p.engBy = []; p.eng = null; }
      const r = { kind, text: '', sub: '', firstDown: false, change: false };
      this.result = r;
      if (kind === 'td') {
        const sc = c.team.idx;
        if (!this.turn) this.creditYards((GL * d - this.los) * d, kind);
        this.score[sc] += 6; this.stats[sc].tds++;
        const xp = this.rand() < 0.86 + (c.team.kicker.e.kac / 99) * 0.13;
        if (xp) this.score[sc] += 1;
        this.scoring.push({ team: sc, q: this.quarter, name: c.card.name, kind: this.turn ? 'Pick six' : this.caught ? 'TD catch' : 'TD run', pts: xp ? 7 : 6 });
        c.mood = 'celebrate';
        this.scorer = c;
        this.state = 'score'; this.stateT = 0; this.xpShown = false;
        this.pendingXP = xp;
        r.text = 'Touchdown!'; r.sub = c.card.name;
        this.emit('td', { team: sc, name: c.card.name, user: sc === this.user, pick: this.turn });
        this.after = () => { this.setPoss(1 - sc, 25); };
        return;
      }
      if (this.turn && c) {
        const nt = c.team, nd = nt.dir;
        let y = 50 + c.x * nd;
        if (y < 0.5) y = 20;
        r.text = 'Intercepted!'; r.sub = nt.short + ' take over'; r.change = true;
        this.after = () => { this.setPoss(nt.idx, clamp(y, 1, 99)); };
        this.emit('result', r);
        return;
      }
      let spot = c ? clamp(c.x, -EL, EL) : this.los;
      if (kind === 'incomplete') { spot = this.los; r.text = 'Incomplete'; }
      else if (kind === 'sack') this.stats[1 - oi].sacks++;
      const gain = (spot - this.los) * d;
      if (kind !== 'incomplete') this.creditYards(gain, kind);
      if (spot * d < -GL) {
        this.score[1 - oi] += 2;
        this.scoring.push({ team: 1 - oi, q: this.quarter, name: tackler ? tackler.card.name : '', kind: 'Safety', pts: 2 });
        r.text = 'Safety!'; r.sub = '2 points to ' + this.defT().short; r.change = true;
        this.emit('safety', { team: 1 - oi, user: 1 - oi === this.user });
        this.after = () => { this.setPoss(1 - oi, 35); };
        this.emit('result', r);
        return;
      }
      if (kind !== 'incomplete') {
        const g = Math.round(gain);
        r.text = kind === 'sack' ? 'Sacked!' : g > 0 ? 'Gain of ' + g : g < 0 ? 'Loss of ' + -g : 'No gain';
        if (kind === 'out') r.sub = 'Out of bounds';
        this.ballZ = clamp(c.z, -HASH, HASH);
        if (kind === 'tackle' || kind === 'sack') this.clock = Math.max(0, this.clock - 14);
      }
      this.los = spot;
      if ((spot - this.firstX) * d >= -0.05) {
        r.firstDown = true;
        st.firstDowns++;
        this.down = 1; this.setFirst();
        r.sub = 'First down';
        this.emit('firstdown', { user: oi === this.user });
      } else {
        this.down++;
        if (this.down > 4) {
          r.sub = 'Turnover on downs'; r.change = true;
          const ny = 50 + spot * this.defT().dir;
          this.after = () => { this.setPoss(1 - oi, ny); };
          this.emit('result', r);
          return;
        }
      }
      this.after = null;
      this.emit('result', r);
    }
    creditYards(g, kind) {
      const st = this.stats[this.poss];
      if ((this.playKind === 'pass' && this.caught) || kind === 'sack') st.passYds += g;
      else st.rushYds += g;
    }

    deadStep(dt) {
      for (const p of this.field) { if (p.act !== 'tackled' && p.act !== 'down') { p.wx *= 0.85; p.wz *= 0.85; p.sprint = false; } }
      this.movePlayers(dt);
      const b = this.ball;
      if (b.state === 'air' && b.fl) {
        b.fl.t += dt;
        const u = Math.min(1.3, b.fl.t / b.fl.T);
        b.x = lerp(b.fl.x0, b.fl.x1, u); b.z = lerp(b.fl.z0, b.fl.z1, u); b.y = Math.max(0.12, lerp(b.fl.y0, b.fl.y1, u) + 4 * b.fl.h * u * (1 - u));
      } else if (b.state === 'loose') this.loosePhysics(dt);
      else this.ballFollow();
      if (this.stateT > 1.9 && !this.fadeJob) {
        const f = this.after;
        this.after = null;
        this.proceed(f);
      }
    }
    celebrate(dt) {
      const s = this.scorer;
      for (const p of this.field) {
        if (s && p.team === s.team) {
          if (p === s) { p.wx *= 0.9; p.wz *= 0.9; p.mood = 'celebrate'; }
          else { this.seek(p, s.x + Math.cos(p.i * 1.7) * 2.2, s.z + Math.sin(p.i * 1.7) * 2.2, false, 1.5); p.mood = hyp(p.x - s.x, p.z - s.z) < 3.5 ? 'celebrate' : null; }
        } else { p.wx *= 0.9; p.wz *= 0.9; p.mood = s && p.team !== s.team ? 'sad' : null; }
        if (p.act === 'tackled' || p.act === 'down') p.act = null;
      }
      this.movePlayers(dt);
      this.ballFollow();
      if (this.stateT > 2.6 && !this.xpShown) { this.xpShown = true; this.emit('xp', { good: this.pendingXP, team: s.team.idx, user: s.team.idx === this.user }); }
      if (this.stateT > 4.4 && !this.fadeJob) { const f = this.after; this.after = null; this.proceed(f); }
    }

    proceed(next) {
      this.startFade(() => {
        if (this.clock <= 0) {
          if (this.quarter >= 4) { this.finish(); return; }
          if (this.quarter === 2) {
            this.quarter = 3; this.clock = this.qLen;
            this.setPoss(1 - this.firstPoss, 25);
            this.emit('banner', { text: 'Halftime', sub: this.teams[0].short + ' ' + this.score[0] + ' – ' + this.score[1] + ' ' + this.teams[1].short, hold: 2.4 });
            this.baseLineup(); this.toCall();
            return;
          }
          if (next) next();
          this.quarter++; this.clock = this.qLen;
          this.emit('banner', { text: 'End of Q' + (this.quarter - 1), sub: this.teams[0].short + ' ' + this.score[0] + ' – ' + this.score[1] + ' ' + this.teams[1].short, hold: 1.6 });
        } else if (next) next();
        this.baseLineup(); this.toCall();
      });
    }
    finish() { this.state = 'final'; this.stateT = 0; this.emit('final'); }

    /* ---------------- special teams ---------------- */
    snapSpecial() {
      const OT = this.offT(), R = OT.role, K = OT.kicker, isFG = this.play.id === 'fg';
      for (const p of this.offense) {
        if (p === K) p.job = 'kicker';
        else if (p.role === 'QB') p.job = isFG ? 'hold' : 'block';
        else if (!isFG && (p.role === 'X' || p.role === 'Z')) p.job = 'gunner';
        else p.job = 'block';
      }
      for (const p of this.defense) p.job = p.pos === 'DL' || (isFG && p.pos === 'LB') ? 'rush' : p.role === 'FS' && !isFG ? 'returner' : 'hold';
      this.assignBlocks();
      this.ballSnap(isFG ? R.QB : K, isFG ? 0.32 : 0.55);
      this.kick = { isFG, kicked: false, res: null };
    }
    liveSpecial(dt) {
      const OT = this.offT(), K = OT.kicker, d = OT.dir, b = this.ball, kk = this.kick;
      this.ballPre(dt);
      for (const p of this.field) {
        if (p.engBy.length || p.eng) continue;
        if (p.job === 'kicker') {
          if (kk.isFG) {
            const ax = b.x - d * 0.45, az = b.z - 0.3;
            if (b.state === 'placed' && !kk.kicked) { this.seek(p, ax, az, false, 0.3); if (hyp(p.x - ax, p.z - az) < 0.35 || this.t > 1.5) this.doFG(); }
            else { p.wx = p.wz = 0; p.face = d > 0 ? 0 : Math.PI; }
          } else if (b.holder === K && !kk.kicked) { p.wx = d * 0.4; p.wz = 0; if (this.t > 1.05) this.doPunt(); }
          else this.idleAI(p);
        } else if (p.job === 'hold') {
          if (p.team === OT) { p.wx = p.wz = 0; p.kneel = true; p.face = d > 0 ? 0 : Math.PI; }
          else if (kk.kicked && !kk.isFG && b.fl) this.seek(p, b.fl.x1 - d * 6, p.z * 0.7 + b.fl.z1 * 0.3, false);
          else { p.wx = p.wz = 0; }
        } else if (p.job === 'returner') {
          if (kk.kicked && b.fl) { this.seek(p, b.fl.x1, b.fl.z1, true, 0.3); p.face = Math.atan2(b.z - p.z, b.x - p.x); }
          else this.seek(p, this.los + d * 42, this.ballZ, false);
        } else if (p.job === 'gunner') {
          const tx = kk.kicked && b.fl ? b.fl.x1 - d * 3 : p.x + d * 10;
          this.seek(p, tx, kk.kicked && b.fl ? b.fl.z1 + (p.z > b.fl.z1 ? 3 : -3) : p.z, true);
        } else if (p.job === 'block') {
          if (kk.kicked && !kk.isFG && b.fl) this.seek(p, b.fl.x1 - d * 5, p.z * 0.6 + b.fl.z1 * 0.4, false);
          else this.blockAI(p);
        } else if (p.job === 'rush') {
          if (kk.kicked) this.idleAI(p); else this.seek(p, this.los - d * 6, this.ballZ, true, 0.3);
        } else this.idleAI(p);
      }
      this.engageStep(dt);
      this.movePlayers(dt);
      this.separate();
      if (b.state === 'held') this.ballFollow();
      if (b.state === 'air' && b.fl) {
        const f = b.fl;
        f.t += dt;
        const u = f.t / f.T;
        b.x = lerp(f.x0, f.x1, u); b.z = lerp(f.z0, f.z1, u); b.y = Math.max(0.12, lerp(f.y0, f.y1, u) + 4 * f.h * u * (1 - u));
        if (f.kind === 'fg') { if (!kk.res.done && (b.x * d >= EL || u >= 1)) { kk.res.done = true; this.fgResult(kk.res); } }
        else if (f.kind === 'punt' && u >= 1) this.puntResult(f);
      }
    }
    doFG() {
      const OT = this.offT(), K = OT.kicker, d = OT.dir, b = this.ball, ke = K.e;
      const dist = this.fgDistance(), range = this.fgRange(OT);
      const side = this.rand() < 0.5 ? -1 : 1;
      const lat = (1 - this.kickAcc) * (4 + dist * 0.08) * side + this.gauss() * (1.25 - ke.kac / 99) * dist * 0.022;
      const short = dist > range;
      const good = !short && Math.abs(lat) < 3.0;
      const sx = b.x, toPosts = Math.max(1, EL - sx * d), travel = toPosts + 6;
      const x1 = short ? sx + d * (range - 3) : sx + d * travel;
      b.state = 'air';
      b.fl = { x0: sx, y0: 0.3, z0: b.z, x1, y1: short ? 0.12 : 4.5, z1: b.z + ((lat - b.z) * travel) / toPosts, T: Math.max(1.2, travel / 26), h: short ? 4 + dist * 0.08 : 6 + dist * 0.14, t: 0, kind: 'fg' };
      this.kick.kicked = true;
      this.kick.res = { good, dist, short, done: false };
      K.act = 'kick'; K.actT = 0; K.actDur = 0.45;
      this.emit('kick', { kind: 'fg' });
    }
    fgResult(res) {
      const OT = this.offT(), oi = this.poss;
      this.state = 'dead'; this.stateT = -0.6;
      const r = { kind: 'fg', text: res.good ? "It's good!" : 'No good', sub: res.dist + '-yard field goal', change: true };
      this.result = r;
      if (res.good) {
        this.score[oi] += 3;
        this.scoring.push({ team: oi, q: this.quarter, name: OT.kicker.card.name, kind: res.dist + ' yd FG', pts: 3 });
        this.after = () => { this.setPoss(1 - oi, 25); };
      } else {
        const ny = Math.max(20, 50 + this.los * this.defT().dir);
        this.after = () => { this.setPoss(1 - oi, ny); };
      }
      this.clock = Math.max(0, this.clock - 4);
      this.emit('fg', { good: res.good, dist: res.dist, user: oi === this.user });
      this.emit('result', r);
    }
    doPunt() {
      const OT = this.offT(), K = OT.kicker, d = OT.dir, b = this.ball, ke = K.e;
      const dist = 37 + (ke.kpw / 99) * 13 + this.gauss() * 4;
      const x1 = clamp(K.x + dist * d, -EL + 2, EL - 2), z1 = clamp(this.ballZ + this.gauss() * 7, -FW + 4, FW - 4);
      b.state = 'air';
      b.fl = { x0: K.x + d * 0.5, y0: 1.0, z0: K.z, x1, y1: 1.2, z1, T: 3.8, h: 17, t: 0, kind: 'punt' };
      this.kick.kicked = true;
      K.act = 'kick'; K.actT = 0; K.actDur = 0.45;
      this.emit('kick', { kind: 'punt' });
    }
    puntResult(f) {
      const oi = this.poss, DT = this.defT();
      this.state = 'dead'; this.stateT = 0;
      const tb = f.x1 * this.offT().dir > GL;
      const ny = tb ? 20 : 50 + f.x1 * DT.dir;
      const r = { kind: 'punt', text: tb ? 'Touchback' : 'Fair catch', sub: Math.round(Math.abs(f.x1 - this.los)) + '-yard punt', change: true };
      this.result = r;
      this.give(DT.role.FS);
      this.clock = Math.max(0, this.clock - 6);
      this.after = () => { this.setPoss(1 - oi, ny); };
      this.emit('result', r);
    }
  }

  FG.Match = Match;
  FG.FIELD = { GL, EL, FW, HASH };
})();
