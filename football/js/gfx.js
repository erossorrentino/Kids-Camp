/* Gridiron Kings — 3D rendering: night stadium, painted field, players in full pads, the football,
   broadcast camera, route art and effects. World units are yards; x runs goal to goal. */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});
  const U = FG.util;
  const { clamp, lerp } = U;
  const { GL, EL, FW, HASH } = FG.FIELD;
  let T = null;

  const G = {
    ready: false, failed: false, quality: 1,
    renderer: null, scene: null, camera: null, canvas: null,
    actors: [], ballG: null, ballMesh: null, marker: null, arrow: null, sun: null,
    cam: { x: -90, y: 40, z: 0, tx: 0, ty: 0, tz: 0, shake: 0, portrait: false, intro: 0, orbit: 0, init: false },
    basis: { rx: 0, rz: 1, ux: 1, uz: 0 },
    ads: [], crowdMat: null, crowdTex: null, crowdJump: 0, flashes: [], confetti: null, bursts: [],
    fieldMat: null, losLine: null, fdLine: null, routeGroup: null, teamAreas: [], time: 0, w: 0, h: 0, kits: null,
    spin: 0, tumble: 0,
  };
  G.RECV_COLORS = ['#ffd23f', '#35e0c2', '#ff6b81', '#7fb3ff', '#c792ff'];

  const SKIN = ['#f6d3b3', '#eebf98', '#dba57c', '#b97f55', '#8a5a3a', '#5e3b26'];

  function canvasTex(w, h, draw, opts) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = G.renderer ? G.renderer.capabilities.getMaxAnisotropy() : 1;
    if (opts && opts.repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }
  const inkOn = (bg, fg) => (U.colorDist(bg, fg) < 110 ? (U.lum(bg) > 0.55 ? '#10131a' : '#ffffff') : fg);

  /* superellipse bowl around the field */
  const RING_A = EL + 10, RING_B = FW + 11, RING_N = 4.2;
  function ringPoint(t, d, out) {
    const c = Math.cos(t), s = Math.sin(t), e = 2 / RING_N;
    out.x = (RING_A + d) * Math.sign(c) * Math.pow(Math.abs(c), e);
    out.z = (RING_B + d) * Math.sign(s) * Math.pow(Math.abs(s), e);
    return out;
  }
  function ringStrip(d1, h1, d2, h2, mat, uRep, segs) {
    segs = segs || 140;
    const pos = [], uv = [], idx = [];
    const a = { x: 0, z: 0 }, b = { x: 0, z: 0 }, prev = { x: 0, z: 0 };
    let len = 0; const lens = [0];
    ringPoint(0, d1, prev);
    for (let i = 1; i <= segs; i++) { ringPoint((i / segs) * Math.PI * 2, d1, a); len += Math.hypot(a.x - prev.x, a.z - prev.z); lens.push(len); prev.x = a.x; prev.z = a.z; }
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      ringPoint(t, d1, a); ringPoint(t, d2, b);
      pos.push(a.x, h1, a.z, b.x, h2, b.z);
      const u = (lens[i] / len) * uRep;
      uv.push(u, 0, u, 1);
      if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new T.Mesh(g, mat);
    m.frustumCulled = false;
    return m;
  }

  /* ---------- textures ---------- */
  function fieldTexture(home, away) {
    const PX = G.quality >= 1 ? 26 : 18, W = 120 * PX, H = Math.round(53.333 * PX);
    const sy = H / 53.333;
    return canvasTex(W, H, (c) => {
      const frame = () => { c.setTransform(PX, 0, 0, sy, 60 * PX, 26.667 * sy); };
      frame();
      for (let i = 0; i < 20; i++) { c.fillStyle = i % 2 ? '#1d7633' : '#24863c'; c.fillRect(-50 + i * 5, -26.7, 5.03, 53.4); }
      [[-1, home], [1, away]].forEach(([s, t]) => {
        const x0 = s < 0 ? -60 : 50;
        c.fillStyle = U.shade(t.c1, -0.42); c.fillRect(x0, -26.7, 10, 53.4);
        c.save(); c.beginPath(); c.rect(x0, -26.7, 10, 53.4); c.clip();
        c.fillStyle = 'rgba(255,255,255,0.05)';
        for (let k = -40; k < 40; k += 2.4) { c.beginPath(); c.moveTo(x0 + k, -27); c.lineTo(x0 + k + 1.2, -27); c.lineTo(x0 + k + 1.2 + 54, 27); c.lineTo(x0 + k + 54, 27); c.fill(); }
        c.restore();
      });
      c.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < 90000; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        c.fillStyle = Math.random() > 0.5 ? 'rgba(170,255,150,0.04)' : 'rgba(0,25,0,0.075)';
        c.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 3);
      }
      frame();
      const wear = c.createLinearGradient(0, -6, 0, 6);
      wear.addColorStop(0, 'rgba(150,130,70,0)'); wear.addColorStop(0.5, 'rgba(150,130,70,0.1)'); wear.addColorStop(1, 'rgba(150,130,70,0)');
      c.fillStyle = wear; c.fillRect(-48, -6, 96, 12);
      c.fillStyle = 'rgba(255,255,255,0.94)';
      c.fillRect(-60, -26.667, 120, 0.36); c.fillRect(-60, 26.667 - 0.36, 120, 0.36);
      c.fillRect(-60, -26.667, 0.36, 53.33); c.fillRect(60 - 0.36, -26.667, 0.36, 53.33);
      c.fillRect(-50 - 0.2, -26.667, 0.4, 53.33); c.fillRect(50 - 0.2, -26.667, 0.4, 53.33);
      for (let x = -45; x <= 45; x += 5) c.fillRect(x - 0.1, -26.3, 0.2, 52.6);
      for (let x = -49; x <= 49; x++) {
        if (x % 5 === 0) continue;
        [-1, 1].forEach((s) => {
          c.fillRect(x - 0.07, s * HASH - 0.35, 0.14, 0.7);
          c.fillRect(x - 0.07, s * (26.667 - 1.0) - 0.35, 0.14, 0.7);
        });
      }
      [-1, 1].forEach((s) => c.fillRect(s * 47.9 - 0.07, -0.5, 0.14, 1));
      c.font = '800 2.3px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let k = 1; k <= 9; k++) {
        const x = -50 + k * 10, n = String(50 - Math.abs(x));
        [-1, 1].forEach((s) => {
          const zc = s * (26.667 - 10);
          c.save(); c.translate(x, zc); if (s < 0) c.rotate(Math.PI);
          c.fillText(n[0], -0.95, 0); c.fillText(n[1], 0.95, 0);
          c.restore();
          if (x !== 0) {
            const g = Math.sign(x), ax = x + g * 2.25, az = zc + (s < 0 ? 0.55 : -0.55);
            c.beginPath(); c.moveTo(ax + g * 0.7, az); c.lineTo(ax, az - 0.32); c.lineTo(ax, az + 0.32); c.fill();
          }
        });
      }
      // midfield logo
      c.save();
      c.fillStyle = home.c1; c.strokeStyle = inkOn(home.c1, home.c2); c.lineWidth = 0.45;
      c.beginPath(); c.arc(0, 0, 4.4, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = inkOn(home.c1, home.c2); c.font = '900 5.4px "Big Shoulders Display", Impact, sans-serif';
      c.rotate(Math.PI / 2);
      c.fillText(home.letter, 0, 0.35);
      c.restore();
      [[-1, home], [1, away]].forEach(([s, t]) => {
        c.save(); c.translate(s * 55, 0); c.rotate(s < 0 ? -Math.PI / 2 : Math.PI / 2);
        let fs = 5.6;
        c.font = `900 ${fs}px "Big Shoulders Display", Impact, sans-serif`;
        const w = c.measureText(t.name.toUpperCase()).width;
        if (w > 44) { fs *= 44 / w; c.font = `900 ${fs}px "Big Shoulders Display", Impact, sans-serif`; }
        c.lineWidth = 0.35; c.strokeStyle = U.shade(t.c1, -0.7);
        c.strokeText(t.name.toUpperCase(), 0, 0.3);
        c.fillStyle = inkOn(U.shade(t.c1, -0.42), t.c2 === '#ffffff' ? '#ffffff' : t.c2);
        c.fillText(t.name.toUpperCase(), 0, 0.3);
        c.restore();
      });
    });
  }

  function crowdTexture(home, away) {
    const W = 512, H = 256, cols = 44, rows = 13;
    const pal = [];
    for (let i = 0; i < 11; i++) pal.push(home);
    for (let i = 0; i < 3; i++) pal.push(U.shade(home, -0.35), U.shade(home, 0.45));
    for (let i = 0; i < 4; i++) pal.push(away);
    pal.push('#f1f1f1', '#f1f1f1', '#20242e', '#2b3a55', '#c7ccd6', '#e9d9a8', '#3a3f4b', '#b53a3a');
    return canvasTex(W, H, (c) => {
      c.fillStyle = '#0d111a'; c.fillRect(0, 0, W, H);
      const cw = W / cols, rh = H / rows;
      for (let r = 0; r < rows; r++) {
        c.fillStyle = r % 2 ? '#121826' : '#0f1420'; c.fillRect(0, r * rh, W, rh);
        for (let i = 0; i < cols; i++) {
          if (Math.random() < 0.04) continue;
          const x = i * cw + cw / 2 + (Math.random() - 0.5) * 2, y = r * rh + rh * 0.55;
          c.fillStyle = pal[Math.floor(Math.random() * pal.length)];
          c.beginPath(); c.roundRect(x - cw * 0.38, y - rh * 0.05, cw * 0.76, rh * 0.5, 2); c.fill();
          c.fillStyle = SKIN[Math.floor(Math.random() * SKIN.length)];
          c.beginPath(); c.arc(x, y - rh * 0.22, cw * 0.24, 0, Math.PI * 2); c.fill();
          if (Math.random() < 0.14) { c.fillStyle = pal[Math.floor(Math.random() * 6)]; c.fillRect(x - cw * 0.45, y - rh * 0.52, cw * 0.9, rh * 0.13); }
        }
      }
    }, { repeat: true });
  }
  function adTexture() {
    const W = 2048, H = 64;
    const words = [['GRIDIRON KINGS', '#ffd23f'], ['VOLTA ENERGY', '#35e0c2'], ['NIMBUS AIR', '#ffffff'], ['KICKR CLEATS', '#ff5a7a'], ['ZEST COLA', '#ffa630'], ['ORBIT MOBILE', '#7fb3ff']];
    return canvasTex(W, H, (c) => {
      c.fillStyle = '#070b14'; c.fillRect(0, 0, W, H);
      c.font = '800 40px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
      c.textBaseline = 'middle'; c.textAlign = 'center';
      const seg = W / words.length;
      words.forEach(([w, col], i) => {
        c.fillStyle = col; c.globalAlpha = 0.14; c.fillRect(i * seg + 6, 6, seg - 12, H - 12); c.globalAlpha = 1;
        c.fillText(w, i * seg + seg / 2, H / 2 + 2);
      });
      c.fillStyle = 'rgba(0,0,0,0.28)';
      for (let x = 0; x < W; x += 4) c.fillRect(x, 0, 1, H);
      for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);
    }, { repeat: true });
  }
  function glowTexture() {
    return canvasTex(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(235,245,255,0.75)'); g.addColorStop(0.5, 'rgba(160,200,255,0.16)'); g.addColorStop(1, 'rgba(120,170,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    });
  }
  function jerseyTexture(kit, num) {
    return canvasTex(256, 128, (c) => {
      c.fillStyle = kit.c1; c.fillRect(0, 0, 256, 128);
      c.fillStyle = U.shade(kit.c1, -0.32); c.globalAlpha = 0.5; c.fillRect(54, 0, 18, 128); c.fillRect(184, 0, 18, 128); c.globalAlpha = 1;
      c.fillStyle = kit.c2 === kit.c1 ? '#ffffff' : kit.c2; c.fillRect(0, 0, 256, 7); c.fillRect(0, 114, 256, 6);
      const ink = inkOn(kit.c1, kit.c2), edge = U.lum(ink) > 0.5 ? U.shade(kit.c1, -0.55) : '#ffffff';
      c.font = '900 76px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const s = String(num);
      [128, 0, 256].forEach((x) => { c.lineWidth = 7; c.strokeStyle = edge; c.strokeText(s, x, 64); c.fillStyle = ink; c.fillText(s, x, 64); });
    });
  }

  /* ---------- stadium ---------- */
  function buildStadium() {
    const S = G.scene;
    S.background = canvasTex(16, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#03050c'); g.addColorStop(0.55, '#0a1126'); g.addColorStop(1, '#1b2a52');
      c.fillStyle = g; c.fillRect(0, 0, 16, 256);
    });
    S.fog = new T.Fog(0x0b1228, 150, 460);
    S.add(new T.HemisphereLight(0xcfe0ff, 0x16301f, 0.5));
    const sun = (G.sun = new T.DirectionalLight(0xfff6e8, 1.15));
    sun.castShadow = true;
    const sz = G.quality >= 1 ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 10; sc.far = 220;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    S.add(sun); S.add(sun.target);
    const fill = new T.DirectionalLight(0xbcd2ff, 0.32);
    fill.position.set(40, 50, -46);
    S.add(fill);
    const rim = new T.DirectionalLight(0xffe3b0, 0.28);
    rim.position.set(60, 30, 60);
    S.add(rim);

    const apron = new T.Mesh(new T.PlaneGeometry(460, 380), new T.MeshLambertMaterial({ color: 0x1a202c }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.06; S.add(apron);
    const surround = new T.Mesh(new T.PlaneGeometry(EL * 2 + 14, FW * 2 + 14), new T.MeshLambertMaterial({ color: 0x14502a }));
    surround.rotation.x = -Math.PI / 2; surround.position.y = -0.03; surround.receiveShadow = true; S.add(surround);
    [-1, 1].forEach((s) => {
      const m = new T.Mesh(new T.PlaneGeometry(50, 4), new T.MeshLambertMaterial({ color: 0x1b2333, transparent: true, opacity: 0.85 }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, -0.02, s * (FW + 4)); S.add(m); G.teamAreas.push(m);
      const bench = new T.Mesh(new T.BoxGeometry(36, 0.5, 0.6), new T.MeshLambertMaterial({ color: 0x2a3142 }));
      bench.position.set(0, 0.25, s * (FW + 5.6)); S.add(bench);
    });
    G.fieldMat = new T.MeshLambertMaterial({ color: 0xffffff });
    const field = new T.Mesh(new T.PlaneGeometry(EL * 2, FW * 2), G.fieldMat);
    field.rotation.x = -Math.PI / 2; field.receiveShadow = true; S.add(field);

    G.crowdTex = crowdTexture('#ffc72c', '#1f4fd6');
    G.crowdMat = new T.MeshLambertMaterial({ map: G.crowdTex, emissive: 0xffffff, emissiveMap: G.crowdTex, emissiveIntensity: 0.2, side: T.DoubleSide });
    const wall = new T.MeshLambertMaterial({ color: 0x10141e, side: T.DoubleSide });
    const band = new T.MeshBasicMaterial({ color: 0x9fd2ff, side: T.DoubleSide, toneMapped: false });
    const rep = Math.round((2 * (RING_A + RING_B) * 1.9) / 22);
    S.add(ringStrip(0, 0, 0, 1.6, wall, 1));
    S.add(ringStrip(0.2, 1.6, 15, 9.5, G.crowdMat, rep));
    S.add(ringStrip(15, 9.5, 15, 12, wall, 1));
    S.add(ringStrip(14.95, 10.4, 14.95, 10.8, band, 1));
    S.add(ringStrip(15.4, 12, 33, 24, G.crowdMat, rep));
    S.add(ringStrip(33, 24, 33, 28, wall, 1));
    S.add(ringStrip(33.5, 28, 17, 30.5, new T.MeshLambertMaterial({ color: 0x0a0d14, side: T.DoubleSide }), 1));
    S.add(ringStrip(17, 30.5, 17, 29.9, band, 1));
    S.add(ringStrip(42, 0, 33.5, 28, new T.MeshLambertMaterial({ color: 0x0c1019, side: T.DoubleSide }), 1));

    const glow = glowTexture();
    const pt = { x: 0, z: 0 };
    for (let i = 0; i < 44; i++) {
      ringPoint((i / 44) * Math.PI * 2 + 0.05, 17.2, pt);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, toneMapped: false, fog: false }));
      sp.position.set(pt.x, 29.6, pt.z); sp.scale.setScalar(i % 5 === 0 ? 14 : 7);
      S.add(sp);
    }
    for (let i = 0; i < 18; i++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false, fog: false }));
      sp.scale.setScalar(3.4); sp.userData.t = 0;
      S.add(sp); G.flashes.push(sp);
    }
    const adTex = adTexture();
    const mkBoard = (len, x, z, ry, rep2) => {
      const t = adTex.clone(); t.needsUpdate = true; t.repeat.set(rep2, 1);
      const m = new T.Mesh(new T.PlaneGeometry(len, 1.25), new T.MeshBasicMaterial({ map: t, toneMapped: false }));
      m.position.set(x, 0.65, z); m.rotation.y = ry; S.add(m); G.ads.push(t);
      const back = new T.Mesh(new T.PlaneGeometry(len, 1.25), new T.MeshLambertMaterial({ color: 0x0c0f16 }));
      back.position.set(x, 0.65, z); back.rotation.y = ry + Math.PI; S.add(back);
    };
    mkBoard(EL * 2 + 8, 0, -FW - 7.6, 0, 4);
    mkBoard(EL * 2 + 8, 0, FW + 7.6, Math.PI, 4);
    mkBoard(FW * 2 + 15, -EL - 4.5, 0, Math.PI / 2, 2);
    mkBoard(FW * 2 + 15, EL + 4.5, 0, -Math.PI / 2, 2);

    // goal posts
    const yellow = new T.MeshStandardMaterial({ color: 0xffd400, roughness: 0.4, emissive: 0x4a3c00 });
    const pad = new T.MeshLambertMaterial({ color: 0x1a2a55 });
    [-1, 1].forEach((s) => {
      const g = new T.Group();
      const base = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 3.1, 12), yellow); base.position.set(s * 1.6, 1.55, 0); base.castShadow = true; g.add(base);
      const pd = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 2.1, 12), pad); pd.position.set(s * 1.6, 1.05, 0); g.add(pd);
      const neck = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 1.7, 10), yellow); neck.rotation.z = Math.PI / 2; neck.position.set(s * 0.8, 3.25, 0); g.add(neck);
      const bar = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 6.17, 12), yellow); bar.rotation.x = Math.PI / 2; bar.position.set(0, 3.33, 0); bar.castShadow = true; g.add(bar);
      [-1, 1].forEach((q) => {
        const up = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 10, 10), yellow); up.position.set(0, 3.33 + 5, q * 3.08); up.castShadow = true; g.add(up);
        const rib = new T.Mesh(new T.PlaneGeometry(0.18, 1.1), new T.MeshBasicMaterial({ color: 0xff5a1f, side: T.DoubleSide })); rib.position.set(0, 3.33 + 9.6, q * 3.08 + 0.05); g.add(rib);
      });
      g.position.x = s * EL;
      S.add(g);
    });
    const pylon = new T.MeshLambertMaterial({ color: 0xff6a13 });
    [-1, 1].forEach((sx) => [GL, EL].forEach((x) => [-1, 1].forEach((sz) => {
      const m = new T.Mesh(new T.BoxGeometry(0.16, 0.6, 0.16), pylon); m.position.set(sx * x, 0.3, sz * FW); m.castShadow = true; S.add(m);
    })));
    // line of scrimmage and line to gain
    const lineMat = (col) => new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    G.losLine = new T.Mesh(new T.PlaneGeometry(0.3, FW * 2), lineMat(0x3f86ff));
    G.fdLine = new T.Mesh(new T.PlaneGeometry(0.3, FW * 2), lineMat(0xffd400));
    [G.losLine, G.fdLine].forEach((l) => { l.rotation.x = -Math.PI / 2; l.position.y = 0.025; l.visible = false; l.renderOrder = 2; S.add(l); });
  }

  /* ---------- players ---------- */
  const GEO = {};
  const MATS = { skin: [] };
  function initShared() {
    const cyl = (rt, rb, h, seg, dy) => { const g = new T.CylinderGeometry(rt, rb, h, seg); if (dy) g.translate(0, dy, 0); return g; };
    GEO.torso = cyl(0.25, 0.18, 0.56, 18, 0.28);
    GEO.pads = new T.SphereGeometry(0.21, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); GEO.pads.scale(1.75, 0.62, 1.12);
    GEO.cap = new T.SphereGeometry(0.115, 10, 8);
    GEO.pants = cyl(0.19, 0.205, 0.3, 14, -0.1);
    GEO.thigh = cyl(0.098, 0.076, 0.44, 10, -0.22);
    GEO.shin = cyl(0.068, 0.05, 0.42, 8, -0.21);
    GEO.cleat = new T.BoxGeometry(0.11, 0.08, 0.28); GEO.cleat.translate(0, -0.45, 0.07);
    GEO.upArm = cyl(0.068, 0.056, 0.29, 8, -0.145);
    GEO.foreArm = cyl(0.052, 0.044, 0.26, 8, -0.13);
    GEO.hand = new T.SphereGeometry(0.06, 8, 6); GEO.hand.translate(0, -0.29, 0);
    GEO.neck = cyl(0.075, 0.08, 0.12, 10, 0);
    GEO.face = new T.SphereGeometry(0.118, 16, 12); GEO.face.scale(0.92, 1.05, 1);
    GEO.helmet = new T.SphereGeometry(0.168, 22, 16, Math.PI / 2 + 0.62, Math.PI * 2 - 1.24, 0, Math.PI * 0.78); GEO.helmet.scale(0.96, 1, 1.08);
    GEO.crown = new T.SphereGeometry(0.168, 22, 8, 0, Math.PI * 2, 0, Math.PI * 0.32); GEO.crown.scale(0.96, 1, 1.08);
    GEO.stripe = new T.TorusGeometry(0.171, 0.017, 4, 22, Math.PI * 1.05);
    GEO.bar = new T.TorusGeometry(0.15, 0.011, 5, 14, Math.PI * 0.62);
    GEO.vbar = new T.CylinderGeometry(0.01, 0.01, 0.14, 5);
    GEO.ring = new T.RingGeometry(0.75, 1.0, 40);
    GEO.arrow = new T.ConeGeometry(0.24, 0.42, 4);
    SKIN.forEach((c) => MATS.skin.push(new T.MeshLambertMaterial({ color: c })));
    MATS.mask = new T.MeshLambertMaterial({ color: 0xc9ced6 });
    MATS.dark = new T.MeshLambertMaterial({ color: 0x1b1d22 });
    MATS.glove = new T.MeshLambertMaterial({ color: 0x24262c });
    MATS.white = new T.MeshLambertMaterial({ color: 0xf2f2f2 });
  }

  function makeActor(p, kit) {
    const look = p.card.look || { skin: 2 };
    const jersey = new T.MeshLambertMaterial({ map: jerseyTexture(kit, p.num) });
    const sleeve = new T.MeshLambertMaterial({ color: kit.c1 });
    const pantsM = new T.MeshLambertMaterial({ color: kit.pants });
    const sockM = new T.MeshLambertMaterial({ color: U.shade(kit.c1 === '#f3f5f8' ? kit.c2 : kit.c1, -0.15) });
    const helmM = new T.MeshPhongMaterial({ color: kit.helm, shininess: 90, specular: 0x777777, side: T.DoubleSide });
    const stripeM = new T.MeshPhongMaterial({ color: inkOn(kit.helm, kit.c2 === kit.helm ? kit.c1 : kit.c2), shininess: 60 });
    const skin = MATS.skin[look.skin % SKIN.length];
    const mk = (geo, mat, parent, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; parent.add(m); return m; };
    const root = new T.Group(); root.rotation.order = 'YXZ';
    const pelvis = new T.Group(); pelvis.position.y = 0.95; root.add(pelvis);
    const body = new T.Group(); pelvis.add(body);
    const torso = mk(GEO.torso, jersey, body); torso.scale.set(1.18, 1, 0.78);
    mk(GEO.pads, sleeve, body, 0, 0.5, 0);
    mk(GEO.cap, sleeve, body, 0.31, 0.5, 0); mk(GEO.cap, sleeve, body, -0.31, 0.5, 0);
    const sh = mk(GEO.pants, pantsM, pelvis); sh.scale.set(1.14, 1, 0.84);
    mk(GEO.neck, skin, body, 0, 0.64, 0.01);
    const head = new T.Group(); head.position.set(0, 0.8, 0.01); body.add(head);
    mk(GEO.face, skin, head, 0, -0.01, 0.02);
    mk(GEO.helmet, helmM, head);
    mk(GEO.crown, helmM, head);
    const st = mk(GEO.stripe, stripeM, head, 0, 0.0, 0); st.rotation.set(0, Math.PI / 2, -Math.PI * 0.025);
    [-0.035, -0.085].forEach((y) => { const b = mk(GEO.bar, MATS.mask, head, 0, y, 0.035); b.rotation.set(Math.PI / 2, 0, Math.PI * 0.19); b.castShadow = false; });
    const vb = mk(GEO.vbar, MATS.mask, head, 0, -0.06, 0.185); vb.castShadow = false;
    const limb = (side) => {
      const arm = new T.Group(); arm.position.set(side * 0.32, 0.47, 0); body.add(arm);
      mk(GEO.upArm, skin, arm);
      const elbow = new T.Group(); elbow.position.y = -0.29; arm.add(elbow);
      mk(GEO.foreArm, skin, elbow);
      mk(GEO.hand, MATS.glove, elbow);
      const leg = new T.Group(); leg.position.set(side * 0.11, -0.05, 0); pelvis.add(leg);
      mk(GEO.thigh, pantsM, leg);
      const knee = new T.Group(); knee.position.y = -0.44; leg.add(knee);
      mk(GEO.shin, sockM, knee); mk(GEO.cleat, p.pos === 'K' ? MATS.white : MATS.dark, knee);
      return { arm, elbow, leg, knee };
    };
    const L = limb(1), R = limb(-1);
    root.scale.setScalar(1.12);
    root.visible = false;
    G.scene.add(root);
    return { p, root, pelvis, body, head, L, R, phase: Math.random() * 6, yaw: 0, mats: [jersey, sleeve, pantsM, sockM, helmM, stripeM] };
  }

  const J = (o, k, v, f) => { o.rotation[k] += (v - o.rotation[k]) * f; };
  function poseActor(a, dt, m) {
    const p = a.p;
    a.root.visible = p.onField;
    if (!p.onField) return;
    const sp = Math.hypot(p.vx, p.vz);
    a.phase += sp * dt * 2.3;
    const amp = clamp(sp / 8.5, 0, 1.1);
    const ph = a.phase, s = Math.sin(ph), c = Math.cos(ph);
    const f = 1 - Math.exp(-16 * dt);
    let thL = -s * 0.95 * amp, thR = s * 0.95 * amp;
    let knL = 0.15 + Math.max(0, c) * 1.4 * amp, knR = 0.15 + Math.max(0, -c) * 1.4 * amp;
    let aL = s * 0.85 * amp, aR = -s * 0.85 * amp, eL = -(0.3 + 1.0 * amp), eR = eL, azL = 0.16, azR = -0.16;
    let lean = 0.08 + 0.24 * amp, py = 0.95 + Math.abs(s) * 0.05 * amp, roll = 0, ry = 0, headX = 0, pitch = 0;
    const b = m.ball, hasBall = b.holder === p && (b.state === 'held' || b.state === 'placed');
    const k = p.act ? clamp(p.actT / p.actDur, 0, 1) : 0;
    const engaged = (p.engBy && p.engBy.length) || p.eng;
    if (p.stance && !p.act) {
      thL = -1.05; thR = -0.75; knL = 1.55; knR = 1.25; py = 0.6; lean = 1.0; aR = -1.45; eR = 0; aL = -0.55; eL = -0.5; azL = 0.25; azR = -0.1; headX = -0.7;
    } else if (p.kneel) {
      thL = -1.45; knL = 1.5; thR = 0.35; knR = 1.95; py = 0.5; lean = 0.25; aL = -1.0; aR = -1.0; eL = eR = -0.3; azL = -0.15; azR = 0.15;
    } else if (engaged) {
      thL = -0.55 + s * 0.25; thR = 0.15 - s * 0.25; knL = 0.7; knR = 0.5; py = 0.86; lean = 0.55; aL = aR = -1.45; eL = eR = -0.35; azL = -0.12; azR = 0.12; headX = -0.4;
    } else if (hasBall && p.job === 'qb' && !p.act) {
      aL = -0.9; eL = -1.3; aR = -1.1; eR = -1.6; azL = -0.2; azR = 0.3;
    } else if (hasBall && !p.act) {
      aR = -0.35; eR = -1.75; azR = 0.05;
    }
    if (p.act === 'throw') {
      if (k < 0.4) { aR = lerp(-1.1, -2.85, k / 0.4); eR = -1.4; azR = -0.25; } else { aR = lerp(-2.85, -0.9, (k - 0.4) / 0.6); eR = lerp(-1.4, -0.2, (k - 0.4) / 0.6); }
      aL = -1.0; eL = -0.6; lean = 0.2;
    } else if (p.act === 'catch') { aL = aR = -2.3; eL = eR = -0.4; azL = -0.1; azR = 0.1; }
    else if (p.act === 'jump') { const j = Math.sin(k * Math.PI); ry = j * 0.75; aL = aR = -3.0; eL = eR = -0.1; thL = thR = -0.2; knL = knR = 0.6 * (1 - j); }
    else if (p.act === 'kick') {
      if (k < 0.3) { thR = lerp(0.2, 0.85, k / 0.3); knR = 1.3; } else { thR = lerp(0.85, -1.7, clamp((k - 0.3) / 0.35, 0, 1)); knR = 0.05; }
      thL = -0.05; knL = 0.25; aL = -1.2; azL = 0.9; aR = 0.6; azR = -0.6; lean = -0.15;
    } else if (p.act === 'dive') {
      pitch = -1.15; py = 0.48; thL = -0.2; thR = 0.1; knL = 0.2; knR = 0.4; aL = aR = -2.9; eL = eR = -0.1; lean = 0.3;
    } else if (p.act === 'down' || p.act === 'tackled') {
      const g = p.act === 'tackled' ? clamp(p.actT / 0.4, 0, 1) : k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      pitch = (p.act === 'tackled' ? 1.3 : -1.25) * g; py = lerp(0.95, 0.35, g); thL = -0.5 * g; thR = -0.15 * g; knL = 0.9 * g; knR = 0.6 * g; aL = aR = -1.6 * g; eL = eR = -0.6;
    } else if (p.act === 'juke') { roll = (p.dvz * Math.cos(p.dir) - p.dvx * Math.sin(p.dir) > 0 ? -1 : 1) * 0.35 * Math.sin(k * Math.PI); }
    if (p.mood === 'celebrate') { aL = -2.8 + Math.sin(G.time * 11 + p.i) * 0.25; aR = -2.8 + Math.cos(G.time * 11 + p.i) * 0.25; eL = eR = -0.2; azL = 0.35; azR = -0.35; ry = Math.abs(Math.sin(G.time * 7 + p.i)) * 0.32; }
    else if (p.mood === 'sad') { headX = 0.55; lean = 0.22; aL = aR = 0.05; eL = eR = -0.1; }
    J(a.L.leg, 'x', thL, f); J(a.R.leg, 'x', thR, f); J(a.L.knee, 'x', knL, f); J(a.R.knee, 'x', knR, f);
    J(a.L.arm, 'x', aL, f); J(a.R.arm, 'x', aR, f); J(a.L.elbow, 'x', eL, f); J(a.R.elbow, 'x', eR, f);
    J(a.L.arm, 'z', azL, f); J(a.R.arm, 'z', azR, f);
    J(a.body, 'x', lean, f); J(a.pelvis, 'x', pitch, f); J(a.head, 'x', headX, f);
    a.pelvis.position.y += (py - a.pelvis.position.y) * f;
    J(a.root, 'z', roll, f);
    a.root.position.set(p.x, a.root.position.y + (ry - a.root.position.y) * f, p.z);
    const yaw = Math.atan2(Math.cos(p.dir), Math.sin(p.dir));
    const yr = p.act === 'spin' ? 40 : 14;
    a.yaw += U.angDiff(yaw, a.yaw) * (1 - Math.exp(-yr * dt));
    a.root.rotation.y = a.yaw;
  }

  /* ---------- the football ---------- */
  function buildBall() {
    const g = new T.Group();
    const geo = new T.SphereGeometry(1, 28, 18); geo.scale(0.125, 0.125, 0.205);
    const leather = new T.MeshStandardMaterial({ color: 0x7b3d1c, roughness: 0.55, metalness: 0.0, emissive: 0x1a0a03 });
    const m = new T.Mesh(geo, leather); m.castShadow = true; g.add(m);
    const lace = new T.MeshLambertMaterial({ color: 0xf6f1e6 });
    const spine = new T.Mesh(new T.BoxGeometry(0.016, 0.012, 0.13), lace); spine.position.set(0, 0.123, 0); g.add(spine);
    for (let i = -3; i <= 3; i++) { const l = new T.Mesh(new T.BoxGeometry(0.05, 0.012, 0.012), lace); l.position.set(0, 0.122, i * 0.019); g.add(l); }
    G.scene.add(g);
    G.ballG = g; G.ballMesh = m;
    g.visible = false;
  }
  const Q = {};
  function syncBall(m, dt) {
    const b = m.ball, g = G.ballG;
    g.visible = true;
    if ((b.state === 'held') && b.holder) {
      const p = b.holder, fx = Math.cos(p.dir), fz = Math.sin(p.dir), rx = -fz, rz = fx;
      let off = 0.32, side = -0.24, h = 1.2;
      if (p.job === 'qb' || p.job === 'handoff' || p.role === 'QB' && !m.passed) { off = 0.36; side = -0.1; h = 1.45; }
      if (p.act === 'throw') { const k = p.actT / p.actDur; h = 1.5 + Math.sin(k * Math.PI) * 0.6; side = -0.35; off = 0.1; }
      if (p.act === 'tackled') h = 0.5;
      g.position.set(p.x + fx * off + rx * side * -1, h, p.z + fz * off + rz * side * -1);
      Q.e.set(-0.45, Math.atan2(fx, fz), 0, 'YXZ');
      g.quaternion.setFromEuler(Q.e);
      return;
    }
    g.position.set(b.x, Math.max(0.13, b.y), b.z);
    if (b.state === 'air' && b.fl) {
      const f = b.fl;
      if (f.kind === 'fg' || f.kind === 'punt') {
        G.tumble += dt * (f.kind === 'fg' ? 11 : 7);
        Q.e.set(G.tumble, Math.atan2(f.x1 - f.x0, f.z1 - f.z0), 0, 'YXZ');
        g.quaternion.setFromEuler(Q.e);
      } else {
        const u = Math.min(1, f.t / f.T), h = 4 * f.h;
        const vx = (f.x1 - f.x0) / f.T, vz = (f.z1 - f.z0) / f.T, vy = (f.y1 - f.y0) / f.T + (h * (1 - 2 * u)) / f.T;
        Q.v.set(vx, vy, vz).normalize();
        Q.q.setFromUnitVectors(Q.zAxis, Q.v);
        G.spin += dt * 30;
        Q.q2.setFromAxisAngle(Q.zAxis, G.spin);
        g.quaternion.copy(Q.q).multiply(Q.q2);
      }
    } else if (b.state === 'snap' && b.snap) {
      Q.e.set(0, Math.atan2(b.snap.to.x - b.snap.x0, b.snap.to.z - b.snap.z0), 0, 'YXZ');
      g.quaternion.setFromEuler(Q.e);
    } else if (b.state === 'placed') {
      Q.e.set(-1.35, Math.PI / 2, 0, 'YXZ'); g.quaternion.setFromEuler(Q.e);
    } else if (b.state === 'set') {
      Q.e.set(0, Math.PI / 2, 0, 'YXZ'); g.quaternion.setFromEuler(Q.e);
    } else if (b.state === 'loose') {
      G.tumble += dt * 8 * Math.min(1, Math.hypot(b.vx, b.vz) / 3);
      Q.e.set(G.tumble, 0.6, 0, 'YXZ'); g.quaternion.setFromEuler(Q.e);
    }
  }

  /* ---------- route art ---------- */
  function ribbon(pts, width, color, arrow) {
    const pos = [], idx = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const nx = -dz * width * 0.5, nz = dx * width * 0.5;
      pos.push(pts[i].x + nx, 0.04, pts[i].z + nz, pts[i].x - nx, 0.04, pts[i].z - nz);
      if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    if (arrow && n >= 2) {
      const a = pts[n - 2], b = pts[n - 1];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const base = pos.length / 3, w = width * 1.8;
      pos.push(b.x - dz * w, 0.04, b.z + dx * w, b.x + dz * w, 0.04, b.z - dx * w, b.x + dx * w * 1.3, 0.04, b.z + dz * w * 1.3);
      idx.push(base, base + 1, base + 2, base + 1, base, base + 2);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    m.renderOrder = 3;
    return m;
  }
  G.showRoutes = function (list) {
    G.clearRoutes();
    if (!list || !list.length) return;
    const grp = new T.Group();
    list.forEach((r) => grp.add(ribbon(r.pts, r.kind === 'run' ? 0.5 : 0.32, r.color, true)));
    G.scene.add(grp);
    G.routeGroup = grp;
  };
  G.clearRoutes = function () {
    if (!G.routeGroup) return;
    G.routeGroup.children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
    G.scene.remove(G.routeGroup);
    G.routeGroup = null;
  };

  /* ---------- effects ---------- */
  function buildConfetti() {
    const N = 460, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    const pts = new T.Points(g, new T.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    pts.frustumCulled = false; pts.visible = false;
    G.scene.add(pts);
    G.confetti = { pts, pos, col, vel, N, t: 0 };
    for (let i = 0; i < 7; i++) {
      const n = 90, bp = new Float32Array(n * 3), bv = new Float32Array(n * 3);
      const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.BufferAttribute(bp, 3));
      const bm = new T.PointsMaterial({ size: 1.1, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, fog: false });
      const bpts = new T.Points(bg, bm); bpts.frustumCulled = false; bpts.visible = false;
      G.scene.add(bpts);
      G.bursts.push({ pts: bpts, pos: bp, vel: bv, n, t: 0, delay: 0 });
    }
  }
  function celebrateFx(x, z, colors) {
    const cf = G.confetti, c = new T.Color();
    for (let i = 0; i < cf.N; i++) {
      cf.pos[i * 3] = x + (Math.random() - 0.5) * 30; cf.pos[i * 3 + 1] = 9 + Math.random() * 16; cf.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 24;
      cf.vel[i * 3] = (Math.random() - 0.5) * 3; cf.vel[i * 3 + 1] = -2.5 - Math.random() * 3; cf.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      c.set(colors[i % colors.length]);
      cf.col[i * 3] = c.r; cf.col[i * 3 + 1] = c.g; cf.col[i * 3 + 2] = c.b;
    }
    cf.pts.geometry.attributes.color.needsUpdate = true;
    cf.t = 4.6; cf.pts.visible = true;
    const pt = { x: 0, z: 0 };
    G.bursts.forEach((bu, i) => {
      ringPoint(Math.atan2(z, x) + (i - 3) * 0.32 + (x > 0 ? 0 : Math.PI) * 0, 20, pt);
      const cx = Math.sign(x || 1) * (EL + 14) + (Math.random() - 0.5) * 10, cz = (i - 3) * 9, cy = 34 + Math.random() * 10;
      for (let j = 0; j < bu.n; j++) {
        bu.pos[j * 3] = cx; bu.pos[j * 3 + 1] = cy; bu.pos[j * 3 + 2] = cz;
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = 9 + Math.random() * 4;
        bu.vel[j * 3] = Math.sin(ph) * Math.cos(th) * sp; bu.vel[j * 3 + 1] = Math.cos(ph) * sp; bu.vel[j * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      }
      bu.pts.material.color.set(colors[i % colors.length]);
      bu.pts.geometry.attributes.position.needsUpdate = true;
      bu.t = 1.7; bu.delay = i * 0.28; bu.pts.visible = false;
    });
  }
  function stepEffects(dt) {
    const cf = G.confetti;
    if (cf.t > 0) {
      cf.t -= dt;
      for (let i = 0; i < cf.N; i++) {
        const k = i * 3;
        cf.pos[k] += (cf.vel[k] + Math.sin(G.time * 3 + i) * 1.4) * dt;
        cf.pos[k + 1] = Math.max(0.1, cf.pos[k + 1] + cf.vel[k + 1] * dt);
        cf.pos[k + 2] += (cf.vel[k + 2] + Math.cos(G.time * 2.3 + i) * 1.4) * dt;
      }
      cf.pts.geometry.attributes.position.needsUpdate = true;
      cf.pts.material.opacity = clamp(cf.t / 0.8, 0, 1);
      if (cf.t <= 0) cf.pts.visible = false;
    }
    G.bursts.forEach((bu) => {
      if (bu.t <= 0) return;
      if (bu.delay > 0) { bu.delay -= dt; return; }
      bu.pts.visible = true;
      bu.t -= dt;
      for (let j = 0; j < bu.n; j++) {
        const k = j * 3;
        bu.vel[k + 1] -= 6 * dt;
        bu.pos[k] += bu.vel[k] * dt; bu.pos[k + 1] += bu.vel[k + 1] * dt; bu.pos[k + 2] += bu.vel[k + 2] * dt;
        bu.vel[k] *= 0.985; bu.vel[k + 2] *= 0.985;
      }
      bu.pts.geometry.attributes.position.needsUpdate = true;
      bu.pts.material.opacity = clamp(bu.t / 1.0, 0, 1);
      if (bu.t <= 0) bu.pts.visible = false;
    });
    G.crowdJump = Math.max(0, G.crowdJump - dt * 0.22);
    G.crowdTex.offset.y = Math.abs(Math.sin(G.time * 9)) * 0.035 * G.crowdJump;
    const rate = 0.6 + G.crowdJump * 26;
    const pt = { x: 0, z: 0 };
    G.flashes.forEach((fl) => {
      if (fl.userData.t > 0) { fl.userData.t -= dt; fl.material.opacity = fl.userData.t > 0 ? 0.95 : 0; }
      else if (Math.random() < (rate * dt) / G.flashes.length * 4) {
        const d = Math.random() < 0.5 ? 2 + Math.random() * 12 : 17 + Math.random() * 14;
        ringPoint(Math.random() * Math.PI * 2, d, pt);
        const h = d < 15 ? 1.6 + (d / 15) * 7.9 : 12 + ((d - 15.4) / 17.6) * 12;
        fl.position.set(pt.x, h + 0.6, pt.z); fl.userData.t = 0.07 + Math.random() * 0.06;
      }
    });
    G.ads.forEach((t, i) => { t.offset.x = (G.time * 0.018 * (i % 2 ? -1 : 1)) % 1; });
  }

  /* ---------- camera ---------- */
  function layoutCamera() {
    const cam = G.camera, aspect = G.w / Math.max(1, G.h);
    cam.aspect = aspect;
    G.cam.portrait = aspect < 0.95;
    const hHalf = Math.tan(((G.cam.portrait ? 60 : 66) * Math.PI) / 360);
    cam.fov = clamp((2 * Math.atan(hHalf / aspect) * 180) / Math.PI, 30, G.cam.portrait ? 76 : 82);
    cam.updateProjectionMatrix();
  }
  function updateCamera(dt, m) {
    const C = G.cam, por = C.portrait;
    let px, py, pz, lx, ly, lz, k = 1 - Math.exp(-3.6 * dt);
    if (!m) {
      C.orbit += dt * 0.06;
      const r = 88;
      px = Math.cos(C.orbit) * r; pz = Math.sin(C.orbit) * r * 0.55; py = 26 + Math.sin(C.orbit * 0.7) * 5;
      lx = 0; ly = 2; lz = 0; k = 1 - Math.exp(-2 * dt);
    } else {
      const b = m.ball, back = por ? 12.5 : 14.5, height = por ? 15.5 : 8.6, ahead = por ? 6.5 : 10;
      let fx, fz;
      const userDef = m.user >= 0 && !m.userOnOffense();
      if (m.state === 'call' || m.state === 'presnap' || m.state === 'intro') {
        fx = m.los + (userDef ? -7 : -3.5); fz = m.ballZ * 0.6;
        if (m.play && m.play.special && m.state === 'presnap') fx = m.los - 6;
      } else {
        const car = m.carrier();
        fx = b.x; fz = b.z;
        if (car) { fx += car.vx * 0.25; fz += car.vz * 0.18; }
        if (b.state === 'air' && b.fl && (b.fl.kind === 'punt' || b.fl.kind === 'fg')) fx = lerp(b.fl.x0, b.fl.x1, 0.55 + 0.45 * Math.min(1, b.fl.t / b.fl.T));
      }
      let zoom = 1;
      if (m.state === 'score' && m.scorer) {
        const kk = clamp((m.stateT - 0.3) / 0.8, 0, 1) * (m.stateT < 4 ? 1 : 0);
        fx = lerp(fx, m.scorer.x, kk); fz = lerp(fz, m.scorer.z, kk); zoom = lerp(1, 0.55, kk);
      }
      fz = clamp(fz, -FW + 6, FW - 6);
      px = fx - back * zoom; py = height * zoom + 1.2; pz = fz * 0.55;
      lx = fx + ahead * zoom; ly = 0.6; lz = fz * 0.85;
      if (b.state === 'air' && b.fl && b.fl.kind === 'punt') { py += b.y * 0.25; ly = b.y * 0.4; }
      if (C.intro > 0) {
        C.intro = Math.max(0, C.intro - dt / 2.9);
        const e = C.intro * C.intro * (3 - 2 * C.intro);
        px = lerp(px, -20, e); py = lerp(py, 58, e); pz = lerp(pz, 70, e);
        lx = lerp(lx, 0, e); lz = lerp(lz, 0, e);
        k = 1;
      }
    }
    if (!C.init) k = 1;
    C.x += (px - C.x) * k; C.y += (py - C.y) * k; C.z += (pz - C.z) * k;
    C.tx += (lx - C.tx) * k; C.ty += (ly - C.ty) * k; C.tz += (lz - C.tz) * k;
    C.init = true;
    C.shake = Math.max(0, C.shake - dt * 2.4);
    const sh = C.shake * C.shake * 0.8;
    G.camera.position.set(C.x + (Math.random() - 0.5) * sh, C.y + (Math.random() - 0.5) * sh, C.z + (Math.random() - 0.5) * sh);
    G.camera.lookAt(C.tx, C.ty, C.tz);
    G.sun.target.position.set(C.tx, 0, C.tz);
    G.sun.position.set(C.tx - 30, 72, C.tz + 40);
  }

  /* ---------- public ---------- */
  G.init = function (canvas, quality) {
    T = window.THREE;
    if (!T) { G.failed = true; return false; }
    G.canvas = canvas; G.quality = quality == null ? 1 : quality;
    try { G.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
    catch (e) { G.failed = true; return false; }
    const R = G.renderer;
    R.outputEncoding = T.sRGBEncoding;
    R.toneMapping = T.ACESFilmicToneMapping;
    R.toneMappingExposure = 1.05;
    R.shadowMap.enabled = G.quality > 0;
    R.shadowMap.type = T.PCFSoftShadowMap;
    G.scene = new T.Scene();
    G.camera = new T.PerspectiveCamera(40, 1.6, 0.5, 700);
    Q.e = new T.Euler(); Q.v = new T.Vector3(); Q.q = new T.Quaternion(); Q.q2 = new T.Quaternion(); Q.zAxis = new T.Vector3(0, 0, 1);
    initShared();
    buildStadium();
    buildBall();
    buildConfetti();
    G.marker = new T.Mesh(GEO.ring, new T.MeshBasicMaterial({ color: 0xffe45c, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: T.DoubleSide }));
    G.marker.rotation.x = -Math.PI / 2; G.marker.visible = false; G.marker.renderOrder = 4; G.scene.add(G.marker);
    G.arrow = new T.Mesh(GEO.arrow, new T.MeshBasicMaterial({ color: 0xffe45c, toneMapped: false }));
    G.arrow.rotation.x = Math.PI; G.arrow.visible = false; G.scene.add(G.arrow);
    G.paintField({ name: 'Gridiron Kings', c1: '#ffc72c', c2: '#111827', letter: 'G' }, { name: 'Visitors', c1: '#1f4fd6', c2: '#ffffff' });
    G.resize();
    G.ready = true;
    return true;
  };

  G.paintField = function (home, away) {
    const old = G.fieldMat.map;
    G.fieldMat.map = fieldTexture(home, away);
    G.fieldMat.needsUpdate = true;
    if (old) old.dispose();
  };

  G.setQuality = function (q) {
    G.quality = q;
    if (!G.ready) return;
    G.renderer.shadowMap.enabled = q > 0;
    G.sun.castShadow = q > 0;
    G.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    G.resize();
  };

  G.resize = function () {
    if (!G.renderer) return;
    const w = G.canvas.clientWidth || window.innerWidth, h = G.canvas.clientHeight || window.innerHeight;
    G.w = w; G.h = h;
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, G.quality >= 1 ? 2 : 1.25));
    G.renderer.setSize(w, h, false);
    layoutCamera();
  };

  G.setupMatch = function (m, kits, names) {
    G.clearMatch();
    m.everyone.forEach((p) => { G.actors.push(makeActor(p, kits[p.team.idx])); });
    G.paintField({ name: names[0], c1: kits[0].c1, c2: kits[0].c2, letter: names[0][0].toUpperCase() }, { name: names[1], c1: kits[1].c1, c2: kits[1].c2 });
    const old = G.crowdTex;
    G.crowdTex = crowdTexture(kits[0].c1, kits[1].c1);
    G.crowdMat.map = G.crowdTex; G.crowdMat.emissiveMap = G.crowdTex; G.crowdMat.needsUpdate = true;
    old.dispose();
    G.teamAreas.forEach((a, i) => a.material.color.set(U.shade(kits[i === 0 ? 1 : 0].c1, -0.55)));
    G.cam.intro = 1; G.cam.init = false;
    G.kits = kits;
  };

  G.clearMatch = function () {
    G.actors.forEach((a) => {
      G.scene.remove(a.root);
      a.mats.forEach((mt) => { if (mt.map) mt.map.dispose(); mt.dispose(); });
    });
    G.actors.length = 0;
    G.clearRoutes();
    if (G.ballG) { G.ballG.visible = false; G.marker.visible = false; G.arrow.visible = false; G.losLine.visible = false; G.fdLine.visible = false; }
    G.cam.init = false;
  };

  G.onEvent = function (e, m) {
    if (e.type === 'td') {
      G.cam.shake = 0.8; G.crowdJump = 1;
      const kit = G.kits[e.data.team];
      celebrateFx(m.ball.x, m.ball.z, [kit.c1, kit.c2 === kit.c1 ? '#ffffff' : kit.c2, '#ffffff', '#ffd23f']);
    } else if (e.type === 'tackle' && e.data.big) { G.cam.shake = 0.9; G.crowdJump = Math.max(G.crowdJump, 0.45); }
    else if (e.type === 'int' || e.type === 'safety') { G.crowdJump = Math.max(G.crowdJump, 0.6); }
    else if (e.type === 'fg' && e.data.good) G.crowdJump = Math.max(G.crowdJump, 0.6);
    else if (e.type === 'catch' || e.type === 'firstdown') G.crowdJump = Math.max(G.crowdJump, 0.25);
    else if (e.type === 'snap') G.clearRoutes();
  };

  G.render = function (dt, m) {
    if (!G.ready) return;
    G.time += dt;
    if (m) {
      for (const a of G.actors) poseActor(a, dt, m);
      syncBall(m, dt);
      const c = m.ctrl;
      const showMk = c && c.onField && m.user >= 0 && (m.state === 'presnap' || m.state === 'live');
      G.marker.visible = G.arrow.visible = !!showMk;
      if (showMk) {
        const pulse = 1 + Math.sin(G.time * 7) * 0.06;
        G.marker.position.set(c.x, 0.05, c.z); G.marker.scale.setScalar(pulse);
        G.arrow.position.set(c.x, 2.55 + Math.sin(G.time * 5) * 0.07, c.z); G.arrow.rotation.y = G.time * 2;
      }
      const lines = m.state === 'call' || m.state === 'presnap' || m.state === 'live' || m.state === 'dead';
      G.losLine.visible = lines && !(m.state === 'dead' && m.result && m.result.change);
      G.fdLine.visible = G.losLine.visible && !(m.play && m.play.special && m.state !== 'call') && !m.goalToGo;
      G.losLine.position.set(m.los, 0.025, 0);
      G.fdLine.position.set(m.firstX, 0.026, 0);
    }
    stepEffects(dt);
    updateCamera(dt, m);
    G.renderer.render(G.scene, G.camera);
  };

  G.snapCamera = function () { G.cam.init = false; };
  const V = { v: null };
  G.project = function (x, y, z) {
    if (!V.v) V.v = new T.Vector3();
    V.v.set(x, y, z).project(G.camera);
    return { x: (V.v.x * 0.5 + 0.5) * G.w, y: (-V.v.y * 0.5 + 0.5) * G.h, vis: V.v.z < 1 && V.v.z > -1 };
  };

  FG.gfx = G;
})();
