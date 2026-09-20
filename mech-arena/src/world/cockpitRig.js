/**
 * COCKPIT INTERIOR
 * ------------------------------------------------------------------
 * A canopy frame drawn a metre in front of the camera in first-person
 * view: window struts, a dashboard lip, side consoles and a few live
 * instrument strips that actually track heat, structure and throttle.
 *
 * It is a scene object rather than a separate render pass, parked just
 * beyond the near plane and re-seated on the camera every frame. That
 * keeps it lit by the same environment as everything else, so the canopy
 * picks up the biome's colour instead of looking pasted on.
 */
import * as THREE from 'three';
import { clamp, lerp, damp } from '../core/rng.js';

export class CockpitRig {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'cockpit';
    this.group.renderOrder = 5;
    this.visible = false;
    this.sway = new THREE.Vector2();
    this.built = false;
    this.bars = [];
  }

  _build() {
    if (this.built) return;
    this.built = true;

    const frame = new THREE.MeshStandardMaterial({ color: 0x23282f, roughness: 0.62, metalness: 0.82 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.85, metalness: 0.4 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.045, roughness: 0.06,
      metalness: 0, transmission: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mats = { frame, trim, glass: glassMat };

    const add = (geo, mat, pos, rot) => {
      const m = new THREE.Mesh(geo, mat);
      if (pos) m.position.set(...pos);
      if (rot) m.rotation.set(...rot);
      m.castShadow = false;
      m.receiveShadow = false;
      this.group.add(m);
      return m;
    };

    // Canopy struts. At a 72 degree vertical field of view the visible
    // half-width one metre out is about 1.29, so the A-pillars sit at 0.95
    // -- near the edge of vision, thin enough never to hide a target.
    const strut = new THREE.BoxGeometry(0.038, 1.6, 0.04);
    for (const sx of [-1, 1]) {
      add(strut, frame, [sx * 0.95, 0.02, -1.0], [0, 0, sx * 0.12]);
      // A short diagonal into the header reads as a real canopy corner.
      add(new THREE.BoxGeometry(0.036, 0.40, 0.04), frame, [sx * 0.845, 0.52, -1.0], [0, 0, sx * 0.72]);
    }
    // Header and sill.
    add(new THREE.BoxGeometry(1.76, 0.062, 0.05), frame, [0, 0.68, -1.0]);
    add(new THREE.BoxGeometry(1.86, 0.05, 0.05), frame, [0, -0.60, -1.0]);

    // Dashboard lip below the sight line, angled toward the pilot.
    add(new THREE.BoxGeometry(1.70, 0.22, 0.09), trim, [0, -0.60, -0.87], [-0.5, 0, 0]);
    add(new THREE.BoxGeometry(1.76, 0.08, 0.34), trim, [0, -0.80, -0.70], [0.18, 0, 0]);

    // Side consoles, pushed out past the pillars so they frame rather than crowd.
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.24, 0.40, 0.46), trim, [sx * 1.06, -0.62, -0.62], [0.1, -sx * 0.4, 0]);
    }

    // Instrument strips. These are driven in update() from live mech state.
    // Sit them on the face of the dashboard lip, a hair in front so they do
    // not z-fight with it.
    const stripGeo = new THREE.PlaneGeometry(0.34, 0.026);
    const mkBar = (x, colour) => {
      const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9 });
      const m = new THREE.Mesh(stripGeo, mat);
      // The frustum bottom at this depth is about y = -0.594, so the strip
      // has to sit above that or it is technically drawn and never seen.
      m.position.set(x, -0.508, -0.802);
      m.rotation.x = -0.5;
      m.renderOrder = 6;
      this.group.add(m);
      return { mesh: m, mat, baseX: x };
    };
    this.bars = [
      mkBar(-0.44, 0x5df2a0),   // structure
      mkBar(0.00, 0xffb454),    // heat
      mkBar(0.44, 0x8e7cff),    // jets
    ];

    // Faint canopy glass so reflections and rain read as being outside it.
    add(new THREE.PlaneGeometry(1.9, 1.3), glassMat, [0, 0.03, -0.99]);

    // A couple of stencilled warning labels, purely for texture.
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.16, 0.012, 0.01),
        new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.55 }),
        [sx * 0.72, -0.552, -0.820], [-0.5, 0, 0]);
    }
  }

  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    if (v) { this._build(); this.scene.add(this.group); }
    else if (this.group.parent) this.scene.remove(this.group);
  }

  /**
   * Re-seat on the camera and drive the instruments.
   * A little lag on the seat is what makes the frame feel bolted to a
   * machine rather than welded to the lens.
   */
  update(dt, camera, mech) {
    if (!this.visible) return;

    // Sway: the frame trails the torso as it swings, then settles.
    const targetX = clamp((mech?.velocity.x ?? 0) * 0.004, -0.05, 0.05);
    const targetY = clamp(-(mech?.velocity.y ?? 0) * 0.004, -0.06, 0.06);
    this.sway.x = damp(this.sway.x, targetX, 6, dt);
    this.sway.y = damp(this.sway.y, targetY, 6, dt);

    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    this.group.translateX(this.sway.x);
    this.group.translateY(this.sway.y + (mech ? Math.sin(mech.gait * 2) * 0.006 : 0));

    if (!mech || !this.bars.length) return;
    const values = [mech.healthFraction, mech.heatFraction, mech.jets.fuel > 0 ? mech.jetFuel / mech.jets.fuel : 0];
    for (let i = 0; i < this.bars.length; i++) {
      const bar = this.bars[i];
      const v = clamp(values[i], 0, 1);
      bar.mesh.scale.x = Math.max(0.02, v);
      // Keep the strip left-anchored as it shrinks.
      bar.mesh.position.x = bar.baseX - (1 - v) * 0.17;
    }
    // Structure and heat both go red at the extremes.
    this.bars[0].mat.color.setHex(values[0] < 0.3 ? 0xff4d5e : values[0] < 0.6 ? 0xffb454 : 0x5df2a0);
    this.bars[1].mat.color.setHex(values[1] > 0.78 ? 0xff4d5e : 0xffb454);
    const alarm = mech.shutdown || mech.heatFraction > 0.85;
    this.bars[1].mat.opacity = alarm ? 0.55 + 0.45 * Math.sin(performance.now() * 0.02) : 0.9;
  }

  /** Tint the frame to the mech's paint so each cockpit feels like its own. */
  applySkin(skin) {
    if (!this.built || !skin) return;
    this.mats.frame.color.set(skin.secondary).multiplyScalar(0.8);
    this.mats.trim.color.set(skin.secondary).multiplyScalar(0.45);
  }

  dispose() {
    this.setVisible(false);
    this.group.traverse(o => {
      if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); }
    });
    this.built = false;
    this.bars = [];
  }
}
