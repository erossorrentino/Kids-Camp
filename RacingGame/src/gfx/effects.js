// Particles (tyre smoke, dust, sparks, exhaust flames), skid marks, the
// on-track racing-line guide and rain.
import * as THREE from 'three';
import * as TX from './textures.js';
import { DS } from '../sim/track.js';

const particleVS = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  attribute float aRot;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vRot;
  uniform float uScale;
  #include <fog_pars_vertex>
  void main() {
    vColor = aColor; vRot = aRot;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = -mvPosition.z;
    // fade out particles right in front of the camera so smoke/dust can't fill the screen
    vAlpha = aAlpha * smoothstep(1.5, 6.0, dist);
    gl_PointSize = min(aSize * uScale / max(0.5, dist), 220.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const particleFS = /* glsl */`
  uniform sampler2D uMap;
  uniform vec3 uLight;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vRot;
  #include <fog_pars_fragment>
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float cs = cos(vRot), sn = sin(vRot);
    c = mat2(cs, -sn, sn, cs) * c + 0.5;
    vec4 t = texture2D(uMap, c);
    gl_FragColor = vec4(vColor * uLight, t.a * vAlpha);
    if (gl_FragColor.a < 0.004) discard;
    #include <fog_fragment>
  }`;

class ParticleSystem {
  constructor(scene, max, { additive = false, map, light = new THREE.Color(1, 1, 1) } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.color = new Float32Array(max * 3);
    this.rot = new Float32Array(max);
    this.rotV = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: map }, uScale: { value: 600 }, uLight: { value: light } }]),
      vertexShader: particleVS, fragmentShader: particleFS,
      transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat.uniforms.uMap.value = map;
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, { size = 1, grow = 1, life = 1, alpha = 0.6, color = [1, 1, 1], drag = 1, gravity = 0, spin = 1 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size; this.grow[i] = grow;
    this.alpha[i] = alpha; this.alpha0[i] = alpha;
    this.life[i] = life; this.maxLife[i] = life;
    this.color[i * 3] = color[0]; this.color[i * 3 + 1] = color[1]; this.color[i * 3 + 2] = color[2];
    this.rot[i] = Math.random() * 6.28; this.rotV[i] = (Math.random() - 0.5) * spin;
    this.drag[i] = drag; this.gravity[i] = gravity;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.gravity[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.rot[i] += this.rotV[i] * dt;
      this.alpha[i] = this.alpha0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
      if (this.life[i] <= 0) this.alpha[i] = 0;
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.aSize.needsUpdate = true; a.aAlpha.needsUpdate = true; a.aColor.needsUpdate = true; a.aRot.needsUpdate = true;
  }

  dispose() { this.points.removeFromParent(); this.geo.dispose(); this.mat.dispose(); }
}

