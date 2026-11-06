import * as THREE from 'three';
import { G } from './G.js';

const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _look = new THREE.Vector3();

// Third-person orbit camera with terrain/collider collision, lock-on
// framing, trauma shake, speed FOV and scripted cinematic shots.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI * 0.75;
    this.pitch = 0.25;
    this.dist = 4.6;
    this.curDist = 4.6;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.trauma = 0;
    this.fov = 70;
    this.mode = 'follow';
    this.shot = null; // cinematic
    this.lockBlend = 0;
    this.shoulder = 0.45;
    this.zoomOut = 0;
    this.overrideDist = null;
    this.topDown = 0;
  }

  shake(a) {
    this.trauma = Math.min(1, this.trauma + a * (G.settings.shake ?? 1));
  }

  // scripted shot: {from, to, lookFrom, lookTo, dur, ease, fov}
  play(shot) {
    this.shot = { ...shot, t: 0 };
    this.mode = 'shot';
  }
  stopShot() {
    this.shot = null;
    this.mode = 'follow';
  }

  cinematic(kind, a, b, dur) {
    if (kind === 'finisher') {
      const mid = new THREE.Vector3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
      const side = new THREE.Vector3(Math.cos(a.yaw), 0, -Math.sin(a.yaw)).multiplyScalar(3.2);
      const from = mid.clone().add(side).add(new THREE.Vector3(0, 1.4, 0));
      const to = mid.clone().add(side.multiplyScalar(0.7)).add(new THREE.Vector3(0, 1.0, 0));
      this.play({ from, to, lookFrom: mid.clone().add(new THREE.Vector3(0, 1.2, 0)), lookTo: mid.clone().add(new THREE.Vector3(0, 1.0, 0)), dur, fov: 55, returnAfter: true });
    }
  }

  update(dt, player) {
    const cam = this.camera;
    const inp = G.input;
    if (this.mode === 'shot' && this.shot) {
      const s = this.shot;
      s.t += dt;
      let u = Math.min(1, s.t / s.dur);
      u = u * u * (3 - 2 * u);
      cam.position.lerpVectors(s.from, s.to, u);
      _look.lerpVectors(s.lookFrom, s.lookTo || s.lookFrom, u);
      cam.lookAt(_look);
      const f = s.fov || 60;
      if (cam.fov !== f) { cam.fov = f; cam.updateProjectionMatrix(); }
      if (s.t >= s.dur && s.returnAfter) this.stopShot();
      this.applyShake(dt);
      return;
    }
    // input
    const sens = G.settings.sensitivity ?? 1;
    if (!G.ui?.blocking) {
      this.yaw -= inp.lookVec.x * sens;
      this.pitch += inp.lookVec.y * sens * (G.settings.invertY ? -1 : 1);
    }
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.9, 1.25);
    // on touch screens, swing gently behind the player while they move so
    // one thumb is enough to explore
    const mv = inp.moveVec;
    if (inp.lastDevice === 'touch' && !player.lockTarget && this.topDown < 0.5 && Math.hypot(mv.x, mv.y) > 0.3 && G.time - (this.lastLookInput || 0) > 1.2 && Math.abs(mv.y) > 0.2) {
      let want = player.yaw + Math.PI;
      let dy = want - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      if (mv.y < 0) this.yaw += dy * Math.min(1, dt * 0.9);
    }
    if (inp.lookVec.x || inp.lookVec.y) this.lastLookInput = G.time;
    if (inp.mouse.wheel && G.build?.active) {
      // wheel is used by build mode
    }
    // lock-on framing
    const lt = player.lockTarget;
    this.lockBlend += ((lt ? 1 : 0) - this.lockBlend) * Math.min(1, dt * 6);
    if (lt) {
      _d.set(lt.pos.x - player.pos.x, 0, lt.pos.z - player.pos.z);
      const want = Math.atan2(-_d.x, -_d.z);
      let dy = want - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 5);
      const desiredPitch = 0.22 + (lt.boss ? 0.1 : 0);
      this.pitch += (desiredPitch - this.pitch) * Math.min(1, dt * 2);
    }
    // distance by state
    let want = 4.6;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    if (player.mode === 'glide') want = 7;
    else if (player.mode === 'climb') want = 5.2;
    else if (player.mode === 'mounted') want = 6.8;
    else if (player.sprinting) want = 5.4;
    if (lt) want = lt.boss ? 8.5 : 5.6;
    if (G.build?.active) want = 6.5;
    if (this.overrideDist) want = this.overrideDist;
    this.dist += (want - this.dist) * Math.min(1, dt * 3);
    // target
    _t.copy(player.pos);
    _t.y += player.mode === 'swim' ? 1.4 : player.crouching ? 1.1 : player.mode === 'mounted' ? 2.4 : 1.55;
    if (player.mode === 'climb') _t.y += 0.2;
    if (lt) _t.lerp(_p.set((player.pos.x + lt.pos.x) / 2, player.pos.y + 1.4, (player.pos.z + lt.pos.z) / 2), 0.25 * this.lockBlend);
    const follow = player.mode === 'glide' ? 6 : 14;
    this.smoothTarget.lerp(_t, Math.min(1, dt * follow));
    if (this.smoothTarget.distanceTo(_t) > 8) this.smoothTarget.copy(_t);
    const tgt = this.smoothTarget;
    // shoulder offset (to the right of view)
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const sh = this.shoulder * (1 - this.lockBlend * 0.6);
    const origin = _p.set(tgt.x + rx * sh, tgt.y, tgt.z + rz * sh);
    // top-down blend (rift arenas)
    const pitch = THREE.MathUtils.lerp(this.pitch, 0.9, this.topDown);
    const dist = THREE.MathUtils.lerp(this.dist, 17, this.topDown);
    _d.set(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch));
    // collision: terrain + colliders
    let d = dist;
    const hit = G.collision.raycast(origin, _d, dist + 0.3, { step: 0.5, terrainMax: dist + 0.3, filter: (c) => c.tag !== 'tree' || c.r > 0.6 });
    if (hit) d = Math.max(0.6, hit.t - 0.3);
    if (d < this.curDist) this.curDist += (d - this.curDist) * Math.min(1, dt * 25);
    else this.curDist += (d - this.curDist) * Math.min(1, dt * 3);
    cam.position.copy(origin).addScaledVector(_d, this.curDist);
    // keep above terrain & water surface
    const th = G.terrain.heightAt(cam.position.x, cam.position.z) + 0.4;
    if (cam.position.y < th) cam.position.y = th;
    if (G.water && !G.game?.inPocket) {
      const wl = G.water.level;
      if (Math.abs(cam.position.y - wl) < 0.25) cam.position.y = wl + 0.25;
    }
    _look.copy(origin);
    if (lt) _look.lerp(_p.set(lt.pos.x, lt.pos.y + (lt.height || 1.6) * 0.6, lt.pos.z), 0.35 * this.lockBlend);
    cam.lookAt(_look);
    // fov
    let f = G.settings.fov || 70;
    if (player.sprinting) f += 6;
    if (player.mode === 'glide') f += 8 + Math.min(10, Math.abs(player.vel.y) * 0.3);
    if (player.mode === 'mounted') f += Math.min(10, speed * 0.6);
    this.fov += (f - this.fov) * Math.min(1, dt * 4);
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    this.applyShake(dt);
  }

  applyShake(dt) {
    if (this.trauma <= 0) return;
    const s = this.trauma * this.trauma;
    const t = G.time * 40;
    const cam = this.camera;
    cam.rotation.z += (Math.sin(t * 1.3) * 0.5 + Math.sin(t * 2.7) * 0.5) * 0.04 * s;
    cam.position.x += Math.sin(t * 1.9) * 0.15 * s;
    cam.position.y += Math.sin(t * 2.3 + 1) * 0.15 * s;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }
}
