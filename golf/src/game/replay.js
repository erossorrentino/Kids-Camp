// TV-style replays: the ball flight shown again from three angles (behind
// the player, alongside the flight, then low by where it finishes, in slow
// motion), plus the scoring that picks each round's "Shot of the Round".
import * as THREE from '../../vendor/three.module.min.js';
import { YD } from '../sim/hole.js';
import { sfx } from '../audio.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function sampleAt(res, t, out = {}) {
  const S = res.samples;
  const n = S.length / 5;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (S[mid * 5] <= t) lo = mid; else hi = mid;
  }
  const a = lo * 5, b = hi * 5;
  const ta = S[a], tb = S[b];
  const k = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 1;
  out.x = S[a + 1] + (S[b + 1] - S[a + 1]) * k;
  out.y = S[a + 2] + (S[b + 2] - S[a + 2]) * k;
  out.z = S[a + 3] + (S[b + 3] - S[a + 3]) * k;
  return out;
}

/**
 * shot: { res, start, heading, putt, label }
 * Drives the world's ball, tracer and camera until the replay is over.
 */
export class ReplayDirector {
  constructor(world, hole, shot, onDone) {
    this.world = world;
    this.hole = hole;
    this.shot = shot;
    this.onDone = onDone;
    this.t = 0;
    this.ev = 0;
    this.done = false;
    this.p = {};
    const res = shot.res;
    this.dur = res.duration;
    this.landT = res.land && res.land.t != null ? res.land.t : this.dur * 0.6;
    // slow motion for the last stretch of the ball's travel
    this.slowFrom = Math.max(this.dur * 0.35, this.dur - (shot.putt ? 1.1 : 1.8));
    const f = { x: Math.sin(shot.heading), z: -Math.cos(shot.heading) };
    const r = { x: Math.cos(shot.heading), z: Math.sin(shot.heading) };
    this.f = f; this.r = r;
    const st = shot.start;
    const end = res.rest;
    this.end = end;
    const carry = Math.hypot(end.x - st.x, end.z - st.z);
    this.carry = carry;
    // side camera: off to the right of the midpoint, far enough to see the arc
    // a little behind the midpoint so the ball flies away across the picture,
    // and high enough to see over the trees
    const mid = { x: st.x + (end.x - st.x) * 0.42, z: st.z + (end.z - st.z) * 0.42 };
    const off = Math.max(12, Math.min(120, carry * 0.45));
    const sx = mid.x + r.x * off, sz = mid.z + r.z * off;
    const lift = shot.putt ? 1.5 : Math.max(8, Math.min(38, (res.apex || 5) * 0.8 + 6));
    this.sideCam = V(sx, Math.max(hole.heightAt(sx, sz), hole.heightAt(mid.x, mid.z)) + lift, sz);
    // finish camera: low, just past where the ball stops, looking back at it
    const ex = end.x + f.x * (shot.putt ? 2.2 : 7) + r.x * (shot.putt ? 1.2 : 4);
    const ez = end.z + f.z * (shot.putt ? 2.2 : 7) + r.z * (shot.putt ? 1.2 : 4);
    this.endCam = V(ex, hole.heightAt(ex, ez) + (shot.putt ? 0.55 : 1.4), ez);
    world.tracer.reset();
    world.ball.setVisible(true);
  }

  camFor(t, p) {
    const st = this.shot.start;
    const w = this.world;
    const f = this.f, r = this.r;
    const gy = this.hole.heightAt(st.x, st.z);
    if (this.shot.putt) {
      if (t < this.dur * 0.45) {
        w.setCamera(V(st.x - f.x * 3 + r.x * 0.6, gy + 1.1, st.z - f.z * 3 + r.z * 0.6), V(p.x, p.y, p.z), 42, 4);
      } else {
        w.setCamera(this.endCam, V(p.x, p.y, p.z), 38, 3);
      }
      return;
    }
    if (t < Math.min(1.3, this.landT * 0.3)) {
      // high behind the player, the classic TV tee shot
      w.setCamera(V(st.x - f.x * 7 + r.x * 1.5, gy + 3.4, st.z - f.z * 7 + r.z * 1.5), V(p.x, p.y, p.z), 42, 5);
    } else if (t < this.slowFrom) {
      w.setCamera(this.sideCam, V(p.x, p.y, p.z), 46, 4);
    } else {
      w.setCamera(this.endCam, V(p.x, p.y, p.z), 36, 3.5);
    }
  }