// Ring buffer of dark quads laid on the track
class SkidMarks {
  constructor(scene, max = 3000) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    this.alpha = new Float32Array(max * 4);
    const idx = new Uint32Array(max * 6);
    for (let q = 0; q < max; q++) {
      const v = q * 4;
      idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: `attribute float aAlpha; varying float vA;
        #include <fog_pars_vertex>
        void main(){ vA = aAlpha; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `varying float vA;
        #include <fog_pars_fragment>
        void main(){ gl_FragColor = vec4(0.02,0.02,0.02, vA);
        #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.next = 0;
    this.dirty = false;
  }
  add(p0, p1, side, width, a) {
    const q = this.next;
    this.next = (this.next + 1) % this.max;
    const o = q * 12;
    const P = this.pos;
    const sx = side.x * width, sz = side.z * width;
    P[o] = p0.x - sx; P[o + 1] = p0.y; P[o + 2] = p0.z - sz;
    P[o + 3] = p0.x + sx; P[o + 4] = p0.y; P[o + 5] = p0.z + sz;
    P[o + 6] = p1.x - sx; P[o + 7] = p1.y; P[o + 8] = p1.z - sz;
    P[o + 9] = p1.x + sx; P[o + 10] = p1.y; P[o + 11] = p1.z + sz;
    this.alpha.fill(a, q * 4, q * 4 + 4);
    this.dirty = true;
  }
  update() {
    if (!this.dirty) return;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.dirty = false;
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mat.dispose(); }
}

// Coloured racing-line guide (green = go, yellow = lift, red = brake)
export class RacingLineGuide {
  constructor(scene, track, profile) {
    const N = track.N;
    const pos = [], prof = [], sArr = [], idx = [];
    const w = 0.55;
    for (let k = 0; k <= N; k++) {
      const i = k % N;
      const d = track.raceLine[i];
      for (const side of [-1, 1]) {
        const dd = d + side * w;
        pos.push(track.x[i] + track.lx[i] * dd, track.heightAt(i, 0, dd) + 0.03, track.z[i] + track.lz[i] * dd);
        prof.push(profile[i]);
        sArr.push(k * DS);
      }
      if (k < N) { const v = k * 2; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aProf', new THREE.Float32BufferAttribute(prof, 1));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(sArr, 1));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uS: { value: 0 }, uSpeed: { value: 0 }, uLen: { value: track.length } },
      vertexShader: `attribute float aProf; attribute float aS; varying float vProf; varying float vS;
        void main(){ vProf = aProf; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uS, uSpeed, uLen; varying float vProf; varying float vS;
        void main(){
          float ahead = mod(vS - uS + uLen, uLen);
          float a = smoothstep(4.0, 14.0, ahead) * (1.0 - smoothstep(110.0, 170.0, ahead));
          if (a < 0.01) discard;
          float over = uSpeed / max(vProf, 1.0);
          vec3 green = vec3(0.1, 0.95, 0.35), yellow = vec3(1.0, 0.82, 0.1), red = vec3(1.0, 0.12, 0.08);
          vec3 c = over < 0.97 ? green : over < 1.06 ? mix(yellow, red, (over - 0.97) / 0.09) : red;
          float chev = 0.65 + 0.35 * step(0.5, fract(vS * 0.25));
          gl_FragColor = vec4(c * 1.6 * chev, a * 0.55);
        }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.renderOrder = 4;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(s, speed) { this.mat.uniforms.uS.value = s; this.mat.uniforms.uSpeed.value = speed; }
  set visible(v) { this.mesh.visible = v; }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

class Rain {
  constructor(scene, count = 4000) {
    this.count = count;
    const pos = new Float32Array(count * 6);
    this.offsets = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.offsets[i * 3] = (Math.random() - 0.5) * 60;
      this.offsets[i * 3 + 1] = Math.random() * 30;
      this.offsets[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.35, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }
  update(dt, cam, vel) {
    const p = this.geo.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      let y = this.offsets[i * 3 + 1] - dt * 22;
      if (y < 0) y += 30;
      this.offsets[i * 3 + 1] = y;
      const x = cam.x + this.offsets[i * 3] - vel.x * 0.05, z = cam.z + this.offsets[i * 3 + 2] - vel.z * 0.05;
      const yy = cam.y - 8 + y;
      p[i * 6] = x; p[i * 6 + 1] = yy; p[i * 6 + 2] = z;
      p[i * 6 + 3] = x - vel.x * 0.012; p[i * 6 + 4] = yy + 0.6; p[i * 6 + 5] = z - vel.z * 0.012;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  dispose() { this.lines.removeFromParent(); this.geo.dispose(); this.mat.dispose(); }
}

export class Effects {
  constructor(scene, { rain = false, night = false, lightColor } = {}) {
    const light = lightColor || (night ? new THREE.Color(0.55, 0.55, 0.6) : new THREE.Color(1, 1, 1));
    this.smoke = new ParticleSystem(scene, 1400, { map: TX.smokeSprite(), light });
    this.glow = new ParticleSystem(scene, 700, { map: TX.glowSprite(), additive: true });
    this.skids = new SkidMarks(scene);
    this.rain = rain ? new Rain(scene) : null;
    this.wheelState = new Map();
    this._v = new THREE.Vector3();
    this._p0 = new THREE.Vector3(); this._p1 = new THREE.Vector3(); this._side = new THREE.Vector3();
  }

  // Per-car emission. car = {x,y,z,heading,speed, slip (0..1), spin, offSurface dust color, rearWheels local positions}
  carFx(dt, id, c) {
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading), lx = Math.cos(c.heading), lz = -Math.sin(c.heading);
    const wheels = c.wheels; // [{lx, lz, rear:boolean}]
    let st = this.wheelState.get(id);
    if (!st) { st = wheels.map(() => ({ last: null })); this.wheelState.set(id, st); }
    const smokeAmt = c.smoke || 0;
    for (let k = 0; k < wheels.length; k++) {
      const w = wheels[k];
      const wx = c.x + lx * w.x + fx * w.z, wz = c.z + lz * w.x + fz * w.z;
      const wy = c.y + 0.02;
      const mark = w.rear ? c.markRear : c.markFront;
      // skid marks
      if (mark > 0.15 && c.onAsphalt) {
        const p1 = this._p1.set(wx, wy + 0.012, wz);
        if (st[k].last) {
          const d = st[k].last.distanceTo(p1);
          if (d > 0.35 && d < 4) {
            this._side.set(lx, 0, lz);
            this.skids.add(st[k].last, p1, this._side, w.width || 0.13, Math.min(0.75, mark * 0.8));
            st[k].last.copy(p1);
          }
        } else st[k].last = p1.clone();
      } else st[k].last = null;
      // smoke
      if (w.rear && smokeAmt > 0.12 && Math.random() < smokeAmt * dt * 60) {
        const sp = c.speed;
        this.smoke.emit(wx + (Math.random() - 0.5) * 0.3, wy + 0.2, wz + (Math.random() - 0.5) * 0.3,
          -fx * sp * 0.15 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.8, -fz * sp * 0.15 + (Math.random() - 0.5) * 1.5,
          { size: 0.9 + smokeAmt * 0.8, grow: 2.6, life: 1.2 + smokeAmt * 1.4, alpha: 0.18 + smokeAmt * 0.22, color: [0.86, 0.86, 0.88], drag: 1.6, spin: 1.4 });
      }
      // dust off track
      if (c.dust && Math.random() < Math.min(1, c.speed / 25) * dt * 16) {
        this.smoke.emit(wx, wy + 0.25, wz, -fx * c.speed * 0.1 + (Math.random() - 0.5) * 2, 0.8 + Math.random(), -fz * c.speed * 0.1 + (Math.random() - 0.5) * 2,
          { size: 1.1, grow: 2.6, life: 1.3, alpha: 0.26, color: c.dust, drag: 1.2, spin: 1 });
      }
      // rain spray
      if (c.wet && c.speed > 8 && Math.random() < dt * 30) {
        this.smoke.emit(wx, wy + 0.2, wz, -fx * c.speed * 0.3 + (Math.random() - 0.5) * 2, 0.6 + Math.random(), -fz * c.speed * 0.3 + (Math.random() - 0.5) * 2,
          { size: 1.0, grow: 4, life: 0.9, alpha: 0.22, color: [0.8, 0.83, 0.88], drag: 2.5 });
      }
    }
    // exhaust flames (upshift pops, nitro)
    if (c.flame > 0 && c.exhausts) {
      for (const e of c.exhausts) {
        const ex = c.x + lx * e.x + fx * e.z, ez = c.z + lz * e.x + fz * e.z;
        const n = c.nitro ? 3 : 2;
        for (let q = 0; q < n; q++) {
          this.glow.emit(ex, c.y + e.y, ez, -fx * (4 + Math.random() * 4) + c.vx * 0.9, Math.random() * 0.5, -fz * (4 + Math.random() * 4) + c.vz * 0.9,
            { size: c.nitro ? 0.9 : 0.6, grow: -0.4, life: 0.12 + Math.random() * 0.08, alpha: 1, color: c.nitro ? [0.3, 0.55, 2.4] : [2.6, 1.1, 0.3], drag: 3, spin: 6 });
        }
      }
    }
  }

  sparks(x, y, z, dirX, dirZ, strength) {
    const n = Math.min(40, Math.floor(strength * 4) + 6);
    for (let i = 0; i < n; i++) {
      const sp = 4 + Math.random() * 10;
      this.glow.emit(x, y + 0.3, z, dirX * sp + (Math.random() - 0.5) * 6, Math.random() * 5 + 1, dirZ * sp + (Math.random() - 0.5) * 6,
        { size: 0.25 + Math.random() * 0.2, grow: -0.2, life: 0.35 + Math.random() * 0.4, alpha: 1, color: [3, 1.8, 0.6], drag: 0.8, gravity: 12, spin: 0 });
    }
    for (let i = 0; i < 3; i++) {
      this.smoke.emit(x, y + 0.4, z, (Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2, { size: 1, grow: 2.5, life: 1, alpha: 0.25, color: [0.7, 0.7, 0.72], drag: 1.5 });
    }
  }

  update(dt, camera, camVel) {
    this.smoke.update(dt);
    this.glow.update(dt);
    this.skids.update();
    if (this.rain) this.rain.update(dt, camera.position, camVel || { x: 0, z: 0 });
  }

  dispose() {
    this.smoke.dispose(); this.glow.dispose(); this.skids.dispose();
    if (this.rain) this.rain.dispose();
  }
}
