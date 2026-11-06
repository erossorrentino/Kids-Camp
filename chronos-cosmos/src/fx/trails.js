import * as THREE from 'three';
import { G } from '../core/G.js';

// Ribbon trail that follows a weapon's base->tip segment over recent frames.
const N = 18;
export class WeaponTrail {
  constructor(scene) {
    this.tips = [];
    this.bases = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3);
    this.alpha = new Float32Array(N * 2);
    const idx = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x9fe0ff) }, uFade: { value: 1 } },
      vertexShader: `attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uFade; varying float vA; void main(){ gl_FragColor = vec4(uColor * 2.5, vA * uFade); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    scene.add(this.mesh);
    this.active = 0;
    this.owner = null;
    this._t = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }
  start(owner, color) {
    this.owner = owner;
    this.active = 1;
    this.tips.length = 0;
    this.bases.length = 0;
    let c = color;
    if (c === undefined) {
      if (owner.imbue) c = [0xff7a2a, 0x8fe8ff, 0xc39bff, 0xffe08a][owner.imbue.el];
      else c = owner.stance === 'stone' ? 0xffb36a : 0x9fe0ff;
    }
    this.mat.uniforms.uColor.value.setHex(c);
  }
  update(dt) {
    const o = this.owner;
    if (!o) return;
    const swinging = o.action && (o.action.type === 'attack' || o.action.type === 'plunge');
    if (swinging) {
      if (o.rig.weaponPoints(this._t, this._b)) {
        this.tips.unshift(this._t.clone());
        this.bases.unshift(this._b.clone().lerp(this._t, 0.25));
        if (this.tips.length > N) { this.tips.pop(); this.bases.pop(); }
      }
      this.active = 1;
    } else {
      this.active -= dt * 6;
      if (this.tips.length) { this.tips.pop(); this.bases.pop(); }
    }
    this.mat.uniforms.uFade.value = Math.max(0, this.active);
    const n = this.tips.length;
    for (let i = 0; i < N; i++) {
      const k = Math.min(i, n - 1);
      if (k < 0) { this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0; continue; }
      const t = this.tips[k], b = this.bases[k];
      this.pos.set([t.x, t.y, t.z], i * 6);
      this.pos.set([b.x, b.y, b.z], i * 6 + 3);
      const a = i < n ? Math.pow(1 - i / N, 1.6) * 0.8 : 0;
      this.alpha[i * 2] = a;
      this.alpha[i * 2 + 1] = 0;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aA.needsUpdate = true;
    this.mesh.visible = n > 1 && this.active > 0;
  }
}