  update(dt) {
    if (this.done) return;
    const res = this.shot.res;
    const slow = this.t >= this.slowFrom;
    this.t = Math.min(this.dur + 1.2, this.t + dt * (slow ? 0.38 : 1));
    const tt = Math.min(this.dur, this.t);
    const p = sampleAt(res, tt, this.p);
    const gy = this.hole.heightAt(p.x, p.z);
    const w = this.world;
    w.ball.set(p.x, p.y, p.z, gy, w.camera.position);
    if (!this.shot.putt) w.tracer.push(p.x, p.y, p.z);
    w.focus.set(p.x, gy, p.z);
    while (this.ev < res.events.length && res.events[this.ev].t <= tt) {
      const e = res.events[this.ev++];
      if (e.type === 'holed') sfx.cup();
      else if (e.type === 'pin') sfx.pin();
      else if (e.type === 'bounce' && e.speed > 1.2) sfx.bounce(e.speed);
    }
    if (res.outcome === 'holed' && tt >= this.dur) w.ball.setVisible(false);
    this.camFor(tt, p);
    if (this.t >= this.dur + 1.2) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.world.tracer.reset();
    if (this.onDone) this.onDone();
  }
}

// ------------------------------------------------------------ best shots
const ord = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

function fmt(m, units, small = false) {
  if (units === 'meters') return small && m < 20 ? `${m.toFixed(1)} m` : `${Math.round(m)} m`;
  if (small && m / YD < 20) return `${Math.round(m / 0.3048)} ft`;
  return `${Math.round(m / YD)} yds`;
}

/**
 * How good was a shot, and what to call it. Returns null for ordinary shots.
 * info: { res, start, putt, holeIndex, strokes, par, hole, units }
 */
export function rateShot(info) {
  const { res, start, putt, holeIndex, strokes, hole, units } = info;
  const h = ord(holeIndex + 1);
  const pin = hole.pin;
  const from = Math.hypot(pin.x - start.x, pin.z - start.z);
  if (res.outcome === 'holed') {
    if (strokes === 1) return { value: 1000, label: `Hole-in-one on the ${h}`, great: true, kind: 'ace' };
    if (!putt) return { value: 500 + from, label: `Holed out from ${fmt(from, units)} on the ${h}`, great: true, kind: 'holeout' };
    if (from > 7) return { value: 100 + from * 20, label: `${fmt(from, units, true)} putt holed on the ${h}`, great: from > 9, kind: 'putt' };
    return { value: 40 + from * 10, label: `${fmt(from, units, true)} putt on the ${h}`, great: false, kind: 'putt' };
  }
  if (res.outcome !== 'rest') return null;
  const rest = res.rest;
  const prox = Math.hypot(pin.x - rest.x, pin.z - rest.z);
  const surf = hole.surfaceAt(rest.x, rest.z);
  if (!putt && surf === 'green' && from > 55 && prox < 4) {
    const v = Math.min(420, (from / Math.max(0.4, prox)) * 3);
    return { value: v, label: `Approach from ${fmt(from, units)} to ${fmt(prox, units, true)} on the ${h}`, great: prox < 1.6 && from > 80, kind: 'approach' };
  }
  if (!putt && info.teeShot && (surf === 'fairway') && res.total > 265) {
    return { value: res.total - 200, label: `${fmt(res.total, units)} drive down the ${h}`, great: false, kind: 'drive' };
  }
  return null;
}
