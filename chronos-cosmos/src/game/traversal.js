import * as THREE from 'three';
import { G } from '../core/G.js';
import { mulberry32 } from '../core/noise.js';
import { Builder, Site, MATS } from '../world/structures.js';
import { START, forestMask } from '../world/worldmap.js';
import { EPOCHS } from '../world/epochs.js';
import { setJ, OFF } from '../actors/rig.js';

// Extra ways to move and play: ziplines, belly-sliding down slopes,
// giant bounce mushrooms, glide/run ring trials and a combo counter.

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export class Traversal {
  constructor(scene) {
    this.scene = scene;
    this.lines = [];
    this.trials = [];
    this.run = null;
    this.retry = null;
    this.combo = { n: 0, t: 0, best: 0 };
    const root = document.getElementById('ui-root');
    this.banner = document.createElement('div');
    this.banner.className = 'trial-banner';
    this.banner.hidden = true;
    root.appendChild(this.banner);
    this.comboEl = document.createElement('div');
    this.comboEl.className = 'combo';
    this.comboEl.hidden = true;
    root.appendChild(this.comboEl);
  }

  get S() {
    return G.game.state;
  }

  build() {
    this.buildZiplines();
    this.buildMushrooms();
    this.buildTrials();
  }

  // -------------------------------------------------------------- ziplines
  buildZiplines() {
    const c = G.content;
    const H = (x, z) => G.terrain.heightAt(x, z);
    const defs = [];
    // from the Spire summit balcony to the west shore
    if (c.spireTop) {
      const t = c.spireTop;
      // run out over the lake until we reach dry land on the far side
      const ang = Math.atan2(-215, 70);
      let d = 200, ex = 0, ez = 0;
      for (; d < 340; d += 8) {
        ex = t.x + Math.sin(ang) * d; ez = t.z + Math.cos(ang) * d;
        if (H(ex, ez) > EPOCHS[0].water.level + 1.2) break;
      }
      defs.push({ a: V(t.x - 4.6, t.y + 2.4, t.z + 1.5), b: V(ex, H(ex, ez) + 2.6, ez), name: 'the shore', epochs: [0] });
    }
    // observatory balcony down to the village square
    const hm = c.hearthmere;
    if (hm) {
      const tx = hm.obs.x, tz = hm.obs.z - 4, ty = H(tx, tz);
      const dx = hm.cx - tx, dz = hm.cz - tz, l = Math.hypot(dx, dz) || 1;
      const ax = tx + (dx / l) * 4.5, az = tz + (dz / l) * 4.5;
      const bx = hm.cx - (dx / l) * 6, bz = hm.cz - (dz / l) * 6;
      defs.push({ a: V(ax, ty + 16.2, az), b: V(bx, H(bx, bz) + 2.6, bz), name: 'the square', epochs: [0] });
    }
    // the three pillar tops
    for (const p of c.pillars || []) {
      const ang = Math.atan2(START.x - p.x, START.z - p.z) + 0.5;
      const ex = p.x + Math.sin(ang) * 120, ez = p.z + Math.cos(ang) * 120;
      const ey = H(ex, ez);
      if (ey < EPOCHS[0].water.level + 0.5 || ey > p.top - 20) continue;
      defs.push({ a: V(p.x + Math.sin(ang) * 3.5, p.top + 2.4, p.z + Math.cos(ang) * 3.5), b: V(ex, ey + 2.6, ez), name: 'the valley', epochs: [0, 1, 2] });
    }
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.8 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xc8b07a, metalness: 1, roughness: 0.35 });
    for (const d of defs) {
      const len = d.a.distanceTo(d.b);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6, 1), ropeMat);
      rope.position.copy(d.a).add(d.b).multiplyScalar(0.5);
      rope.quaternion.setFromUnitVectors(V(0, 1, 0), _v.subVectors(d.b, d.a).normalize());
      this.scene.add(rope);
      const objs = [rope];
      for (const [p, top] of [[d.a, true], [d.b, false]]) {
        const g = new THREE.Group();
        const postH = top ? 2.6 : p.y - G.terrain.heightAt(p.x, p.z) + 0.2;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, postH, 8), MATS.woodDark);
        post.position.y = -postH / 2 + 0.15;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 16), metal);
        g.add(post, ring);
        g.position.copy(p);
        post.castShadow = true;
        this.scene.add(g);
        objs.push(g);
      }
      const line = { ...d, len, dir: _v.subVectors(d.b, d.a).normalize().clone(), objs };
      this.lines.push(line);
      G.world.addInteractable({
        pos: V(d.a.x, d.a.y - 2.3, d.a.z), r: 2.6, dy: 3, verb: 'Ride', label: ` the zipline to ${d.name}`, epochs: d.epochs,
        action: () => this.startZip(line),
      });
    }
  }

  startZip(line) {
    const P = G.player;
    if (P.mode !== 'ground') return;
    G.game.stat('zips');
    P.mode = 'zip';
    P.action = null;
    P.zip = { line, s: 0.5, speed: 3 };
    P.rig.sheathe(true);
    G.audio?.sfx('grab', { pos: P.pos });
    G.audio?.sfx('glide', { pos: P.pos });
    G.tutorial?.hint?.('zip');
  }

  updateZip(P, dt) {
    const z = P.zip;
    const L = z.line;
    const slope = (L.a.y - L.b.y) / L.len;
    z.speed = Math.min(26, z.speed + (16 * slope + 0.6 - z.speed * 0.02) * dt);
    z.s += z.speed * dt;
    const end = z.s >= L.len - 1.2;
    _v.copy(L.a).addScaledVector(L.dir, Math.min(z.s, L.len));
    P.pos.set(_v.x, _v.y - 2.15, _v.z);
    P.vel.copy(L.dir).multiplyScalar(z.speed);
    P.yaw = Math.atan2(L.dir.x, L.dir.z);
    if (Math.random() < dt * 10) G.fx?.sparks(_v.x, _v.y, _v.z, 2, 0xffd890, 2);
    if (G.input.hit('jump') || end) {
      // let go: keep some momentum, and glide straight away if you like
      P.mode = 'air';
      P.vel.copy(L.dir).multiplyScalar(z.speed * (end ? 0.35 : 0.8));
      P.vel.y = end ? 1.5 : 3;
      P.fallStartY = P.pos.y;
      P.zip = null;
      G.audio?.sfx('jump', { pos: P.pos });
    }
  }

  // ---------------------------------------------------------------- slide
  canSlide(P) {
    return P.mode === 'ground' && !P.action && Math.hypot(P.vel.x, P.vel.z) > 5.5;
  }
  startSlide(P) {
    P.mode = 'slide';
    P.slide = { t: 0, dust: 0 };
    P.crouching = false;
    const sp = Math.hypot(P.vel.x, P.vel.z);
    const boost = Math.min(13, sp * 1.25);
    P.vel.x *= boost / (sp || 1);
    P.vel.z *= boost / (sp || 1);
    G.audio?.sfx('dodge', { pos: P.pos });
    G.tutorial?.hint?.('slide');
  }
  updateSlide(P, dt, dir, hasInput) {
    const s = P.slide;
    s.t += dt;
    const T = G.terrain, col = G.collision;
    T.normalAt(P.pos.x, P.pos.z, _n);
    // gravity pulls along the slope; gentle steering; a little friction
    P.vel.x += _n.x * 24 * dt;
    P.vel.z += _n.z * 24 * dt;
    let sp = Math.hypot(P.vel.x, P.vel.z);
    if (hasInput && sp > 0.5) {
      const want = Math.atan2(dir.x, dir.z), cur = Math.atan2(P.vel.x, P.vel.z);
      let d = want - cur;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const a = cur + THREE.MathUtils.clamp(d, -1, 1) * dt * 2.2;
      P.vel.x = Math.sin(a) * sp;
      P.vel.z = Math.cos(a) * sp;
    }
    const friction = _n.y > 0.985 ? 5.5 : 1.4;
    sp = Math.max(0, sp - friction * dt);
    sp = Math.min(sp, 26);
    const k = sp / (Math.hypot(P.vel.x, P.vel.z) || 1);
    P.vel.x *= k;
    P.vel.z *= k;
    P.pos.x += P.vel.x * dt;
    P.pos.z += P.vel.z * dt;
    const res = col.resolve(P.pos, P.radius, P.height, 0.55, P.resolveOut);
    if (res.wall && sp > 4) {
      G.cam?.shake(0.2);
      sp = 0;
    }
    if (sp > 0.1) P.yaw = Math.atan2(P.vel.x, P.vel.z);
    const g = col.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.6, P.radius, 0.8);
    const wl = G.water ? G.water.level : -1e9;
    if (g.h < P.pos.y - 0.7 || wl > g.h + 0.4) {
      // off a ledge (or into water): fly on with the momentum
      P.mode = 'air';
      P.slide = null;
      P.fallStartY = P.pos.y;
      return;
    }
    P.pos.y = g.h;
    P.grounded = true;
    // bowl over small foes
    if (sp > 8) {
      for (const e of G.enemies) {
        if (e.dead || e.boss || e.hitBySlide > G.time) continue;
        if (e.distTo(P.pos) < 1.4) {
          e.hitBySlide = G.time + 0.8;
          G.combat.damageEnemy(e, 14 + sp, { source: P, kind: 'heavy' });
        }
      }
    }
    s.dust -= dt;
    if (s.dust <= 0 && sp > 2) {
      s.dust = 0.05;
      G.fx?.dust(P.pos.x - P.vel.x * 0.04, P.pos.y, P.pos.z - P.vel.z * 0.04, 0.22);
    }
    const inp = G.input;
    if (inp.hit('jump')) {
      P.mode = 'air';
      P.vel.y = 7 + Math.min(4, sp * 0.18);
      P.slide = null;
      P.fallStartY = P.pos.y;
      G.audio?.sfx('jump', { pos: P.pos });
      return;
    }
    if (sp < 1.6 || inp.hit('crouch') || s.t > 30) {
      P.mode = 'ground';
      P.slide = null;
    }
  }

  // pose overrides used by the player's animate()
  pose(P, pose, t) {
    if (P.mode === 'zip') {
      setJ(pose, 'armL', -3.0, 0, 0.18); setJ(pose, 'armR', -3.0, 0, -0.18);
      setJ(pose, 'foreL', -0.25, 0, 0); setJ(pose, 'foreR', -0.25, 0, 0);
      setJ(pose, 'thighL', -0.5 + Math.sin(t * 3) * 0.1, 0, 0.05); setJ(pose, 'thighR', -0.4 - Math.sin(t * 3) * 0.1, 0, -0.05);
      setJ(pose, 'shinL', 0.6, 0, 0); setJ(pose, 'shinR', 0.7, 0, 0);
      setJ(pose, 'head', -0.2, 0, 0);
      return true;
    }
    if (P.mode === 'slide') {
      setJ(pose, 'spine', -0.35, 0, 0); setJ(pose, 'chest', -0.1, 0, 0);
      setJ(pose, 'thighL', -1.35, 0, 0.1); setJ(pose, 'shinL', 0.25, 0, 0);
      setJ(pose, 'thighR', -0.5, 0, -0.15); setJ(pose, 'shinR', 1.7, 0, 0);
      setJ(pose, 'armL', -0.4, 0, 1.25); setJ(pose, 'armR', -0.4, 0, -1.25);
      setJ(pose, 'foreL', -0.4, 0, 0); setJ(pose, 'foreR', -0.4, 0, 0);
      setJ(pose, 'head', 0.25, 0, 0);
      pose[OFF + 1] = -0.48;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------- bounce mushrooms
  buildMushrooms() {
    const rng = mulberry32(5150);
    const spots = [];
    let guard = 0;
    while (spots.length < 26 && guard++ < 4000) {
      const near = spots.length < 6;
      const x = near ? START.x + (rng() - 0.5) * 160 : (rng() * 2 - 1) * 640;
      const z = near ? START.z + (rng() - 0.5) * 160 : (rng() * 2 - 1) * 640;
      const h = G.terrain.heightAt(x, z);
      if (h < 2 || h > 110) continue;
      G.terrain.normalAt(x, z, _n);
      if (_n.y < 0.9) continue;
      if (!near && forestMask(x, z) < 0.35 && rng() > 0.25) continue;
      if (G.collision.pointInside(x, h + 1, z, 2.5)) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 40)) continue;
      if (Math.hypot(x - START.x, z - START.z) < 12) continue;
      spots.push({ x, z, h, s: 0.85 + rng() * 0.5 });
    }
    const site = new Site('Mushrooms', START.x, START.z);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xf2e6d2, roughness: 0.8 });
    const variants = [
      { ep: 0, cap: new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.45 }), dot: new THREE.MeshStandardMaterial({ color: 0xfff6e8, roughness: 0.6 }) },
      { ep: 2, cap: new THREE.MeshStandardMaterial({ color: 0x3a7cff, emissive: 0x2a8aff, emissiveIntensity: 1.3, roughness: 0.3 }), dot: new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x8fe8ff, emissiveIntensity: 2.2 }) },
    ];
    for (const v of variants) {
      const b = new Builder('mushrooms-' + v.ep);
      for (const s of spots) {
        const stemH = 1.6 * s.s, capR = 2.0 * s.s;
        b.cyl(stemMat, 0.45 * s.s, 0.7 * s.s, stemH, s.x, s.h - 0.2, s.z, 10, { tag: 'wood' });
        const top = s.h - 0.2 + stemH;
        b.sphere(v.cap, capR, s.x, top - 0.15, s.z, { half: true, seg: 16, sy: 0.55 });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + s.s, rr = capR * (i % 2 ? 0.55 : 0.75);
          const y = top - 0.15 + Math.sqrt(Math.max(0, 1 - (rr / capR) ** 2)) * capR * 0.55;
          b.sphere(v.dot, 0.34 * s.s, s.x + Math.cos(a) * rr, y, s.z + Math.sin(a) * rr, { sy: 0.5 });
        }
        b.collider({ type: 'cyl', x: s.x, z: s.z, y0: top - 0.4, y1: top - 0.15 + capR * 0.55, r: capR * 0.95, dome: capR * 0.45, climbable: true, tag: 'wood', bounce: true });
      }
      const built = b.build();
      site.set([v.ep], built);
    }
    site.register();
    this.mushrooms = spots;
  }

  // ------------------------------------------------------------- trials
  buildTrials() {
    const c = G.content;
    const H = (x, z) => G.terrain.heightAt(x, z);
    const courses = [];
    // Meadow Dash: a ground loop near where you wake up (run or ride)
    {
      const cx = START.x - 4, cz = START.z - 62, r = 38;
      const rings = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI * 0.5;
        const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
        rings.push(V(x, Math.max(H(x, z), 0.4) + 1.7, z));
      }
      const sx = cx, sz = cz + r + 5;
      courses.push({ id: 'meadow', name: 'Meadow Dash', start: V(sx, H(sx, sz), sz), rings, size: 2.8, limit: 75, par: [34, 44, 75], glide: false, epochs: [0, 1, 2], reward: { xp: 60, item: ['tonic', 2] } });
    }
    // gliding courses that start from a high point and fall away from it
    const glideCourse = (id, name, from, toward, n, spacing, drop, par, reward, epochs) => {
      const dx = toward.x - from.x, dz = toward.z - from.z, l = Math.hypot(dx, dz) || 1;
      const rings = [];
      for (let i = 0; i < n; i++) {
        const d = 14 + i * spacing;
        const x = from.x + (dx / l) * d + Math.sin(i * 1.3) * 6 * (i > 0), z = from.z + (dz / l) * d + Math.cos(i * 1.1) * 6 * (i > 0);
        const y = Math.max(from.y - 2 - (i + 1) * drop, Math.max(H(x, z), 0.5) + 5);
        rings.push(V(x, y, z));
      }
      courses.push({ id, name, start: from.clone(), rings, size: 3.2, limit: par[2], par, glide: true, reward, epochs });
    };
    if (c.spireTop) glideCourse('spire', 'Spire Dive', V(c.spireTop.x + 3.5, c.spireTop.y, c.spireTop.z + 3), V(START.x + 40, 0, START.z - 40), 12, 24, 5, [34, 42, 60], { xp: 200, item: ['crystal', 3] }, [0]);
    const p1 = (c.pillars || [])[0];
    if (p1) glideCourse('pillar', 'Dawnwatch Plunge', V(p1.x + 2.5, p1.top, p1.z), V(p1.x - 160, 0, p1.z - 60), 8, 22, 4.4, [22, 28, 45], { xp: 120, item: ['herb', 3] }, [0, 1, 2]);
    const ringGeo = new THREE.TorusGeometry(1, 0.08, 8, 48);
    for (const co of courses) {
      co.meshes = co.rings.map((p, i) => {
        const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.6), transparent: true, opacity: 0.85, depthWrite: false }));
        m.position.copy(p);
        const nxt = co.rings[i + 1] || p.clone().add(_v.subVectors(p, co.rings[i - 1] || co.start).normalize());
        m.lookAt(nxt);
        m.scale.setScalar(co.size);
        m.visible = false;
        this.scene.add(m);
        return m;
      });
      // a glowing start beacon
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0xffd86b, emissive: 0xffb43a, emissiveIntensity: 0.9 }));
      beacon.position.copy(co.start).add(V(0, 0.2, 0));
      this.scene.add(beacon);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex, color: 0xffcf6a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(2);
      glow.position.copy(co.start).add(V(0, 1.2, 0));
      this.scene.add(glow);
      co.beacon = beacon;
      co.glow = glow;
      G.world.addInteractable({
        pos: co.start.clone(), r: 2.4, dy: 3, verb: 'Start',
        get label() { const b = G.game.state.flags.trials?.[co.id]; return ` ${co.name}${b ? ` (best ${fmt(b)})` : ''}`; },
        epochs: co.epochs,
        cond: () => !this.run,
        action: () => this.startTrial(co),
      });
      this.trials.push(co);
    }
  }

  startTrial(co) {
    const P = G.player;
    this.retry = null;
    this.run = { co, i: 0, t: -3, last: null, lastSide: 0 };
    co.meshes.forEach((m) => (m.visible = true));
    P.vel.set(0, 0, 0);
    G.audio?.sfx('questStart');
    this.banner.hidden = false;
    G.tutorial?.hint?.(co.glide ? 'trialGlide' : 'trialRun');
  }

  endTrial(ok) {
    const r = this.run;
    if (!r) return;
    const co = r.co;
    co.meshes.forEach((m) => (m.visible = false));
    this.run = null;
    const S = this.S;
    S.flags.trials = S.flags.trials || {};
    if (ok) {
      const t = r.t;
      const medal = t <= co.par[0] ? 'Gold' : t <= co.par[1] ? 'Silver' : 'Bronze';
      const best = S.flags.trials[co.id];
      const isBest = !best || t < best;
      if (isBest) S.flags.trials[co.id] = t;
      S.flags.medals = S.flags.medals || {};
      const rank = { Gold: 3, Silver: 2, Bronze: 1 };
      const first = !S.flags.medals[co.id];
      if (!S.flags.medals[co.id] || rank[medal] > rank[S.flags.medals[co.id]]) S.flags.medals[co.id] = medal;
      G.audio?.sfx(medal === 'Gold' ? 'levelup' : 'questDone');
      this.banner.innerHTML = `<b>${co.name}</b> ${fmt(t)} · <span class="medal ${medal.toLowerCase()}">${medal}</span>${isBest ? ' · New best!' : ''}<small>E to try again</small>`;
      if (first || medal === 'Gold') {
        G.player.gainXP(co.reward.xp * (medal === 'Gold' ? 1.5 : 1));
        const [id, n] = co.reward.item;
        G.game.give(id, n);
      }
    } else {
      G.audio?.sfx('fizzle');
      this.banner.innerHTML = `<b>${co.name}</b> · Out of time<small>E to try again</small>`;
    }
    this.retry = { co, t: 7 };
  }

  updateTrials(dt) {
    const P = G.player;
    const t = G.time;
    const ep = G.epochs.current;
    for (const L of this.lines) for (const o of L.objs) o.visible = L.epochs.includes(ep) && !G.game.inPocket;
    for (const co of this.trials) {
      co.beacon.visible = co.glow.visible = co.epochs.includes(ep) && !G.game.inPocket;
      co.glow.material.opacity = 0.32 + Math.sin(t * 3) * 0.12;
    }
    if (this.retry) {
      this.retry.t -= dt;
      if (G.input.hit('interact') && !G.game.currentInteractable) {
        // back to the start for another go
        const co = this.retry.co;
        P.spawn(co.start.x, co.start.y + 0.1, co.start.z);
        G.fx?.screenFade(0.4);
        this.startTrial(co);
        return;
      }
      if (this.retry.t <= 0) { this.retry = null; this.banner.hidden = true; }
    }
    const r = this.run;
    if (!r) return;
    const co = r.co;
    r.t += dt;
    if (r.t < 0) {
      this.banner.innerHTML = `<b>${co.name}</b><span class="count">${Math.ceil(-r.t)}</span>`;
      // hold still on the start pad during the countdown
      P.vel.x = P.vel.z = 0;
      P.pos.x = co.start.x; P.pos.z = co.start.z;
      if (Math.ceil(-r.t) !== Math.ceil(-(r.t - dt))) G.audio?.sfx('blip', { pitch: 1.5 });
      return;
    }
    if (r.t - dt < 0) G.audio?.sfx('select');
    const ring = co.rings[r.i];
    co.meshes.forEach((m, i) => {
      m.material.opacity = i === r.i ? 0.95 : i < r.i ? 0 : 0.35;
      m.scale.setScalar(co.size * (i === r.i ? 1 + Math.sin(t * 6) * 0.05 : 1));
      m.visible = i >= r.i;
    });
    // passing: cross the ring's plane within its radius
    const m = co.meshes[r.i];
    _n.set(0, 0, 1).applyQuaternion(m.quaternion);
    _v.subVectors(P.pos, ring);
    _v.y += 1;
    const side = _v.dot(_n);
    const lateral = Math.sqrt(Math.max(0, _v.lengthSq() - side * side));
    if (r.lastSide < 0 && side >= 0 && lateral < co.size + 0.6) {
      r.i++;
      G.audio?.sfx('mote', { pitch: 1 + r.i * 0.06 });
      G.fx?.ring(ring.x, ring.y, ring.z, co.size * 1.6, 0xffd86b, 0.8, 0.35);
      if (r.i >= co.rings.length) return this.endTrial(true);
      r.lastSide = -1;
    } else r.lastSide = side < 0 ? -1 : 1;
    this.banner.innerHTML = `<b>${co.name}</b> ${r.i} / ${co.rings.length} · ${fmt(r.t)}<small>Gold ${fmt(co.par[0])}</small>`;
    if (r.t > co.limit || P.dead || G.game.inPocket) this.endTrial(false);
  }

  // ------------------------------------------------------------- combos
  onHit() {
    const c = this.combo;
    c.n = c.t > 0 ? c.n + 1 : 1;
    c.t = 2.4;
    c.best = Math.max(c.best, c.n);
    if (c.n >= 2) {
      this.comboEl.hidden = false;
      this.comboEl.innerHTML = `<b>${c.n}</b> hit combo`;
      this.comboEl.classList.remove('pop');
      void this.comboEl.offsetWidth;
      this.comboEl.classList.add('pop');
    }
    if (c.n === 10 || c.n === 25 || c.n === 50) {
      const P = G.player;
      P.mana = Math.min(P.maxMana, P.mana + 25);
      G.hud.toast(`${c.n}-hit combo! Aether restored.`, 'good');
      G.audio?.sfx('reaction');
      const S = this.S;
      S.stats.bestCombo = Math.max(S.stats.bestCombo || 0, c.n);
    }
  }

  update(dt) {
    if (!G.player) return;
    this.updateTrials(dt);
    const c = this.combo;
    if (c.t > 0) {
      c.t -= dt;
      if (c.t <= 0) { c.n = 0; this.comboEl.hidden = true; }
    }
    // keep the run's best combo for feats
    const S = this.S;
    if (c.best > (S.stats.bestCombo || 0)) S.stats.bestCombo = c.best;
  }
}
