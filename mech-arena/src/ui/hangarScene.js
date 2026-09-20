/**
 * HANGAR BAY
 * ------------------------------------------------------------------
 * The menu is not a flat page over a blurred screenshot: it is a real 3D
 * bay with the selected mech standing on a turntable. Picking a chassis,
 * a weapon or a paint job rebuilds the model in place, so every choice is
 * something you look at rather than read.
 */
import * as THREE from 'three';
import { buildMech } from '../world/mechBuilder.js';
import { buildWeaponModel } from '../world/weaponModels.js';
import { WEAPON_BY_ID } from '../data/weapons.js';
import { damp, clamp, lerp } from '../core/rng.js';

export class HangarScene {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.group = new THREE.Group();
    this.group.name = 'hangar';
    this.model = null;
    this.spin = 0;
    this.spinSpeed = 0.28;
    this.userSpin = 0;
    this.dragging = false;
    this.zoom = 1;
    this.targetZoom = 1;
    this.focusY = 0.5;
    this.built = false;
    this.visible = false;
  }

  build() {
    if (this.built) return;
    this.built = true;
    const g = this.group;

    const dark = new THREE.MeshStandardMaterial({ color: 0x13181e, roughness: 0.82, metalness: 0.35 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.42, metalness: 0.85 });
    const grate = new THREE.MeshStandardMaterial({ color: 0x1b2128, roughness: 0.66, metalness: 0.6 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x49d6ff });
    this.mats = { dark, metal, grate, glow };

    // Floor + turntable.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 48), dark);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 10.5, 0.7, 48), grate);
    pad.position.y = 0.35;
    pad.receiveShadow = true; pad.castShadow = true;
    g.add(pad);

    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 1.6), glow);
      seg.position.set(Math.cos(a) * 9.9, 0.74, Math.sin(a) * 9.9);
      seg.rotation.y = -a;
      g.add(seg);
    }

    // Gantry towers either side: they give the mech a sense of scale.
    for (const sx of [-1, 1]) {
      const tower = new THREE.Group();
      tower.position.set(sx * 16, 0, -2);
      for (let lvl = 0; lvl < 4; lvl++) {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 16), metal);
        deck.position.set(0, 3.4 + lvl * 3.4, 0);
        deck.castShadow = true; deck.receiveShadow = true;
        tower.add(deck);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 16), metal);
        rail.position.set(-sx * 2.9, 4.4 + lvl * 3.4, 0);
        tower.add(rail);
      }
      const column = new THREE.Mesh(new THREE.BoxGeometry(2.2, 17, 2.2), dark);
      column.position.set(sx * 2.4, 8.5, -7);
      column.castShadow = true;
      tower.add(column);
      g.add(tower);
    }

    // Back wall with a lit doorway.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(90, 34, 1.4), dark);
    wall.position.set(0, 17, -34);
    wall.receiveShadow = true;
    g.add(wall);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), new THREE.MeshBasicMaterial({ color: 0x0c2230 }));
    door.position.set(0, 8, -33.2);
    g.add(door);

    // Lighting rig: a warm key, a cool fill, and two rim lights.
    this.key = new THREE.SpotLight(0xffe6c8, 340, 90, 0.7, 0.45, 1.6);
    this.key.position.set(14, 30, 20);
    this.key.target.position.set(0, 6, 0);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0012;
    g.add(this.key, this.key.target);

    this.fill = new THREE.PointLight(0x4fa8ff, 160, 90, 2);
    this.fill.position.set(-18, 14, 14);
    g.add(this.fill);

    this.rimA = new THREE.PointLight(0x49d6ff, 120, 70, 2);
    this.rimA.position.set(-14, 9, -16);
    g.add(this.rimA);
    this.rimB = new THREE.PointLight(0xff8a3d, 90, 70, 2);
    this.rimB.position.set(16, 7, -14);
    g.add(this.rimB);

    this.ambient = new THREE.HemisphereLight(0x3a4a5a, 0x0a0c10, 0.6);
    g.add(this.ambient);
  }

  enter() {
    this.build();
    if (!this.visible) { this.scene.add(this.group); this.visible = true; }
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.Fog(0x05070a, 40, 150);
    this.engine.sun.intensity = 0.25;
    this.engine.hemi.intensity = 0.35;
    this.engine.rim.intensity = 0.2;
    this.engine.fovTarget = 40;
  }

  leave() {
    if (this.visible) { this.scene.remove(this.group); this.visible = false; }
    this.clearMech();
  }

  clearMech() {
    if (!this.model) return;
    this.group.remove(this.model.root);
    this.model.root.traverse(o => { if (o.isMesh) o.geometry?.dispose?.(); });
    for (const m of Object.values(this.model.materials)) m?.dispose?.();
    this.model = null;
  }

  /** Rebuild the displayed mech from a hangar build record. */
  setMech(chassis, skinId, loadout) {
    this.build();
    this.clearMech();
    if (!chassis) return;
    this.model = buildMech(chassis, skinId, null);
    this.model.root.position.y = 0.7;
    this.model.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(this.model.root);

    // Hang the fitted weapons on the mounts so the silhouette is honest.
    (loadout || []).forEach((id, i) => {
      if (!id) return;
      const w = WEAPON_BY_ID[id];
      const hp = chassis.hardpoints[i];
      if (!w || !hp) return;
      const { group } = buildWeaponModel(w, this.model.materials, this.model.scaleRef);
      const mount = this.model.mounts[hp.loc] || this.model.mounts.CT;
      mount.add(group);
    });

    this.focusY = chassis.build.height * 0.5;
    this.frameHeight = chassis.build.height;
  }

  /** Highlight one hardpoint by pulsing a marker at its mount. */
  highlightHardpoint(index, chassis) {
    if (this._marker) { this._marker.parent?.remove(this._marker); this._marker = null; }
    if (index == null || !this.model || !chassis) return;
    const hp = chassis.hardpoints[index];
    if (!hp) return;
    const mount = this.model.mounts[hp.loc];
    if (!mount) return;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x49d6ff, transparent: true, opacity: 0.85 }),
    );
    mount.add(m);
    this._marker = m;
  }

  update(dt) {
    if (!this.visible) return;
    this.spin += (this.dragging ? 0 : this.spinSpeed) * dt;
    if (this.model) this.model.root.rotation.y = this.spin + this.userSpin;
    if (this._marker) {
      const s = 1 + Math.sin(performance.now() * 0.006) * 0.25;
      this._marker.scale.setScalar(s);
    }

    this.zoom = damp(this.zoom, this.targetZoom, 8, dt);
    const h = this.frameHeight || 10;
    const cam = this.engine.camera;
    const dist = (h * 2.4 + 8) / this.zoom;
    const want = _v.set(
      Math.sin(-0.5) * dist * 0.55,
      this.focusY + h * 0.42,
      Math.cos(-0.5) * dist,
    );
    cam.position.x = damp(cam.position.x, want.x, 6, dt);
    cam.position.y = damp(cam.position.y, want.y, 6, dt);
    cam.position.z = damp(cam.position.z, want.z, 6, dt);
    cam.lookAt(0, this.focusY + h * 0.06, 0);
  }

  /** Hook pointer drag from the menu layer so the mech can be spun by hand. */
  attachDrag(el) {
    let last = null;
    const down = (e) => { this.dragging = true; last = e.clientX; };
    const move = (e) => {
      if (!this.dragging || last == null) return;
      this.userSpin += (e.clientX - last) * 0.011;
      last = e.clientX;
    };
    const up = () => { this.dragging = false; last = null; };
    el.addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    el.addEventListener('wheel', (e) => {
      this.targetZoom = clamp(this.targetZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.6, 2.6);
      e.preventDefault();
    }, { passive: false });
  }
}

const _v = new THREE.Vector3();
