import * as THREE from 'three';

// Ribbon trail that follows a weapon's base->tip segment. Samples are taken
// once per frame and smoothed with a Catmull-Rom curve, so even at a low
// frame rate the arc stays round instead of turning into a polygon.
const MAXS = 12; // raw samples kept
const M = 36; // points along the smoothed ribbon
const LIFE = 0.2; // seconds a sample stays visible

function cr(out, a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  out.x = 0.5 * (2 * b.x + (c.x - a.x) * t + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * t2 + (3 * b.x - a.x - 3 * c.x + d.x) * t3);
  out.y = 0.5 * (2 * b.y + (c.y - a.y) * t + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * t2 + (3 * b.y - a.y - 3 * c.y + d.y) * t3);
  out.z = 0.5 * (2 * b.z + (c.z - a.z) * t + (2 * a.z - 5 * b.z + 4 * c.z - d.z) * t2 + (3 * b.z - a.z - 3 * c.z + d.z) * t3);
  return out;
}

export class WeaponTrail {
  constructor(scene) {
    this.tips = [];
    this.bases = [];
    this.times = new Float32Array(MAXS);
    for (let i = 0; i < MAXS; i++) {
      this.tips.push(new THREE.Vector3());
      this.bases.push(new THREE.Vector3());
    }
    this.count = 0;
    this.clock = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(M * 2 * 3);
    this.uv = new Float32Array(M * 2 * 2);
    const idx = [];
    for (let i = 0; i < M - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aUV', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x9fe0ff) }, uFade: { value: 1 } },
      vertexShader: /* glsl */ `attribute vec2 aUV; varying vec2 vUV;
        void main(){ vUV = aUV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uFade; varying vec2 vUV;
        void main(){
          float age = clamp(vUV.x, 0.0, 1.0), v = vUV.y;
          float body = smoothstep(0.0, 0.9, v) * smoothstep(1.0, 0.94, v);
          float fade = pow(1.0 - age, 1.7);
          float a = body * fade * uFade;
          // a hot thin edge along the blade tip, coloured haze behind it
          float edge = smoothstep(0.8, 0.97, v) * (1.0 - age);
          vec3 col = uColor * (0.7 + 0.5 * v) + vec3(1.0) * edge * 0.4;
          gl_FragColor = vec4(col * 1.2, a * 0.7);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.active = 0;
    this.owner = null;
    this._t = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  start(owner, color) {
    this.owner = owner;
    this.active = 1;
    this.count = 0;
    let c = color;
    if (c === undefined) {
      if (owner.imbue) c = [0xff7a2a, 0x8fe8ff, 0xc39bff, 0xffe08a][owner.imbue.el];
      else c = owner.stance === 'stone' ? 0xffb36a : 0x9fe0ff;
    }
    this.mat.uniforms.uColor.value.setHex(c);
  }

  push(t, b) {
    const last = Math.min(this.count, MAXS - 1);
    // shift older samples back (recycling the vectors)
    const tt = this.tips[last], bb = this.bases[last];
    for (let i = last; i > 0; i--) {
      this.tips[i] = this.tips[i - 1];
      this.bases[i] = this.bases[i - 1];
      this.times[i] = this.times[i - 1];
    }
    this.tips[0] = tt.copy(t);
    this.bases[0] = bb.copy(b);
    this.times[0] = this.clock;
    this.count = Math.min(this.count + 1, MAXS);
  }

  update(dt) {
    this.clock += dt;
    const o = this.owner;
    if (!o) return;
    const swinging = o.action && (o.action.type === 'attack' || o.action.type === 'plunge');
    if (swinging && o.rig.weaponPoints(this._t, this._b)) {
      this._b.lerp(this._t, 0.32);
      this.push(this._t, this._b);
      this.active = 1;
    } else this.active = Math.max(0, this.active - dt * 4);
    // drop samples that have aged out
    while (this.count > 0 && this.clock - this.times[this.count - 1] > LIFE) this.count--;
    const n = this.count;
    this.mesh.visible = n > 1 && this.active > 0;
    if (!this.mesh.visible) return;
    this.mat.uniforms.uFade.value = this.active;
    const T = this.tips, B = this.bases, P = this._p;
    const at = (arr, i) => arr[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < M; i++) {
      const s = (i / (M - 1)) * (n - 1);
      const k = Math.min(n - 2, Math.floor(s));
      const f = s - k;
      cr(P, at(T, k - 1), T[k], T[k + 1], at(T, k + 2), f);
      this.pos[i * 6] = P.x; this.pos[i * 6 + 1] = P.y; this.pos[i * 6 + 2] = P.z;
      cr(P, at(B, k - 1), B[k], B[k + 1], at(B, k + 2), f);
      this.pos[i * 6 + 3] = P.x; this.pos[i * 6 + 4] = P.y; this.pos[i * 6 + 5] = P.z;
      const age = (this.clock - (this.times[k] + (this.times[k + 1] - this.times[k]) * f)) / LIFE;
      this.uv[i * 4] = age; this.uv[i * 4 + 1] = 1;
      this.uv[i * 4 + 2] = age; this.uv[i * 4 + 3] = 0;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aUV.needsUpdate = true;
  }
}
