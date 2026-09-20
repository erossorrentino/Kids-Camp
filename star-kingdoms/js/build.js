/* Star Kingdoms — procedural model construction.
   Everything visible in the game is generated here from primitives:
   no external meshes, no texture downloads. Geometry and material
   instances are cached aggressively because a battlefield can hold
   thirty characters at once. */
(function (SK) {
  'use strict';
  const U = SK.util;

  /* ============================================================ caches */
  const geoCache = {};
  const matCache = {};

  function G(key, make) {
    if (!geoCache[key]) geoCache[key] = make();
    return geoCache[key];
  }

  /* Stylized surface: low roughness bump, slight sheen, optional glow. */
  // r128 predates automatic colour management, so convert every authored
  // sRGB hex into linear space by hand. Doing it in one place keeps merged
  // vertex colours and plain material colours agreeing with each other.
  function SRGB(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  function mat(color, opt) {
    opt = opt || {};
    const key = [color, opt.rough, opt.metal, opt.flat, opt.emissive, opt.emissiveI,
      opt.transparent, opt.opacity, opt.side, opt.depthWrite, opt.vcolor].join('|');
    if (matCache[key]) return matCache[key];
    const m = new THREE.MeshStandardMaterial({
      color: SRGB(color),
      vertexColors: !!opt.vcolor,
      roughness: opt.rough != null ? opt.rough : 0.62,
      metalness: opt.metal != null ? opt.metal : 0.12,
      flatShading: !!opt.flat,
      transparent: !!opt.transparent,
      opacity: opt.opacity != null ? opt.opacity : 1,
      side: opt.side || THREE.FrontSide
    });
    if (opt.emissive != null) {
      m.emissive = SRGB(opt.emissive);
      m.emissiveIntensity = opt.emissiveI != null ? opt.emissiveI : 1.0;
    }
    if (opt.depthWrite === false) m.depthWrite = false;
    matCache[key] = m;
    return m;
  }

  /* Unlit additive glow — the cheap trick that sells every energy effect. */
  function glowMat(color, opacity) {
    const key = 'glow' + color + '|' + opacity;
    if (matCache[key]) return matCache[key];
    const m = new THREE.MeshBasicMaterial({
      color: SRGB(color), transparent: true, opacity: opacity == null ? 0.85 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    matCache[key] = m;
    return m;
  }

  /* ======================================================== geo helpers */
  // r128 has no CapsuleGeometry, so revolve a capsule profile instead.
  function capsuleGeo(r, h, seg, cap) {
    seg = seg || 12; cap = cap || 6;
    const pts = [];
    for (let i = 0; i <= cap; i++) {
      const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * r, -h / 2 + Math.sin(a) * r));
    }
    for (let i = 0; i <= cap; i++) {
      const a = (i / cap) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * r, h / 2 + Math.sin(a) * r));
    }
    return new THREE.LatheGeometry(pts, seg);
  }
  const capsule = (r, h) => G('cap' + r + '_' + h, () => capsuleGeo(r, h));

  // A capsule that tapers, for limbs and torsos with a bit of silhouette.
  function taperGeo(rTop, rBot, h, seg) {
    seg = seg || 12;
    const pts = [];
    const cap = 5;
    for (let i = 0; i <= cap; i++) {
      const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * rBot, -h / 2 + Math.sin(a) * rBot));
    }
    for (let i = 0; i <= cap; i++) {
      const a = (i / cap) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * rTop, h / 2 + Math.sin(a) * rTop));
    }
    return new THREE.LatheGeometry(pts, seg);
  }

  const box = (w, h, d) => G('box' + w + '_' + h + '_' + d, () => new THREE.BoxGeometry(w, h, d));
  const sphere = (r, s) => G('sph' + r + '_' + (s || 14), () => new THREE.SphereGeometry(r, s || 14, (s || 14) - 4));
  // Partial sphere: how a helmet gets a face opening and a visor gets a curve.
  const sphereSeg = (r, p0, pLen, t0, tLen, w, h) =>
    G('sps' + [r, p0, pLen, t0, tLen].map((v) => v.toFixed(3)).join('_'),
      () => new THREE.SphereGeometry(r, w || 18, h || 12, p0, pLen, t0, tLen));
  const cone = (r, h, s) => G('cone' + r + '_' + h + '_' + (s || 12), () => new THREE.ConeGeometry(r, h, s || 12));
  const cyl = (rt, rb, h, s) => G('cyl' + rt + '_' + rb + '_' + h + '_' + (s || 12),
    () => new THREE.CylinderGeometry(rt, rb, h, s || 12));
  const ico = (r, d) => G('ico' + r + '_' + (d || 0), () => new THREE.IcosahedronGeometry(r, d || 0));
  const torus = (r, t, s) => G('tor' + r + '_' + t, () => new THREE.TorusGeometry(r, t, 8, s || 20));
  const ring = (ri, ro) => G('ring' + ri + '_' + ro, () => new THREE.RingGeometry(ri, ro, 28));
  const plane = (w, h) => G('pln' + w + '_' + h, () => new THREE.PlaneGeometry(w, h));

  function m(geo, material, x, y, z) {
    const mesh = new THREE.Mesh(geo, material);
    if (x !== undefined) mesh.position.set(x, y || 0, z || 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  function decor(geo, material, x, y, z) { // glow bits shouldn't cast shadows
    const mesh = new THREE.Mesh(geo, material);
    if (x !== undefined) mesh.position.set(x, y || 0, z || 0);
    return mesh;
  }
  function grp(x, y, z) {
    const g = new THREE.Group();
    if (x !== undefined) g.position.set(x, y || 0, z || 0);
    return g;
  }

  /* ================================================== geometry merging */
  /* r128 core ships no BufferGeometryUtils, so bake transformed primitives
     into one vertex-coloured buffer by hand. Characters use this to collapse
     ~45 little meshes into a handful, which is the difference between a
     crowded battlefield running and crawling. */
  function mergeParts(parts) {
    const baked = [];
    let total = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      g.applyMatrix4(p.matrix);
      if (!g.attributes.normal) g.computeVertexNormals();
      const n = g.attributes.position.count;
      baked.push({ g: g, n: n, c: SRGB(p.color) });
      total += n;
    }
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    let o = 0;
    for (let i = 0; i < baked.length; i++) {
      const b = baked[i];
      pos.set(b.g.attributes.position.array, o * 3);
      nor.set(b.g.attributes.normal.array, o * 3);
      for (let k = 0; k < b.n; k++) {
        col[(o + k) * 3] = b.c.r; col[(o + k) * 3 + 1] = b.c.g; col[(o + k) * 3 + 2] = b.c.b;
      }
      o += b.n;
      b.g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  const _mv = new THREE.Vector3(), _mq = new THREE.Quaternion();
  const _me = new THREE.Euler(), _ms = new THREE.Vector3();

  /* Accumulates primitives for one rigid piece of a rig, then bakes them
     into at most two meshes: opaque body and additive trim. */
  function Rig() { this.solid = []; this.glow = []; }
  Rig.prototype.put = function (list, geo, color, x, y, z, sx, sy, sz, rx, ry, rz) {
    _me.set(rx || 0, ry || 0, rz || 0);
    _mq.setFromEuler(_me);
    _mv.set(x || 0, y || 0, z || 0);
    const a = sx == null ? 1 : sx;
    _ms.set(a, sy == null ? a : sy, sz == null ? a : sz);
    list.push({ geo: geo, matrix: new THREE.Matrix4().compose(_mv, _mq, _ms), color: color });
    return this;
  };
  Rig.prototype.add = function (geo, color, x, y, z, sx, sy, sz, rx, ry, rz) {
    return this.put(this.solid, geo, color, x, y, z, sx, sy, sz, rx, ry, rz);
  };
  Rig.prototype.lit = function (geo, color, x, y, z, sx, sy, sz, rx, ry, rz) {
    return this.put(this.glow, geo, color, x, y, z, sx, sy, sz, rx, ry, rz);
  };
  // Bakes into `group`; returns the group for chaining.
  Rig.prototype.bake = function (group, castShadow) {
    if (this.solid.length) {
      const mesh = new THREE.Mesh(mergeParts(this.solid), charSolidMat());
      mesh.castShadow = castShadow !== false;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (this.glow.length) {
      const g = new THREE.Mesh(mergeParts(this.glow), charGlowMat());
      g.renderOrder = 5;
      group.add(g);
    }
    return group;
  };

  let _charSolid = null, _charGlow = null;
  function charSolidMat() {
    if (!_charSolid) {
      _charSolid = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.62, metalness: 0.18
      });
    }
    return _charSolid;
  }
  function charGlowMat() {
    if (!_charGlow) {
      // depthTest keeps trim behind nearer geometry; no depthWrite so it
      // layers cleanly over the body it sits on.
      _charGlow = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
    }
    return _charGlow;
  }

  /* ==================================================================
     WEAPONS — held in the right hand, sized for chunky proportions.
     Each one bakes down to one opaque mesh plus one glowing mesh.
     ================================================================== */
  const DARK = 0x2a2f3d, MID = 0x4a5266;

  function buildWeapon(kind, pal) {
    const g = grp();
    const r = new Rig();
    const hot = pal.trim, acc = pal.accent;
    const PI2 = Math.PI / 2;

    if (kind === 'rifle') {
      r.add(box(0.13, 0.15, 0.62), DARK, 0, 0, 0.1);
      r.add(cyl(0.045, 0.045, 0.5, 8), MID, 0, 0.03, 0.46, 1, 1, 1, PI2, 0, 0);
      r.add(box(0.09, 0.2, 0.12), DARK, 0, -0.13, -0.05);
      r.add(box(0.1, 0.06, 0.2), DARK, 0, 0.11, -0.02);
      r.lit(cyl(0.06, 0.06, 0.1, 8), hot, 0, 0.03, 0.3, 1, 1, 1, PI2, 0, 0);
      r.lit(sphere(0.05, 8), acc, 0, 0.03, 0.7);
    } else if (kind === 'blade') {
      r.add(cyl(0.05, 0.06, 0.24, 8), DARK, 0, 0, 0);
      r.add(box(0.2, 0.05, 0.05), MID, 0, 0.14, 0);
      r.lit(box(0.07, 0.86, 0.02), hot, 0, 0.58, 0);
      r.lit(box(0.14, 0.9, 0.012), acc, 0, 0.58, 0);
    } else if (kind === 'launcher') {
      r.add(cyl(0.12, 0.13, 0.9, 10), DARK, 0, 0, 0.2, 1, 1, 1, PI2, 0, 0);
      r.add(cone(0.17, 0.22, 10), MID, 0, 0, 0.76, 1, 1, 1, PI2, 0, 0);
      r.add(box(0.08, 0.18, 0.12), DARK, 0, -0.15, 0);
      r.lit(torus(0.14, 0.02, 14), hot, 0, 0, 0.3, 1, 1, 1, PI2, 0, 0);
    } else if (kind === 'longrifle') {
      r.add(box(0.11, 0.13, 0.5), DARK, 0, 0, 0);
      r.add(cyl(0.035, 0.04, 1.15, 8), MID, 0, 0.02, 0.8, 1, 1, 1, PI2, 0, 0);
      r.add(box(0.08, 0.1, 0.24), DARK, 0, 0.14, 0.05);
      r.add(box(0.09, 0.22, 0.12), DARK, 0, -0.14, -0.16);
      r.lit(cyl(0.055, 0.055, 0.14, 8), hot, 0, 0.02, 1.3, 1, 1, 1, PI2, 0, 0);
    } else if (kind === 'staff') {
      r.add(cyl(0.035, 0.045, 1.5, 8), MID, 0, 0.35, 0);
      r.add(torus(0.12, 0.022, 12), MID, 0, 1.18, 0, 1, 1, 1, PI2, 0, 0);
      r.lit(ico(0.17, 0), hot, 0, 1.18, 0);
      r.lit(ico(0.27, 0), acc, 0, 1.18, 0);
    } else if (kind === 'cannon') {
      r.add(box(0.28, 0.3, 0.9), DARK, 0, 0, 0.2);
      r.add(cyl(0.11, 0.13, 0.9, 10), MID, -0.09, 0, 0.7, 1, 1, 1, PI2, 0, 0);
      r.add(cyl(0.11, 0.13, 0.9, 10), MID, 0.09, 0, 0.7, 1, 1, 1, PI2, 0, 0);
      r.lit(sphere(0.09, 8), hot, -0.09, 0, 1.16);
      r.lit(sphere(0.09, 8), hot, 0.09, 0, 1.16);
      r.lit(box(0.3, 0.06, 0.2), acc, 0, 0.18, 0.1);
    } else if (kind === 'beamer') {
      r.add(box(0.16, 0.2, 0.3), DARK, 0, 0, 0.05);
      r.add(torus(0.16, 0.03, 16), MID, 0, 0, 0.26, 1, 1, 1, PI2, 0, 0);
      r.add(box(0.08, 0.18, 0.1), DARK, 0, -0.14, -0.04);
      r.lit(ring(0.05, 0.15), 0x6effc0, 0, 0, 0.27);
    }
    return r.bake(g);
  }

  function buildShield(pal) {
    const g = grp();
    const r = new Rig();
    const dk = new THREE.Color(pal.suit).multiplyScalar(0.55).getHex();
    const lt = pal.helmet != null ? pal.helmet
      : new THREE.Color(pal.suit).lerp(new THREE.Color(0xf2f7ff), 0.5).getHex();
    // Kite-ish slab built from stacked plates so it curves in silhouette.
    r.add(box(0.66, 0.5, 0.11), lt, 0, 0.26, 0);
    r.add(box(0.6, 0.42, 0.1), lt, 0, -0.14, 0.015);
    r.add(box(0.42, 0.3, 0.09), lt, 0, -0.47, 0.035);
    r.add(box(0.2, 0.2, 0.08), lt, 0, -0.66, 0.05, 1, 1, 1, 0, 0, Math.PI / 4);
    r.add(box(0.52, 0.9, 0.05), dk, 0, 0.0, -0.06);
    r.add(cyl(0.05, 0.05, 0.3, 6), DARK, 0, 0, -0.16, 1, 1, 1, Math.PI / 2, 0, 0);
    r.lit(box(0.46, 0.05, 0.03), pal.trim, 0, 0.32, 0.08);
    r.add(box(0.3, 0.22, 0.03), new THREE.Color(pal.suit).multiplyScalar(0.8).getHex(), 0, 0.14, 0.08);
    r.lit(box(0.06, 0.62, 0.03), pal.trim, 0, -0.06, 0.08);
    return r.bake(g);
  }

  /* ==================================================================
     CHARACTER — chunky mobile-strategy proportions: head about a third
     of total height, oversized gloves and boots, tiny waist. Rigid
     pieces are baked into single meshes; only the joints are real
     Object3Ds, so the walk cycle stays pure rotation.
     ================================================================== */
  function buildCharacter(opt) {
    opt = opt || {};
    const pal = opt.pal;
    const scale = opt.scale || 1;
    const heavy = !!opt.heavy;
    const tiny = !!opt.tiny;
    const PI2 = Math.PI / 2;

    const suit = pal.suit;
    const suitDark = new THREE.Color(pal.suit).multiplyScalar(0.6).getHex();
    const suitLight = new THREE.Color(pal.suit).lerp(new THREE.Color(0xffffff), 0.22).getHex();
    const skin = pal.skin;
    const skinDark = new THREE.Color(pal.skin).multiplyScalar(0.72).getHex();
    const helmetC = pal.helmet != null ? pal.helmet
      : new THREE.Color(pal.suit).lerp(new THREE.Color(0xdae6f2), 0.5).getHex();
    const trim = pal.trim;
    const rubber = 0x1a1d26;

    const root = grp();
    const body = grp(); root.add(body);
    const hipH = heavy ? 0.78 : tiny ? 0.34 : 0.66;

    /* ---- legs ---- */
    const legs = [];
    for (let s = -1; s <= 1; s += 2) {
      const hip = grp(s * (heavy ? 0.22 : 0.16), hipH, 0);
      const r = new Rig();
      r.add(taperGeo(0.115, 0.095, hipH * 0.52, 10), suit, 0, -hipH * 0.29, 0);
      r.add(box(0.23, 0.17, 0.34), rubber, 0, -hipH * 0.62, 0.05);
      r.add(box(0.1, 0.12, 0.1), suitDark, 0, -hipH * 0.48, -0.08);
      r.lit(box(0.17, 0.035, 0.05), trim, 0, -hipH * 0.55, 0.2);
      r.bake(hip);
      body.add(hip);
      legs.push(hip);
    }

    /* ---- torso ---- */
    const torsoH = heavy ? 0.78 : tiny ? 0.3 : 0.62;
    const chest = grp(0, hipH + torsoH * 0.46, 0);
    body.add(chest);
    const torsoR = heavy ? 0.42 : tiny ? 0.24 : 0.33;
    {
      const r = new Rig();
      r.add(taperGeo(torsoR, torsoR * 0.72, torsoH * 0.72, 14), suit, 0, 0, 0);
      r.add(box(torsoR * 1.35, torsoH * 0.46, 0.14), suitDark, 0, 0.04, torsoR * 0.72);
      r.add(cyl(torsoR * 0.78, torsoR * 0.78, 0.12, 12), rubber, 0, -torsoH * 0.38, 0);
      r.add(box(torsoR * 0.5, torsoH * 0.3, 0.1), suitLight, 0, 0.02, -torsoR * 0.6);
      r.lit(box(torsoR * 1.0, 0.07, 0.04), trim, 0, 0.16, torsoR * 0.8);
      r.lit(box(0.08, 0.26, 0.04), trim, torsoR * 0.42, -0.02, torsoR * 0.8);
      r.bake(chest);
    }

    /* ---- backpack + thrusters ---- */
    const pack = grp(0, 0.02, -torsoR * 0.85);
    chest.add(pack);
    {
      const r = new Rig();
      r.add(box(torsoR * 1.3, torsoH * 0.62, 0.22), suitDark, 0, 0, 0);
      for (let s = -1; s <= 1; s += 2) {
        r.add(cyl(0.085, 0.085, 0.18, 8), suitDark, s * torsoR * 0.42, -torsoH * 0.2, -0.06);
      }
      r.lit(box(0.1, 0.06, 0.03), trim, 0, torsoH * 0.22, -0.12);
      r.bake(pack);
    }
    const thrusters = [];
    const thrustMat = glowMat(pal.trim, 0.9).clone();
    for (let s = -1; s <= 1; s += 2) {
      const t = new THREE.Mesh(cone(0.075, 0.2, 8), thrustMat);
      t.position.set(s * torsoR * 0.42, -torsoH * 0.36, -0.06);
      t.rotation.x = Math.PI;
      pack.add(t);
      thrusters.push(t);
    }

    /* ---- arms ---- */
    const arms = [];
    const armLen = heavy ? 0.62 : tiny ? 0.26 : 0.5;
    for (let s = -1; s <= 1; s += 2) {
      const sh = grp(s * (torsoR + 0.1), torsoH * 0.26, 0);
      chest.add(sh);
      const rp = new Rig();
      const pr = heavy ? 0.24 : 0.19;
      rp.add(sphere(pr, 12), suitDark, 0, 0.04, 0, 1.1, 0.85, 1.05);
      rp.add(cyl(pr * 0.95, pr * 1.05, pr * 0.34, 12), suit, 0, 0.11, 0, 1, 1, 1);
      rp.lit(torus(pr * 0.98, 0.022, 14), trim, 0, 0.145, 0, 1, 1, 1, Math.PI / 2, 0, 0);
      rp.bake(sh);

      const arm = grp(0, -0.02, 0);
      sh.add(arm);
      const ra = new Rig();
      ra.add(taperGeo(0.085, 0.07, armLen * 0.66, 10), suit, 0, -armLen * 0.42, 0);
      ra.add(sphere(heavy ? 0.16 : 0.13, 12), suitDark, 0, -armLen * 0.86, 0.02, 1, 0.95, 1.15);
      ra.lit(torus(0.09, 0.02, 10), trim, 0, -armLen * 0.7, 0, 1, 1, 1, PI2, 0, 0);
      ra.bake(arm);

      const hand = grp(0, -armLen * 0.93, 0.07);
      arm.add(hand);
      arms.push({ shoulder: sh, arm: arm, hand: hand, side: s });
    }

    /* ---- head ---- */
    const neck = grp(0, torsoH * 0.5, 0);
    chest.add(neck);
    const head = grp(0, heavy ? 0.34 : tiny ? 0.2 : 0.3, 0);
    neck.add(head);
    const hr = heavy ? 0.33 : tiny ? 0.2 : 0.3;
    const FRONT = Math.PI / 2;            // +Z is the direction the face looks
    const OPEN = 0.80;                    // half-width of the face opening
    {
      const r = new Rig();
      // collar, so the head sits on something rather than floating
      r.add(cyl(hr * 0.62, hr * 0.74, hr * 0.28, 12), suitDark, 0, -hr * 0.92, 0);

      // face
      r.add(sphere(hr, 18), skin, 0, 0, 0, 1, 1.06, 0.99);
      for (let s = -1; s <= 1; s += 2) {
        r.add(sphere(hr * 0.19, 10), 0x121620, s * hr * 0.34, hr * 0.06, hr * 0.84, 1, 1.22, 0.55);
        r.lit(sphere(hr * 0.052, 6), 0xffffff, s * hr * 0.39, hr * 0.16, hr * 0.94);
        // brow, angled slightly inward — the whole expression lives here
        r.add(box(hr * 0.3, hr * 0.075, hr * 0.1), skinDark,
          s * hr * 0.34, hr * 0.3, hr * 0.88, 1, 1, 1, 0, 0, s * 0.22);
      }
      r.add(box(hr * 0.26, hr * 0.06, hr * 0.08), skinDark, 0, -hr * 0.34, hr * 0.92);

      // helmet: a crown cap plus a back-and-sides band, leaving the face clear
      r.add(sphereSeg(hr * 1.14, 0, U.TAU, 0, Math.PI * 0.40), helmetC, 0, 0, 0);
      r.add(sphereSeg(hr * 1.14, FRONT + OPEN, U.TAU - OPEN * 2, Math.PI * 0.38, Math.PI * 0.55),
        helmetC, 0, 0, 0);
      // rim around the opening reads as the helmet edge from every angle
      r.add(torus(hr * 1.1, hr * 0.075, 18), suitDark, 0, hr * 0.28, 0, 1, 1, 1, 0.42, 0, 0);
      // jaw guard and side pods
      r.add(box(hr * 0.72, hr * 0.26, hr * 0.34), suitDark, 0, -hr * 0.72, hr * 0.62, 1, 1, 1, 0.35, 0, 0);
      for (let s = -1; s <= 1; s += 2) {
        r.add(cyl(hr * 0.26, hr * 0.28, hr * 0.26, 10), suitDark,
          s * hr * 1.06, hr * 0.02, 0, 1, 1, 1, 0, 0, Math.PI / 2);
        r.lit(cyl(hr * 0.16, hr * 0.16, hr * 0.05, 10), trim,
          s * hr * 1.21, hr * 0.02, 0, 1, 1, 1, 0, 0, Math.PI / 2);
      }
      // antenna
      r.add(cyl(0.015, 0.02, hr * 0.9, 5), suitDark, hr * 0.85, hr * 1.2, -hr * 0.2, 1, 1, 1, 0, 0, -0.35);
      r.lit(sphere(0.05, 8), pal.accent, hr * 1.16, hr * 1.62, -hr * 0.2);
      r.lit(box(hr * 0.5, hr * 0.06, hr * 0.04), trim, 0, hr * 0.62, hr * 0.95, 1, 1, 1, -0.45, 0, 0);

      /* faction crest */
      if (opt.crest === 'horns') {
        for (let s = -1; s <= 1; s += 2) {
          r.add(cone(0.075, 0.36, 7), pal.accent, s * hr * 0.92, hr * 0.7, -hr * 0.1,
            1, 1, 1, -0.3, 0, -s * 0.8);
        }
      } else if (opt.crest === 'fin') {
        r.add(box(0.055, hr * 0.8, hr * 1.35), pal.accent, 0, hr * 1.12, -hr * 0.18);
        r.lit(box(0.03, hr * 0.5, hr * 0.9), trim, 0, hr * 1.28, -hr * 0.18);
      } else if (opt.crest === 'halo') {
        r.lit(torus(hr * 1.46, 0.035, 20), pal.accent, 0, hr * 1.24, 0, 1, 1, 1, Math.PI / 2 + 0.25, 0, 0);
      }
      r.bake(head);
    }
    // Visor: a curved pane across the face opening only, so the face reads
    // through it instead of the whole head going milky.
    const visor = new THREE.Mesh(
      sphereSeg(hr * 1.09, FRONT - OPEN * 0.95, OPEN * 1.9, Math.PI * 0.31, Math.PI * 0.30, 14, 6),
      mat(pal.visor, {
        emissive: pal.visor, emissiveI: 0.25, rough: 0.04, metal: 0.1,
        transparent: true, opacity: 0.17, side: THREE.DoubleSide
      }));
    visor.renderOrder = 4;
    head.add(visor);

    /* ---- cape ---- */
    let cape = null;
    if (opt.cape) {
      cape = grp(0, torsoH * 0.34, -torsoR * 0.92);
      const cr = new Rig();
      // hanging panel that narrows toward the hem, plus a collar clasp
      cr.add(box(torsoR * 2.45, torsoH * 1.5, 0.05), suitDark, 0, -torsoH * 0.72, 0);
      cr.add(box(torsoR * 1.75, torsoH * 0.62, 0.05), suitDark, 0, -torsoH * 1.72, 0.01);
      cr.add(box(torsoR * 0.7, torsoH * 0.34, 0.05), suitDark, 0, -torsoH * 2.16, 0.02);
      cr.add(cyl(torsoR * 0.7, torsoR * 0.7, 0.1, 10), suitDark, 0, 0.03, 0, 1, 1, 0.45);
      cr.lit(box(torsoR * 2.2, 0.05, 0.02), pal.accent, 0, -torsoH * 0.05, -0.04);
      cr.lit(box(0.05, torsoH * 1.4, 0.02), pal.trim, 0, -torsoH * 0.72, -0.04);
      cr.bake(cape);
      chest.add(cape);
    }

    /* ---- gear in hands ---- */
    let weapon = null, shield = null;
    if (opt.weapon) {
      weapon = buildWeapon(opt.weapon, pal);
      weapon.rotation.x = (opt.weapon === 'blade' || opt.weapon === 'staff') ? -0.15 : 1.35;
      arms[1].hand.add(weapon);
    }
    if (opt.shield) {
      shield = buildShield(pal);
      shield.rotation.y = 0.25;
      shield.position.set(-0.05, -0.1, 0.2);
      arms[0].hand.add(shield);
    }

    root.scale.setScalar(scale);

    /* ---------------------------------------------------- animation */
    const api = {
      group: root, body, chest, head, neck, legs, arms, weapon, shield, cape, thrusters, pal,
      visor: visor,
      phase: Math.random() * 10,
      flash: 0,
      dead: false,
      fall: 0,
      setFlash(v) { api.flash = v; },
      update(dt, st) {
        st = st || {};
        api.phase += dt;
        const t = api.phase;

        if (api.dead) {
          api.fall = Math.min(1, api.fall + dt * 3.2);
          const e = 1 - Math.pow(1 - api.fall, 3);
          root.rotation.x = -e * 1.45;
          body.position.y = -e * 0.28;
          return;
        }

        const sp = st.speed || 0;
        const moving = sp > 0.25;
        const cyc = moving ? t * (3.2 + sp * 0.55) : t * 1.4;
        const swing = moving ? Math.min(0.95, 0.24 + sp * 0.085) : 0.06;

        legs[0].rotation.x = Math.sin(cyc) * swing;
        legs[1].rotation.x = -Math.sin(cyc) * swing;
        legs[0].rotation.z = moving ? 0 : Math.sin(t * 1.1) * 0.015;

        // vertical bob and forward lean sell the weight
        body.position.y = moving ? Math.abs(Math.sin(cyc)) * 0.055 * (0.5 + sp * 0.06)
          : Math.sin(t * 1.4) * 0.016;
        body.rotation.x = U.damp(body.rotation.x, moving ? -0.06 - sp * 0.012 : 0, 6, dt);
        chest.rotation.y = U.damp(chest.rotation.y, moving ? Math.sin(cyc) * 0.07 : 0, 8, dt);

        const atk = st.attack || 0;
        for (let i = 0; i < 2; i++) {
          const a = arms[i];
          let target;
          if (i === 1 && (st.aiming || atk > 0)) {
            target = -1.15 - atk * 0.5;
            a.shoulder.rotation.z = U.damp(a.shoulder.rotation.z, -0.42, 10, dt);
          } else if (i === 0 && opt.shield) {
            target = -0.95;
            a.shoulder.rotation.z = U.damp(a.shoulder.rotation.z, 0.35, 10, dt);
          } else {
            target = moving ? -Math.sin(cyc) * (swing * 0.85) * (i === 0 ? 1 : -1) : Math.sin(t * 1.4) * 0.05;
            a.shoulder.rotation.z = U.damp(a.shoulder.rotation.z, a.side * -0.1, 8, dt);
          }
          a.arm.rotation.x = U.damp(a.arm.rotation.x, target, 12, dt);
        }
        if (opt.weapon === 'blade' && atk > 0) {
          arms[1].arm.rotation.x = -2.2 + (1 - atk) * 2.6;
          arms[1].shoulder.rotation.z = -0.9;
        }

        neck.rotation.y = U.damp(neck.rotation.y, U.clamp(st.lookYaw || 0, -0.8, 0.8), 7, dt);
        neck.rotation.x = U.damp(neck.rotation.x, U.clamp(st.lookPitch || 0, -0.45, 0.45), 7, dt);

        if (cape) {
          cape.rotation.x = U.damp(cape.rotation.x, -0.08 - sp * 0.045, 5, dt) + Math.sin(t * 2.4) * 0.03;
        }
        const gi = 0.5 + (moving ? 0.5 : 0.12) + Math.sin(t * 9) * 0.12;
        for (let i = 0; i < thrusters.length; i++) {
          thrusters[i].scale.setScalar(0.8 + gi * 0.5);
          thrusters[i].material.opacity = 0.35 + gi * 0.4;
        }

        if (api.flash > 0) api.flash = Math.max(0, api.flash - dt * 4);
      },
      dispose() {
        root.traverse((o) => {
          if (o.isMesh && o.geometry && o.geometry.attributes.color) o.geometry.dispose();
        });
      }
    };
    return api;
  }

  /* ==================================================================
     VEHICLES
     ================================================================== */
  function buildHoverBike(pal) {
    const root = grp();
    const body = grp(); root.add(body);
    const shell = mat(pal.body, { rough: 0.3, metal: 0.65 });
    const shellDark = mat(new THREE.Color(pal.body).multiplyScalar(0.5).getHex(), { rough: 0.4, metal: 0.7 });
    const trim = mat(pal.trim, { emissive: pal.trim, emissiveI: 2.0, rough: 0.3 });
    const podMat = glowMat(pal.trim, 0.55).clone();
    const flameMat = glowMat(pal.trim, 0.85).clone();
    const glass = mat(0x9fe8ff, { transparent: true, opacity: 0.32, rough: 0.05, metal: 0.2, emissive: 0x2288aa, emissiveI: 0.4 });

    // spine
    const spine = m(taperGeo(0.2, 0.3, 1.9, 12), shell, 0, 0.55, -0.1);
    spine.rotation.x = Math.PI / 2;
    body.add(spine);
    // nose cowling
    const nose = m(cone(0.34, 1.0, 12), shell, 0, 0.62, 1.35);
    nose.rotation.x = Math.PI / 2;
    body.add(nose);
    body.add(m(box(0.5, 0.16, 0.5), shellDark, 0, 0.78, 0.95));
    const wind = m(box(0.44, 0.34, 0.05), glass, 0, 0.98, 0.78);
    wind.rotation.x = -0.5;
    body.add(wind);
    // seat
    body.add(m(box(0.38, 0.16, 0.8), mat(0x1c1f28, { rough: 0.9 }), 0, 0.82, -0.25));
    // handlebars
    const bar = m(cyl(0.035, 0.035, 0.92, 8), shellDark, 0, 0.98, 0.5);
    bar.rotation.z = Math.PI / 2;
    body.add(bar);
    for (let s = -1; s <= 1; s += 2) body.add(m(cyl(0.055, 0.055, 0.2, 8), mat(0x15181f), s * 0.42, 0.98, 0.5));

    // thruster pods with visible lift discs
    const pods = [];
    [[-0.44, 1.05], [0.44, 1.05], [-0.44, -0.75], [0.44, -0.75]].forEach((p) => {
      const pod = grp(p[0], 0.5, p[1]);
      pod.add(m(cyl(0.2, 0.24, 0.3, 10), shellDark));
      const disc = decor(cyl(0.3, 0.05, 0.42, 12), podMat, 0, -0.3, 0);
      pod.add(disc);
      pod.add(decor(ring(0.08, 0.22), flameMat, 0, -0.17, 0));
      pod.children[2].rotation.x = -Math.PI / 2;
      body.add(pod);
      pods.push(disc);
    });
    // rear engine
    body.add(m(cyl(0.26, 0.3, 0.5, 12), shellDark, 0, 0.62, -1.1));
    const flame = decor(cone(0.22, 0.85, 10), flameMat, 0, 0.62, -1.55);
    flame.rotation.x = -Math.PI / 2;
    body.add(flame);
    body.add(decor(box(0.9, 0.04, 0.5), trim, 0, 0.42, -0.2));
    // headlight
    body.add(decor(sphere(0.1, 10), glowMat(0xd8f6ff, 0.95), 0, 0.66, 1.78));

    root.traverse((o) => { if (o.isMesh && o.material.blending !== THREE.AdditiveBlending) o.castShadow = true; });
    return { group: root, body, pods, flame, kind: 'bike', seat: new THREE.Vector3(0, 1.0, -0.2) };
  }

  function buildHoverCar(pal) {
    const root = grp();
    const body = grp(); root.add(body);
    const shell = mat(pal.body, { rough: 0.25, metal: 0.7 });
    const shellDark = mat(new THREE.Color(pal.body).multiplyScalar(0.45).getHex(), { rough: 0.4, metal: 0.75 });
    const trim = mat(pal.trim, { emissive: pal.trim, emissiveI: 2.0, rough: 0.3 });
    const podMat = glowMat(pal.trim, 0.55).clone();
    const flameMat = glowMat(pal.trim, 0.85).clone();
    const glass = mat(0x8fd8ff, { transparent: true, opacity: 0.3, rough: 0.04, metal: 0.3, emissive: 0x1a6a88, emissiveI: 0.5 });

    const hull = m(taperGeo(0.75, 0.95, 2.6, 16), shell, 0, 0.85, 0);
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(1.0, 1.0, 0.62);
    body.add(hull);
    body.add(m(box(2.0, 0.28, 3.6), shellDark, 0, 0.55, 0));
    // canopy
    const canopy = m(sphere(0.78, 16), glass, 0, 1.16, 0.15);
    canopy.scale.set(0.95, 0.72, 1.25);
    body.add(canopy);
    body.add(m(box(1.5, 0.1, 0.12), shellDark, 0, 1.3, -0.72));
    // nose + tail
    const nose = m(cone(0.62, 1.1, 14), shell, 0, 0.82, 1.85);
    nose.rotation.x = Math.PI / 2; nose.scale.set(1, 1, 0.55);
    body.add(nose);
    body.add(decor(box(1.1, 0.09, 0.5), trim, 0, 0.72, 2.0));
    body.add(m(box(1.9, 0.5, 0.4), shellDark, 0, 1.05, -1.75));
    // spoiler
    body.add(m(box(2.2, 0.08, 0.5), shell, 0, 1.45, -1.8));
    for (let s = -1; s <= 1; s += 2) body.add(m(box(0.1, 0.4, 0.4), shellDark, s * 0.95, 1.25, -1.8));
    body.add(decor(box(2.0, 0.07, 0.1), glowMat(0xff4d5f, 0.9), 0, 1.45, -2.03));

    // four hover pods
    const pods = [];
    [[-1.0, 1.25], [1.0, 1.25], [-1.0, -1.25], [1.0, -1.25]].forEach((p) => {
      const pod = grp(p[0], 0.55, p[1]);
      pod.add(m(cyl(0.3, 0.36, 0.42, 12), shellDark));
      pod.add(m(torus(0.34, 0.06, 14), shell, 0, -0.1, 0));
      pod.children[1].rotation.x = Math.PI / 2;
      const disc = decor(cyl(0.44, 0.08, 0.55, 14), podMat, 0, -0.4, 0);
      pod.add(disc);
      pod.add(decor(ring(0.1, 0.3), glowMat(pal.trim, 0.9), 0, -0.24, 0));
      pod.children[3].rotation.x = -Math.PI / 2;
      body.add(pod);
      pods.push(disc);
    });
    // rear thrusters
    const flames = [];
    for (let s = -1; s <= 1; s += 2) {
      body.add(m(cyl(0.26, 0.3, 0.5, 12), shellDark, s * 0.6, 0.95, -2.05));
      const f = decor(cone(0.22, 1.0, 10), flameMat, s * 0.6, 0.95, -2.6);
      f.rotation.x = -Math.PI / 2;
      body.add(f); flames.push(f);
    }
    // headlights + side strip
    for (let s = -1; s <= 1; s += 2) body.add(decor(sphere(0.13, 10), glowMat(0xe6f8ff, 0.95), s * 0.42, 0.9, 2.28));
    body.add(decor(box(0.04, 0.1, 2.6), trim, -1.02, 0.78, 0));
    body.add(decor(box(0.04, 0.1, 2.6), trim, 1.02, 0.78, 0));

    root.traverse((o) => { if (o.isMesh && o.material.blending !== THREE.AdditiveBlending) o.castShadow = true; });
    return { group: root, body, pods, flames, kind: 'car', seat: new THREE.Vector3(0, 1.1, 0.2) };
  }

  function buildStarship(pal) {
    const root = grp();
    const body = grp(); root.add(body);
    const hullC = mat(pal.body, { rough: 0.28, metal: 0.8 });
    const dark = mat(new THREE.Color(pal.body).multiplyScalar(0.42).getHex(), { rough: 0.4, metal: 0.85 });
    const trim = mat(pal.trim, { emissive: pal.trim, emissiveI: 2.2, rough: 0.3 });
    const podMat = glowMat(pal.trim, 0.55).clone();
    const flameMat = glowMat(pal.trim, 0.85).clone();
    const glass = mat(0x9fe4ff, { transparent: true, opacity: 0.34, rough: 0.03, metal: 0.4, emissive: 0x2a86a8, emissiveI: 0.6 });

    // fuselage
    const fus = m(taperGeo(0.55, 1.1, 4.4, 16), hullC, 0, 0, 0);
    fus.rotation.x = -Math.PI / 2;
    fus.scale.set(1, 1, 0.66);
    body.add(fus);
    const nose = m(cone(0.78, 2.4, 16), hullC, 0, 0, 3.3);
    nose.rotation.x = Math.PI / 2; nose.scale.set(1, 1, 0.6);
    body.add(nose);
    // cockpit
    const cock = m(sphere(0.62, 16), glass, 0, 0.42, 1.5);
    cock.scale.set(0.9, 0.62, 1.5);
    body.add(cock);
    body.add(m(box(0.16, 0.16, 1.4), dark, 0, 0.72, 1.5));

    // swept delta wings
    for (let s = -1; s <= 1; s += 2) {
      const w = m(box(3.0, 0.16, 1.5), hullC, s * 1.85, -0.12, -0.7);
      w.rotation.y = s * 0.42; w.rotation.z = -s * 0.1;
      body.add(w);
      const tip = m(box(0.3, 0.5, 1.0), dark, s * 3.2, 0.12, -1.0);
      tip.rotation.y = s * 0.42;
      body.add(tip);
      body.add(decor(box(2.6, 0.05, 0.16), trim, s * 1.8, -0.02, -0.35));
      body.children[body.children.length - 1].rotation.y = s * 0.42;
      // wing cannons
      body.add(m(cyl(0.07, 0.07, 1.6, 8), dark, s * 2.3, -0.06, 0.6));
      body.children[body.children.length - 1].rotation.x = Math.PI / 2;
      body.add(decor(sphere(0.1, 8), glowMat(pal.trim, 0.9), s * 2.3, -0.06, 1.45));
    }
    // dorsal fin
    const fin = m(box(0.14, 1.3, 1.6), dark, 0, 0.85, -1.6);
    fin.rotation.x = 0.3;
    body.add(fin);
    body.add(decor(box(0.05, 0.9, 0.9), trim, 0, 1.0, -1.6));

    // engines
    const flames = [];
    for (let s = -1; s <= 1; s += 2) {
      body.add(m(cyl(0.42, 0.46, 1.5, 14), dark, s * 0.85, -0.1, -2.1));
      body.children[body.children.length - 1].rotation.x = Math.PI / 2;
      body.add(m(torus(0.46, 0.07, 16), hullC, s * 0.85, -0.1, -2.75));
      const f = decor(cone(0.38, 2.2, 12), flameMat, s * 0.85, -0.1, -3.4);
      f.rotation.x = -Math.PI / 2;
      body.add(f); flames.push(f);
      body.add(decor(ring(0.12, 0.38), glowMat(0xffffff, 0.85), s * 0.85, -0.1, -2.83));
    }
    // belly glow + running lights
    body.add(decor(box(1.2, 0.05, 2.6), trim, 0, -0.62, 0));
    body.add(decor(sphere(0.08, 8), glowMat(0xff4d6d, 0.9), -3.3, 0.2, -1.0));
    body.add(decor(sphere(0.08, 8), glowMat(0x5dffa0, 0.9), 3.3, 0.2, -1.0));

    root.traverse((o) => { if (o.isMesh && o.material.blending !== THREE.AdditiveBlending) o.castShadow = true; });
    return { group: root, body, flames, kind: 'ship', seat: new THREE.Vector3(0, 0.4, 1.4) };
  }

  SK.build = {
    SRGB, mat, glowMat, mergeParts, Rig, charSolidMat, charGlowMat, capsule, taperGeo, capsuleGeo, box, sphere, cone, cyl, ico, torus, ring, plane,
    m, decor, grp, G, geoCache,
    buildCharacter, buildWeapon, buildShield,
    buildHoverBike, buildHoverCar, buildStarship
  };
})(window.SK);
