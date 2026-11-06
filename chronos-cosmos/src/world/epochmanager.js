import * as THREE from 'three';
import { G } from '../core/G.js';
import { EPOCH_UNIFORMS } from '../core/shaderlib.js';
import { EPOCHS } from './epochs.js';

const _p = new THREE.Vector3();

// Drives the timeline shift: a ring expands from the player and every
// epoch-aware object flips to the new Age as the wave passes it.
export class EpochManager {
  constructor() {
    this.current = 0;
    this.shifting = false;
    this.t = 0;
    this.dur = 3.2;
    this.maxR = 1400;
    this.objects = [];
    this.pending = [];
    this.cooldown = 0;
    this.locked = true; // until the story unlocks shifting
    this.listeners = [];
  }

  register(obj) {
    // obj: {x, z, apply(epoch)}
    this.objects.push(obj);
    obj.apply(this.current, true);
    return obj;
  }
  unregister(obj) {
    const i = this.objects.indexOf(obj);
    if (i >= 0) this.objects.splice(i, 1);
  }
  onChange(fn) {
    this.listeners.push(fn);
  }

  setInstant(e) {
    this.current = e;
    this.shifting = false;
    EPOCH_UNIFORMS.uEpochNew.value = e;
    EPOCH_UNIFORMS.uEpochOld.value = e;
    EPOCH_UNIFORMS.uShiftRadius.value = 0;
    G.atmo.setEpochInstant(e);
    const ep = EPOCHS[e];
    G.water.targetLevel = ep.water.level;
    G.water.level = ep.water.level;
    G.water.setEpochColors(ep.water.deep, ep.water.shallow, ep.water.glow);
    for (const o of this.objects) o.apply(e, true);
    for (const f of this.listeners) f(e, e, true);
  }

  canShift() {
    if (this.locked) return { ok: false, why: 'The Astrolabe is still dormant.' };
    if (this.shifting) return { ok: false, why: '' };
    if (this.cooldown > 0) return { ok: false, why: 'The Astrolabe is still recharging.' };
    if (G.game?.bossActive) return { ok: false, why: 'Time is anchored here. You cannot shift during this battle.' };
    if (G.game?.inPocket) return { ok: false, why: 'Time does not flow inside the rift.' };
    return { ok: true };
  }

  shift(to, opts = {}) {
    if (to === this.current) return false;
    if (!opts.force) {
      const c = this.canShift();
      if (!c.ok) {
        if (c.why) G.hud?.toast(c.why, 'warn');
        G.audio?.sfx('fizzle');
        return false;
      }
    }
    const from = this.current;
    this.current = to;
    this.from = from;
    this.shifting = true;
    this.t = 0;
    this.cooldown = opts.cooldown ?? 4;
    const c = opts.center || G.player.pos;
    EPOCH_UNIFORMS.uEpochOld.value = from;
    EPOCH_UNIFORMS.uEpochNew.value = to;
    EPOCH_UNIFORMS.uShiftCenter.value.set(c.x, c.y, c.z);
    EPOCH_UNIFORMS.uShiftRadius.value = 0.01;
    this.center = new THREE.Vector3(c.x, c.y, c.z);
    G.atmo.beginEpochBlend(from, to);
    const ep = EPOCHS[to];
    G.water.targetLevel = ep.water.level;
    this.pending = this.objects.slice();
    G.audio?.sfx('epochShift');
    G.audio?.setEpoch?.(to);
    G.cam?.shake(0.35);
    G.fx?.motes(c.x, c.y, c.z, 60, to === 1 ? 0xff9a5a : to === 2 ? 0x9fd8ff : 0xffe08a, 1.5);
    G.hud?.epochBanner(to);
    for (const f of this.listeners) f(to, from, false);
    // despawn enemies of the old timeline (they fade out with the wave)
    G.spawner?.despawnAll();
    return true;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const grade = G.post.grade.uniforms;
    if (!this.shifting) {
      grade.uRipple.value.z = -1;
      return;
    }
    this.t += dt;
    const u = Math.min(1, this.t / this.dur);
    const e = u * u * (1.6 - 0.6 * u);
    const r = e * this.maxR;
    EPOCH_UNIFORMS.uShiftRadius.value = r;
    G.atmo.epochMix = Math.min(1, u * 1.4);
    const ep = EPOCHS[this.current];
    const eo = EPOCHS[this.from];
    const k = Math.min(1, u * 1.4);
    const lerp3 = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    G.water.setEpochColors(lerp3(eo.water.deep, ep.water.deep), lerp3(eo.water.shallow, ep.water.shallow), eo.water.glow + (ep.water.glow - eo.water.glow) * k);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const o = this.pending[i];
      if (Math.hypot(o.x - this.center.x, o.z - this.center.z) < r) {
        o.apply(this.current, false);
        this.pending.splice(i, 1);
      }
    }
    // screen-space ripple from the player's position
    _p.copy(this.center);
    _p.y += 1;
    _p.project(G.camera);
    const sr = Math.min(2.5, this.t * 1.6);
    grade.uRipple.value.set(_p.x * 0.5 + 0.5, _p.y * 0.5 + 0.5, sr, Math.max(0, 1 - u * 1.2));
    grade.uCA.value = Math.max(grade.uCA.value, (1 - u) * 0.006);
    if (u >= 1) {
      for (const o of this.pending) o.apply(this.current, false);
      this.pending = [];
      this.shifting = false;
      EPOCH_UNIFORMS.uEpochOld.value = this.current;
      G.atmo.epochMix = 1;
      grade.uRipple.value.z = -1;
      // make sure the player is not inside something that appeared
      G.player && G.collision.resolve(G.player.pos, G.player.radius, G.player.height, 0.5, {});
      G.game?.onEpochSettled(this.current);
    }
  }
}
