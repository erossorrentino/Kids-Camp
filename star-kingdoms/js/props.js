/* Star Kingdoms — scenery props and kingdom architecture.
   Props are merged into single vertex-coloured geometries and drawn with
   InstancedMesh, so a planet carrying 900 objects still costs only a
   handful of draw calls. */
(function (SK) {
  'use strict';
  const B = SK.build;
  const U = SK.util;

  /* Geometry merging lives in build.js so characters share it. */
  const mergeParts = B.mergeParts;

  // Small builder that accumulates transformed primitives.
  function Parts() {
    this.solid = [];
    this.glow = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }
  Parts.prototype.at = function (geo, color, x, y, z, sx, sy, sz, rx, ry, rz, glow) {
    this._e.set(rx || 0, ry || 0, rz || 0);
    this._q.setFromEuler(this._e);
    this._v.set(x || 0, y || 0, z || 0);
    this._s.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz);
    const mat = new THREE.Matrix4().compose(this._v, this._q, this._s);
    (glow ? this.glow : this.solid).push({ geo: geo, matrix: mat, color: color });
    return this;
  };
  Parts.prototype.glowAt = function (geo, color, x, y, z, sx, sy, sz, rx, ry, rz) {
    return this.at(geo, color, x, y, z, sx, sy, sz, rx, ry, rz, true);
  };

  /* ================================================================
     PROP VARIANTS — each returns a Parts bundle for one instance shape.
     ================================================================ */
  const PROPS = {
    sporeTree(rng, p) {
      const h = rng.range(5, 9);
      const bark = 0x4a3a2c, leaf = 0x3f9a58, leaf2 = 0x6fd47a, glow = 0xbfff6a;
      p.at(B.cyl(0.18, 0.42, h, 7), bark, 0, h / 2, 0);
      // leaning secondary trunks give the canopy an organic silhouette
      for (let i = 0; i < 2; i++) {
        const a = rng.range(0, U.TAU), l = rng.range(1.6, 2.8);
        p.at(B.cyl(0.08, 0.16, l, 6), bark, Math.cos(a) * 0.5, h * 0.62, Math.sin(a) * 0.5,
          1, 1, 1, rng.range(0.3, 0.6) * Math.sin(a), 0, -rng.range(0.3, 0.6) * Math.cos(a));
      }
      const layers = rng.int(3, 4);
      for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1 || 1);
        const r = U.lerp(3.0, 1.1, t) * rng.range(0.85, 1.15);
        p.at(B.ico(1, 0), i % 2 ? leaf2 : leaf, rng.range(-0.5, 0.5), h * (0.72 + t * 0.42),
          rng.range(-0.5, 0.5), r, r * 0.66, r, rng.range(0, 1), rng.range(0, 1), 0);
      }
      for (let i = 0; i < 5; i++) {
        const a = rng.range(0, U.TAU), r = rng.range(1.0, 2.6);
        p.glowAt(B.sphere(0.16, 6), glow, Math.cos(a) * r, h * rng.range(0.8, 1.2), Math.sin(a) * r);
      }
    },

    mushroom(rng, p) {
      const h = rng.range(1.6, 4.2);
      const stalk = 0xe8dfc4;
      const caps = [0xd6524f, 0xc9459a, 0x4f8fd6, 0xd6a13a];
      const c = rng.pick(caps);
      p.at(B.cyl(0.2, 0.3, h, 8), stalk, 0, h / 2, 0);
      const r = rng.range(0.9, 1.9);
      p.at(B.sphere(1, 12), c, 0, h, 0, r, r * 0.55, r);
      p.at(B.cyl(r * 0.95, r * 0.95, 0.06, 12), 0xf3e6c8, 0, h - 0.06, 0);
      for (let i = 0; i < 4; i++) {
        const a = rng.range(0, U.TAU), d = rng.range(0.2, r * 0.7);
        p.at(B.sphere(rng.range(0.07, 0.15), 6), 0xfff4d8, Math.cos(a) * d, h + r * 0.4, Math.sin(a) * d);
      }
      p.glowAt(B.ring(r * 0.2, r * 0.8), c, 0, h - 0.1, 0, 1, 1, 1, -Math.PI / 2, 0, 0);
    },

    rock(rng, p, color) {
      const n = rng.int(2, 4);
      for (let i = 0; i < n; i++) {
        const r = rng.range(0.6, 1.6) / (i + 1) * 1.4;
        p.at(B.ico(1, 0), color, rng.range(-0.6, 0.6), r * rng.range(0.4, 0.8), rng.range(-0.6, 0.6),
          r * rng.range(0.8, 1.4), r * rng.range(0.6, 1.1), r * rng.range(0.8, 1.4),
          rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      }
    },

    grassTuft(rng, p) {
      const c = [0x4f9c4f, 0x6cba5c, 0x8ed06a];
      for (let i = 0; i < 5; i++) {
        const a = rng.range(0, U.TAU), h = rng.range(0.5, 1.3);
        p.at(B.cone(0.07, h, 4), rng.pick(c), Math.cos(a) * 0.18, h / 2, Math.sin(a) * 0.18,
          1, 1, 1, rng.range(-0.3, 0.3), a, rng.range(-0.3, 0.3));
      }
    },

    obsidianSpike(rng, p) {
      const h = rng.range(3, 8);
      p.at(B.cone(rng.range(0.5, 1.1), h, 5), 0x1a1114, 0, h / 2, 0, 1, 1, 1,
        rng.range(-0.18, 0.18), rng.range(0, 3), rng.range(-0.18, 0.18));
      p.glowAt(B.cone(0.24, h * 0.5, 5), 0xff5a1a, 0, h * 0.22, 0);
      for (let i = 0; i < 2; i++) {
        const a = rng.range(0, U.TAU), hh = h * rng.range(0.3, 0.6);
        p.at(B.cone(0.3, hh, 5), 0x241719, Math.cos(a) * 0.8, hh / 2, Math.sin(a) * 0.8,
          1, 1, 1, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      }
    },

    emberVent(rng, p) {
      const r = rng.range(1.0, 2.2);
      p.at(B.cyl(r * 0.7, r, 0.7, 10), 0x2a1a16, 0, 0.35, 0);
      p.at(B.cyl(r * 0.45, r * 0.55, 0.3, 10), 0x140c0a, 0, 0.72, 0);
      p.glowAt(B.cyl(r * 0.44, r * 0.44, 0.08, 10), 0xff7a1a, 0, 0.82, 0);
      p.glowAt(B.cone(r * 0.4, 2.2, 8), 0xff9a3a, 0, 1.9, 0);
    },

    iceSpire(rng, p) {
      const h = rng.range(4, 12);
      const tint = [0xcfeeff, 0xa9dcf5, 0xe8f8ff];
      p.at(B.cone(rng.range(0.5, 1.2), h, 6), rng.pick(tint), 0, h / 2, 0, 1, 1, 1,
        rng.range(-0.12, 0.12), rng.range(0, 3), rng.range(-0.12, 0.12));
      for (let i = 0; i < rng.int(1, 3); i++) {
        const a = rng.range(0, U.TAU), hh = h * rng.range(0.25, 0.55);
        p.at(B.cone(0.35, hh, 5), 0xbfe6fa, Math.cos(a) * rng.range(0.6, 1.3), hh / 2,
          Math.sin(a) * rng.range(0.6, 1.3), 1, 1, 1, Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28);
      }
      p.glowAt(B.cone(0.3, h * 0.7, 6), 0x7fe8ff, 0, h * 0.35, 0);
    },

    frozenPine(rng, p) {
      const h = rng.range(4, 8);
      p.at(B.cyl(0.14, 0.24, h * 0.5, 6), 0x3a2e28, 0, h * 0.25, 0);
      const layers = 4;
      for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1);
        p.at(B.cone(U.lerp(1.7, 0.5, t), 1.9, 7), i % 2 ? 0x24483f : 0x2e5a4c,
          0, h * 0.42 + t * h * 0.42, 0);
        p.at(B.cone(U.lerp(1.72, 0.52, t), 0.5, 7), 0xf2fbff, 0, h * 0.42 + t * h * 0.42 + 0.7, 0);
      }
    },

    mesa(rng, p) {
      const h = rng.range(8, 20), r = rng.range(3, 7);
      const bands = [0x9a6237, 0xb87b45, 0xd3a066, 0xe6c493];
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        p.at(B.cyl(r * (1 - t * 0.35), r * (1 - (t - 0.2) * 0.35), h / n, 8),
          bands[i % bands.length], 0, h * (t + 0.5 / n), 0, 1, 1, rng.range(0.85, 1.15));
      }
      p.at(B.cyl(r * 0.62, r * 0.68, 0.6, 8), 0xf0dcb4, 0, h + 0.3, 0);
    },

    cactusSpire(rng, p) {
      const h = rng.range(3, 7);
      const c = 0x5c7a45;
      p.at(B.cyl(0.42, 0.55, h, 8), c, 0, h / 2, 0);
      for (let i = 0; i < rng.int(1, 3); i++) {
        const s = rng.sign(), y = h * rng.range(0.35, 0.65), al = rng.range(1.2, 2.2);
        p.at(B.cyl(0.26, 0.3, al, 7), c, s * 0.55, y, 0, 1, 1, 1, 0, 0, s * Math.PI / 2);
        p.at(B.cyl(0.26, 0.3, al * 0.9, 7), c, s * (0.55 + al / 2), y + al * 0.45, 0);
      }
      p.at(B.sphere(0.5, 8), 0x6f8f52, 0, h, 0, 1, 0.7, 1);
      for (let i = 0; i < 3; i++) {
        p.glowAt(B.sphere(0.13, 6), 0xff7ad0, rng.range(-0.4, 0.4), h + rng.range(0, 0.3), rng.range(-0.4, 0.4));
      }
    },

    boneArch(rng, p) {
      const h = rng.range(5, 11), w = rng.range(2.5, 5);
      const c = 0xe8e0cc;
      for (let s = -1; s <= 1; s += 2) {
        p.at(B.cyl(0.28, 0.5, h, 7), c, s * w / 2, h / 2, 0, 1, 1, 1, 0, 0, -s * 0.16);
      }
      const seg = 5;
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI * (i / seg);
        p.at(B.sphere(0.34, 7), c, Math.cos(a) * w * 0.52, h + Math.sin(a) * w * 0.4, 0, 1, 1, 1.3);
      }
      for (let i = 0; i < 4; i++) {
        p.at(B.cone(0.16, rng.range(0.6, 1.2), 5), c, rng.range(-w / 2, w / 2), h * rng.range(0.3, 0.9),
          rng.range(-0.3, 0.3), 1, 1, 1, 0, 0, rng.range(-1.2, 1.2));
      }
    },

    crystal(rng, p) {
      const h = rng.range(3, 10);
      const hues = [0xc24bff, 0x6a3bd6, 0xff4fd8, 0x3ad4ff];
      const c = rng.pick(hues);
      p.at(B.cone(rng.range(0.5, 1.1), h, 6), c, 0, h / 2, 0, 1, 1, 1,
        rng.range(-0.25, 0.25), rng.range(0, 3), rng.range(-0.25, 0.25));
      p.glowAt(B.cone(0.42, h * 0.85, 6), c, 0, h * 0.42, 0);
      for (let i = 0; i < rng.int(2, 4); i++) {
        const a = rng.range(0, U.TAU), hh = h * rng.range(0.25, 0.6), d = rng.range(0.6, 1.5);
        p.at(B.cone(0.3, hh, 6), c, Math.cos(a) * d, hh / 2, Math.sin(a) * d,
          1, 1, 1, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
        p.glowAt(B.cone(0.16, hh * 0.8, 5), 0xffffff, Math.cos(a) * d, hh / 2, Math.sin(a) * d,
          1, 1, 1, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      }
    },

    floatRock(rng, p) {
      const r = rng.range(1.6, 3.6);
      p.at(B.ico(1, 0), 0x2a1a3e, 0, 0, 0, r, r * 0.6, r, rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      p.at(B.cone(r * 0.85, r * 1.6, 6), 0x1c1029, 0, -r * 1.0, 0, 1, 1, 1, Math.PI, 0, 0);
      for (let i = 0; i < 3; i++) {
        p.glowAt(B.cone(0.22, rng.range(0.8, 1.8), 5), 0xc46bff,
          rng.range(-r * 0.6, r * 0.6), r * 0.4, rng.range(-r * 0.6, r * 0.6));
      }
      p.glowAt(B.ring(r * 1.1, r * 1.35), 0x9a4bff, 0, -r * 0.3, 0, 1, 1, 1, -Math.PI / 2, 0, 0);
    }
  };

  /* Build an InstancedMesh pair (solid + glow) for one prop kind. */
  function makePropField(kind, count, seed, tintColor) {
    const rng = U.makeRng(seed);
    const VARIANTS = Math.min(5, Math.max(2, Math.round(count / 40) || 2));
    const groups = [];
    for (let v = 0; v < VARIANTS; v++) {
      const p = new Parts();
      PROPS[kind](rng, p, tintColor);
      const solidGeo = p.solid.length ? mergeParts(p.solid) : null;
      const glowGeo = p.glow.length ? mergeParts(p.glow) : null;
      const per = Math.ceil(count / VARIANTS);
      const solid = solidGeo ? new THREE.InstancedMesh(solidGeo,
        B.mat(0xffffff, { vcolor: true, rough: 0.78, metal: 0.05, flat: true }), per) : null;
      const glow = glowGeo ? new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false
      }), per) : null;
      if (solid) { solid.castShadow = true; solid.receiveShadow = true; solid.count = 0; solid.frustumCulled = false; }
      if (glow) { glow.count = 0; glow.frustumCulled = false; }
      groups.push({ solid: solid, glow: glow, used: 0, cap: per });
    }
    return groups;
  }

  /* ================================================================
     KINGDOM ARCHITECTURE — one builder per building, level-aware.
     ================================================================ */
  function buildingPalette(pal) {
    return {
      hull: B.mat(0xa9bcd0, { rough: 0.6, metal: 0.3 }),
      hull2: B.mat(0x6d8099, { rough: 0.62, metal: 0.4 }),
      dark: B.mat(0x2a3243, { rough: 0.68, metal: 0.45 }),
      accent: B.mat(pal.trim, { emissive: pal.trim, emissiveI: 1.6, rough: 0.35, metal: 0.4 }),
      glass: B.mat(0x8fd8ff, { transparent: true, opacity: 0.35, rough: 0.05, metal: 0.3, emissive: 0x1a5a78, emissiveI: 0.6 }),
      glow: (o) => B.glowMat(pal.trim, o == null ? 0.7 : o),
      hot: B.mat(pal.accent, { emissive: pal.accent, emissiveI: 2.2 })
    };
  }

  function buildBuilding(id, level, pal) {
    const P = buildingPalette(pal);
    const g = B.grp();
    const lv = Math.max(1, level);
    const spin = [];
    const pulse = [];

    // Shared foundation so the settlement reads as one built environment.
    const padR = 3.2 + lv * 0.16;
    g.add(B.m(B.cyl(padR, padR + 0.35, 0.45, 12), P.dark, 0, 0.22, 0));
    const rim = B.decor(B.ring(padR * 0.93, padR), P.glow(0.55), 0, 0.46, 0);
    rim.rotation.x = -Math.PI / 2;
    g.add(rim);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * U.TAU;
      g.add(B.m(B.box(0.3, 0.7, 0.3), P.hull2, Math.cos(a) * padR * 0.86, 0.6, Math.sin(a) * padR * 0.86));
    }

    if (id === 'command') {
      const h = 5 + lv * 1.3;
      g.add(B.m(B.taperGeo(0.9, 1.9, h, 8), P.hull, 0, 0.45 + h / 2, 0));
      g.add(B.m(B.cyl(2.3, 2.0, 0.7, 8), P.hull2, 0, 0.45 + h * 0.52, 0));
      g.add(B.m(B.sphere(1.5, 14), P.glass, 0, 0.45 + h + 0.4, 0));
      g.add(B.m(B.cyl(0.14, 0.14, 2.4, 6), P.hull2, 0, 0.45 + h + 2.2, 0));
      const beacon = B.decor(B.sphere(0.34, 10), P.glow(0.95), 0, 0.45 + h + 3.4, 0);
      g.add(beacon); pulse.push(beacon);
      // one banner ring per command level: progress you can read at a glance
      for (let i = 0; i < lv; i++) {
        const r = B.decor(B.torus(1.5 + (i % 3) * 0.2, 0.05, 20), P.glow(0.6),
          0, 1.4 + i * (h * 0.85 / Math.max(1, lv)), 0);
        r.rotation.x = Math.PI / 2;
        g.add(r); spin.push({ o: r, s: (i % 2 ? 1 : -1) * 0.25 });
      }
      for (let s = -1; s <= 1; s += 2) {
        const bn = B.m(B.box(0.05, 2.6, 1.4), P.accent, s * 2.2, 0.45 + h * 0.4, 0);
        g.add(bn);
      }
    } else if (id === 'mine') {
      g.add(B.m(B.cyl(2.4, 2.7, 1.4, 10), P.hull2, 0, 1.1, 0));
      const drill = B.grp(0, 2.4, 0);
      drill.add(B.m(B.cyl(0.55, 0.85, 3.2, 8), P.dark, 0, 0, 0));
      drill.add(B.m(B.cone(0.8, 2.0, 8), P.hull, 0, -2.2, 0));
      for (let i = 0; i < 4; i++) {
        const t = B.m(B.box(0.12, 2.6, 0.5), P.hull2, 0, -1.2, 0);
        t.rotation.y = (i / 4) * U.TAU;
        t.position.set(Math.cos((i / 4) * U.TAU) * 0.8, -1.2, Math.sin((i / 4) * U.TAU) * 0.8);
        drill.add(t);
      }
      g.add(drill); spin.push({ o: drill, s: 1.6 });
      for (let i = 0; i < Math.min(lv, 6); i++) {
        const a = (i / 6) * U.TAU;
        const c = B.decor(B.ico(0.5, 0), P.glow(0.85), Math.cos(a) * 2.6, 1.9 + (i % 2) * 0.5, Math.sin(a) * 2.6);
        g.add(c); pulse.push(c);
      }
      g.add(B.m(B.box(4.6, 0.3, 1.2), P.dark, 0, 2.0, 2.6));
      g.add(B.m(B.box(1.6, 1.6, 1.6), P.hull, 2.6, 1.6, 2.6));
    } else if (id === 'refinery') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * U.TAU;
        const h = 3.2 + lv * 0.3 + i * 0.7;
        g.add(B.m(B.cyl(0.85, 0.95, h, 10), P.hull, Math.cos(a) * 1.6, 0.45 + h / 2, Math.sin(a) * 1.6));
        g.add(B.m(B.torus(0.92, 0.09, 14), P.dark, Math.cos(a) * 1.6, 0.45 + h * 0.7, Math.sin(a) * 1.6));
        g.children[g.children.length - 1].rotation.x = Math.PI / 2;
        const stack = B.decor(B.cone(0.42, 1.6, 8), P.glow(0.6), Math.cos(a) * 1.6, 0.45 + h + 0.9, Math.sin(a) * 1.6);
        g.add(stack); pulse.push(stack);
      }
      g.add(B.m(B.box(4.4, 0.4, 0.5), P.dark, 0, 3.4, 0));
      g.add(B.m(B.box(0.5, 0.4, 4.4), P.dark, 0, 3.4, 0));
      const vat = B.m(B.cyl(1.2, 1.2, 1.0, 12), P.glass, 0, 1.2, 0);
      g.add(vat);
      g.add(B.decor(B.cyl(1.05, 1.05, 0.8, 12), P.glow(0.5), 0, 1.2, 0));
    } else if (id === 'barracks') {
      g.add(B.m(B.box(6.4, 2.6, 4.4), P.hull, 0, 1.75, 0));
      g.add(B.m(B.box(6.8, 0.5, 4.8), P.hull2, 0, 3.1, 0));
      const roof = B.m(B.cyl(2.5, 2.5, 6.6, 3), P.hull2, 0, 3.6, 0);
      roof.rotation.z = Math.PI / 2; roof.scale.set(0.5, 1, 0.5);
      g.add(roof);
      g.add(B.m(B.box(1.6, 2.2, 0.3), P.dark, 0, 1.55, 2.25));
      g.add(B.decor(B.box(1.3, 0.12, 0.1), P.glow(0.9), 0, 2.5, 2.35));
      // rack of banners: one per barracks level
      for (let i = 0; i < lv; i++) {
        const x = -2.6 + i * (5.2 / Math.max(1, lv - 1 || 1));
        g.add(B.m(B.cyl(0.07, 0.07, 3.4, 6), P.dark, x, 2.2, -2.5));
        g.add(B.m(B.box(0.04, 1.5, 0.9), P.accent, x, 3.1, -2.05));
      }
      for (let s = -1; s <= 1; s += 2) {
        g.add(B.m(B.box(0.6, 3.2, 0.6), P.hull2, s * 3.4, 2.05, 2.3));
        const lamp = B.decor(B.sphere(0.22, 8), P.glow(0.9), s * 3.4, 3.8, 2.3);
        g.add(lamp); pulse.push(lamp);
      }
    } else if (id === 'lab') {
      g.add(B.m(B.cyl(2.6, 2.9, 2.0, 12), P.hull, 0, 1.45, 0));
      const dome = B.m(B.sphere(2.5, 18), P.glass, 0, 2.4, 0);
      dome.scale.y = 0.75;
      g.add(dome);
      const core = B.decor(B.ico(0.9, 1), P.glow(0.95), 0, 2.6, 0);
      g.add(core); pulse.push(core);
      for (let i = 0; i < 3; i++) {
        const r = B.decor(B.torus(1.4 + i * 0.35, 0.05, 24), P.glow(0.55), 0, 2.6, 0);
        r.rotation.x = i * 0.7; r.rotation.z = i * 0.5;
        g.add(r); spin.push({ o: r, s: 0.4 + i * 0.3, axis: i });
      }
      for (let i = 0; i < Math.min(lv, 8); i++) {
        const a = (i / 8) * U.TAU;
        g.add(B.m(B.cyl(0.18, 0.18, 1.6, 6), P.hull2, Math.cos(a) * 2.75, 1.2, Math.sin(a) * 2.75));
        g.add(B.decor(B.sphere(0.16, 8), P.glow(0.8), Math.cos(a) * 2.75, 2.1, Math.sin(a) * 2.75));
      }
    } else if (id === 'reactor') {
      g.add(B.m(B.cyl(2.8, 3.1, 1.2, 12), P.dark, 0, 1.05, 0));
      const core = B.grp(0, 3.2, 0);
      core.add(B.m(B.ico(1.5, 1), P.hull));
      const plasma = B.decor(B.sphere(1.15, 16), P.glow(0.9));
      core.add(plasma); pulse.push(plasma);
      g.add(core); spin.push({ o: core, s: 0.5 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * U.TAU + 0.4;
        const arm = B.m(B.box(0.4, 3.6, 0.4), P.hull2, Math.cos(a) * 2.2, 2.2, Math.sin(a) * 2.2);
        arm.rotation.z = -Math.cos(a) * 0.35; arm.rotation.x = Math.sin(a) * 0.35;
        g.add(arm);
        const tip = B.decor(B.sphere(0.3, 10), P.glow(0.95), Math.cos(a) * 2.9, 3.9, Math.sin(a) * 2.9);
        g.add(tip); pulse.push(tip);
      }
      for (let i = 0; i < Math.min(lv, 8); i++) {
        const r = B.decor(B.torus(1.9, 0.045, 24), P.glow(0.4), 0, 1.9 + i * 0.28, 0);
        r.rotation.x = Math.PI / 2;
        g.add(r);
      }
    } else if (id === 'hangar') {
      g.add(B.m(B.box(8.0, 0.5, 6.4), P.dark, 0, 0.6, 0));
      const arch = B.m(B.cyl(3.2, 3.2, 7.6, 12), P.hull, 0, 0.7, 0);
      arch.rotation.z = Math.PI / 2;
      arch.scale.set(1, 1, 0.78);
      g.add(arch);
      g.add(B.m(B.box(0.4, 4.6, 6.6), P.hull2, -3.9, 2.6, 0));
      const doorGlow = B.decor(B.box(0.1, 4.2, 6.0), P.glow(0.45), 3.85, 2.5, 0);
      g.add(doorGlow); pulse.push(doorGlow);
      for (let i = 0; i < 5; i++) {
        g.add(B.decor(B.box(0.5, 0.06, 0.5), P.glow(0.8), -3 + i * 1.5, 0.88, 3.0));
        g.add(B.decor(B.box(0.5, 0.06, 0.5), P.glow(0.8), -3 + i * 1.5, 0.88, -3.0));
      }
      // parked craft scale with hangar level
      if (lv >= 3) {
        const parked = SK.build.buildHoverBike({ body: 0xb8c4d4, trim: pal.trim });
        parked.group.position.set(0, 0.7, 0);
        parked.group.scale.setScalar(0.85);
        g.add(parked.group);
      }
      const tower = B.m(B.box(1.4, 3.4, 1.4), P.hull2, -4.6, 2.3, 3.4);
      g.add(tower);
      g.add(B.m(B.box(1.8, 0.9, 1.8), P.glass, -4.6, 4.3, 3.4));
    } else if (id === 'shield') {
      g.add(B.m(B.cyl(2.2, 2.6, 1.6, 10), P.hull2, 0, 1.25, 0));
      const emitter = B.grp(0, 3.0, 0);
      emitter.add(B.m(B.cone(1.1, 2.0, 8), P.hull, 0, 0, 0));
      emitter.add(B.decor(B.sphere(0.6, 12), P.glow(0.95), 0, 1.1, 0));
      g.add(emitter);
      const dome = new THREE.Mesh(B.sphere(5.5 + lv * 0.35, 20),
        new THREE.MeshBasicMaterial({
          color: B.SRGB(pal.trim), transparent: true, opacity: 0.1,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide
        }));
      dome.position.y = 1.0;
      g.add(dome); pulse.push(dome);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * U.TAU;
        g.add(B.m(B.box(0.45, 2.4, 0.45), P.dark, Math.cos(a) * 2.5, 1.6, Math.sin(a) * 2.5));
        const n = B.decor(B.sphere(0.28, 10), P.glow(0.9), Math.cos(a) * 2.5, 3.0, Math.sin(a) * 2.5);
        g.add(n); pulse.push(n);
      }
      const eq = B.decor(B.torus(5.5 + lv * 0.35, 0.07, 32), P.glow(0.5), 0, 1.0, 0);
      eq.rotation.x = Math.PI / 2;
      g.add(eq); spin.push({ o: eq, s: 0.3 });
    }

    g.traverse((o) => {
      if (o.isMesh && o.material && o.material.blending !== THREE.AdditiveBlending && !o.material.transparent) {
        o.castShadow = true; o.receiveShadow = true;
      }
    });

    return {
      group: g, spin: spin, pulse: pulse, t: Math.random() * 6,
      update(dt) {
        this.t += dt;
        for (let i = 0; i < spin.length; i++) {
          const s = spin[i];
          if (s.axis === 1) s.o.rotation.x += s.s * dt;
          else if (s.axis === 2) s.o.rotation.z += s.s * dt;
          else s.o.rotation.y += s.s * dt;
        }
        const k = 0.72 + Math.sin(this.t * 2.1) * 0.22;
        for (let i = 0; i < pulse.length; i++) {
          const o = pulse[i];
          if (o.material) o.material.opacity = (o.material.userData.base || (o.material.userData.base = o.material.opacity)) * k;
        }
      }
    };
  }

  /* ================================================================
     TERRITORY KEEP — the objective structure you attack or defend.
     ================================================================ */
  function buildKeep(pal, owned) {
    const P = buildingPalette(pal);
    const g = B.grp();
    const stone = B.mat(owned ? 0x9fb0c6 : 0x5c5364, { rough: 0.82, metal: 0.15 });
    const stone2 = B.mat(owned ? 0x74879f : 0x3e3746, { rough: 0.85, metal: 0.18 });

    g.add(B.m(B.cyl(6.2, 7.0, 1.2, 12), stone2, 0, 0.6, 0));
    g.add(B.m(B.cyl(4.6, 5.0, 4.4, 10), stone, 0, 3.4, 0));
    g.add(B.m(B.cyl(5.4, 5.0, 0.9, 10), stone2, 0, 5.9, 0));
    // crenellations
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * U.TAU;
      g.add(B.m(B.box(1.0, 1.1, 0.7), stone, Math.cos(a) * 5.0, 6.7, Math.sin(a) * 5.0, 1, 1, 1));
      g.children[g.children.length - 1].rotation.y = -a;
    }
    // central spire + faction banner
    g.add(B.m(B.taperGeo(0.9, 1.7, 6.0, 8), stone, 0, 9.0, 0));
    g.add(B.m(B.cone(2.0, 2.6, 8), P.accent, 0, 13.3, 0));
    const orb = B.decor(B.sphere(0.7, 14), P.glow(0.95), 0, 15.0, 0);
    g.add(orb);
    for (let s = -1; s <= 1; s += 2) {
      g.add(B.m(B.cyl(0.12, 0.12, 4.6, 6), stone2, s * 4.0, 8.2, 0));
      g.add(B.m(B.box(0.06, 2.4, 1.5), P.accent, s * 4.0, 9.4, 0.8));
    }
    // corner towers
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * U.TAU + Math.PI / 4;
      const x = Math.cos(a) * 6.0, z = Math.sin(a) * 6.0;
      g.add(B.m(B.cyl(1.1, 1.3, 5.6, 8), stone, x, 3.0, z));
      g.add(B.m(B.cone(1.6, 1.8, 8), P.accent, x, 6.6, z));
      g.add(B.decor(B.sphere(0.22, 8), P.glow(0.9), x, 7.7, z));
    }
    const ringGlow = B.decor(B.ring(7.2, 8.0), P.glow(0.55), 0, 0.08, 0);
    ringGlow.rotation.x = -Math.PI / 2;
    g.add(ringGlow);

    g.traverse((o) => {
      if (o.isMesh && o.material && o.material.blending !== THREE.AdditiveBlending) {
        o.castShadow = true; o.receiveShadow = true;
      }
    });
    return { group: g, orb: orb, ring: ringGlow, t: 0,
      update(dt) { this.t += dt; orb.scale.setScalar(1 + Math.sin(this.t * 2.4) * 0.14);
        ringGlow.material.opacity = 0.35 + Math.sin(this.t * 1.6) * 0.18; } };
  }


  /* ================================================================
     CITADEL — a world's final objective. Deliberately larger and
     darker than an ordinary keep so it reads as the end of a planet.
     ================================================================ */
  function buildCitadel(pal, conquered) {
    const P = buildingPalette(conquered ? { trim: 0x35e0ff, accent: 0xffb23f } : pal);
    const g = B.grp();
    const stone = B.mat(conquered ? 0x9fb0c6 : 0x3a3142, { rough: 0.85, metal: 0.15 });
    const stone2 = B.mat(conquered ? 0x74879f : 0x261f2e, { rough: 0.88, metal: 0.18 });
    const trimM = B.mat(conquered ? 0x35e0ff : pal.trim,
      { emissive: conquered ? 0x35e0ff : pal.trim, emissiveI: 1.7, rough: 0.35 });

    // stepped foundation
    g.add(B.m(B.cyl(17, 19, 1.8, 8), stone2, 0, 0.9, 0));
    g.add(B.m(B.cyl(14, 15.5, 1.6, 8), stone, 0, 2.5, 0));
    g.add(B.m(B.cyl(11, 12, 1.4, 8), stone2, 0, 3.9, 0));

    // outer wall with gate
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * U.TAU;
      if (i === 0) continue;                       // leave a gate
      const w = B.m(B.box(11, 7.5, 1.8), stone, Math.cos(a) * 16, 5.4, Math.sin(a) * 16);
      w.rotation.y = -a + Math.PI / 2;
      g.add(w);
      for (let k = -1; k <= 1; k++) {
        const ca = a + k * 0.14;
        g.add(B.m(B.box(1.7, 1.8, 1.9), stone2, Math.cos(ca) * 16, 10, Math.sin(ca) * 16));
      }
    }
    // gate pillars
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      const a = sgn * 0.42;
      g.add(B.m(B.cyl(2.0, 2.4, 12, 8), stone, Math.cos(a) * 16, 7, Math.sin(a) * 16));
      g.add(B.decor(B.sphere(0.8, 12), P.glow(0.9), Math.cos(a) * 16, 13.6, Math.sin(a) * 16));
    }

    // corner towers
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * U.TAU + Math.PI / 4;
      const x = Math.cos(a) * 15.5, z = Math.sin(a) * 15.5;
      g.add(B.m(B.cyl(2.6, 3.1, 17, 9), stone, x, 9, z));
      g.add(B.m(B.cyl(3.5, 3.0, 1.4, 9), stone2, x, 17.8, z));
      g.add(B.m(B.cone(3.4, 5.2, 9), trimM, x, 21, z));
      const orb = B.decor(B.sphere(0.6, 12), P.glow(0.9), x, 24.2, z);
      g.add(orb);
    }

    // the throne spire
    g.add(B.m(B.cyl(6.5, 8, 16, 10), stone, 0, 12, 0));
    g.add(B.m(B.cyl(8.4, 7.5, 1.6, 10), stone2, 0, 20.5, 0));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * U.TAU;
      g.add(B.m(B.box(1.5, 2.2, 1.2), stone, Math.cos(a) * 7.8, 22.4, Math.sin(a) * 7.8));
    }
    g.add(B.m(B.taperGeo(1.6, 4.4, 14, 8), stone, 0, 29, 0));
    g.add(B.m(B.cone(3.6, 6, 8), trimM, 0, 38, 0));
    const crown = B.decor(B.ico(1.6, 1), P.glow(0.95), 0, 42.5, 0);
    g.add(crown);
    const halo = B.decor(B.torus(4.2, 0.16, 28), P.glow(0.6), 0, 40, 0);
    halo.rotation.x = Math.PI / 2;
    g.add(halo);

    // faction banners down the spire
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * U.TAU + 0.4;
      g.add(B.m(B.box(0.16, 7, 3.4), trimM, Math.cos(a) * 6.6, 16, Math.sin(a) * 6.6));
      g.children[g.children.length - 1].rotation.y = -a;
    }

    const ground = B.decor(B.ring(18.5, 20.5), P.glow(0.45), 0, 0.12, 0);
    ground.rotation.x = -Math.PI / 2;
    g.add(ground);

    g.traverse((o) => {
      if (o.isMesh && o.material && o.material.blending !== THREE.AdditiveBlending) {
        o.castShadow = true; o.receiveShadow = true;
      }
    });
    return {
      group: g, t: 0,
      update(dt) {
        this.t += dt;
        crown.scale.setScalar(1 + Math.sin(this.t * 1.8) * 0.12);
        halo.rotation.z += dt * 0.35;
        ground.material.opacity = 0.3 + Math.sin(this.t * 1.3) * 0.15;
      }
    };
  }

  SK.props = { PROPS, Parts, mergeParts, makePropField, buildBuilding, buildKeep, buildCitadel, buildingPalette };
})(window.SK);
