/* Star Kingdoms — effects: tracers, impacts, explosions, thruster dust,
   floating damage numbers and billboard health bars. Everything is
   pooled; nothing allocates during a firefight. */
(function (SK) {
  'use strict';
  const U = SK.util;
  const B = SK.build;

  function dotTex() { return SK.World.softDot(0xffffff); }

  function FX(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.active = [];
    this.spritePool = [];
    this.meshPool = {};
    this.popups = [];
    this.popupLayer = null;
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  FX.prototype._sprite = function (color, opacity) {
    let s = this.spritePool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dotTex(), transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false
      }));
      s.userData.pooled = true;
    }
    s.material.color = B.SRGB(color);
    s.material.opacity = opacity == null ? 1 : opacity;
    s.visible = true;
    this.scene.add(s);
    return s;
  };

  FX.prototype._mesh = function (key, geo, color, opacity, additive) {
    const pool = (this.meshPool[key] = this.meshPool[key] || []);
    let m = pool.pop();
    if (!m) {
      m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        transparent: true, blending: additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false, fog: false, side: THREE.DoubleSide
      }));
      m.userData.key = key;
    }
    m.material.color = B.SRGB(color);
    m.material.opacity = opacity == null ? 1 : opacity;
    m.scale.set(1, 1, 1);
    m.rotation.set(0, 0, 0);
    m.visible = true;
    this.scene.add(m);
    return m;
  };

  FX.prototype._push = function (obj, p) {
    p.obj = obj; p.t = 0;
    this.active.push(p);
    return p;
  };

  /* ---------------------------------------------------------- effects */

  // Instant beam between two points — used for rifles and sniper shots.
  FX.prototype.tracer = function (from, to, color, thickness) {
    const d = this._v.subVectors(to, from);
    const len = d.length();
    if (len < 0.01) return;
    const geo = B.box(1, 1, 1);
    const m = this._mesh('tracer', geo, color, 0.95);
    m.position.copy(from).addScaledVector(d, 0.5);
    m.lookAt(to);
    m.scale.set(thickness || 0.09, thickness || 0.09, len);
    this._push(m, { life: 0.09, kind: 'fade', s0: 1, s1: 0.3 });
    // soft core so the beam has a bloom-like halo without a post pass
    const halo = this._mesh('tracer', geo, 0xffffff, 0.4);
    halo.position.copy(m.position);
    halo.quaternion.copy(m.quaternion);
    halo.scale.set((thickness || 0.09) * 2.6, (thickness || 0.09) * 2.6, len);
    this._push(halo, { life: 0.07, kind: 'fade', s0: 1, s1: 0.1 });
  };

  // A bolt that visibly travels — slower weapons and the player blaster.
  FX.prototype.bolt = function (from, dir, color, speed, range, onHit) {
    const geo = B.box(1, 1, 1);
    const m = this._mesh('bolt', geo, color, 1);
    m.position.copy(from);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    m.quaternion.copy(q);
    m.scale.set(0.16, 0.16, 1.5);
    const halo = this._mesh('bolt', geo, 0xffffff, 0.45);
    halo.position.copy(from); halo.quaternion.copy(q); halo.scale.set(0.42, 0.42, 1.9);
    const v = dir.clone().normalize().multiplyScalar(speed || 90);
    const life = (range || 120) / (speed || 90);
    this._push(m, { life: life, kind: 'travel', vel: v, halo: halo, onHit: onHit, color: color });
  };

  FX.prototype.muzzle = function (pos, color) {
    const s = this._sprite(color, 1);
    s.position.copy(pos);
    s.scale.setScalar(1.6);
    this._push(s, { life: 0.09, kind: 'fade', s0: 1.7, s1: 0.2 });
    const s2 = this._sprite(0xffffff, 0.9);
    s2.position.copy(pos);
    this._push(s2, { life: 0.06, kind: 'fade', s0: 0.9, s1: 0.1 });
  };

  FX.prototype.sparks = function (pos, color, n, power) {
    n = n || 8; power = power || 6;
    for (let i = 0; i < n; i++) {
      const s = this._sprite(i % 3 === 0 ? 0xffffff : color, 1);
      s.position.copy(pos);
      const v = new THREE.Vector3(U.rand(-1, 1), U.rand(0.1, 1.2), U.rand(-1, 1))
        .normalize().multiplyScalar(U.rand(power * 0.4, power));
      this._push(s, { life: U.rand(0.25, 0.6), kind: 'phys', vel: v, grav: 16, s0: U.rand(0.3, 0.7), s1: 0.02 });
    }
  };

  FX.prototype.impact = function (pos, color) {
    this.sparks(pos, color, 7, 7);
    const s = this._sprite(color, 0.9);
    s.position.copy(pos);
    this._push(s, { life: 0.22, kind: 'fade', s0: 0.4, s1: 2.0 });
  };

  FX.prototype.explosion = function (pos, radius, color) {
    radius = radius || 4;
    color = color == null ? 0xffa23a : color;
    // fireball
    const core = this._sprite(0xfff0c0, 1);
    core.position.copy(pos);
    this._push(core, { life: 0.3, kind: 'fade', s0: radius * 0.5, s1: radius * 2.0 });
    const ball = this._sprite(color, 0.95);
    ball.position.copy(pos);
    this._push(ball, { life: 0.55, kind: 'fade', s0: radius * 0.8, s1: radius * 3.0 });
    // shockwave ring on the ground plane
    const ring = this._mesh('ring', B.ring(0.75, 1), color, 0.8);
    ring.position.copy(pos); ring.position.y += 0.35;
    ring.rotation.x = -Math.PI / 2;
    this._push(ring, { life: 0.5, kind: 'fade', s0: radius * 0.4, s1: radius * 3.4 });
    // smoke
    for (let i = 0; i < 5; i++) {
      const s = this._sprite(0x5a5148, 0.55);
      s.position.copy(pos).add(new THREE.Vector3(U.rand(-1, 1), U.rand(0, 1), U.rand(-1, 1)).multiplyScalar(radius * 0.4));
      this._push(s, {
        life: U.rand(0.9, 1.6), kind: 'phys',
        vel: new THREE.Vector3(U.rand(-2, 2), U.rand(1.5, 4), U.rand(-2, 2)),
        grav: -1.2, s0: radius * 0.5, s1: radius * 1.5
      });
    }
    this.sparks(pos, 0xffc65a, 14, radius * 3.2);
  };

  FX.prototype.dust = function (pos, color, scale) {
    const s = this._sprite(color == null ? 0xbfae94 : color, 0.35);
    s.position.copy(pos);
    this._push(s, {
      life: U.rand(0.5, 0.95), kind: 'phys',
      vel: new THREE.Vector3(U.rand(-1.2, 1.2), U.rand(0.2, 0.9), U.rand(-1.2, 1.2)),
      grav: -0.6, s0: (scale || 1) * 0.5, s1: (scale || 1) * 2.4
    });
  };

  FX.prototype.beam = function (from, to, color, life) {
    const d = this._v.subVectors(to, from);
    const len = d.length();
    if (len < 0.01) return;
    const m = this._mesh('tracer', B.box(1, 1, 1), color, 0.55);
    m.position.copy(from).addScaledVector(d, 0.5);
    m.lookAt(to);
    m.scale.set(0.16, 0.16, len);
    this._push(m, { life: life || 0.12, kind: 'fade', s0: 1, s1: 0.4 });
  };

  FX.prototype.teleportIn = function (pos, color) {
    const ring = this._mesh('ring', B.ring(0.75, 1), color, 0.9);
    ring.position.copy(pos); ring.position.y += 0.1;
    ring.rotation.x = -Math.PI / 2;
    this._push(ring, { life: 0.6, kind: 'fade', s0: 4.5, s1: 0.4 });
    const col = this._mesh('col', B.cyl(1, 1, 1, 14), color, 0.55);
    col.position.copy(pos); col.position.y += 2.4;
    col.scale.set(1.4, 4.8, 1.4);
    this._push(col, { life: 0.45, kind: 'shrink', s0: 1, s1: 0.05, keepY: true });
    this.sparks(pos, color, 10, 5);
  };

  /* ------------------------------------------ floating damage numbers */
  FX.prototype.setPopupLayer = function (node) { this.popupLayer = node; };

  FX.prototype.popup = function (pos, text, color, big) {
    if (!this.popupLayer) return;
    const n = document.createElement('div');
    n.className = 'dmg' + (big ? ' dmg-big' : '');
    n.textContent = text;
    n.style.color = color || '#fff';
    this.popupLayer.appendChild(n);
    this.popups.push({
      node: n, pos: pos.clone(), t: 0, life: big ? 1.5 : 1.0,
      drift: new THREE.Vector3(U.rand(-0.5, 0.5), U.rand(2.2, 3.4), U.rand(-0.5, 0.5))
    });
  };

  FX.prototype.updatePopups = function (dt, camera, w, h) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.node.remove(); this.popups.splice(i, 1); continue; }
      p.pos.addScaledVector(p.drift, dt);
      p.drift.multiplyScalar(1 - dt * 1.6);
      this._v.copy(p.pos).project(camera);
      if (this._v.z > 1) { p.node.style.opacity = '0'; continue; }
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;
      p.node.style.transform = 'translate(-50%,-50%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale('
        + (1 + (1 - Math.min(1, k * 4)) * 0.5).toFixed(2) + ')';
      p.node.style.opacity = String(U.clamp(1 - Math.pow(k, 3), 0, 1));
    }
  };

  FX.prototype.clearPopups = function () {
    this.popups.forEach((p) => p.node.remove());
    this.popups.length = 0;
  };

  /* ------------------------------------------------------------ tick */
  FX.prototype.update = function (dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.t += dt;
      const k = U.clamp(p.t / p.life, 0, 1);
      const o = p.obj;
      if (p.kind === 'travel') {
        o.position.addScaledVector(p.vel, dt);
        if (p.halo) p.halo.position.copy(o.position);
        o.material.opacity = 1;
        if (k >= 1) {
          if (p.onHit) p.onHit(o.position);
          this._recycle(p.halo); this._recycle(o);
          this.active.splice(i, 1);
          continue;
        }
      } else if (p.kind === 'phys') {
        p.vel.y -= p.grav * dt;
        o.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(1 - dt * 1.2);
        const s = U.lerp(p.s0, p.s1, k);
        o.scale.setScalar(s);
        o.material.opacity = (1 - k) * (p.op0 || 1);
      } else if (p.kind === 'shrink') {
        const s = U.lerp(p.s0, p.s1, k);
        o.scale.set(s * (p.baseX || 1.4), p.keepY ? o.scale.y : s, s * (p.baseX || 1.4));
        o.material.opacity = (1 - k) * 0.6;
      } else {
        const s = U.lerp(p.s0 == null ? 1 : p.s0, p.s1 == null ? 1 : p.s1, U.smoothstep(k));
        if (o.isSprite) o.scale.setScalar(s);
        else if (p.s0 != null) o.scale.set(s, o.userData.key === 'tracer' ? o.scale.y : s, o.scale.z);
        o.material.opacity = (1 - k) * (p.op0 || 1);
      }
      if (k >= 1) {
        this._recycle(o);
        this.active.splice(i, 1);
      }
    }
  };

  FX.prototype._recycle = function (o) {
    if (!o) return;
    this.scene.remove(o);
    o.visible = false;
    if (o.isSprite) this.spritePool.push(o);
    else (this.meshPool[o.userData.key] = this.meshPool[o.userData.key] || []).push(o);
  };

  FX.prototype.clear = function () {
    this.active.forEach((p) => { this._recycle(p.obj); if (p.halo) this._recycle(p.halo); });
    this.active.length = 0;
    this.clearPopups();
  };

  /* ==================================================================
     Billboard health bar — a two-quad group that faces the camera.
     ================================================================== */
  function HealthBar(color, width) {
    width = width || 1.5;
    this.group = new THREE.Group();
    const bg = new THREE.Mesh(B.plane(1, 1), new THREE.MeshBasicMaterial({
      color: B.SRGB(0x0a0e18), transparent: true, opacity: 0.72, depthWrite: false, fog: false
    }));
    bg.scale.set(width, 0.17, 1);
    this.group.add(bg);
    const fillMat = new THREE.MeshBasicMaterial({
      color: B.SRGB(color), transparent: true, opacity: 0.98, depthWrite: false, fog: false
    });
    this.fillWrap = new THREE.Group();
    this.fill = new THREE.Mesh(B.plane(1, 1), fillMat);
    this.fill.scale.set(width - 0.06, 0.11, 1);
    this.fill.position.z = 0.002;
    this.fillWrap.add(this.fill);
    this.group.add(this.fillWrap);
    this.width = width;
    this.group.renderOrder = 900;
    this.value = 1;
  }
  HealthBar.prototype.set = function (frac) {
    frac = U.clamp(frac, 0, 1);
    this.value = frac;
    const w = (this.width - 0.06) * frac;
    this.fill.scale.x = Math.max(0.001, w);
    this.fill.position.x = -(this.width - 0.06) / 2 + w / 2;
    this.fill.material.color = B.SRGB(frac > 0.55 ? 0x5dffa0 : frac > 0.28 ? 0xffb23f : 0xff4d6d);
  };
  HealthBar.prototype.face = function (camera) {
    this.group.quaternion.copy(camera.quaternion);
  };

  SK.FX = FX;
  SK.HealthBar = HealthBar;
})(window.SK);
