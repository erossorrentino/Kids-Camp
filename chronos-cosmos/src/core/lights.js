import * as THREE from 'three';

// Light sources in the world are "virtual": they behave like PointLights
// (position, colour, intensity, distance, can be parented and hidden) but
// cost nothing. Each frame the pool hands its few real PointLights to the
// sources that matter most near the camera. The real light count never
// changes, so materials never recompile and fragment cost stays bounded,
// which is what keeps phones and Chromebooks smooth.
export class VLight extends THREE.Object3D {
  constructor(color = 0xffffff, intensity = 1, distance = 10, decay = 2) {
    super();
    this.isVLight = true;
    this.color = new THREE.Color(color);
    this.intensity = intensity;
    this.distance = distance;
    this.decay = decay;
    VLight.all.add(this);
  }
  dispose() {
    VLight.all.delete(this);
  }
}
VLight.all = new Set();

const _p = new THREE.Vector3();

export class LightPool {
  constructor(scene, n) {
    this.scene = scene;
    this.real = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      scene.add(l);
      this.real.push(l);
    }
    this.cand = [];
  }

  isLive(o) {
    let n = o;
    while (n) {
      if (!n.visible) return false;
      if (n === this.scene) return true;
      n = n.parent;
    }
    return false;
  }

  update(cam) {
    const c = this.cand;
    c.length = 0;
    for (const v of VLight.all) {
      if (v.intensity <= 0.01 || !this.isLive(v)) continue;
      v.getWorldPosition(_p);
      const d = _p.distanceTo(cam);
      const reach = (v.distance || 20) * 2.5 + 25;
      if (d > reach) continue;
      v._wp = v._wp || new THREE.Vector3();
      v._wp.copy(_p);
      v._score = (v.intensity * Math.min(1, (v.distance || 10) / 10)) / (1 + (d * d) / 400);
      c.push(v);
    }
    c.sort((a, b) => b._score - a._score);
    for (let i = 0; i < this.real.length; i++) {
      const l = this.real[i];
      const v = c[i];
      if (!v) {
        l.intensity = 0;
        continue;
      }
      l.position.copy(v._wp);
      l.color.copy(v.color);
      l.intensity = v.intensity;
      l.distance = v.distance;
      l.decay = v.decay;
    }
  }
}
