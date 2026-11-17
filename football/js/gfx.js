/* Gridiron Kings — 3D rendering. Night stadium with a living crowd, light towers and video boards,
   painted field, players in full pads with glossy helmets, the football, weather, a broadcast camera,
   route art, and a post-processing pass (bloom, filmic tone curve, vignette).
   World units are yards; x runs goal to goal. */
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
    actors: [], ballG: null, marker: null, arrow: null, sun: null,
    cam: { x: -90, y: 40, z: 0, tx: 0, ty: 0, tz: 0, shake: 0, portrait: false, intro: 0, orbit: 0, init: false },
    basis: { rx: 0, rz: 1, ux: 1, uz: 0 },
    ads: [], crowdTex: null, crowdMat: null, crowd: null, crowdU: null, excite: 0, flashes: [], confetti: null, bursts: [],
    fieldMat: null, losLine: null, fdLine: null, routeGroup: null, teamAreas: [], beams: [], jumbo: [], post: null,
    blobs: null, trail: null, weather: null, weatherKind: 'clear', snowCover: null, time: 0, w: 0, h: 0, kits: null, names: null,
    spin: 0, tumble: 0, prScale: 1, perf: { t: 0, n: 0, sum: 0 },
  };
  G.RECV_COLORS = ['#ffd23f', '#35e0c2', '#ff6b81', '#7fb3ff', '#c792ff'];
  const SKIN = ['#f3cfae', '#e7b994', '#d29e74', '#b07850', '#7f5236', '#583725'];

  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
  }
  function canvasTex(w, h, draw, opts) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    if (!(opts && opts.linear)) t.encoding = T.sRGBEncoding;
    t.anisotropy = G.renderer ? G.renderer.capabilities.getMaxAnisotropy() : 1;
    if (opts && opts.repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }
  const inkOn = (bg, fg) => (U.colorDist(bg, fg) < 110 ? (U.lum(bg) > 0.55 ? '#10131a' : '#ffffff') : fg);
  const DISPLAY = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
  const hi = () => G.quality >= 1;

  /* ---------- geometry helpers ---------- */
  function M(x, y, z, rx, ry, rz, sx, sy, sz) {
    const m = new T.Matrix4();
    m.compose(new T.Vector3(x || 0, y || 0, z || 0), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)), new T.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
    return m;
  }
  function merge(parts) {
    let nv = 0, ni = 0;
    const gs = parts.map(([g, m]) => {
      let c = g.clone();
      if (!c.index) { const n = c.attributes.position.count, ix = []; for (let i = 0; i < n; i++) ix.push(i); c.setIndex(ix); }
      if (m) c.applyMatrix4(m);
      nv += c.attributes.position.count; ni += c.index.count;
      return c;
    });
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const hasCol = gs.some((c) => c.attributes.color), col = hasCol ? new Float32Array(nv * 3).fill(1) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    gs.forEach((c) => {
      const n = c.attributes.position.count;
      pos.set(c.attributes.position.array, vo * 3);
      nor.set(c.attributes.normal.array, vo * 3);
      if (c.attributes.uv) uv.set(c.attributes.uv.array, vo * 2);
      if (hasCol && c.attributes.color) col.set(c.attributes.color.array, vo * 3);
      const ia = c.index.array;
      for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
      vo += n; io += ia.length;
      c.dispose();
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    if (hasCol) g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setIndex(new T.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  function tint(geo, hex) {
    const g = geo.clone(), n = g.attributes.position.count, c = new T.Color(hex), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(a, 3));
    return g;
  }

  /* superellipse bowl around the field */
  const RING_A = EL + 10, RING_B = FW + 11, RING_N = 4.2;
  function ringPoint(t, d, out) {
    const c = Math.cos(t), s = Math.sin(t), e = 2 / RING_N;
    out.x = (RING_A + d) * Math.sign(c) * Math.pow(Math.abs(c), e);
    out.z = (RING_B + d) * Math.sign(s) * Math.pow(Math.abs(s), e);
    return out;
  }
  function ringStrip(d1, h1, d2, h2, mat, uRep, segs) {
    segs = segs || 160;
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
    const PX = hi() ? 28 : 18, W = 120 * PX, H = Math.round(53.333 * PX);
    const sy = H / 53.333;
    return canvasTex(W, H, (c) => {
      const frame = () => { c.setTransform(PX, 0, 0, sy, 60 * PX, 26.667 * sy); };
      frame();
      for (let i = 0; i < 20; i++) { c.fillStyle = i % 2 ? '#1c7431' : '#23853b'; c.fillRect(-50 + i * 5, -26.7, 5.03, 53.4); }
      for (let j = 0; j < 8; j++) { c.fillStyle = j % 2 ? 'rgba(0,30,0,0.05)' : 'rgba(255,255,255,0.02)'; c.fillRect(-50, -26.7 + j * 6.67, 100, 6.67); }
      [[-1, home], [1, away]].forEach(([s, t]) => {
        const x0 = s < 0 ? -60 : 50;
        c.fillStyle = U.shade(t.c1, -0.45); c.fillRect(x0, -26.7, 10, 53.4);
        c.save(); c.beginPath(); c.rect(x0, -26.7, 10, 53.4); c.clip();
        c.fillStyle = 'rgba(255,255,255,0.05)';
        for (let k = -40; k < 40; k += 2.4) { c.beginPath(); c.moveTo(x0 + k, -27); c.lineTo(x0 + k + 1.2, -27); c.lineTo(x0 + k + 1.2 + 54, 27); c.lineTo(x0 + k + 54, 27); c.fill(); }
        c.restore();
      });
      c.setTransform(1, 0, 0, 1, 0, 0);
      const n = Math.round(W * H * 0.028);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        c.fillStyle = Math.random() > 0.5 ? 'rgba(170,255,150,0.045)' : 'rgba(0,25,0,0.08)';
        c.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 3);
      }
      frame();
      const wear = c.createLinearGradient(0, -6, 0, 6);
      wear.addColorStop(0, 'rgba(150,130,70,0)'); wear.addColorStop(0.5, 'rgba(150,130,70,0.12)'); wear.addColorStop(1, 'rgba(150,130,70,0)');
      c.fillStyle = wear; c.fillRect(-48, -6, 96, 12);
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.fillRect(-60, -26.667, 120, 0.36); c.fillRect(-60, 26.667 - 0.36, 120, 0.36);
      c.fillRect(-60, -26.667, 0.36, 53.33); c.fillRect(60 - 0.36, -26.667, 0.36, 53.33);
      c.fillRect(-50 - 0.2, -26.667, 0.4, 53.33); c.fillRect(50 - 0.2, -26.667, 0.4, 53.33);
      for (let x = -45; x <= 45; x += 5) c.fillRect(x - 0.1, -26.3, 0.2, 52.6);
      for (let x = -49; x <= 49; x++) {
        if (x % 5 === 0) continue;
        [-1, 1].forEach((s) => { c.fillRect(x - 0.07, s * HASH - 0.35, 0.14, 0.7); c.fillRect(x - 0.07, s * (26.667 - 1.0) - 0.35, 0.14, 0.7); });
      }
      [-1, 1].forEach((s) => c.fillRect(s * 47.9 - 0.07, -0.5, 0.14, 1));
      c.font = '800 2.3px ' + DISPLAY;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let k = 1; k <= 9; k++) {
        const x = -50 + k * 10, num = String(50 - Math.abs(x));
        [-1, 1].forEach((s) => {
          const zc = s * (26.667 - 10);
          c.save(); c.translate(x, zc); if (s < 0) c.rotate(Math.PI);
          c.fillText(num[0], -0.95, 0); c.fillText(num[1], 0.95, 0);
          c.restore();
          if (x !== 0) {
            const g = Math.sign(x), ax = x + g * 2.25, az = zc + (s < 0 ? 0.55 : -0.55);
            c.beginPath(); c.moveTo(ax + g * 0.7, az); c.lineTo(ax, az - 0.32); c.lineTo(ax, az + 0.32); c.fill();
          }
        });
      }
      c.save();
      c.fillStyle = home.c1; c.strokeStyle = inkOn(home.c1, home.c2); c.lineWidth = 0.45;
      c.beginPath(); c.arc(0, 0, 4.4, 0, Math.PI * 2); c.fill(); c.stroke();
      c.lineWidth = 0.15; c.beginPath(); c.arc(0, 0, 3.7, 0, Math.PI * 2); c.stroke();
      c.fillStyle = inkOn(home.c1, home.c2); c.font = '900 5.4px ' + DISPLAY;
      c.rotate(Math.PI / 2);
      c.fillText(home.letter, 0, 0.35);
      c.restore();
      [[-1, home], [1, away]].forEach(([s, t]) => {
        c.save(); c.translate(s * 55, 0); c.rotate(s < 0 ? -Math.PI / 2 : Math.PI / 2);
        let fs = 5.6;
        c.font = `900 ${fs}px ${DISPLAY}`;
        const w = c.measureText(t.name.toUpperCase()).width;
        if (w > 44) { fs *= 44 / w; c.font = `900 ${fs}px ${DISPLAY}`; }
        c.lineWidth = 0.35; c.strokeStyle = U.shade(t.c1, -0.75);
        c.strokeText(t.name.toUpperCase(), 0, 0.3);
        c.fillStyle = inkOn(U.shade(t.c1, -0.45), t.c2 === '#ffffff' ? '#ffffff' : t.c2);
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
        }
      }
    }, { repeat: true });
  }
  function seatTexture() {
    return canvasTex(64, 64, (c) => {
      c.fillStyle = '#0b0f18'; c.fillRect(0, 0, 64, 64);
      for (let y = 0; y < 64; y += 8) { c.fillStyle = '#151c2c'; c.fillRect(0, y, 64, 4); c.fillStyle = '#070a11'; c.fillRect(0, y + 4, 64, 1); }
    }, { repeat: true });
  }
  function adTexture() {
    const W = 2048, H = 64;
    const words = [['GRIDIRON KINGS', '#ffd23f'], ['VOLTA ENERGY', '#35e0c2'], ['NIMBUS AIR', '#ffffff'], ['KICKR CLEATS', '#ff5a7a'], ['ZEST COLA', '#ffa630'], ['ORBIT MOBILE', '#7fb3ff']];
    return canvasTex(W, H, (c) => {
      c.fillStyle = '#070b14'; c.fillRect(0, 0, W, H);
      c.font = '800 40px ' + DISPLAY;
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
  function dotTexture() {
    return canvasTex(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
  }
  function blobTexture() {
    return canvasTex(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.55, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
  }
  function jerseyTexture(kit, num) {
    return canvasTex(512, 256, (c) => {
      c.fillStyle = kit.c1; c.fillRect(0, 0, 512, 256);
      c.fillStyle = U.shade(kit.c1, -0.3); c.globalAlpha = 0.45; c.fillRect(108, 0, 34, 256); c.fillRect(370, 0, 34, 256); c.globalAlpha = 1;
      const trim = kit.c2 === kit.c1 ? '#ffffff' : kit.c2;
      c.fillStyle = trim; c.fillRect(0, 0, 512, 12); c.fillRect(0, 26, 512, 6);
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, 226, 512, 30);
      const ink = inkOn(kit.c1, kit.c2), edge = U.lum(ink) > 0.5 ? U.shade(kit.c1, -0.6) : '#ffffff';
      c.font = '900 150px ' + DISPLAY;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const s = String(num);
      [256, 0, 512].forEach((x) => { c.lineJoin = 'round'; c.lineWidth = 14; c.strokeStyle = edge; c.strokeText(s, x, 128); c.fillStyle = ink; c.fillText(s, x, 128); });
      for (let i = 0; i < 2500; i++) { c.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'; c.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
    });
  }
  function stripeTexture(base, stripe, kind) {
    return canvasTex(128, 64, (c) => {
      c.fillStyle = base; c.fillRect(0, 0, 128, 64);
      c.fillStyle = stripe;
      if (kind === 'pants') { c.fillRect(28, 0, 8, 64); c.fillRect(92, 0, 8, 64); }
      else if (kind === 'sleeve') { c.fillRect(0, 40, 128, 7); c.fillRect(0, 51, 128, 4); }
      else if (kind === 'sock') { c.fillRect(0, 10, 128, 6); c.fillRect(0, 21, 128, 6); }
    });
  }
  function decalTexture(kit, letter) {
    return canvasTex(128, 128, (c) => {
      c.clearRect(0, 0, 128, 128);
      const ring = inkOn(kit.helm, kit.c2 === kit.helm ? kit.c1 : kit.c2);
      c.fillStyle = kit.c1 === kit.helm ? ring : kit.c1; c.strokeStyle = ring; c.lineWidth = 9;
      c.beginPath(); c.arc(64, 64, 46, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = inkOn(c.fillStyle, ring); c.font = '900 66px ' + DISPLAY; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(letter, 64, 68);
    });
  }
  function leatherTexture() {
    return canvasTex(256, 128, (c) => {
      c.fillStyle = '#7a3a18'; c.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 9000; i++) { c.fillStyle = Math.random() > 0.5 ? 'rgba(255,200,150,0.06)' : 'rgba(30,8,0,0.12)'; c.beginPath(); c.arc(Math.random() * 256, Math.random() * 128, 0.8 + Math.random() * 1.2, 0, 7); c.fill(); }
      const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
      c.fillStyle = g; c.fillRect(0, 0, 256, 128);
    });
  }
  function lampTexture() {
    return canvasTex(128, 64, (c) => {
      c.fillStyle = '#1a1f2b'; c.fillRect(0, 0, 128, 64);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
        const g = c.createRadialGradient(8 + x * 16, 8 + y * 16, 0, 8 + x * 16, 8 + y * 16, 8);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#fff6dc'); g.addColorStop(1, '#8a8a8a');
        c.fillStyle = g; c.fillRect(1 + x * 16, 1 + y * 16, 14, 14);
      }
    });
  }
  function beamTexture() {
    return canvasTex(8, 128, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.6, 'rgba(255,250,235,0.3)'); g.addColorStop(1, 'rgba(255,250,235,0)');
      c.fillStyle = g; c.fillRect(0, 0, 8, 128);
    });
  }
  function snowCoverTexture() {
    return canvasTex(512, 256, (c) => {
      c.clearRect(0, 0, 512, 256);
      for (let i = 0; i < 1500; i++) {
        const x = Math.random() * 512, y = Math.random() * 256, r = 1.5 + Math.random() * 5;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.26)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }, { repeat: true });
  }

  /* ---------- environment (reflections for helmets, ball and a wet field) ---------- */
  function buildEnv() {
    const s = new T.Scene();
    const sky = new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({
      side: T.BackSide,
      map: canvasTex(16, 256, (c) => { const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#05091a'); g.addColorStop(0.45, '#14223f'); g.addColorStop(0.55, '#2a2a30'); g.addColorStop(1, '#0a1a0c'); c.fillStyle = g; c.fillRect(0, 0, 16, 256); }),
    }));
    s.add(sky);
    const lamp = new T.MeshBasicMaterial({ color: new T.Color(1, 0.96, 0.88).multiplyScalar(10), side: T.DoubleSide });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const q = new T.Mesh(new T.PlaneGeometry(9, 3.5), lamp);
      q.position.set(Math.cos(a) * 40, 24, Math.sin(a) * 40); q.lookAt(0, 0, 0); s.add(q);
    }
    const band = new T.Mesh(new T.CylinderGeometry(44, 44, 16, 32, 1, true), new T.MeshBasicMaterial({ side: T.BackSide, color: new T.Color(0.32, 0.26, 0.22) }));
    band.position.y = 6; s.add(band);
    const pm = new T.PMREMGenerator(G.renderer);
    const rt = pm.fromScene(s, 0.02);
    pm.dispose();
    s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    G.scene.environment = rt.texture;
  }

  /* ---------- post-processing: bloom + filmic tone curve + vignette ---------- */
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  function buildPost() {
    const R = G.renderer;
    if (!R.capabilities.isWebGL2) return null;
    const ext = R.extensions;
    const float = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    const type = float ? T.HalfFloatType : T.UnsignedByteType;
    const rt = (samples, depth) => {
      const t = new T.WebGLRenderTarget(4, 4, { type, depthBuffer: !!depth, samples: samples || 0 });
      t.texture.generateMipmaps = false; t.texture.minFilter = T.LinearFilter; t.texture.magFilter = T.LinearFilter;
      return t;
    };
    const P = {
      float, scene: rt((window.devicePixelRatio || 1) >= 1.5 ? 2 : 4, true),
      lv: [0, 1, 2].map(() => ({ a: rt(), b: rt() })),
      bright: new T.ShaderMaterial({
        uniforms: { tex: { value: null }, th: { value: float ? 2.6 : 0.92 }, knee: { value: float ? 1.6 : 0.06 } },
        vertexShader: VS,
        fragmentShader: 'uniform sampler2D tex; uniform float th; uniform float knee; varying vec2 vUv; void main(){ vec3 c = texture2D(tex, vUv).rgb; float b = max(c.r, max(c.g, c.b)); float w = smoothstep(th, th + knee, b); gl_FragColor = vec4(c * w, 1.0); }',
        depthTest: false, depthWrite: false,
      }),
      blur: new T.ShaderMaterial({
        uniforms: { tex: { value: null }, dir: { value: new T.Vector2() } },
        vertexShader: VS,
        fragmentShader: 'uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 c = texture2D(tex, vUv).rgb * 0.227027; c += texture2D(tex, vUv + dir * 1.3846153846).rgb * 0.3162162162; c += texture2D(tex, vUv - dir * 1.3846153846).rgb * 0.3162162162; c += texture2D(tex, vUv + dir * 3.2307692308).rgb * 0.0702702703; c += texture2D(tex, vUv - dir * 3.2307692308).rgb * 0.0702702703; gl_FragColor = vec4(c, 1.0); }',
        depthTest: false, depthWrite: false,
      }),
      final: new T.ShaderMaterial({
        uniforms: { tScene: { value: null }, t1: { value: null }, t2: { value: null }, t3: { value: null }, strength: { value: 0.6 }, exposure: { value: 0.86 }, vig: { value: 0.95 }, time: { value: 0 }, flash: { value: 0 } },
        vertexShader: VS,
        fragmentShader: [
          'uniform sampler2D tScene, t1, t2, t3; uniform float strength, exposure, vig, time, flash; varying vec2 vUv;',
          'vec3 aces(vec3 x){ x *= 0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }',
          'vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }',
          'float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
          'void main(){',
          '  vec3 c = texture2D(tScene, vUv).rgb;',
          '  vec3 b = texture2D(t1, vUv).rgb * 0.6 + texture2D(t2, vUv).rgb * 0.5 + texture2D(t3, vUv).rgb * 0.45;',
          '  c += b * strength + flash;',
          '  c = aces(c * exposure);',
          '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.1);',
          '  c = pow(c, vec3(0.97, 0.99, 1.02));',
          '  vec2 d = vUv - 0.5; c *= 1.0 - vig * dot(d, d) * 1.25;',
          '  c = srgb(clamp(c, 0.0, 1.0));',
          '  c += (h(vUv * vec2(1931.0, 1171.0) + fract(time)) - 0.5) * 0.014;',
          '  gl_FragColor = vec4(c, 1.0);',
          '}',
        ].join('\n'),
        depthTest: false, depthWrite: false,
      }),
      qs: new T.Scene(), qc: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    };
    P.quad = new T.Mesh(new T.PlaneGeometry(2, 2), P.final);
    P.quad.frustumCulled = false;
    P.qs.add(P.quad);
    return P;
  }
  function sizePost() {
    const P = G.post; if (!P) return;
    const v = new T.Vector2(); G.renderer.getDrawingBufferSize(v);
    const w = Math.max(4, v.x), h = Math.max(4, v.y);
    P.scene.setSize(w, h);
    P.lv.forEach((l, i) => { const k = 2 << i; l.a.setSize(Math.max(2, w / k | 0), Math.max(2, h / k | 0)); l.b.setSize(Math.max(2, w / k | 0), Math.max(2, h / k | 0)); });
  }
  function pass(mat, target) {
    const P = G.post;
    P.quad.material = mat;
    G.renderer.setRenderTarget(target);
    G.renderer.render(P.qs, P.qc);
  }
  function renderPost() {
    const P = G.post, R = G.renderer;
    R.setRenderTarget(P.scene);
    R.render(G.scene, G.camera);
    P.bright.uniforms.tex.value = P.scene.texture;
    pass(P.bright, P.lv[0].a);
    let src = P.lv[0].a;
    P.lv.forEach((l, i) => {
      P.blur.uniforms.tex.value = src.texture;
      P.blur.uniforms.dir.value.set(1 / src.width, 0);
      pass(P.blur, l.b);
      P.blur.uniforms.tex.value = l.b.texture;
      P.blur.uniforms.dir.value.set(0, 1 / l.b.height);
      pass(P.blur, l.a);
      if (i + 1 < P.lv.length) src = l.a;
      P.blur.uniforms.tex.value = null;
    });
    const f = P.final.uniforms;
    f.tScene.value = P.scene.texture; f.t1.value = P.lv[0].a.texture; f.t2.value = P.lv[1].a.texture; f.t3.value = P.lv[2].a.texture;
    f.time.value = G.time; f.flash.value = Math.max(0, f.flash.value - (G.lastDt || 0.016) * 1.2);
    pass(P.final, null);
  }

  /* ---------- stadium ---------- */
  function buildStadium() {
    const S = G.scene;
    S.background = canvasTex(16, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#020410'); g.addColorStop(0.5, '#081028'); g.addColorStop(1, '#1a2850');
      c.fillStyle = g; c.fillRect(0, 0, 16, 256);
    });
    S.fog = new T.Fog(0x0a1126, 170, 520);
    S.add(new T.HemisphereLight(0xbfd4ff, 0x14301d, 0.42));
    const sun = (G.sun = new T.DirectionalLight(0xfff3e2, 1.35));
    sun.castShadow = true;
    sun.shadow.mapSize.set(hi() ? 2048 : 1024, hi() ? 2048 : 1024);
    const sc = sun.shadow.camera;
    sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 10; sc.far = 230;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    S.add(sun); S.add(sun.target);
    [[60, 55, -50, 0.42, 0xd6e4ff], [-60, 50, -55, 0.32, 0xd6e4ff], [55, 45, 55, 0.36, 0xffe6c4]].forEach(([x, y, z, i, col]) => {
      const l = new T.DirectionalLight(col, i); l.position.set(x, y, z); S.add(l);
    });

    const apron = new T.Mesh(new T.PlaneGeometry(480, 400), new T.MeshLambertMaterial({ color: 0x161b26 }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.06; S.add(apron);
    const surround = new T.Mesh(new T.PlaneGeometry(EL * 2 + 16, FW * 2 + 16), new T.MeshStandardMaterial({ color: 0x134d27, roughness: 0.95 }));
    surround.rotation.x = -Math.PI / 2; surround.position.y = -0.03; surround.receiveShadow = true; S.add(surround);
    const borderM = new T.MeshStandardMaterial({ color: 0xf3f6f8, roughness: 0.9 });
    [[0, -FW - 1, EL * 2 + 4, 2], [0, FW + 1, EL * 2 + 4, 2], [-EL - 1, 0, 2, FW * 2], [EL + 1, 0, 2, FW * 2]].forEach(([x, z, w, d]) => {
      const b = new T.Mesh(new T.PlaneGeometry(w, d), borderM); b.rotation.x = -Math.PI / 2; b.position.set(x, -0.015, z); b.receiveShadow = true; S.add(b);
    });
    [-1, 1].forEach((s) => {
      const m = new T.Mesh(new T.PlaneGeometry(52, 5), new T.MeshLambertMaterial({ color: 0x1b2333 }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, -0.02, s * (FW + 5)); S.add(m); G.teamAreas.push(m);
      const bench = new T.Mesh(new T.BoxGeometry(36, 0.55, 0.7), new T.MeshStandardMaterial({ color: 0x2a3142, roughness: 0.6, metalness: 0.3 }));
      bench.position.set(0, 0.28, s * (FW + 6.4)); bench.castShadow = true; S.add(bench);
    });
    G.fieldMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, envMapIntensity: 0.25 });
    const field = new T.Mesh(new T.PlaneGeometry(EL * 2, FW * 2), G.fieldMat);
    field.rotation.x = -Math.PI / 2; field.receiveShadow = true; S.add(field);
    G.snowCover = new T.Mesh(new T.PlaneGeometry(EL * 2 + 16, FW * 2 + 16), new T.MeshLambertMaterial({ map: snowCoverTexture(), color: 0xaab4c0, transparent: true, opacity: 0.8, depthWrite: false }));
    G.snowCover.material.map.repeat.set(16, 8);
    G.snowCover.rotation.x = -Math.PI / 2; G.snowCover.position.y = 0.015; G.snowCover.visible = false; G.snowCover.renderOrder = 1; S.add(G.snowCover);

    // bowl
    G.crowdTex = crowdTexture('#ffc72c', '#1f4fd6');
    G.crowdMat = new T.MeshLambertMaterial({ map: G.crowdTex, emissive: 0xffffff, emissiveMap: G.crowdTex, emissiveIntensity: 0.2, side: T.DoubleSide });
    G.seatMat = new T.MeshLambertMaterial({ map: seatTexture(), side: T.DoubleSide });
    G.seatMat.map.repeat.set(8, 14);
    const wall = new T.MeshStandardMaterial({ color: 0x10141e, roughness: 0.8, side: T.DoubleSide });
    const band = new T.MeshBasicMaterial({ color: new T.Color(0x9fd2ff).multiplyScalar(1.6), side: T.DoubleSide, toneMapped: false });
    const rep = Math.round((2 * (RING_A + RING_B) * 1.9) / 22);
    S.add(ringStrip(0, 0, 0, 1.6, wall, 1));
    G.tiers = [ringStrip(0.2, 1.6, 15, 9.5, G.crowdMat, rep), ringStrip(15.4, 12, 33, 24, G.crowdMat, rep)];
    G.tiers.forEach((t) => S.add(t));
    S.add(ringStrip(15, 9.5, 15, 12, wall, 1));
    S.add(ringStrip(14.95, 10.4, 14.95, 10.8, band, 1));
    S.add(ringStrip(33, 24, 33, 28, wall, 1));
    S.add(ringStrip(33.5, 28, 17, 30.5, new T.MeshStandardMaterial({ color: 0x0a0d14, roughness: 0.7, metalness: 0.4, side: T.DoubleSide }), 1));
    S.add(ringStrip(17, 30.5, 17, 29.9, band, 1));
    S.add(ringStrip(42, 0, 33.5, 28, new T.MeshLambertMaterial({ color: 0x0c1019, side: T.DoubleSide }), 1));

    const glow = glowTexture();
    const pt = { x: 0, z: 0 };
    for (let i = 0; i < 44; i++) {
      ringPoint((i / 44) * Math.PI * 2 + 0.05, 17.2, pt);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85, toneMapped: false, fog: false, color: new T.Color(1, 1, 1).multiplyScalar(2) }));
      sp.position.set(pt.x, 29.6, pt.z); sp.scale.setScalar(i % 5 === 0 ? 14 : 7);
      S.add(sp);
    }
    for (let i = 0; i < 18; i++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false, fog: false, color: new T.Color(1, 1, 1).multiplyScalar(3) }));
      sp.scale.setScalar(3.4); sp.userData.t = 0;
      S.add(sp); G.flashes.push(sp);
    }
    // light towers with glowing lamp banks and soft beams
    const lampM = new T.MeshBasicMaterial({ map: lampTexture(), color: new T.Color(1, 1, 1).multiplyScalar(4), toneMapped: false });
    const steel = new T.MeshStandardMaterial({ color: 0x2b3240, roughness: 0.5, metalness: 0.7 });
    const beamM = new T.MeshBasicMaterial({ map: beamTexture(), transparent: true, opacity: 0.075, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    [0.62, Math.PI - 0.62, Math.PI + 0.62, -0.62].forEach((t) => {
      ringPoint(t, 40, pt);
      const g = new T.Group();
      const pole = new T.Mesh(new T.CylinderGeometry(0.7, 1.1, 48, 10), steel); pole.position.y = 24; g.add(pole);
      const head = new T.Group(); head.position.y = 50; g.add(head);
      const frame = new T.Mesh(new T.BoxGeometry(14, 7, 1.2), steel); head.add(frame);
      const lamps = new T.Mesh(new T.PlaneGeometry(13, 6.2), lampM); lamps.position.z = 0.62; head.add(lamps);
      g.position.set(pt.x, 0, pt.z);
      S.add(g);
      head.lookAt(0, 0, 0);
      const to = new T.Vector3(-pt.x * 0.15, 0, -pt.z * 0.15), from = new T.Vector3(pt.x, 50, pt.z);
      const len = from.distanceTo(to);
      const cone = new T.Mesh(new T.CylinderGeometry(1.5, 22, len, 24, 1, true), beamM);
      cone.position.copy(from).lerp(to, 0.5);
      cone.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), to.clone().sub(from).normalize());
      cone.renderOrder = 5;
      S.add(cone); G.beams.push(cone);
      const hal = new T.Sprite(new T.SpriteMaterial({ map: glow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, toneMapped: false, fog: false, color: new T.Color(1, 0.97, 0.9).multiplyScalar(2.5) }));
      hal.position.set(pt.x * 0.985, 50, pt.z * 0.985); hal.scale.setScalar(34); S.add(hal);
    });
    // video boards above each end zone
    [-1, 1].forEach((s) => {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 224;
      const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
      const scr = new T.Mesh(new T.PlaneGeometry(26, 11.4), new T.MeshBasicMaterial({ map: tex, color: new T.Color(1, 1, 1).multiplyScalar(1.5), toneMapped: false }));
      const box = new T.Mesh(new T.BoxGeometry(28, 13.4, 1.5), steel);
      const legs = new T.Mesh(new T.BoxGeometry(1.2, 30, 1.2), steel);
      const g = new T.Group();
      box.position.z = -0.8; legs.position.set(0, -20, -1.2);
      g.add(box, scr, legs);
      g.position.set(s * (RING_A + 36), 40, 0);
      g.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      S.add(g);
      G.jumbo.push({ cv, ctx: cv.getContext('2d'), tex, sig: '' });
    });
    // stars
    const sp = [], N = 1400;
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.42 * Math.PI, r = 380;
      sp.push(Math.cos(th) * Math.sin(ph) * r, Math.cos(ph) * r * 0.6 + 40, Math.sin(th) * Math.sin(ph) * r);
    }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
    S.add(new T.Points(sg, new T.PointsMaterial({ color: 0xcfe0ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));

    const adTex = adTexture();
    const mkBoard = (len, x, z, ry, rep2) => {
      const t = adTex.clone(); t.needsUpdate = true; t.repeat.set(rep2, 1);
      const m = new T.Mesh(new T.PlaneGeometry(len, 1.25), new T.MeshBasicMaterial({ map: t, color: new T.Color(1, 1, 1).multiplyScalar(1.3), toneMapped: false }));
      m.position.set(x, 0.65, z); m.rotation.y = ry; S.add(m); G.ads.push(t);
      const back = new T.Mesh(new T.PlaneGeometry(len, 1.25), new T.MeshLambertMaterial({ color: 0x0c0f16 }));
      back.position.set(x, 0.65, z); back.rotation.y = ry + Math.PI; S.add(back);
    };
    mkBoard(EL * 2 + 10, 0, -FW - 9.2, 0, 4);
    mkBoard(EL * 2 + 10, 0, FW + 9.2, Math.PI, 4);
    mkBoard(FW * 2 + 18, -EL - 5.5, 0, Math.PI / 2, 2);
    mkBoard(FW * 2 + 18, EL + 5.5, 0, -Math.PI / 2, 2);

    // goal posts
    const yellow = new T.MeshStandardMaterial({ color: 0xffd400, roughness: 0.32, metalness: 0.2, emissive: 0x3a2e00 });
    const pad = new T.MeshStandardMaterial({ color: 0x1a2a55, roughness: 0.7 });
    [-1, 1].forEach((s) => {
      const g = new T.Group();
      const base = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 3.1, 14), yellow); base.position.set(s * 1.6, 1.55, 0); base.castShadow = true; g.add(base);
      const pd = new T.Mesh(new T.CylinderGeometry(0.36, 0.36, 2.2, 16), pad); pd.position.set(s * 1.6, 1.1, 0); g.add(pd);
      const neck = new T.Mesh(new T.TorusGeometry(0.8, 0.13, 8, 16, Math.PI / 2), yellow); neck.position.set(s * 0.8, 2.45, 0); neck.rotation.set(0, s > 0 ? 0 : Math.PI, 0); g.add(neck);
      const bar = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 6.17, 14), yellow); bar.rotation.x = Math.PI / 2; bar.position.set(0, 3.33, 0); bar.castShadow = true; g.add(bar);
      [-1, 1].forEach((q) => {
        const up = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 10, 12), yellow); up.position.set(0, 3.33 + 5, q * 3.08); up.castShadow = true; g.add(up);
        const rib = new T.Mesh(new T.PlaneGeometry(0.2, 1.2), new T.MeshBasicMaterial({ color: 0xff5a1f, side: T.DoubleSide })); rib.position.set(0, 3.33 + 9.6, q * 3.08 + 0.06); g.add(rib);
      });
      g.position.x = s * EL;
      S.add(g);
    });
    const pylon = new T.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.6, emissive: 0x401400 });
    [-1, 1].forEach((sx) => [GL, EL].forEach((x) => [-1, 1].forEach((sz) => {
      const m = new T.Mesh(new T.BoxGeometry(0.16, 0.6, 0.16), pylon); m.position.set(sx * x, 0.3, sz * FW); m.castShadow = true; S.add(m);
    })));
    const lineMat = (col) => new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(1.25), transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    G.losLine = new T.Mesh(new T.PlaneGeometry(0.3, FW * 2), lineMat(0x3f86ff));
    G.fdLine = new T.Mesh(new T.PlaneGeometry(0.3, FW * 2), lineMat(0xffd400));
    [G.losLine, G.fdLine].forEach((l) => { l.rotation.x = -Math.PI / 2; l.position.y = 0.025; l.visible = false; l.renderOrder = 2; S.add(l); });
  }

  /* ---------- a living crowd: thousands of fans in one draw call ---------- */
  function buildCrowd(home, away) {
    if (G.crowd) { G.scene.remove(G.crowd); G.crowd.geometry.dispose(); G.crowd = null; }
    if (!hi()) { G.tiers.forEach((t) => (t.material = G.crowdMat)); return; }
    G.tiers.forEach((t) => (t.material = G.seatMat));
    const person = merge([
      [new T.BoxGeometry(0.46, 0.5, 0.3), M(0, 0.25, 0)],
      [new T.BoxGeometry(0.24, 0.24, 0.24), M(0, 0.66, 0)],
      [new T.BoxGeometry(0.74, 0.11, 0.11), M(0, 0.46, 0.04)],
    ]);
    const spots = [], pt = { x: 0, z: 0 };
    const tiers = [[0.9, 14.6, 1.6, 9.5, 0.95], [16.2, 32.6, 12, 24, 1.12]];
    tiers.forEach(([d0, d1, h0, h1, gap]) => {
      const rows = Math.floor((d1 - d0) / 1.05);
      for (let r = 0; r < rows; r++) {
        const k = (r + 0.5) / rows, d = lerp(d0, d1, k), h = lerp(h0, h1, k);
        const per = 2 * Math.PI * Math.sqrt(((RING_A + d) ** 2 + (RING_B + d) ** 2) / 2) * 1.08;
        const n = Math.floor(per / gap);
        for (let i = 0; i < n; i++) {
          if (Math.random() < 0.05) continue;
          ringPoint(((i + (r % 2) * 0.5) / n) * Math.PI * 2, d, pt);
          spots.push(pt.x, h, pt.z);
        }
      }
    });
    const count = spots.length / 3;
    const mat = new T.MeshLambertMaterial({ color: 0xffffff });
    G.crowdU = { uTime: { value: 0 }, uExcite: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = G.crowdU.uTime; sh.uniforms.uExcite = G.crowdU.uExcite;
      sh.vertexShader = 'attribute float aPhase;\nuniform float uTime;\nuniform float uExcite;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float ph = aPhase * 6.2831;',
        'float on = step(0.72 - uExcite * 0.7, fract(aPhase * 13.7));',
        'float hop = max(0.0, sin(uTime * (4.0 + aPhase * 3.0) + ph));',
        'transformed.y += hop * (0.06 + uExcite * 0.42) * on;',
        'if (position.y > 0.38 && position.y < 0.55 && abs(position.x) > 0.25) transformed.y += uExcite * on * (0.25 + 0.35 * hop);',
        'transformed.x += sin(uTime * 1.4 + ph) * 0.03;',
      ].join('\n'));
    };
    const im = new T.InstancedMesh(person, mat, count);
    const phase = new Float32Array(count);
    const pal = [];
    for (let i = 0; i < 10; i++) pal.push(home);
    pal.length = 6;
    pal.push(U.shade(home, -0.4), U.shade(home, -0.2), away, away, U.shade(away, -0.3), '#d8dbe0', '#20242e', '#20242e', '#2b3a55', '#3a3f4b', '#5b6170', '#8a4a3a', '#1b2a44', '#6c7a89');
    const col = new T.Color(), m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), sc = new T.Vector3();
    for (let i = 0; i < count; i++) {
      const x = spots[i * 3], y = spots[i * 3 + 1], z = spots[i * 3 + 2];
      const fx = clamp(x, -EL, EL) - x, fz = clamp(z, -FW, FW) - z;
      q.setFromAxisAngle(up, Math.atan2(fx, fz));
      sc.setScalar(1.05 + Math.random() * 0.15);
      m4.compose(new T.Vector3(x, y, z), q, sc);
      im.setMatrixAt(i, m4);
      col.set(pal[Math.floor(Math.random() * pal.length)]);
      col.multiplyScalar(0.42 + Math.random() * 0.28);
      im.setColorAt(i, col);
      phase[i] = Math.random();
    }
    person.setAttribute('aPhase', new T.InstancedBufferAttribute(phase, 1));
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    G.scene.add(im);
    G.crowd = im;
  }

  /* ---------- video boards ---------- */
  function drawJumbo(m) {
    let sig, flash = G.jumboFlash > 0;
    if (!m) sig = 'menu';
    else {
      const mm = Math.floor(m.clock / 60), ss = Math.floor(m.clock % 60);
      sig = [m.score[0], m.score[1], m.quarter, mm, ss, m.down, Math.round(m.toGo), flash ? Math.floor(G.time * 3) % 2 : '-', m.poss].join('|');
    }
    G.jumbo.forEach((j) => {
      if (j.sig === sig) return;
      j.sig = sig;
      const c = j.ctx, W = 512, H = 224;
      c.fillStyle = '#04070f'; c.fillRect(0, 0, W, H);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (!m) {
        c.fillStyle = '#ffd23f'; c.font = '900 70px ' + DISPLAY; c.fillText('GRIDIRON', W / 2, 78); c.fillStyle = '#ffffff'; c.fillText('KINGS', W / 2, 150);
      } else if (flash) {
        const k = G.kits[G.jumboTeam] || { c1: '#ffd23f', c2: '#111' };
        const on = Math.floor(G.time * 3) % 2 === 0;
        c.fillStyle = on ? k.c1 : '#04070f'; c.fillRect(0, 0, W, H);
        c.fillStyle = on ? inkOn(k.c1, k.c2) : k.c1; c.font = '900 92px ' + DISPLAY; c.fillText('TOUCHDOWN', W / 2, H / 2 + 4);
      } else {
        const k0 = G.kits[0], k1 = G.kits[1];
        [[0, 128, k0], [1, 384, k1]].forEach(([i, x, k]) => {
          c.fillStyle = k.c1; c.fillRect(x - 118, 18, 236, 10);
          c.fillStyle = '#ffffff'; c.font = '800 38px ' + DISPLAY; c.fillText(m.teams[i].short + (m.poss === i ? ' •' : ''), x, 58);
          c.font = '900 96px ' + DISPLAY; c.fillText(String(m.score[i]), x, 128);
        });
        const mm = Math.floor(m.clock / 60), ss = Math.floor(m.clock % 60);
        c.fillStyle = '#ffd23f'; c.fillRect(176, 172, 160, 40);
        c.fillStyle = '#1b1500'; c.font = '800 30px ' + DISPLAY; c.fillText('Q' + m.quarter + '  ' + mm + ':' + String(ss).padStart(2, '0'), W / 2, 193);
        c.fillStyle = '#c9d6f2'; c.font = '700 26px ' + DISPLAY; c.fillText(m.downText().toUpperCase(), W / 2, 100);
      }
      c.fillStyle = 'rgba(0,0,0,0.32)';
      for (let x = 0; x < W; x += 3) c.fillRect(x, 0, 1, H);
      for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
      j.tex.needsUpdate = true;
    });
  }

  /* ---------- players ---------- */
  const GEO = {}, MATS = { skin: [] };
  function initShared() {
    const lathe = (pts, seg) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg || 22);
    GEO.torso = lathe([[0.16, 0], [0.19, 0.12], [0.235, 0.32], [0.255, 0.46], [0.24, 0.56], [0.13, 0.63]]);
    GEO.torso.scale(1.25, 1, 0.8);
    GEO.pads = new T.SphereGeometry(0.25, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55); GEO.pads.scale(1.6, 0.6, 1.05);
    GEO.cap = new T.SphereGeometry(0.135, 14, 10); GEO.cap.scale(1, 0.82, 1.08);
    GEO.padsAll = merge([[GEO.pads, M(0, 0.5, 0)], [GEO.cap, M(0.33, 0.5, 0)], [GEO.cap, M(-0.33, 0.5, 0)]]);
    GEO.sleeve = new T.CylinderGeometry(0.105, 0.098, 0.15, 14, 1, true); GEO.sleeve.translate(0, -0.06, 0);
    GEO.pants = lathe([[0.17, -0.22], [0.205, -0.12], [0.215, 0.0], [0.19, 0.08]]); GEO.pants.scale(1.12, 1, 0.84);
    GEO.thigh = new T.CapsuleGeometry(0.09, 0.28, 4, 12); GEO.thigh.translate(0, -0.22, 0);
    GEO.shin = new T.CapsuleGeometry(0.064, 0.3, 4, 10); GEO.shin.translate(0, -0.21, 0);
    GEO.cleat = merge([[new T.BoxGeometry(0.115, 0.075, 0.27), M(0, -0.44, 0.07)], [new T.BoxGeometry(0.12, 0.025, 0.29), M(0, -0.485, 0.075)]]);
    GEO.upArm = new T.CapsuleGeometry(0.064, 0.17, 4, 10); GEO.upArm.translate(0, -0.15, 0);
    GEO.foreArm = new T.CapsuleGeometry(0.052, 0.16, 4, 10); GEO.foreArm.translate(0, -0.13, 0);
    GEO.band = new T.CylinderGeometry(0.058, 0.058, 0.06, 12, 1, true); GEO.band.translate(0, -0.23, 0);
    GEO.glove = new T.CapsuleGeometry(0.058, 0.05, 4, 10); GEO.glove.translate(0, -0.3, 0); GEO.glove.scale(1, 1, 0.75);
    GEO.neck = new T.CylinderGeometry(0.078, 0.085, 0.14, 12); GEO.neck.translate(0, 0.66, 0.01);
    GEO.collar = new T.TorusGeometry(0.1, 0.022, 6, 18); GEO.collar.rotateX(Math.PI / 2); GEO.collar.translate(0, 0.62, 0.01);
    GEO.face = new T.SphereGeometry(0.118, 16, 12); GEO.face.scale(0.92, 1.05, 1);
    const shell = (ps, pl, ts, tl) => new T.SphereGeometry(0.172, 30, 20, ps, pl, ts, tl);
    GEO.helmet = merge([[shell(0, Math.PI * 2, 0, Math.PI * 0.5)], [shell(Math.PI / 2 + 0.7, Math.PI * 2 - 1.4, Math.PI * 0.5, Math.PI * 0.3)]]);
    GEO.helmet.scale(0.97, 1.0, 1.1);
    GEO.stripe = new T.TorusGeometry(0.175, 0.018, 6, 30, Math.PI * 1.08);
    GEO.decal = merge([[new T.SphereGeometry(0.1745, 10, 10, -0.5, 1.0, Math.PI * 0.26, Math.PI * 0.32)], [new T.SphereGeometry(0.1745, 10, 10, Math.PI - 0.5, 1.0, Math.PI * 0.26, Math.PI * 0.32)]]);
    GEO.decal.scale(0.97, 1, 1.1);
    const bars = [];
    [-0.03, -0.075, -0.115].forEach((y, i) => { const tb = new T.TorusGeometry(0.162 - i * 0.004, 0.0105, 6, 18, Math.PI * (0.66 - i * 0.05)); bars.push([tb, M(0, y, 0.025, Math.PI / 2, 0, Math.PI * (0.17 + i * 0.025))]); });
    [-0.045, 0.045].forEach((x) => bars.push([new T.CylinderGeometry(0.009, 0.009, 0.12, 6), M(x, -0.075, 0.19, 0.25, 0, 0)]));
    [-1, 1].forEach((s) => bars.push([new T.CylinderGeometry(0.011, 0.011, 0.11, 6), M(s * 0.13, -0.07, 0.11, 0.2, 0, 0)]));
    GEO.mask = merge(bars);
    GEO.visor = new T.SphereGeometry(0.158, 16, 8, Math.PI / 2 - 0.62, 1.24, Math.PI * 0.4, Math.PI * 0.14); GEO.visor.scale(0.97, 1, 1.1);
    GEO.towel = new T.PlaneGeometry(0.11, 0.26); GEO.towel.translate(0, -0.15, 0);
    GEO.ring = new T.RingGeometry(0.75, 1.0, 48);
    GEO.arrow = new T.ConeGeometry(0.24, 0.42, 4);
    SKIN.forEach((c) => MATS.skin.push(new T.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0, envMapIntensity: 0.4 })));
    MATS.mask = new T.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.32, metalness: 0.75 });
    MATS.maskDark = new T.MeshStandardMaterial({ color: 0x23262d, roughness: 0.35, metalness: 0.6 });
    MATS.visor = new T.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.6, transparent: true, opacity: 0.88 });
    MATS.cleat = new T.MeshStandardMaterial({ color: 0x15171c, roughness: 0.4, metalness: 0.1 });
    MATS.cleatW = new T.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.45 });
    MATS.white = new T.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.8, side: T.DoubleSide });
  }

  const helmCache = new Map();
  function helmetGeo(kit) {
    const key = kit.helm + kit.c1 + kit.c2;
    if (helmCache.has(key)) return helmCache.get(key);
    const g = merge([[tint(GEO.helmet, kit.helm)], [tint(GEO.stripe, inkOn(kit.helm, kit.c2 === kit.helm ? kit.c1 : kit.c2)), M(0, 0, 0, 0, Math.PI / 2, -Math.PI * 0.03)]]);
    helmCache.set(key, g);
    return g;
  }
  function makeActor(p, kit, letter) {
    const look = p.card.look || { skin: 2 };
    const trim = kit.c2 === kit.c1 ? '#ffffff' : kit.c2;
    const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.72, metalness: 0, envMapIntensity: 0.5 }, o));
    const jersey = std({ map: jerseyTexture(kit, p.num), roughness: 0.68 });
    const sleeveC = std({ map: stripeTexture(kit.c1, trim, 'sleeve'), side: T.DoubleSide });
    const padM = std({ color: kit.c1, roughness: 0.66 });
    const trimM = std({ color: trim, roughness: 0.6 });
    const pantsM = std({ map: stripeTexture(kit.pants, U.colorDist(kit.pants, trim) < 90 ? kit.c1 : trim, 'pants'), roughness: 0.5, envMapIntensity: 0.7 });
    const sockBase = kit.c1 === '#f3f5f8' ? kit.c2 : kit.c1;
    const sockM = std({ map: stripeTexture(U.shade(sockBase, -0.1), '#ffffff', 'sock'), roughness: 0.8 });
    const helmM = new T.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.25 });
    const helmGeo = helmetGeo(kit);
    const decalM = new T.MeshStandardMaterial({ map: decalTexture(kit, letter), transparent: true, roughness: 0.25, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const skin = MATS.skin[look.skin % SKIN.length];
    const skinHex = SKIN[look.skin % SKIN.length];
    const handGeo = merge([[tint(GEO.foreArm, skinHex)], [tint(GEO.band, '#f2f2f2')], [tint(GEO.glove, p.pos === 'OL' || p.pos === 'DL' ? '#1e2026' : trim)]]);
    const handM = std({ color: 0xffffff, vertexColors: true, roughness: 0.6 });
    const big = p.pos === 'OL' || p.pos === 'DL';
    const mk = (geo, mat, parent, x, y, z, shadow) => { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = shadow !== false; parent.add(m); return m; };
    const root = new T.Group(); root.rotation.order = 'YXZ';
    const pelvis = new T.Group(); pelvis.position.y = 0.97; root.add(pelvis);
    const body = new T.Group(); pelvis.add(body);
    const torso = mk(GEO.torso, jersey, body);
    if (big) torso.scale.set(1.12, 1, 1.12);
    mk(GEO.padsAll, padM, body);
    mk(GEO.neck, skin, body, 0, 0, 0, false);
    mk(GEO.collar, trimM, body, 0, 0, 0, false);
    mk(GEO.pants, pantsM, pelvis);
    if (p.pos === 'WR' || p.pos === 'RB' || p.pos === 'QB' || p.pos === 'CB') { const tw = mk(GEO.towel, MATS.white, pelvis, 0.1, -0.02, 0.17, false); tw.rotation.x = 0.15; }
    const head = new T.Group(); head.position.set(0, 0.8, 0.01); body.add(head);
    mk(GEO.face, skin, head, 0, -0.01, 0.02, false);
    mk(helmGeo, helmM, head);
    mk(GEO.decal, decalM, head, 0, 0, 0, false);
    mk(GEO.mask, U.lum(kit.helm) < 0.25 ? MATS.mask : (p.i % 3 === 0 ? MATS.maskDark : MATS.mask), head, 0, 0, 0, false);
    if (look.brow === 1 && !big) mk(GEO.visor, MATS.visor, head, 0, 0, 0, false);
    const limb = (side) => {
      const arm = new T.Group(); arm.position.set(side * 0.34, 0.47, 0); body.add(arm);
      mk(GEO.sleeve, sleeveC, arm, 0, 0, 0, false);
      mk(GEO.upArm, big ? padM : skin, arm, 0, 0, 0, false);
      const elbow = new T.Group(); elbow.position.y = -0.29; arm.add(elbow);
      mk(handGeo, handM, elbow, 0, 0, 0, false);
      const leg = new T.Group(); leg.position.set(side * 0.11, -0.06, 0); pelvis.add(leg);
      mk(GEO.thigh, pantsM, leg);
      const knee = new T.Group(); knee.position.y = -0.44; leg.add(knee);
      mk(GEO.shin, sockM, knee); mk(GEO.cleat, p.pos === 'K' || p.i % 2 ? MATS.cleatW : MATS.cleat, knee, 0, 0, 0, false);
      return { arm, elbow, leg, knee };
    };
    const L = limb(1), R = limb(-1);
    root.scale.setScalar(big ? 1.16 : 1.12);
    root.visible = false;
    G.scene.add(root);
    return { p, root, pelvis, body, head, L, R, phase: Math.random() * 6, yaw: 0, mats: [jersey, sleeveC, padM, trimM, pantsM, sockM, helmM, decalM, handM], geos: [handGeo], scale: root.scale.x };
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
    let knL = 0.15 + Math.max(0, c) * 1.45 * amp, knR = 0.15 + Math.max(0, -c) * 1.45 * amp;
    let aL = s * 0.9 * amp, aR = -s * 0.9 * amp, eL = -(0.3 + 1.05 * amp), eR = eL, azL = 0.14, azR = -0.14;
    let lean = 0.08 + 0.26 * amp, py = 0.97 + Math.abs(s) * 0.05 * amp, roll = 0, ry = 0, headX = 0, pitch = 0;
    const b = m.ball, hasBall = b.holder === p && (b.state === 'held' || b.state === 'placed');
    const k = p.act ? clamp(p.actT / p.actDur, 0, 1) : 0;
    const engaged = (p.engBy && p.engBy.length) || p.eng;
    if (!p.act && amp < 0.15 && !p.stance && !p.kneel && !engaged) { const br = Math.sin(G.time * 2.2 + p.i) * 0.02; lean += br; aL += 0.05; aR += 0.05; }
    if (p.stance && !p.act) {
      thL = -1.05; thR = -0.75; knL = 1.55; knR = 1.25; py = 0.6; lean = 1.0; aR = -1.45; eR = 0; aL = -0.55; eL = -0.5; azL = 0.25; azR = -0.1; headX = -0.7;
    } else if (p.kneel) {
      thL = -1.45; knL = 1.5; thR = 0.35; knR = 1.95; py = 0.5; lean = 0.25; aL = -1.0; aR = -1.0; eL = eR = -0.3; azL = -0.15; azR = 0.15;
    } else if (engaged) {
      thL = -0.55 + s * 0.25; thR = 0.15 - s * 0.25; knL = 0.75; knR = 0.55; py = 0.86; lean = 0.55; aL = aR = -1.45; eL = eR = -0.35; azL = -0.12; azR = 0.12; headX = -0.4;
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
      pitch = -1.15; py = 0.5; thL = -0.2; thR = 0.1; knL = 0.2; knR = 0.4; aL = aR = -2.9; eL = eR = -0.1; lean = 0.3;
    } else if (p.act === 'down' || p.act === 'tackled') {
      const g = p.act === 'tackled' ? clamp(p.actT / 0.4, 0, 1) : k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      pitch = (p.act === 'tackled' ? 1.3 : -1.25) * g; py = lerp(0.97, 0.36, g); thL = -0.5 * g; thR = -0.15 * g; knL = 0.9 * g; knR = 0.6 * g; aL = aR = -1.6 * g; eL = eR = -0.6;
    } else if (p.act === 'juke') { roll = (p.dvz * Math.cos(p.dir) - p.dvx * Math.sin(p.dir) > 0 ? -1 : 1) * 0.35 * Math.sin(k * Math.PI); }
    if (p.mood === 'celebrate') { aL = -2.8 + Math.sin(G.time * 11 + p.i) * 0.25; aR = -2.8 + Math.cos(G.time * 11 + p.i) * 0.25; eL = eR = -0.2; azL = 0.35; azR = -0.35; ry = Math.abs(Math.sin(G.time * 7 + p.i)) * 0.34; }
    else if (p.mood === 'sad') { headX = 0.55; lean = 0.22; aL = aR = 0.05; eL = eR = -0.1; }
    J(a.L.leg, 'x', thL, f); J(a.R.leg, 'x', thR, f); J(a.L.knee, 'x', knL, f); J(a.R.knee, 'x', knR, f);
    J(a.L.arm, 'x', aL, f); J(a.R.arm, 'x', aR, f); J(a.L.elbow, 'x', eL, f); J(a.R.elbow, 'x', eR, f);
    J(a.L.arm, 'z', azL, f); J(a.R.arm, 'z', azR, f);
    J(a.body, 'x', lean, f); J(a.pelvis, 'x', pitch, f); J(a.head, 'x', headX, f);
    a.pelvis.position.y += (py - a.pelvis.position.y) * f;
    J(a.root, 'z', roll, f);
    a.root.position.set(p.x, a.root.position.y + (ry - a.root.position.y) * f, p.z);
    const yaw = Math.atan2(Math.cos(p.dir), Math.sin(p.dir));
    a.yaw += U.angDiff(yaw, a.yaw) * (1 - Math.exp(-(p.act === 'spin' ? 40 : 14) * dt));
    a.root.rotation.y = a.yaw;
  }

  /* soft contact shadows under every player (one draw call) */
  function buildBlobs() {
    const g = new T.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const mt = new T.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.85, toneMapped: false });
    const im = new T.InstancedMesh(g, mt, 64);
    im.frustumCulled = false; im.renderOrder = 1;
    G.scene.add(im);
    G.blobs = { im, m: new T.Matrix4(), q: new T.Quaternion(), v: new T.Vector3(), s: new T.Vector3() };
  }
  function syncBlobs() {
    const B = G.blobs; let n = 0;
    for (const a of G.actors) {
      if (!a.root.visible || n >= 64) continue;
      const p = a.p, down = a.pelvis.position.y < 0.6;
      const r = (down ? 2.0 : 1.25) * (a.scale / 1.12) / (1 + Math.max(0, a.root.position.y) * 0.8);
      B.v.set(p.x, 0.02, p.z); B.s.set(r, 1, r * (down ? 1.4 : 1));
      B.q.setFromAxisAngle(new T.Vector3(0, 1, 0), a.yaw);
      B.m.compose(B.v, B.q, B.s);
      B.im.setMatrixAt(n++, B.m);
    }
    B.s.set(0, 0, 0); B.m.compose(B.v, B.q, B.s);
    for (let i = n; i < 64; i++) B.im.setMatrixAt(i, B.m);
    B.im.count = Math.max(1, n);
    B.im.instanceMatrix.needsUpdate = true;
  }

  /* ---------- the football ---------- */
  function buildBall() {
    const g = new T.Group();
    const pts = [];
    for (let i = 0; i <= 20; i++) { const t = -1 + (2 * i) / 20; pts.push(new T.Vector2(Math.max(0.003, 0.125 * Math.pow(Math.max(0, 1 - t * t), 0.68)), t * 0.205)); }
    const geo = new T.LatheGeometry(pts, 28); geo.rotateX(Math.PI / 2);
    const leather = new T.MeshStandardMaterial({ map: leatherTexture(), roughness: 0.55, metalness: 0, envMapIntensity: 0.9 });
    const m = new T.Mesh(geo, leather); m.castShadow = true; g.add(m);
    const lace = new T.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.6 });
    const parts = [[new T.BoxGeometry(0.016, 0.012, 0.13), M(0, 0.123, 0)]];
    for (let i = -3; i <= 3; i++) parts.push([new T.BoxGeometry(0.05, 0.012, 0.012), M(0, 0.122, i * 0.019)]);
    g.add(new T.Mesh(merge(parts), lace));
    g.scale.setScalar(1.3);
    G.scene.add(g);
    G.ballG = g;
    g.visible = false;
    // light trail behind a pass or kick
    const N = 22, pos = new Float32Array(N * 2 * 3), colr = new Float32Array(N * 2 * 3), idx = [];
    for (let i = 0; i < N - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const tg = new T.BufferGeometry();
    tg.setAttribute('position', new T.BufferAttribute(pos, 3));
    tg.setAttribute('color', new T.BufferAttribute(colr, 3));
    tg.setIndex(idx);
    const tm = new T.Mesh(tg, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    tm.frustumCulled = false; tm.visible = false;
    G.scene.add(tm);
    G.trail = { mesh: tm, pts: [], N };
  }
  const Q = {};
  function syncBall(m, dt) {
    const b = m.ball, g = G.ballG;
    g.visible = true;
    if (b.state === 'held' && b.holder) {
      const p = b.holder, fx = Math.cos(p.dir), fz = Math.sin(p.dir), rx = -fz, rz = fx;
      let off = 0.32, side = -0.24, h = 1.22;
      if (p.job === 'qb' || p.job === 'handoff' || (p.role === 'QB' && !m.passed)) { off = 0.36; side = -0.1; h = 1.45; }
      if (p.act === 'throw') { const k = p.actT / p.actDur; h = 1.5 + Math.sin(k * Math.PI) * 0.6; side = -0.35; off = 0.1; }
      if (p.act === 'tackled') h = 0.5;
      g.position.set(p.x + fx * off - rx * side, h, p.z + fz * off - rz * side);
      Q.e.set(-0.45, Math.atan2(fx, fz), 0, 'YXZ');
      g.quaternion.setFromEuler(Q.e);
    } else {
      g.position.set(b.x, Math.max(0.16, b.y), b.z);
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
      } else if (b.state === 'snap' && b.snap) { Q.e.set(0, Math.atan2(b.snap.to.x - b.snap.x0, b.snap.to.z - b.snap.z0), 0, 'YXZ'); g.quaternion.setFromEuler(Q.e); }
      else if (b.state === 'placed') { Q.e.set(-1.35, Math.PI / 2, 0, 'YXZ'); g.quaternion.setFromEuler(Q.e); }
      else if (b.state === 'set') { Q.e.set(0, Math.PI / 2, 0, 'YXZ'); g.quaternion.setFromEuler(Q.e); }
      else if (b.state === 'loose') { G.tumble += dt * 8 * Math.min(1, Math.hypot(b.vx, b.vz) / 3); Q.e.set(G.tumble, 0.6, 0, 'YXZ'); g.quaternion.setFromEuler(Q.e); }
    }
    // trail
    const tr = G.trail, flying = b.state === 'air' && b.fl && b.fl.kind !== 'pitch';
    if (flying) { tr.pts.unshift(g.position.clone()); if (tr.pts.length > tr.N) tr.pts.pop(); }
    else if (tr.pts.length) tr.pts.pop();
    tr.mesh.visible = tr.pts.length > 2;
    if (tr.mesh.visible) {
      const pos = tr.mesh.geometry.attributes.position.array, col = tr.mesh.geometry.attributes.color.array;
      const cam = G.camera.position, n = tr.pts.length;
      for (let i = 0; i < tr.N; i++) {
        const P = tr.pts[Math.min(i, n - 1)], Pn = tr.pts[Math.min(i + 1, n - 1)] || P, Pp = tr.pts[Math.max(0, i - 1)];
        Q.v.subVectors(Pp, Pn); Q.v2.subVectors(cam, P); Q.v.cross(Q.v2).normalize();
        const w = 0.09 * (1 - i / tr.N), a = i < n ? Math.pow(1 - i / tr.N, 1.6) * 0.9 : 0;
        pos[i * 6] = P.x + Q.v.x * w; pos[i * 6 + 1] = P.y + Q.v.y * w; pos[i * 6 + 2] = P.z + Q.v.z * w;
        pos[i * 6 + 3] = P.x - Q.v.x * w; pos[i * 6 + 4] = P.y - Q.v.y * w; pos[i * 6 + 5] = P.z - Q.v.z * w;
        for (let j = 0; j < 2; j++) { col[i * 6 + j * 3] = a; col[i * 6 + j * 3 + 1] = a * 0.95; col[i * 6 + j * 3 + 2] = a * 0.85; }
      }
      tr.mesh.geometry.attributes.position.needsUpdate = true;
      tr.mesh.geometry.attributes.color.needsUpdate = true;
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
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.92, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
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

  /* ---------- weather ---------- */
  function setWeather(kind) {
    if (G.weather) { G.scene.remove(G.weather.obj); G.weather.obj.geometry.dispose(); G.weather.obj.material.dispose(); G.weather = null; }
    G.weatherKind = kind || 'clear';
    G.snowCover.visible = kind === 'snow';
    G.fieldMat.roughness = kind === 'rain' ? 0.32 : 0.9;
    G.fieldMat.envMapIntensity = kind === 'rain' ? 0.9 : 0.25;
    G.fieldMat.color.set(kind === 'rain' ? 0xc8d2c8 : kind === 'snow' ? 0xe6eef2 : 0xffffff);
    G.fieldMat.needsUpdate = true;
    G.scene.fog.near = kind === 'clear' ? 170 : 140; G.scene.fog.far = kind === 'clear' ? 520 : 440;
    if (kind !== 'snow' && kind !== 'rain') return;
    const N = kind === 'snow' ? (hi() ? 3200 : 1400) : (hi() ? 2600 : 1200);
    const box = { x: 70, y: 34, z: 54 };
    if (kind === 'snow') {
      const pos = new Float32Array(N * 3), vel = new Float32Array(N);
      for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * box.x; pos[i * 3 + 1] = Math.random() * box.y; pos[i * 3 + 2] = (Math.random() - 0.5) * box.z; vel[i] = 0.8 + Math.random() * 1.2; }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const obj = new T.Points(g, new T.PointsMaterial({ map: dotTexture(), size: 0.1, transparent: true, opacity: 0.85, depthWrite: false, color: 0xe8eef6 }));
      obj.frustumCulled = false;
      G.scene.add(obj);
      G.weather = { kind, obj, pos, vel, N, box, cx: 0, cz: 0 };
    } else {
      const pos = new Float32Array(N * 2 * 3), vel = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const x = (Math.random() - 0.5) * box.x, y = Math.random() * box.y, z = (Math.random() - 0.5) * box.z;
        pos.set([x, y, z, x + 0.12, y + 0.9, z], i * 6); vel[i] = 22 + Math.random() * 8;
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const obj = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xbcd0ea, transparent: true, opacity: 0.38, depthWrite: false }));
      obj.frustumCulled = false;
      G.scene.add(obj);
      G.weather = { kind, obj, pos, vel, N, box, cx: 0, cz: 0 };
    }
  }
  function stepWeather(dt) {
    const W = G.weather; if (!W) return;
    const cx = G.cam.tx, cz = G.cam.tz, bx = W.box.x / 2, bz = W.box.z / 2, p = W.pos;
    if (W.kind === 'snow') {
      for (let i = 0; i < W.N; i++) {
        const k = i * 3;
        p[k + 1] -= W.vel[i] * dt;
        p[k] += Math.sin(G.time * 0.7 + i) * 0.4 * dt + 0.3 * dt;
        p[k + 2] += Math.cos(G.time * 0.5 + i * 1.3) * 0.4 * dt;
        if (p[k + 1] < 0) { p[k + 1] = W.box.y; p[k] = cx + (Math.random() - 0.5) * W.box.x; p[k + 2] = cz + (Math.random() - 0.5) * W.box.z; }
        if (p[k] < cx - bx) p[k] += W.box.x; else if (p[k] > cx + bx) p[k] -= W.box.x;
        if (p[k + 2] < cz - bz) p[k + 2] += W.box.z; else if (p[k + 2] > cz + bz) p[k + 2] -= W.box.z;
      }
    } else {
      for (let i = 0; i < W.N; i++) {
        const k = i * 6, dy = W.vel[i] * dt;
        p[k + 1] -= dy; p[k + 4] -= dy; p[k] += dy * 0.13; p[k + 3] += dy * 0.13;
        if (p[k + 1] < 0) {
          const x = cx + (Math.random() - 0.5) * W.box.x, y = W.box.y * (0.7 + Math.random() * 0.3), z = cz + (Math.random() - 0.5) * W.box.z;
          p[k] = x; p[k + 1] = y; p[k + 2] = z; p[k + 3] = x + 0.12; p[k + 4] = y + 0.9; p[k + 5] = z;
        }
        if (p[k] < cx - bx) { p[k] += W.box.x; p[k + 3] += W.box.x; } else if (p[k] > cx + bx) { p[k] -= W.box.x; p[k + 3] -= W.box.x; }
        if (p[k + 2] < cz - bz) { p[k + 2] += W.box.z; p[k + 5] += W.box.z; } else if (p[k + 2] > cz + bz) { p[k + 2] -= W.box.z; p[k + 5] -= W.box.z; }
      }
    }
    W.obj.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------- effects ---------- */
  function buildConfetti() {
    const N = 520, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    const pts = new T.Points(g, new T.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    pts.frustumCulled = false; pts.visible = false;
    G.scene.add(pts);
    G.confetti = { pts, pos, col, vel, N, t: 0 };
    const dot = dotTexture();
    for (let i = 0; i < 8; i++) {
      const n = 110, bp = new Float32Array(n * 3), bv = new Float32Array(n * 3);
      const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.BufferAttribute(bp, 3));
      const bm = new T.PointsMaterial({ map: dot, size: 1.5, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, fog: false });
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
      c.set(colors[i % colors.length]).multiplyScalar(1.3);
      cf.col[i * 3] = c.r; cf.col[i * 3 + 1] = c.g; cf.col[i * 3 + 2] = c.b;
    }
    cf.pts.geometry.attributes.color.needsUpdate = true;
    cf.t = 4.6; cf.pts.visible = true;
    G.bursts.forEach((bu, i) => {
      const cx = Math.sign(x || 1) * (EL + 14) + (Math.random() - 0.5) * 12, cz = (i - 3.5) * 9, cy = 36 + Math.random() * 12;
      for (let j = 0; j < bu.n; j++) {
        bu.pos[j * 3] = cx; bu.pos[j * 3 + 1] = cy; bu.pos[j * 3 + 2] = cz;
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = 9 + Math.random() * 4;
        bu.vel[j * 3] = Math.sin(ph) * Math.cos(th) * sp; bu.vel[j * 3 + 1] = Math.cos(ph) * sp; bu.vel[j * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      }
      bu.pts.material.color.set(colors[i % colors.length]).multiplyScalar(2.2);
      bu.pts.geometry.attributes.position.needsUpdate = true;
      bu.t = 1.8; bu.delay = i * 0.26; bu.pts.visible = false;
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
    G.excite = Math.max(0, G.excite - dt * 0.2);
    G.crowdTex.offset.y = Math.abs(Math.sin(G.time * 9)) * 0.035 * G.excite;
    if (G.crowdU) { G.crowdU.uTime.value = G.time; G.crowdU.uExcite.value = G.excite; }
    const rate = 0.6 + G.excite * 26;
    const pt = { x: 0, z: 0 };
    G.flashes.forEach((fl) => {
      if (fl.userData.t > 0) { fl.userData.t -= dt; fl.material.opacity = fl.userData.t > 0 ? 0.95 : 0; }
      else if (Math.random() < (rate * dt) / G.flashes.length * 4) {
        const d = Math.random() < 0.5 ? 2 + Math.random() * 12 : 17 + Math.random() * 14;
        ringPoint(Math.random() * Math.PI * 2, d, pt);
        const h = d < 15 ? 1.6 + (d / 15) * 7.9 : 12 + ((d - 15.4) / 17.6) * 12;
        fl.position.set(pt.x, h + 0.9, pt.z); fl.userData.t = 0.07 + Math.random() * 0.06;
      }
    });
    G.ads.forEach((t, i) => { t.offset.x = (G.time * 0.018 * (i % 2 ? -1 : 1)) % 1; });
    G.jumboFlash = Math.max(0, (G.jumboFlash || 0) - dt);
    stepWeather(dt);
  }

  /* ---------- camera ---------- */
  function layoutCamera() {
    const cam = G.camera, aspect = G.w / Math.max(1, G.h);
    cam.aspect = aspect;
    G.cam.portrait = aspect < 0.95;
    const hHalf = Math.tan(((G.cam.portrait ? 60 : 64) * Math.PI) / 360);
    cam.fov = clamp((2 * Math.atan(hHalf / aspect) * 180) / Math.PI, 30, G.cam.portrait ? 76 : 80);
    cam.updateProjectionMatrix();
  }
  function updateCamera(dt, m) {
    const C = G.cam, por = C.portrait;
    let px, py, pz, lx, ly, lz, k = 1 - Math.exp(-3.6 * dt);
    if (!m) {
      C.orbit += dt * 0.05;
      const r = 84;
      px = Math.cos(C.orbit) * r; pz = Math.sin(C.orbit) * r * 0.55; py = 20 + Math.sin(C.orbit * 0.7) * 6;
      lx = Math.cos(C.orbit + 0.5) * 10; ly = 4; lz = 0; k = 1 - Math.exp(-2 * dt);
    } else {
      const b = m.ball, back = por ? 12 : 12.5, height = por ? 14.5 : 7.2, ahead = por ? 6.5 : 9;
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
      fz = clamp(fz, -FW + 6, FW - 6);
      px = fx - back; py = height + 1.2; pz = fz * 0.55;
      lx = fx + ahead; ly = 0.6; lz = fz * 0.85;
      if (b.state === 'air' && b.fl && b.fl.kind === 'punt') { py += b.y * 0.25; ly = b.y * 0.4; }
      if (m.state === 'score' && m.scorer && m.stateT > 0.35 && m.stateT < 4.2) {
        // low cinematic orbit around the scorer
        const s = m.scorer, ang = -Math.PI / 2 + (m.stateT - 0.35) * 0.6, r = por ? 8.5 : 7;
        px = s.x + Math.cos(ang) * r; pz = s.z + Math.sin(ang) * r; py = 2.3;
        lx = s.x; ly = 1.5; lz = s.z;
        k = 1 - Math.exp(-2.6 * dt);
      }
      if (C.intro > 0) {
        C.intro = Math.max(0, C.intro - dt / 3.2);
        const e = C.intro * C.intro * (3 - 2 * C.intro);
        const ang = e * 1.6;
        px = lerp(px, Math.cos(ang + 2.2) * 70, e); py = lerp(py, 44, e); pz = lerp(pz, Math.sin(ang + 2.2) * 50, e);
        lx = lerp(lx, 0, e); ly = lerp(ly, 2, e); lz = lerp(lz, 0, e);
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
    const bo = clamp((C.y - 5) / 9, 0, 1) * 0.075;
    if (G.beams.length && G.beams[0].material.opacity !== bo) G.beams[0].material.opacity = bo;
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
    G.camera = new T.PerspectiveCamera(40, 1.6, 0.5, 800);
    Q.e = new T.Euler(); Q.v = new T.Vector3(); Q.v2 = new T.Vector3(); Q.q = new T.Quaternion(); Q.q2 = new T.Quaternion(); Q.zAxis = new T.Vector3(0, 0, 1);
    initShared();
    buildStadium();
    try { buildEnv(); } catch (e) { console.warn('environment map unavailable', e); }
    buildBall();
    buildBlobs();
    buildConfetti();
    G.marker = new T.Mesh(GEO.ring, new T.MeshBasicMaterial({ color: new T.Color(0xffe45c).multiplyScalar(1.4), transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: T.DoubleSide }));
    G.marker.rotation.x = -Math.PI / 2; G.marker.visible = false; G.marker.renderOrder = 4; G.scene.add(G.marker);
    G.arrow = new T.Mesh(GEO.arrow, new T.MeshBasicMaterial({ color: new T.Color(0xffe45c).multiplyScalar(1.4), toneMapped: false }));
    G.arrow.rotation.x = Math.PI; G.arrow.visible = false; G.scene.add(G.arrow);
    G.paintField({ name: 'Gridiron Kings', c1: '#ffc72c', c2: '#111827', letter: 'G' }, { name: 'Visitors', c1: '#1f4fd6', c2: '#ffffff' });
    buildCrowd('#ffc72c', '#1f4fd6');
    G.applyQuality();
    G.resize();
    G.ready = true;
    return true;
  };

  G.applyQuality = function () {
    const R = G.renderer, q = hi();
    R.shadowMap.enabled = G.quality > 0;
    G.sun.castShadow = G.quality > 0;
    G.beams.forEach((b) => (b.visible = q));
    if (q && !G.post) { try { G.post = buildPost(); } catch (e) { console.warn('post-processing unavailable', e); G.post = null; } }
    if (!q && G.post) G.post = null;
    if (G.post) { R.toneMapping = T.NoToneMapping; } else { R.toneMapping = T.ACESFilmicToneMapping; R.outputEncoding = T.sRGBEncoding; }
    G.scene.traverse((o) => { if (o.material && !o.material.length) o.material.needsUpdate = true; });
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
    G.applyQuality();
    buildCrowd(G.kits ? G.kits[0].c1 : '#ffc72c', G.kits ? G.kits[1].c1 : '#1f4fd6');
    G.resize();
  };

  G.resize = function () {
    if (!G.renderer) return;
    const w = G.canvas.clientWidth || window.innerWidth, h = G.canvas.clientHeight || window.innerHeight;
    G.w = w; G.h = h;
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hi() ? 2 : 1.25) * G.prScale);
    G.renderer.setSize(w, h, false);
    sizePost();
    layoutCamera();
  };

  G.setupMatch = function (m, kits, names, weather) {
    G.clearMatch();
    G.kits = kits; G.names = names;
    m.everyone.forEach((p) => { G.actors.push(makeActor(p, kits[p.team.idx], names[p.team.idx][0].toUpperCase())); });
    G.paintField({ name: names[0], c1: kits[0].c1, c2: kits[0].c2, letter: names[0][0].toUpperCase() }, { name: names[1], c1: kits[1].c1, c2: kits[1].c2 });
    const old = G.crowdTex;
    G.crowdTex = crowdTexture(kits[0].c1, kits[1].c1);
    G.crowdMat.map = G.crowdTex; G.crowdMat.emissiveMap = G.crowdTex; G.crowdMat.needsUpdate = true;
    old.dispose();
    buildCrowd(kits[0].c1, kits[1].c1);
    G.teamAreas.forEach((a, i) => a.material.color.set(U.shade(kits[i === 0 ? 1 : 0].c1, -0.55)));
    setWeather(weather);
    G.cam.intro = 1; G.cam.init = false;
    G.jumbo.forEach((j) => (j.sig = ''));
  };

  G.clearMatch = function () {
    G.actors.forEach((a) => {
      G.scene.remove(a.root);
      a.mats.forEach((mt) => { if (mt.map) mt.map.dispose(); mt.dispose(); });
      (a.geos || []).forEach((g) => g.dispose());
    });
    G.actors.length = 0;
    helmCache.forEach((g) => g.dispose()); helmCache.clear();
    G.clearRoutes();
    if (G.ballG) {
      G.ballG.visible = false; G.marker.visible = false; G.arrow.visible = false; G.losLine.visible = false; G.fdLine.visible = false;
      G.trail.pts.length = 0; G.trail.mesh.visible = false;
      if (G.blobs) { G.blobs.im.count = 0; }
      setWeather('clear');
    }
    G.cam.init = false;
    G.jumbo.forEach((j) => (j.sig = ''));
  };

  G.onEvent = function (e, m) {
    if (e.type === 'td') {
      G.cam.shake = 0.8; G.excite = 1; G.jumboFlash = 5; G.jumboTeam = e.data.team;
      if (G.post) G.post.final.uniforms.flash.value = 0.22;
      const kit = G.kits[e.data.team];
      celebrateFx(m.ball.x, m.ball.z, [kit.c1, kit.c2 === kit.c1 ? '#ffffff' : kit.c2, '#ffffff', '#ffd23f']);
    } else if (e.type === 'tackle' && e.data.big) { G.cam.shake = 0.9; G.excite = Math.max(G.excite, 0.5); }
    else if (e.type === 'int' || e.type === 'safety') { G.excite = Math.max(G.excite, 0.7); }
    else if (e.type === 'fg' && e.data.good) G.excite = Math.max(G.excite, 0.7);
    else if (e.type === 'catch' || e.type === 'firstdown') G.excite = Math.max(G.excite, 0.3);
    else if (e.type === 'snap') G.clearRoutes();
  };

  function adapt(dt) {
    const P = G.perf;
    if (dt <= 0 || G.noAdapt) return;
    P.sum += dt; P.n++;
    if (P.sum < 2) return;
    const avg = P.sum / P.n;
    P.sum = 0; P.n = 0;
    if (avg > 1 / 26 && G.prScale > 0.55) { G.prScale = Math.max(0.55, G.prScale - 0.15); G.resize(); }
    else if (avg < 1 / 50 && G.prScale < 1) { G.prScale = Math.min(1, G.prScale + 0.1); G.resize(); }
  }

  G.render = function (dt, m) {
    if (!G.ready) return;
    G.time += dt; G.lastDt = dt;
    adapt(dt);
    if (m) {
      for (const a of G.actors) poseActor(a, dt, m);
      syncBall(m, dt);
      syncBlobs();
      const c = m.ctrl;
      const showMk = c && c.onField && m.user >= 0 && (m.state === 'presnap' || m.state === 'live');
      G.marker.visible = G.arrow.visible = !!showMk;
      if (showMk) {
        const pulse = 1 + Math.sin(G.time * 7) * 0.06;
        G.marker.position.set(c.x, 0.05, c.z); G.marker.scale.setScalar(pulse);
        G.arrow.position.set(c.x, 2.6 + Math.sin(G.time * 5) * 0.07, c.z); G.arrow.rotation.y = G.time * 2;
      }
      const lines = m.state === 'call' || m.state === 'presnap' || m.state === 'live' || m.state === 'dead';
      G.losLine.visible = lines && !(m.state === 'dead' && m.result && m.result.change);
      G.fdLine.visible = G.losLine.visible && !(m.play && m.play.special && m.state !== 'call') && !m.goalToGo;
      G.losLine.position.set(m.los, 0.025, 0);
      G.fdLine.position.set(m.firstX, 0.026, 0);
    } else if (G.blobs) G.blobs.im.count = 0;
    drawJumbo(m);
    stepEffects(dt);
    updateCamera(dt, m);
    if (G.post) {
      try { renderPost(); }
      catch (e) { console.warn('post-processing failed, falling back', e); G.post = null; G.applyQuality(); G.renderer.setRenderTarget(null); G.renderer.render(G.scene, G.camera); }
    } else G.renderer.render(G.scene, G.camera);
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
