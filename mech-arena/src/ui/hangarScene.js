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
    // Lateral framing: shifting the look target moves the subject across
    // the screen without moving the camera off its turntable arc. The title
    // screen uses it to keep the mech clear of the menu column.
    this.lookShiftX = 0;
    // The rectangle of the window the menu has left clear for the mech, in
    // CSS pixels. Null means "the whole window".
    this.stage = null;
    // The whole lance stands in the bay, the way an arena game's squad
    // screen does. `lineUp` is false where there is no room for a row --
    // a phone -- and only the selected machine is shown.
    this.slots = [];
    this.selected = 0;
    this.lineUp = true;
    // 'row' frames the whole squad -- the title screen, where nothing is in
    // the way. 'selected' puts the machine you are working on in the middle
    // of the gap between the panels and lets the rest of the lance stand
    // behind them.
    this.focusMode = 'row';
    this.rowWidth = 0;
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

    // The turntable is for a single machine. A line-up gets its own pads,
    // so this whole assembly goes away -- see _layout.
    this.turntable = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 10.5, 0.7, 48), grate);
    pad.position.y = 0.35;
    pad.receiveShadow = true; pad.castShadow = true;
    this.turntable.add(pad);

    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 1.6), glow);
      seg.position.set(Math.cos(a) * 9.9, 0.74, Math.sin(a) * 9.9);
      seg.rotation.y = -a;
      this.turntable.add(seg);
    }
    g.add(this.turntable);

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

    // A lit window wall behind the line-up. It is what makes the bay read
    // as a bright hangar rather than a dark room with a spotlight in it.
    const window = new THREE.Mesh(
      new THREE.PlaneGeometry(74, 15),
      new THREE.MeshBasicMaterial({ color: 0x1d6f9e }),
    );
    window.position.set(0, 12, -33.1);
    g.add(window);
    for (let i = -2; i <= 2; i++) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.8, 20, 0.5), this.mats.metal);
      mullion.position.set(i * 14.2, 13.5, -32.8);
      g.add(mullion);
    }
    const spill = new THREE.PointLight(0x58c8ff, 9000, 90, 2);
    spill.position.set(0, 13, -26);
    g.add(spill);

    // Lighting rig: a warm key, a cool fill, and two rim lights.
    // Physically-based falloff: illuminance is intensity / distance^2, so a
    // key light twenty-five metres away needs to be in the thousands, not
    // the hundreds.
    this.key = new THREE.SpotLight(0xfff4e4, 11500, 130, 0.8, 0.55, 2);
    this.key.position.set(14, 30, 20);
    this.key.target.position.set(0, 6, 0);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0012;
    g.add(this.key, this.key.target);

    this.fill = new THREE.PointLight(0x9fd0f0, 4200, 120, 2);
    this.fill.position.set(-18, 14, 14);
    g.add(this.fill);

    this.rimA = new THREE.PointLight(0x5cd8ff, 3000, 100, 2);
    this.rimA.position.set(-14, 9, -16);
    g.add(this.rimA);
    this.rimB = new THREE.PointLight(0xffb454, 3600, 95, 2);
    this.rimB.position.set(16, 7, -14);
    g.add(this.rimB);

    this.ambient = new THREE.HemisphereLight(0xb4cad8, 0x2a3f56, 1.15);
    g.add(this.ambient);
  }

  enter() {
    this.build();
    if (!this.visible) { this.scene.add(this.group); this.visible = true; }
    this.scene.background = new THREE.Color(0x0a2340);
    this.scene.fog = new THREE.Fog(0x0e2c4e, 70, 210);
    this.engine.buildStudioEnvironment();
    this.engine.sun.intensity = 0.35;
    this.engine.hemi.intensity = 0.4;
    this.engine.rim.intensity = 0.25;
    this.engine.ambient.intensity = 0.55;
    this.engine.ambient.color.setHex(0x8fa6bb);
    this.engine.fill.intensity = 0.35;
    this.engine.fovTarget = 40;
  }

  leave() {
    if (this.visible) { this.scene.remove(this.group); this.visible = false; }
    this.clearMech();
  }

  clearMech() {
    for (const slot of this.slots) this._disposeSlot(slot);
    this.slots.length = 0;
    this.model = null;
  }

  _disposeSlot(slot) {
    if (!slot) return;
    if (slot.model) {
      this.group.remove(slot.model.root);
      slot.model.root.traverse(o => { if (o.isMesh) o.geometry?.dispose?.(); });
      for (const m of Object.values(slot.model.materials)) m?.dispose?.();
    }
    if (slot.pad) {
      this.group.remove(slot.pad);
      slot.pad.traverse(o => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); } });
    }
  }

  /** A lit disc under a machine: gold for the one you are working on. */
  _makePad(radius, hot) {
    const g = new THREE.Group();
    const colour = hot ? 0xffc247 : 0x3fd2ff;
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.06, 0.36, 40),
      new THREE.MeshStandardMaterial({ color: 0x14314f, roughness: 0.5, metalness: 0.7 }),
    );
    disc.position.y = 0.18;
    disc.receiveShadow = true;
    g.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.99, 0.09, 8, 44),
      new THREE.MeshBasicMaterial({ color: colour }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.38;
    g.add(ring);
    // A soft glow sheet on the floor, which is what sells the lit pad.
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 1.25, 32),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: hot ? 0.16 : 0.07, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    g.add(glow);
    return g;
  }

  /** Rebuild the displayed mech from a hangar build record. */
  setMech(chassis, skinId, loadout) {
    this.setLance(chassis ? [{ chassis, skinId, loadout }] : [], 0);
  }

  /**
   * Stand the whole lance in the bay.
   * @param {{chassis:object, skinId:string, loadout:string[]}[]} builds
   * @param {number} selected index of the machine being worked on
   */
  setLance(builds, selected = 0) {
    this.build();
    this.clearMech();
    this.selected = Math.max(0, Math.min(selected, builds.length - 1));
    if (!builds.length) return;

    for (let i = 0; i < builds.length; i++) {
      const b = builds[i];
      if (!b || !b.chassis) { this.slots.push(null); continue; }
      const model = buildMech(b.chassis, b.skinId, null);
      model.root.position.y = 0.7;
      model.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(model.root);

      // Hang the fitted weapons on the mounts so the silhouette is honest.
      (b.loadout || []).forEach((id, j) => {
        if (!id) return;
        const w = WEAPON_BY_ID[id];
        const hp = b.chassis.hardpoints[j];
        if (!w || !hp) return;
        const { group } = buildWeaponModel(w, model.materials, model.scaleRef);
        const mount = model.mounts[hp.loc] || model.mounts.CT;
        mount.add(group);
      });

      const pad = this._makePad(b.chassis.build.height * 0.42 + 1.4, i === this.selected);
      this.group.add(pad);
      this.slots.push({ model, pad, chassis: b.chassis, width: b.chassis.build.height * 0.75 + 2.6 });
    }
    this.model = this.slots[this.selected]?.model || null;
    const chassis = this.slots[this.selected]?.chassis || builds[this.selected]?.chassis;
    this.focusY = (chassis?.build.height || 10) * 0.5;
    this.frameHeight = chassis?.build.height || 10;
    this._layout();
  }

  /** Show the whole row, or only the machine being worked on. */
  setLineUp(on) {
    if (this.lineUp === !!on) return;
    this.lineUp = !!on;
    this._layout();
  }

  /** @param {'row'|'selected'} mode what the camera should fill the stage with. */
  setFocus(mode) {
    if (this.focusMode === mode) return;
    this.focusMode = mode;
    this._layout();
  }

  /** Place the row: selected in the middle, the rest shoulder to shoulder. */
  _layout() {
    const live = this.slots.filter(Boolean);
    if (this.turntable) this.turntable.visible = !this.lineUp || live.length <= 1;
    if (!live.length) { this.rowWidth = 0; return; }
    if (!this.lineUp) {
      // One machine, centred, everything else off the floor.
      for (const s of this.slots) {
        if (!s) continue;
        const on = s === this.slots[this.selected];
        s.model.root.visible = on;
        s.pad.visible = on;
        s.model.root.position.x = 0;
        s.pad.position.x = 0;
        s.model.root.position.z = 0;
        s.pad.position.z = 0;
      }
      this.rowWidth = this.slots[this.selected]?.width || 8;
      return;
    }
    // Widths first, then walk the row, then slide the whole thing so the
    // machine being worked on stands in the middle of the bay.
    const gap = 1.6;
    const total = live.reduce((a, s) => a + s.width, 0) + gap * (live.length - 1);
    // Centre the row itself, not the selected machine: a squad shot reads
    // as a squad. Which one you are working on is said by the gold pad and
    // by its step forward off the line.
    let x = 0;
    for (const s of this.slots) {
      if (!s) continue;
      s.cx = x + s.width / 2;
      x += s.width + gap;
    }
    const sel = this.slots[this.selected];
    const centre = this.focusMode === 'row' ? total / 2 : (sel?.cx ?? total / 2);
    for (const s of this.slots) {
      if (!s) continue;
      const on = s === this.slots[this.selected];
      s.model.root.visible = true;
      s.pad.visible = true;
      s.model.root.position.x = s.cx - centre;
      s.pad.position.x = s.cx - centre;
      // The one you are working on steps forward off the line.
      s.model.root.position.z = on ? 2.2 : 0;
      s.pad.position.z = on ? 2.2 : 0;
    }
    this.rowWidth = this.focusMode === 'row'
      ? total * 1.06                       // the whole squad, with air around it
      : (sel?.width || 9) * 1.55;          // the one being worked on, up close
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
    for (const s of this.slots) {
      if (!s) continue;
      // The machine on the turntable rotates; the rest of the lance stands
      // at ease, angled a little toward the middle of the bay.
      if (s === this.slots[this.selected]) s.model.root.rotation.y = this.spin + this.userSpin;
      else s.model.root.rotation.y = -Math.sign(s.model.root.position.x || 1) * 0.22;
    }
    if (this._marker) {
      const s = 1 + Math.sin(performance.now() * 0.006) * 0.25;
      this._marker.scale.setScalar(s);
    }

    this.zoom = damp(this.zoom, this.targetZoom, 8, dt);
    const h = this.frameHeight || 10;
    const cam = this.engine.camera;

    /* Frame the mech into the rectangle the menu left clear for it, not into
     * the middle of the window. On a wide screen that is the centre column;
     * on a phone it is a band across the top with the panels below. Backing
     * the camera off until the machine fits that rectangle -- and aiming at
     * the rectangle's centre rather than the screen's -- is what keeps it
     * visible at every width instead of hiding behind the panels. */
    const vw = Math.max(1, innerWidth), vh = Math.max(1, innerHeight);
    const st = this.stage || { x: 0, y: 0, w: vw, h: vh };
    const tanY = Math.tan((cam.fov * Math.PI / 180) / 2);
    const fracY = clamp(st.h / vh, 0.12, 1);
    const fracX = clamp(st.w / vw, 0.12, 1);
    const distY = (h * 1.12 * 0.5) / (tanY * fracY);
    const subject = Math.max(h * 0.66, this.rowWidth || 0);
    const distX = (subject * 0.5) / (tanY * Math.max(0.35, cam.aspect) * fracX);
    const dist = Math.max(distY, distX, h * 1.4 + 5) / this.zoom;

    // Chest height, looking very slightly up: a machine photographed from
    // above looks like a model on a table, and from below like a threat.
    const want = _v.set(
      Math.sin(-0.5) * dist * 0.55,
      this.focusY + h * 0.14,
      Math.cos(-0.5) * dist,
    );
    cam.position.x = damp(cam.position.x, want.x, 6, dt);
    cam.position.y = damp(cam.position.y, want.y, 6, dt);
    cam.position.z = damp(cam.position.z, want.z, 6, dt);

    const target = _t.set(this.lookShiftX, this.focusY + h * 0.12, 0);
    // Where the stage sits in normalised device coordinates: +x right, +y up.
    const cx = ((st.x + st.w * 0.5) / vw) * 2 - 1;
    const cy = 1 - ((st.y + st.h * 0.5) / vh) * 2;
    if (cx || cy) {
      // Shifting the look target the other way moves the subject onto the
      // stage without moving the camera off its turntable arc.
      _fwd.copy(target).sub(cam.position);
      const d = _fwd.length() || 1;
      _fwd.multiplyScalar(1 / d);
      _right.crossVectors(_fwd, _up).normalize();
      const halfH = tanY * d;
      target.addScaledVector(_right, -cx * halfH * cam.aspect)
            .addScaledVector(_up, -cy * halfH);
    }
    cam.lookAt(target);
  }

  /** @param {number} x negative shifts the subject toward the right of frame. */
  setFraming(x) { this.lookShiftX = x; }

  /**
   * The clear rectangle the mech should be framed into.
   * @param {?{x:number,y:number,w:number,h:number}} rect CSS pixels, or null
   *        for the whole window.
   */
  setStage(rect) {
    this.stage = (rect && rect.w > 8 && rect.h > 8) ? rect : null;
  }

  /** Hook pointer drag from the menu layer so the mech can be spun by hand. */
  attachDrag(el) {
    // The menu re-renders its surface on every change, so the window-level
    // listeners are registered once and the per-element ones ride along.
    if (!this._dragBound) {
      this._dragBound = true;
      this._dragLast = null;
      addEventListener('pointermove', (e) => {
        if (!this.dragging || this._dragLast == null) return;
        this.userSpin += (e.clientX - this._dragLast) * 0.011;
        this._dragLast = e.clientX;
      });
      addEventListener('pointerup', () => { this.dragging = false; this._dragLast = null; });
      addEventListener('pointercancel', () => { this.dragging = false; this._dragLast = null; });
    }
    el.addEventListener('pointerdown', (e) => {
      // On a touch screen a drag that starts on a panel is a scroll, not a
      // turntable spin.
      if (e.pointerType === 'touch' && e.target?.closest?.('.panel,.btn,.card,.tab,button,input,select'))
        return;
      this.dragging = true;
      this._dragLast = e.clientX;
    });
    el.addEventListener('wheel', (e) => {
      this.targetZoom = clamp(this.targetZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.6, 2.6);
      e.preventDefault();
    }, { passive: false });
  }

  /** Pinch/zoom from the on-screen control, clamped to the framing limits. */
  nudgeZoom(mul) { this.targetZoom = clamp(this.targetZoom * mul, 0.6, 2.6); }
}

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
