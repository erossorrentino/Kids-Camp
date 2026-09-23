/**
 * EFFECTS
 * ------------------------------------------------------------------
 * One pooled system for everything transient: tracers, muzzle flashes,
 * sparks, smoke, explosions, beams, ability auras and decals.
 *
 * Every pool is preallocated and reused. Nothing here allocates geometry
 * during a match, which is what keeps frame times flat when eight mechs
 * open up at once.
 */
import * as THREE from 'three';
import { clamp, lerp, makeRng } from '../core/rng.js';

const rng = makeRng(0x5eed);

/* Pool sizes scale with the quality preset's particle budget. */
const BASE = {
  particles: 2600,
  tracers: 320,
  beams: 48,
  flashes: 64,
  decals: 160,
  rings: 40,
};

export class FX {
  constructor(scene, quality = 1) {
    this.scene = scene;
    this.q = quality;
    this.group = new THREE.Group();
    this.group.name = 'fx';
    scene.add(this.group);
    this.time = 0;
    this._initParticles();
    this._initTracers();
    this._initBeams();
    this._initFlashes();
    this._initDecals();
    this._initRings();
    this.shakeRequest = 0;
  }

  /* ---------------- point particles ---------------- */
  _initParticles() {
    const n = this.count = Math.round(BASE.particles * this.q);
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(n * 3);
    this.pCol = new Float32Array(n * 3);
    this.pSize = new Float32Array(n);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1));
    geo.setDrawRange(0, n);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: innerHeight } },
      vertexShader: /* glsl */`
        attribute float aSize;
        varying vec3 vCol;
        uniform float uScale;
        void main(){
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float a = smoothstep(0.25, 0.02, r);
          gl_FragColor = vec4(vCol, a);
        }`,
      transparent: true, depthWrite: false, vertexColors: true,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.parts = new Array(n);
    for (let i = 0; i < n; i++) {
      this.parts[i] = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, drag: 0, grav: 0, size: 1, size1: 0, r:1, g:1, b:1, r1:1, g1:1, b1:1, additive: true };
    }
    this.pHead = 0;
    addEventListener('resize', () => { mat.uniforms.uScale.value = innerHeight; });
  }

  /** Emit a single particle. Colours are linear 0..1 triples. */
  particle(x, y, z, vx, vy, vz, opts = {}) {
    const i = this.pHead;
    this.pHead = (this.pHead + 1) % this.count;
    const p = this.parts[i];
    p.life = p.max = opts.life || 0.6;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.drag = opts.drag ?? 2.2;
    p.grav = opts.grav ?? -9;
    p.size = opts.size ?? 0.5;
    p.size1 = opts.size1 ?? 0;
    const c = opts.color ?? 0xffffff;
    const c1 = opts.color1 ?? c;
    p.r = ((c >> 16) & 255) / 255; p.g = ((c >> 8) & 255) / 255; p.b = (c & 255) / 255;
    p.r1 = ((c1 >> 16) & 255) / 255; p.g1 = ((c1 >> 8) & 255) / 255; p.b1 = (c1 & 255) / 255;
    this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
    return p;
  }

  burst(pos, count, opts = {}) {
    const n = Math.round(count * this.q);
    const spd = opts.speed ?? 10;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const e = Math.acos(2 * rng() - 1);
      const s = spd * (0.35 + rng() * 0.9);
      this.particle(
        pos.x, pos.y, pos.z,
        Math.sin(e) * Math.cos(a) * s,
        Math.cos(e) * s * (opts.up ? 1.4 : 1) + (opts.upBias || 0),
        Math.sin(e) * Math.sin(a) * s,
        opts,
      );
    }
  }

  /* ---------------- tracers ---------------- */
  _initTracers() {
    const n = this.tracerCount = BASE.tracers;
    const geo = new THREE.BufferGeometry();
    this.tPos = new Float32Array(n * 6);
    this.tCol = new Float32Array(n * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.tCol, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerMesh = new THREE.LineSegments(geo, mat);
    this.tracerMesh.frustumCulled = false;
    this.group.add(this.tracerMesh);
    this.tracers = Array.from({ length: n }, () => ({ life: 0, max: 1 }));
    this.tHead = 0;
  }

  /** A bright streak from a to b that fades over `life` seconds. */
  tracer(a, b, color = 0xffd9a0, life = 0.09, width = 1) {
    const i = this.tHead;
    this.tHead = (this.tHead + 1) % this.tracerCount;
    const t = this.tracers[i];
    t.life = t.max = life;
    t.r = ((color >> 16) & 255) / 255; t.g = ((color >> 8) & 255) / 255; t.b = (color & 255) / 255;
    t.w = width;
    const o = i * 6;
    this.tPos[o] = a.x; this.tPos[o + 1] = a.y; this.tPos[o + 2] = a.z;
    this.tPos[o + 3] = b.x; this.tPos[o + 4] = b.y; this.tPos[o + 5] = b.z;
  }

  /* ---------------- beams (sustained lasers, repair, tag) ---------------- */
  _initBeams() {
    this.beams = [];
    const geo = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true);
    geo.translate(0, 0.5, 0);
    geo.rotateX(Math.PI / 2);
    this.beamGeo = geo;
    for (let i = 0; i < BASE.beams; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x66e9ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.beams.push({ mesh: m, life: 0, max: 0 });
    }
    this.bHead = 0;
  }

  beam(a, b, color = 0x66e9ff, radius = 0.12, life = 0.07) {
    const rec = this.beams[this.bHead];
    this.bHead = (this.bHead + 1) % this.beams.length;
    const m = rec.mesh;
    rec.life = rec.max = life;
    rec.radius = radius;
    m.visible = true;
    m.material.color.setHex(color);
    m.position.copy(a);
    m.lookAt(b);
    const len = a.distanceTo(b);
    m.scale.set(radius, radius, len);
    return rec;
  }

  /* ---------------- muzzle flashes / point lights ---------------- */
  _initFlashes() {
    this.flashes = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    this.flashGeo = geo;
    for (let i = 0; i < BASE.flashes; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.flashes.push({ mesh: m, life: 0, max: 0, scale: 1 });
    }
    this.fHead = 0;
    // A small pool of real lights for the biggest events only.
    this.lightPool = [];
    for (let i = 0; i < (this.q > 0.6 ? 8 : 3); i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 60, 2);
      this.group.add(l);
      this.lightPool.push({ light: l, life: 0, max: 0, peak: 0 });
    }
    this.lHead = 0;
  }

  flash(pos, color = 0xffd9a0, scale = 1.6, life = 0.06) {
    const rec = this.flashes[this.fHead];
    this.fHead = (this.fHead + 1) % this.flashes.length;
    rec.life = rec.max = life;
    rec.scale = scale;
    rec.mesh.visible = true;
    rec.mesh.position.copy(pos);
    rec.mesh.material.color.setHex(color);
    rec.mesh.scale.setScalar(scale);
    rec.mesh.rotation.z = rng() * 6.28;
    return rec;
  }

  light(pos, color, intensity, life, dist = 60) {
    const rec = this.lightPool[this.lHead];
    this.lHead = (this.lHead + 1) % this.lightPool.length;
    rec.life = rec.max = life;
    rec.peak = intensity;
    rec.light.color.setHex(color);
    rec.light.distance = dist;
    rec.light.position.copy(pos);
  }

  /* ---------------- ground decals ---------------- */
  _initDecals() {
    const geo = new THREE.CircleGeometry(1, 14);
    geo.rotateX(-Math.PI / 2);
    this.decals = [];
    for (let i = 0; i < Math.round(BASE.decals * this.q); i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x120e0a, transparent: true, opacity: 0, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 2;
      this.group.add(m);
      this.decals.push({ mesh: m, life: 0, max: 1 });
    }
    this.dHead = 0;
  }

  scorch(pos, radius, life = 26) {
    const rec = this.decals[this.dHead];
    this.dHead = (this.dHead + 1) % this.decals.length;
    rec.life = rec.max = life;
    rec.mesh.visible = true;
    rec.mesh.position.copy(pos).setY(pos.y + 0.07);
    rec.mesh.scale.setScalar(radius);
    rec.mesh.material.opacity = 0.7;
  }

  /* ---------------- expanding rings (shockwaves, EMP, scan) ---------------- */
  _initRings() {
    const geo = new THREE.RingGeometry(0.85, 1, 40);
    geo.rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < BASE.rings; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, r0: 1, r1: 10, vertical: false });
    }
    this.rHead = 0;
  }

  ring(pos, r0, r1, color, life = 0.5, vertical = false) {
    const rec = this.rings[this.rHead];
    this.rHead = (this.rHead + 1) % this.rings.length;
    rec.life = rec.max = life;
    rec.r0 = r0; rec.r1 = r1; rec.vertical = vertical;
    rec.mesh.visible = true;
    rec.mesh.position.copy(pos);
    rec.mesh.rotation.set(vertical ? Math.PI / 2 : 0, 0, 0);
    rec.mesh.material.color.setHex(color);
    return rec;
  }

  /* ================= composite effects ================= */

  muzzle(pos, dir, weapon) {
    const c = weapon.tracer || 0xffd9a0;
    const heavy = weapon.dmg * (weapon.pellets || 1) > 60;
    this.flash(pos, c, heavy ? 3.4 : 1.7, heavy ? 0.085 : 0.05);
    if (this.q > 0.5) this.light(pos, c, heavy ? 24 : 9, heavy ? 0.1 : 0.06, heavy ? 80 : 40);
    const n = weapon.cls === 'energy' ? 3 : heavy ? 14 : 5;
    for (let i = 0; i < n; i++) {
      this.particle(pos.x, pos.y, pos.z,
        dir.x * rng.range(4, 22) + rng.range(-3, 3),
        dir.y * rng.range(4, 22) + rng.range(-3, 3),
        dir.z * rng.range(4, 22) + rng.range(-3, 3),
        { life: rng.range(0.1, 0.3), size: rng.range(0.25, 0.7), size1: 0, color: c, color1: 0x442200, drag: 5, grav: -2 });
    }
    // Smoke puff for ballistics.
    if (weapon.cls === 'ballistic' && this.q > 0.5) {
      for (let i = 0; i < 4; i++) {
        this.particle(pos.x, pos.y, pos.z,
          dir.x * rng.range(1, 5) + rng.range(-1.5, 1.5), rng.range(0.5, 2.5), dir.z * rng.range(1, 5) + rng.range(-1.5, 1.5),
          { life: rng.range(0.5, 1.1), size: 0.5, size1: 2.4, color: 0x6b6258, color1: 0x2a2724, drag: 1.4, grav: 0.6 });
      }
    }
  }

  impactBurst(pos, scale = 1, color = 0xffc36b) {
    this.burst(pos, 14 * scale, { speed: 9 * scale, life: 0.35, size: 0.3 * scale, size1: 0, color, color1: 0x3a1c08, drag: 3.4, grav: -14 });
    this.flash(pos, color, 1.2 * scale, 0.05);
  }

  sparks(pos, normal, count = 10, color = 0xffd9a0) {
    for (let i = 0; i < count * this.q; i++) {
      this.particle(pos.x, pos.y, pos.z,
        normal.x * rng.range(2, 12) + rng.range(-7, 7),
        normal.y * rng.range(2, 12) + rng.range(0, 8),
        normal.z * rng.range(2, 12) + rng.range(-7, 7),
        { life: rng.range(0.2, 0.7), size: 0.2, size1: 0.04, color, color1: 0x5a1a00, drag: 1.6, grav: -24 });
    }
  }

  explosion(pos, scale = 1, color = 0xffa040) {
    this.burst(pos, 40 * scale, { speed: 16 * scale, life: 0.55, size: 0.9 * scale, size1: 0.1, color: 0xfff0c0, color1: color, drag: 2.6, grav: -6, upBias: 3 });
    this.burst(pos, 26 * scale, { speed: 7 * scale, life: 1.5, size: 1.4 * scale, size1: 5 * scale, color: 0x4a423a, color1: 0x14110e, drag: 1.1, grav: 1.4, upBias: 2.5 });
    this.flash(pos, 0xffe0a0, 7 * scale, 0.11);
    this.light(pos, color, 60 * scale, 0.35, 150 * scale);
    this.ring(pos, 0.5, 14 * scale, color, 0.45);
    // Scorch radius grows far more slowly than blast radius: a mech dying
    // should not leave a thirty-metre stain on the ground.
    this.scorch(pos, 3 + scale * 1.6, 30);
    this.shakeRequest = Math.max(this.shakeRequest, 0.45 * scale);
  }

  mechExplosion(pos, scale = 1) {
    this.explosion(pos, 2.2 * scale, 0xff8a3d);
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const p = pos.clone().add(new THREE.Vector3(rng.range(-4, 4), rng.range(0, 7), rng.range(-4, 4)));
        this.explosion(p, 1.1 * scale, 0xffb45a);
      }, 90 + i * 130);
    }
    // Debris that arcs away and dies.
    for (let i = 0; i < 26 * this.q; i++) {
      this.particle(pos.x, pos.y + 3, pos.z,
        rng.range(-18, 18), rng.range(6, 26), rng.range(-18, 18),
        { life: rng.range(1.2, 2.4), size: rng.range(0.3, 0.9), size1: 0.2, color: 0xffc07a, color1: 0x2a1a10, drag: 0.5, grav: -22 });
    }
  }

  /* ---- ability visuals ---- */
  blink(from, to) {
    this.ring(from, 0.5, 5, 0x9fe8ff, 0.4);
    this.ring(to, 5, 0.5, 0x9fe8ff, 0.4);
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const p = from.clone().lerp(to, i / n);
      this.particle(p.x, p.y + 4, p.z, rng.range(-2, 2), rng.range(-1, 4), rng.range(-2, 2),
        { life: 0.5, size: 0.7, size1: 0, color: 0x9fe8ff, color1: 0x1a4a6a, drag: 2, grav: 0 });
    }
  }

  /**
   * Jump-jet exhaust: a hot core that cools from white through amber, and
   * slower grey smoke that billows and hangs. The flame itself is geometry
   * on the mech (see mechBuilder); this is what it leaves behind.
   */
  thrusterTrail(mech, dt, intensity = 1) {
    const n = Math.ceil(24 * dt * intensity * this.q);
    const alt = mech.position.y - (mech.world?.heightAt?.(mech.position.x, mech.position.z) ?? mech.position.y - 99);
    for (const port of mech.model.jets) {
      port.getWorldPosition(_v);
      for (let i = 0; i < n; i++) {
        this.particle(_v.x, _v.y, _v.z,
          rng.range(-2, 2), rng.range(-18, -9) * intensity, rng.range(-2, 2),
          { life: rng.range(0.14, 0.34), size: rng.range(0.6, 1.2), size1: 0.1, color: 0xf2f8ff, color1: 0xff8a2d, drag: 3, grav: 0 });
      }
      // Smoke: fewer, bigger, slower, and it rises once it has lost its push.
      if (rng() < dt * 16 * this.q) {
        this.particle(_v.x, _v.y - 0.8, _v.z,
          rng.range(-1.6, 1.6) - mech.velocity.x * 0.2, rng.range(-7, -3), rng.range(-1.6, 1.6) - mech.velocity.z * 0.2,
          { life: rng.range(0.7, 1.3), size: 1.0, size1: 3.6, color: 0x7a808a, color1: 0x2c3036, drag: 1.4, grav: -2 });
      }
    }
    // Low over the ground the blast kicks up a ring of dust.
    if (alt < 7 && rng() < dt * 22 * this.q) {
      const a = rng() * Math.PI * 2;
      const gy = mech.position.y - alt + 0.3;
      this.particle(mech.position.x + Math.cos(a) * 1.5, gy, mech.position.z + Math.sin(a) * 1.5,
        Math.cos(a) * rng.range(8, 14), rng.range(0.5, 2), Math.sin(a) * rng.range(8, 14),
        { life: rng.range(0.5, 0.9), size: 1.2, size1: 3.2, color: 0x9a8f80, color1: 0x4a4540, drag: 2.4, grav: 0 });
    }
  }

  speedLines(mech, dt) {
    if (rng() > dt * 30) return;
    const p = mech.position;
    this.particle(p.x + rng.range(-4, 4), p.y + rng.range(1, 9), p.z + rng.range(-4, 4),
      -mech.velocity.x * 0.6, 0, -mech.velocity.z * 0.6,
      { life: 0.25, size: 0.4, size1: 0, color: 0x9fd8ff, color1: 0x1a3a5a, drag: 1, grav: 0 });
  }

  chargeAura(mech, dt) {
    const n = Math.ceil(40 * dt * this.q);
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28;
      const r = mech.radius * 1.1;
      this.particle(mech.position.x + Math.cos(a) * r, mech.position.y + rng.range(1, mech.height * 0.7), mech.position.z + Math.sin(a) * r,
        -mech.velocity.x * 0.3, rng.range(0, 4), -mech.velocity.z * 0.3,
        { life: 0.3, size: 0.6, size1: 0, color: 0xffd24e, color1: 0xff4a1f, drag: 2, grav: 0 });
    }
  }

  overclockGlow(mech) {
    if (rng() > 0.3) return;
    const a = rng() * 6.28;
    this.particle(mech.position.x + Math.cos(a) * mech.radius, mech.position.y + rng.range(2, mech.height * 0.8), mech.position.z + Math.sin(a) * mech.radius,
      0, rng.range(2, 7), 0, { life: 0.5, size: 0.4, size1: 0, color: 0xff8a3d, color1: 0x5a1a00, drag: 1.5, grav: 0 });
  }

  shockwave(pos, radius) {
    this.ring(pos, 1, radius, 0xffd9a0, 0.55);
    this.burst(pos, 40, { speed: 14, life: 0.6, size: 0.7, size1: 2.4, color: 0xa89478, color1: 0x2a2420, drag: 2.2, grav: -4, upBias: 4 });
    this.shakeRequest = Math.max(this.shakeRequest, 0.8);
    this.scorch(pos, radius * 0.4, 24);
  }

  empRing(pos, radius) {
    this.ring(pos, 1, radius, 0xc08bff, 0.6);
    this.ring(pos, 1, radius * 0.7, 0xffffff, 0.35);
    for (let i = 0; i < 40 * this.q; i++) {
      const a = rng() * 6.28;
      this.particle(pos.x, pos.y + 4, pos.z, Math.cos(a) * radius * 1.6, rng.range(-2, 6), Math.sin(a) * radius * 1.6,
        { life: 0.45, size: 0.5, size1: 0, color: 0xd6a8ff, color1: 0x3a1a6a, drag: 3.5, grav: 0 });
    }
  }

  ecmPulse(mech, radius) {
    if (rng() > 0.05) return;
    this.ring(mech.position, 2, radius, 0x8ecfff, 1.2);
  }

  scanPulse(pos) {
    this.ring(pos, 2, 300, 0x49d6ff, 1.4);
  }

  domeShell(mech, radius) {
    if (rng() > 0.25) return;
    const a = rng() * 6.28, e = rng() * Math.PI * 0.5;
    this.particle(
      mech.position.x + Math.cos(a) * Math.cos(e) * radius,
      mech.position.y + Math.sin(e) * radius,
      mech.position.z + Math.sin(a) * Math.cos(e) * radius,
      0, 0, 0, { life: 0.4, size: 0.5, size1: 0, color: 0x7cd8ff, color1: 0x1a4a6a, drag: 0, grav: 0 });
  }

  repairField(mech, radius) {
    if (rng() > 0.5) return;
    const a = rng() * 6.28, r = rng() * radius;
    this.particle(mech.position.x + Math.cos(a) * r, mech.position.y + 0.5, mech.position.z + Math.sin(a) * r,
      0, rng.range(3, 9), 0, { life: 0.9, size: 0.4, size1: 0, color: 0x9dff9d, color1: 0x1a5a2a, drag: 0.6, grav: 0 });
  }

  bulwarkPlate(mech) {
    if (rng() > 0.12) return;
    const f = mech.aimForward();
    this.particle(mech.position.x + f.x * 4, mech.position.y + mech.height * 0.45, mech.position.z + f.z * 4,
      rng.range(-2, 2), rng.range(-2, 2), rng.range(-2, 2),
      { life: 0.3, size: 0.6, size1: 0, color: 0x7cd8ff, color1: 0x1a4a6a, drag: 2, grav: 0 });
  }

  decloak(mech) {
    this.ring(mech.position, 1, 10, 0xb47cff, 0.4);
  }

  markerBeacon(pos) {
    this.ring(pos, 1, 22, 0xff4d5e, 1.2);
    this.light(pos, 0xff4d5e, 30, 1.2, 80);
  }

  repairTick(pos) {
    this.particle(pos.x + rng.range(-2, 2), pos.y + rng.range(0, 6), pos.z + rng.range(-2, 2),
      0, rng.range(2, 6), 0, { life: 0.6, size: 0.35, size1: 0, color: 0x9dff9d, color1: 0x1a5a2a, drag: 1, grav: 0 });
  }

  /* ---- damage state: smoke and fire streaming off a hurt mech ---- */
  damageSmoke(mech, severity, dt) {
    const rate = severity * 26 * this.q;
    if (rng() > dt * rate) return;
    const h = mech.height * rng.range(0.3, 0.8);
    const p = mech.position;
    this.particle(p.x + rng.range(-2, 2), p.y + h, p.z + rng.range(-2, 2),
      rng.range(-1, 1), rng.range(2, 5), rng.range(-1, 1),
      { life: rng.range(1.2, 2.4), size: 0.8, size1: 4.5, color: 0x3a342e, color1: 0x14120f, drag: 0.7, grav: 1.2 });
    if (severity > 0.65 && rng.chance(0.5)) {
      this.particle(p.x + rng.range(-1.5, 1.5), p.y + h, p.z + rng.range(-1.5, 1.5),
        0, rng.range(2, 6), 0,
        { life: 0.4, size: 0.7, size1: 0.1, color: 0xffb45a, color1: 0xff3a10, drag: 1.4, grav: 0.5 });
    }
  }

  footDust(pos, scale = 1) {
    for (let i = 0; i < 5 * this.q; i++) {
      this.particle(pos.x, pos.y + 0.2, pos.z, rng.range(-3, 3) * scale, rng.range(0.5, 3), rng.range(-3, 3) * scale,
        { life: rng.range(0.4, 0.9), size: 0.5 * scale, size1: 2.2 * scale, color: 0x6b6258, color1: 0x2a2724, drag: 2.4, grav: -1 });
    }
  }

  /* ================= per-frame update ================= */
  update(dt) {
    this.time += dt;

    // particles
    const pos = this.pPos, col = this.pCol, siz = this.pSize;
    for (let i = 0; i < this.count; i++) {
      const p = this.parts[i];
      if (p.life <= 0) { siz[i] = 0; continue; }
      p.life -= dt;
      if (p.life <= 0) { siz[i] = 0; continue; }
      const t = 1 - p.life / p.max;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d;
      p.vy = (p.vy + p.grav * dt) * d;
      const o = i * 3;
      pos[o] += p.vx * dt; pos[o + 1] += p.vy * dt; pos[o + 2] += p.vz * dt;
      col[o] = lerp(p.r, p.r1, t);
      col[o + 1] = lerp(p.g, p.g1, t);
      col[o + 2] = lerp(p.b, p.b1, t);
      const fade = p.life / p.max;
      siz[i] = lerp(p.size, p.size1, t) * (0.25 + 0.75 * fade);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;

    // tracers
    const tc = this.tCol;
    for (let i = 0; i < this.tracerCount; i++) {
      const t = this.tracers[i];
      const o = i * 6;
      if (t.life <= 0) { tc[o] = tc[o + 1] = tc[o + 2] = tc[o + 3] = tc[o + 4] = tc[o + 5] = 0; continue; }
      t.life -= dt;
      const f = clamp(t.life / t.max, 0, 1);
      const r = t.r * f, g = t.g * f, b = t.b * f;
      tc[o] = r * 0.3; tc[o + 1] = g * 0.3; tc[o + 2] = b * 0.3;
      tc[o + 3] = r; tc[o + 4] = g; tc[o + 5] = b;
    }
    this.tracerMesh.geometry.attributes.position.needsUpdate = true;
    this.tracerMesh.geometry.attributes.color.needsUpdate = true;

    // beams
    for (const rec of this.beams) {
      if (rec.life <= 0) { if (rec.mesh.visible) rec.mesh.visible = false; continue; }
      rec.life -= dt;
      const f = clamp(rec.life / rec.max, 0, 1);
      rec.mesh.material.opacity = 0.9 * f;
      rec.mesh.scale.x = rec.mesh.scale.y = rec.radius * (0.5 + f * 0.5);
      if (rec.life <= 0) rec.mesh.visible = false;
    }

    // flashes
    for (const rec of this.flashes) {
      if (rec.life <= 0) { if (rec.mesh.visible) rec.mesh.visible = false; continue; }
      rec.life -= dt;
      const f = clamp(rec.life / rec.max, 0, 1);
      rec.mesh.material.opacity = f;
      rec.mesh.scale.setScalar(rec.scale * (1.4 - f * 0.4));
      if (this.camera) rec.mesh.quaternion.copy(this.camera.quaternion);
      if (rec.life <= 0) rec.mesh.visible = false;
    }

    // lights
    for (const rec of this.lightPool) {
      if (rec.life <= 0) { rec.light.intensity = 0; continue; }
      rec.life -= dt;
      rec.light.intensity = rec.peak * clamp(rec.life / rec.max, 0, 1);
    }

    // decals
    for (const rec of this.decals) {
      if (rec.life <= 0) { if (rec.mesh.visible) rec.mesh.visible = false; continue; }
      rec.life -= dt;
      rec.mesh.material.opacity = 0.7 * clamp(rec.life / rec.max, 0, 1);
      if (rec.life <= 0) rec.mesh.visible = false;
    }

    // rings
    for (const rec of this.rings) {
      if (rec.life <= 0) { if (rec.mesh.visible) rec.mesh.visible = false; continue; }
      rec.life -= dt;
      const t = 1 - clamp(rec.life / rec.max, 0, 1);
      const r = lerp(rec.r0, rec.r1, t * t * (3 - 2 * t));
      rec.mesh.scale.setScalar(r);
      rec.mesh.material.opacity = 0.85 * (1 - t);
      if (rec.life <= 0) rec.mesh.visible = false;
    }
  }

  setCamera(cam) { this.camera = cam; }

  consumeShake() { const s = this.shakeRequest; this.shakeRequest = 0; return s; }
}

const _v = new THREE.Vector3();
