/* Star Kingdoms — planet worlds.
   Builds terrain, sky, weather, scenery, territory keeps and your
   settlement for one planet, and exposes heightAt() so the player and
   every vehicle can stay glued to the ground. */
(function (SK) {
  'use strict';
  const U = SK.util;
  const B = SK.build;
  const P = SK.props;

  const WORLD_R = 250;        // playable radius before the rim mountains
  const TERRAIN_SIZE = 620;
  const TERRAIN_SEG = 176;

  /* ------------------------------------------------- sprite textures */
  const texCache = {};
  function softDot(color) {
    const key = 'dot' + color;
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    texCache[key] = t;
    return t;
  }
  function ribbonTex() {
    if (texCache.ribbon) return texCache.ribbon;
    const c = document.createElement('canvas');
    c.width = 8; c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.35, 'rgba(160,255,220,0.55)');
    g.addColorStop(0.6, 'rgba(120,200,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 128);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    texCache.ribbon = t;
    return t;
  }

  /* ================================================================== */
  function PlanetWorld(planet, opts) {
    opts = opts || {};
    this.planet = planet;
    this.quality = opts.quality || 'high';
    this.scene = new THREE.Scene();
    this.noise = U.makeNoise(planet.seed);
    this.noiseB = U.makeNoise(planet.seed + 977);
    this.t = 0;
    this.updaters = [];
    this.pads = [];

    const T = planet.terrain;

    /* ------------------------------------------------ height sampling */
    const self = this;
    function raw(x, z) {
      let h = self.noise.fbm(x * T.freq, z * T.freq, 5) * T.amp;
      if (T.ridge > 0) {
        h += self.noise.ridged(x * T.freq * 1.75 + 120, z * T.freq * 1.75 - 60, 4) * T.amp * T.ridge;
      }
      if (T.dunes) {
        const warp = self.noiseB.fbm(x * 0.0035, z * 0.0035, 3) * 6;
        h += Math.sin(x * 0.028 + warp) * 3.4 + Math.sin((x * 0.4 + z) * 0.016 + warp * 0.5) * 2.2;
      }
      if (T.plateau > 0) {
        // Quantise into terraces, then blend back so edges stay readable.
        const step = T.amp * 0.34;
        const terr = Math.round(h / step) * step;
        h = U.lerp(h, terr, T.plateau);
      }
      if (T.shattered) {
        // Carve deep chasms so the land reads as broken floating shelves.
        const c = Math.abs(self.noiseB.fbm(x * 0.0055, z * 0.0055, 3));
        if (c < 0.12) h -= (0.12 - c) * 420;
      }
      // Fine bumps: too small to fight the vehicles, big enough that the
      // surface catches light instead of reading as moulded plastic.
      h += self.noiseB.fbm(x * 0.055, z * 0.055, 2) * 0.85;
      // Rim mountains fence the playable area without an invisible wall.
      const d = Math.sqrt(x * x + z * z);
      const rim = U.smoothstep(U.clamp((d - WORLD_R * 0.82) / 78, 0, 1));
      h += rim * 120 + rim * self.noise.fbm(x * 0.02, z * 0.02, 3) * 40;
      return h;
    }
    this.rawHeight = raw;

    // Flat pads under every keep and the landing site, so structures sit level.
    planet.territories.forEach((tr) => {
      this.pads.push({ x: tr.x, z: tr.z, r: 26, flat: 16, y: raw(tr.x, tr.z) });
    });
    if (planet.citadel) {
      const c = planet.citadel;
      this.pads.push({ x: c.x, z: c.z, r: 44, flat: 28, y: raw(c.x, c.z) });
    }
    // Pick a landing site that is dry, fairly level, and clear of every keep.
    const wl = T.water ? T.water.level : -9999;
    const t0 = planet.territories[0];
    let land = null, bestScore = -Infinity;
    const lrng = U.makeRng(planet.seed + 4001);
    for (let i = 0; i < 260; i++) {
      const a = lrng.range(0, U.TAU);
      const d = lrng.range(42, 72);
      const cx = t0.x + Math.cos(a) * d, cz = t0.z + Math.sin(a) * d;
      if (Math.hypot(cx, cz) > WORLD_R * 0.82) continue;
      let clear = true;
      for (let k = 0; k < planet.territories.length; k++) {
        const tr = planet.territories[k];
        if (Math.hypot(cx - tr.x, cz - tr.z) < 38) { clear = false; break; }
      }
      if (clear && planet.citadel &&
        Math.hypot(cx - planet.citadel.x, cz - planet.citadel.z) < 62) clear = false;
      if (!clear) continue;
      const y = raw(cx, cz);
      if (y < wl + 4) continue;                       // never land in water
      // flattest candidate wins; prefer sites a little above the waterline
      const slope = Math.abs(raw(cx + 9, cz) - y) + Math.abs(raw(cx, cz + 9) - y) +
        Math.abs(raw(cx - 9, cz) - y) + Math.abs(raw(cx, cz - 9) - y);
      const score = -slope * 2 - Math.abs(y - (wl + 14)) * 0.15;
      if (score > bestScore) { bestScore = score; land = { x: cx, z: cz }; }
    }
    if (!land) land = { x: t0.x + 52, z: t0.z + 52 };
    this.landingSite = land;
    this.pads.push({ x: land.x, z: land.z, r: 18, flat: 10, y: raw(land.x, land.z) });

    this.heightAt = function (x, z) {
      let h = raw(x, z);
      for (let i = 0; i < self.pads.length; i++) {
        const p = self.pads[i];
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < p.r) {
          const w = 1 - U.smoothstep(U.clamp((d - p.flat) / (p.r - p.flat), 0, 1));
          h = U.lerp(h, p.y, w);
        }
      }
      return h;
    };
    land.y = this.heightAt(land.x, land.z);

    /* ------------------------------------------------------- terrain */
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cLow = B.SRGB(T.low), cMid = B.SRGB(T.mid), cHigh = B.SRGB(T.high), cPeak = B.SRGB(T.peak);
    const tmp = new THREE.Color();
    let minH = Infinity, maxH = -Infinity;
    const hs = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z);
      hs[i] = h;
      pos.setY(i, h);
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
    for (let i = 0; i < pos.count; i++) {
      const t = U.clamp(U.invLerp(minH * 0.55, maxH * 0.72, hs[i]), 0, 1);
      if (t < 0.34) tmp.copy(cLow).lerp(cMid, t / 0.34);
      else if (t < 0.72) tmp.copy(cMid).lerp(cHigh, (t - 0.34) / 0.38);
      else tmp.copy(cHigh).lerp(cPeak, (t - 0.72) / 0.28);
      // per-vertex noise breaks up the banding into something organic
      const n = this.noiseB.value(pos.getX(i) * 0.06, pos.getZ(i) * 0.06) * 0.09;
      colors[i * 3] = U.clamp(tmp.r + n, 0, 1);
      colors[i * 3 + 1] = U.clamp(tmp.g + n, 0, 1);
      colors[i * 3 + 2] = U.clamp(tmp.b + n, 0, 1);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.94, metalness: 0.04, flatShading: false
    });
    const ground = new THREE.Mesh(geo, groundMat);
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.scene.add(ground);
    this.ground = ground;

    /* --------------------------------------------------- water / lava */
    if (T.water) {
      const wgeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 1, 1);
      wgeo.rotateX(-Math.PI / 2);
      const wmat = new THREE.MeshStandardMaterial({
        color: B.SRGB(T.water.color),
        transparent: T.water.opacity < 1,
        opacity: T.water.opacity,
        roughness: T.water.lava ? 0.55 : 0.08,
        metalness: T.water.lava ? 0.1 : 0.5
      });
      if (T.water.lava) { wmat.emissive = B.SRGB(T.water.color); wmat.emissiveIntensity = 1.9; }
      if (T.water.ice) { wmat.roughness = 0.12; wmat.metalness = 0.35; }
      const water = new THREE.Mesh(wgeo, wmat);
      water.position.y = T.water.level;
      this.scene.add(water);
      this.water = water;
      this.waterLevel = T.water.level;
    } else {
      this.waterLevel = -9999;
    }

    /* ----------------------------------------------------------- sky */
    const skyGeo = new THREE.SphereGeometry(1500, 32, 20);
    const sPos = skyGeo.attributes.position;
    const sCol = new Float32Array(sPos.count * 3);
    const top = B.SRGB(planet.sky.top), hor = B.SRGB(planet.sky.horizon), bot = B.SRGB(planet.sky.bottom);
    for (let i = 0; i < sPos.count; i++) {
      const y = sPos.getY(i) / 1500;
      if (y > 0) tmp.copy(hor).lerp(top, Math.pow(y, 0.65));
      else tmp.copy(hor).lerp(bot, Math.pow(-y, 0.7));
      sCol[i * 3] = tmp.r; sCol[i * 3 + 1] = tmp.g; sCol[i * 3 + 2] = tmp.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false
    }));
    sky.renderOrder = -1000;
    this.scene.add(sky);
    this.sky = sky;

    this.scene.fog = new THREE.Fog(B.SRGB(planet.sky.fog).getHex(), planet.sky.fogNear, planet.sky.fogFar);

    /* --------------------------------------------------------- suns */
    const sunDir = new THREE.Vector3().fromArray(planet.sun.dir).normalize();
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softDot(0xffffff), color: B.SRGB(planet.sun.color),
      transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false
    }));
    sunSprite.scale.setScalar(190);
    sunSprite.position.copy(sunDir).multiplyScalar(1200);
    this.scene.add(sunSprite);
    if (planet.twinSun) {
      const s2 = sunSprite.clone();
      s2.material = sunSprite.material.clone();
      s2.material.color = B.SRGB(0xff6a4a);
      s2.scale.setScalar(150);
      s2.position.set(sunDir.x * 1200 - 420, 180, sunDir.z * 1200 + 300);
      this.scene.add(s2);
    }

    /* -------------------------------------------------------- lights */
    const sun = new THREE.DirectionalLight(B.SRGB(planet.sun.color).getHex(), planet.sun.intensity);
    sun.position.copy(sunDir).multiplyScalar(160);
    sun.castShadow = this.quality !== 'low';
    const sm = this.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sm, sm);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 420;
    const ext = 110;
    sun.shadow.camera.left = -ext; sun.shadow.camera.right = ext;
    sun.shadow.camera.top = ext; sun.shadow.camera.bottom = -ext;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
    this.sunOffset = sunDir.clone().multiplyScalar(170);

    const hemi = new THREE.HemisphereLight(B.SRGB(planet.hemi.sky).getHex(),
      B.SRGB(planet.hemi.ground).getHex(), planet.hemi.intensity);
    this.scene.add(hemi);

    // Coloured rim light opposite the sun — this is what makes the
    // stylized shapes pop instead of going flat in shadow.
    const rim = new THREE.DirectionalLight(B.SRGB(planet.rim.color).getHex(), planet.rim.intensity);
    rim.position.set(-sunDir.x * 100, 42, -sunDir.z * 100);
    this.scene.add(rim);

    /* ----------------------------------------------- sky decorations */
    if (planet.nebula) {
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: softDot(0xffffff),
          color: B.SRGB([0x7a2fd0, 0xd23ba8, 0x3a6ae0, 0x9a3fff][i % 4]),
          transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending,
          depthWrite: false, fog: false
        }));
        s.scale.setScalar(U.rand(500, 1100));
        const a = U.rand(0, U.TAU);
        s.position.set(Math.cos(a) * 1100, U.rand(80, 700), Math.sin(a) * 1100);
        this.scene.add(s);
      }
      const starGeo = new THREE.BufferGeometry();
      const sp = new Float32Array(1400 * 3);
      for (let i = 0; i < 1400; i++) {
        const v = new THREE.Vector3(U.rand(-1, 1), U.rand(-0.1, 1), U.rand(-1, 1)).normalize().multiplyScalar(1350);
        sp[i * 3] = v.x; sp[i * 3 + 1] = v.y; sp[i * 3 + 2] = v.z;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
        size: 6, map: softDot(0xffffff), color: 0xffffff, transparent: true,
        opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
        sizeAttenuation: true, fog: false
      })));
    }

    if (planet.aurora) {
      const ribbons = [];
      for (let i = 0; i < 4; i++) {
        const g2 = new THREE.PlaneGeometry(900, 260, 40, 1);
        const mat2 = new THREE.MeshBasicMaterial({
          map: ribbonTex(), transparent: true, opacity: 0.4,
          blending: THREE.AdditiveBlending, depthWrite: false,
          side: THREE.DoubleSide, fog: false,
          color: B.SRGB(i % 2 ? 0x7affd0 : 0x6aa8ff)
        });
        const mesh = new THREE.Mesh(g2, mat2);
        mesh.position.set(U.rand(-300, 300), 330 + i * 65, -700 - i * 90);
        mesh.rotation.y = U.rand(-0.35, 0.35);
        mesh.renderOrder = -900;
        this.scene.add(mesh);
        ribbons.push({ mesh: mesh, base: g2.attributes.position.array.slice(), ph: U.rand(0, 10) });
      }
      this.updaters.push((dt, t) => {
        ribbons.forEach((r, i) => {
          const a = r.mesh.geometry.attributes.position;
          for (let k = 0; k < a.count; k++) {
            const bx = r.base[k * 3];
            a.setZ(k, Math.sin(bx * 0.011 + t * 0.35 + r.ph) * 55 + Math.sin(bx * 0.004 - t * 0.2) * 40);
            a.setY(k, r.base[k * 3 + 1] + Math.sin(bx * 0.008 + t * 0.5 + i) * 22);
          }
          a.needsUpdate = true;
          r.mesh.material.opacity = 0.28 + Math.sin(t * 0.4 + i) * 0.14;
        });
      });
    }

    /* ---------------------------------------------------------- props */
    this.propGroups = [];
    const prng = U.makeRng(planet.seed + 55);
    const dummy = new THREE.Object3D();
    (planet.props || []).forEach((spec) => {
      if (!P.PROPS[spec.kind]) return;
      const budget = this.quality === 'low' ? Math.round(spec.count * 0.45)
        : this.quality === 'medium' ? Math.round(spec.count * 0.7) : spec.count;
      const fields = P.makePropField(spec.kind, budget, planet.seed + spec.kind.length * 31, spec.color || 0x777777);
      fields.forEach((f) => {
        if (f.solid) this.scene.add(f.solid);
        if (f.glow) this.scene.add(f.glow);
      });
      let placed = 0, guard = 0;
      while (placed < budget && guard < budget * 24) {
        guard++;
        const a = prng.range(0, U.TAU);
        const r = Math.sqrt(prng()) * WORLD_R * 0.97;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const y = this.heightAt(x, z);
        if (y < spec.minH || y > spec.maxH) continue;
        if (y < this.waterLevel + 0.8 && spec.kind !== 'floatRock') continue;
        // keep a clear apron around every keep and the landing pad
        let blocked = false;
        for (let i = 0; i < this.pads.length; i++) {
          if (Math.hypot(x - this.pads[i].x, z - this.pads[i].z) < this.pads[i].r + 6) { blocked = true; break; }
        }
        if (blocked) continue;
        const f = fields[placed % fields.length];
        if (f.used >= f.cap) continue;
        const s = prng.range(spec.scale[0], spec.scale[1]);
        dummy.position.set(x, spec.kind === 'floatRock' ? y + prng.range(10, 34) : y - 0.4, z);
        dummy.rotation.set(0, prng.range(0, U.TAU), 0);
        dummy.scale.set(s, s * prng.range(0.85, 1.2), s);
        dummy.updateMatrix();
        if (f.solid) { f.solid.setMatrixAt(f.used, dummy.matrix); f.solid.count = f.used + 1; }
        if (f.glow) { f.glow.setMatrixAt(f.used, dummy.matrix); f.glow.count = f.used + 1; }
        f.used++;
        placed++;
      }
      fields.forEach((f) => {
        if (f.solid) f.solid.instanceMatrix.needsUpdate = true;
        if (f.glow) f.glow.instanceMatrix.needsUpdate = true;
      });
      this.propGroups.push(fields);
    });

    /* -------------------------------------------------------- weather */
    const w = planet.weather;
    if (w) {
      const n = this.quality === 'low' ? Math.round(w.count * 0.4)
        : this.quality === 'medium' ? Math.round(w.count * 0.7) : w.count;
      const wg = new THREE.BufferGeometry();
      const wp = new Float32Array(n * 3);
      const wv = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        wp[i * 3] = U.rand(-90, 90); wp[i * 3 + 1] = U.rand(0, 70); wp[i * 3 + 2] = U.rand(-90, 90);
        wv[i * 3] = U.rand(-0.4, 0.4); wv[i * 3 + 1] = U.rand(0.5, 1.4); wv[i * 3 + 2] = U.rand(-0.4, 0.4);
      }
      wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
      const wmat = new THREE.PointsMaterial({
        size: w.size * 1.5, map: softDot(0xffffff), color: B.SRGB(w.color),
        transparent: true, opacity: w.kind === 'snow' ? 0.75 : 0.45,
        blending: w.kind === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false, sizeAttenuation: true, fog: true
      });
      const pts = new THREE.Points(wg, wmat);
      pts.frustumCulled = false;
      this.scene.add(pts);
      this.weather = { pts: pts, n: n, vel: wv, spec: w };
    }

    /* --------------------------------------------------- landing pad */
    const padG = B.grp(land.x, land.y, land.z);
    const padMat = B.mat(0x333c48, { rough: 0.72, metal: 0.4 });
    const padDeck = B.mat(0x47525f, { rough: 0.8, metal: 0.25 });
    padG.add(B.m(B.cyl(8, 8.6, 0.55, 6), padMat, 0, 0.26, 0));
    padG.add(B.m(B.cyl(7.1, 7.1, 0.16, 6), padDeck, 0, 0.58, 0));
    const padRing = B.decor(B.ring(6.6, 7.1), B.glowMat(0x35e0ff, 0.28), 0, 0.68, 0);
    padRing.rotation.x = -Math.PI / 2;
    padG.add(padRing);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * U.TAU;
      padG.add(B.m(B.box(0.4, 2.2, 0.4), padMat, Math.cos(a) * 8.1, 1.3, Math.sin(a) * 8.1));
      padG.add(B.decor(B.sphere(0.2, 8), B.glowMat(0xffb23f, 0.7), Math.cos(a) * 8.1, 2.5, Math.sin(a) * 8.1));
    }
    padG.add(B.m(B.box(4.4, 0.08, 0.45), B.mat(0xffb23f, { emissive: 0xffb23f, emissiveI: 0.9 }), 0, 0.68, 0));
    this.scene.add(padG);
    this.padRing = padRing;

    /* ----------------------------------------------------------- keeps */
    this.keeps = {};
    this.citadelRig = null;
    this.citadelConquered = null;
    this.buildings = [];
    this.settlementGroup = new THREE.Group();
    this.scene.add(this.settlementGroup);

    this.tmpV = new THREE.Vector3();
  }

  /* Rebuild keeps and the settlement whenever ownership changes. */
  PlanetWorld.prototype.syncOwnership = function (state) {
    const planet = this.planet;
    const playerPal = { trim: 0x35e0ff, accent: 0xffb23f, suit: 0x2a4a72 };
    // keeps
    planet.territories.forEach((tr) => {
      const owned = !!state.owned[tr.id];
      const existing = this.keeps[tr.id];
      if (existing && existing.owned === owned) return;
      if (existing) { this.scene.remove(existing.group); }
      const pal = owned ? playerPal : planet.faction;
      const k = P.buildKeep(pal, owned);
      k.group.position.set(tr.x, this.heightAt(tr.x, tr.z) - 0.5, tr.z);
      k.owned = owned;
      k.territory = tr;
      this.scene.add(k.group);
      this.keeps[tr.id] = k;
    });

    // settlement: sits on the first territory you took on this planet
    const capital = planet.territories.filter((t) => state.owned[t.id])[0];
    while (this.settlementGroup.children.length) {
      this.settlementGroup.remove(this.settlementGroup.children[0]);
    }
    this.buildings = [];
    if (!capital) { this.capital = null; return; }
    this.capital = capital;
    const built = SK.data.BUILDINGS.filter((b) => (state.buildings[b.id] || 0) > 0);
    const R = 27;
    built.forEach((b, i) => {
      const a = (i / Math.max(6, built.length)) * U.TAU + 0.35;
      const x = capital.x + Math.cos(a) * R;
      const z = capital.z + Math.sin(a) * R;
      const inst = P.buildBuilding(b.id, state.buildings[b.id], playerPal);
      inst.group.position.set(x, this.heightAt(x, z) - 0.3, z);
      inst.group.rotation.y = -a + Math.PI / 2;
      inst.id = b.id;
      this.settlementGroup.add(inst.group);
      this.buildings.push(inst);
    });
    // connecting walkways so the settlement reads as a built place
    const walk = B.mat(0x4a5464, { rough: 0.8, metal: 0.2 });
    built.forEach((b, i) => {
      const a = (i / Math.max(6, built.length)) * U.TAU + 0.35;
      const seg = B.m(B.box(2.2, 0.5, R - 9), walk,
        capital.x + Math.cos(a) * (R / 2 + 3.5),
        this.heightAt(capital.x + Math.cos(a) * (R / 2), capital.z + Math.sin(a) * (R / 2)) - 0.05,
        capital.z + Math.sin(a) * (R / 2 + 3.5));
      seg.rotation.y = -a + Math.PI / 2;
      seg.receiveShadow = true;
      this.settlementGroup.add(seg);
    });
  };

  /* The Citadel only exists once every territory on the world is held.
     Before that it is not on the map at all, which is the point. */
  PlanetWorld.prototype.syncCitadel = function (state, available, conquered) {
    const c = this.planet.citadel;
    if (!c) return;
    const want = available || conquered;
    if (!want) {
      if (this.citadelRig) { this.scene.remove(this.citadelRig.group); this.citadelRig = null; }
      this.citadelConquered = null;
      return;
    }
    if (this.citadelRig && this.citadelConquered === conquered) return;
    if (this.citadelRig) this.scene.remove(this.citadelRig.group);
    const rig = P.buildCitadel(this.planet.faction, conquered);
    rig.group.position.set(c.x, this.heightAt(c.x, c.z) - 0.6, c.z);
    this.scene.add(rig.group);
    this.citadelRig = rig;
    this.citadelConquered = conquered;
  };

  PlanetWorld.prototype.update = function (dt, focus) {
    this.t += dt;
    const t = this.t;
    // Follow the camera with the shadow frustum so shadows stay sharp.
    if (focus) {
      const o = this.sunOffset;
      this.sun.position.set(focus.x + o.x, o.y, focus.z + o.z);
      this.sun.target.position.set(focus.x, 0, focus.z);
      this.sun.target.updateMatrixWorld();
      this.sky.position.set(focus.x, 0, focus.z);
    }
    if (this.weather && focus) {
      const w = this.weather, spec = w.spec;
      const arr = w.pts.geometry.attributes.position.array;
      const sp = spec.speed;
      for (let i = 0; i < w.n; i++) {
        const i3 = i * 3;
        if (spec.rising) arr[i3 + 1] += w.vel[i3 + 1] * sp * dt * 9;
        else if (spec.horizontal) { arr[i3] += sp * dt * 12; arr[i3 + 1] -= dt * sp * 1.5; }
        else arr[i3 + 1] -= w.vel[i3 + 1] * sp * dt * 6;
        arr[i3] += Math.sin(t * 0.8 + i) * dt * sp * 1.4;
        arr[i3 + 2] += Math.cos(t * 0.7 + i * 0.3) * dt * sp * 1.4;
        // recycle inside a moving box around the camera
        const dx = arr[i3] - focus.x, dz = arr[i3 + 2] - focus.z, dy = arr[i3 + 1] - focus.y;
        if (dy > 72 || dy < -20 || Math.abs(dx) > 95 || Math.abs(dz) > 95) {
          arr[i3] = focus.x + U.rand(-90, 90);
          arr[i3 + 2] = focus.z + U.rand(-90, 90);
          arr[i3 + 1] = focus.y + (spec.rising ? U.rand(-16, 0) : U.rand(40, 70));
        }
      }
      w.pts.geometry.attributes.position.needsUpdate = true;
    }
    if (this.water && this.planet.terrain.water && this.planet.terrain.water.lava) {
      this.water.material.emissiveIntensity = 1.6 + Math.sin(t * 0.9) * 0.4;
    }
    if (this.padRing) this.padRing.material.opacity = 0.4 + Math.sin(t * 2) * 0.2;
    for (let i = 0; i < this.updaters.length; i++) this.updaters[i](dt, t);
    for (const k in this.keeps) this.keeps[k].update(dt);
    if (this.citadelRig) this.citadelRig.update(dt);
    for (let i = 0; i < this.buildings.length; i++) this.buildings[i].update(dt);
  };

  PlanetWorld.prototype.dispose = function () {
    this.scene.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isSprite) {
        if (o.geometry && !B.geoCache[o.geometry.uuid]) { /* cached geos are reused */ }
      }
    });
    this.ground.geometry.dispose();
    if (this.water) this.water.geometry.dispose();
    this.sky.geometry.dispose();
    this.propGroups.forEach((fs) => fs.forEach((f) => {
      if (f.solid) { f.solid.geometry.dispose(); f.solid.material.dispose(); }
      if (f.glow) { f.glow.geometry.dispose(); f.glow.material.dispose(); }
    }));
    if (this.weather) this.weather.pts.geometry.dispose();
  };

  SK.World = { PlanetWorld, WORLD_R, softDot };
})(window.SK);
