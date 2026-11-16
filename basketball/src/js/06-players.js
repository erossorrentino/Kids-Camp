'use strict';
/* ============================================================
   Players: one continuous skinned mesh per player on a
   14-bone skeleton, painted from a per-player texture atlas
   (jersey, shorts, face, hair, colour patches) with a shared
   roughness atlas and baked ambient occlusion. The pose
   solver below drives the bones from simulation state.
   ============================================================ */

const SKIN = ['#f0c8a2', '#dcaa7c', '#c48a5c', '#9c6640', '#76482a', '#4c2e1b'];
const HAIRC = ['#14100c', '#221710', '#35261a', '#6a4a2a', '#c9a35e'];

/* ---------- atlas layout: 1024 x 1024 canvas, uv v = 1 - y / 1024 ---------- */
const AT = 1024;
const REG = { jersey: [0, 0, 1024, 512], shortsR: [0, 512, 512, 256], shortsL: [512, 512, 512, 256], pelvis: [512, 896, 256, 128], face: [0, 768, 256, 256], hair: [256, 768, 256, 128], limb: [256, 896, 256, 128],
  armR: [768, 896, 128, 128], armL: [896, 896, 128, 128] };
const PATCH = { skin: 0, sock: 1, shoe: 2, sole: 3, accent: 4, trim: 5, dark: 6, white: 7, band: 8, sleeve: 9, lip: 10, kit: 11, hairSolid: 12, shoe2: 13, pants: 14, shirt: 15 };
const SKIN_REG = { face: 1, limb: 1, armR: 1, armL: 1 };
const ROUGH = { jersey: 0.74, shortsR: 0.6, shortsL: 0.6, pelvis: 0.6, face: 0.48, hair: 0.86, limb: 0.44, armR: 0.44, armL: 0.44,
  patch: [0.46, 0.85, 0.32, 0.55, 0.38, 0.6, 0.35, 0.6, 0.8, 0.5, 0.4, 0.6, 0.86, 0.3, 0.7, 0.72] };
function patchXY(i) { return [512 + (i % 8) * 64, 768 + Math.floor(i / 8) * 64]; }
function patchUV(name) { const [x, y] = patchXY(PATCH[name]); return [(x + 32) / AT, 1 - (y + 32) / AT]; }

/* ---------- geometry helpers ---------- */
function lathe(prof, seg, sx, sz) {
  const g = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), seg || 14);
  if (sx !== 1 || sz !== 1) g.scale(sx || 1, 1, sz || 1);
  g.computeVertexNormals();
  return g;
}
function sphereG(r, ws, hs, sx, sy, sz, x, y, z, t0, tl) {
  const g = new THREE.SphereGeometry(r, ws || 12, hs || 9, 0, TAU, t0 || 0, tl == null ? PI : tl);
  g.scale(sx || 1, sy || 1, sz || 1); g.translate(x || 0, y || 0, z || 0);
  return g;
}
function boxG(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x || 0, y || 0, z || 0); return g; }
function cylG(rt, rb, h, seg, x, y, z) { const g = new THREE.CylinderGeometry(rt, rb, h, seg || 10); g.translate(x || 0, y || 0, z || 0); return g; }
function regionUV(g, reg) {
  const uv = g.attributes.uv, [x, y, w, h] = REG[reg];
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * w) / AT, 1 - (y + (1 - uv.getY(i)) * h) / AT);
  return g;
}
function constUV(g, name) {
  const [u, v] = patchUV(name), n = g.attributes.position.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; }
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  return g;
}
/* radius of a [r, y] profile at height y, and a band of it pushed outward (sleeves, socks, pads) */
function profR(P, y) {
  if (y <= P[0][1]) return P[0][0];
  for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const t = (y - P[i - 1][1]) / (P[i][1] - P[i - 1][1]); return lerp(P[i - 1][0], P[i][0], t); }
  return P[P.length - 1][0];
}
function bandProf(P, y0, y1, off, n) { const out = []; for (let i = 0; i <= n; i++) { const y = lerp(y0, y1, i / n); out.push([profR(P, y) + (typeof off === 'function' ? off(y) : off), y]); } return out; }
/* deterministic lumpy displacement for curly hair */
function lumpy(g, amp, f, seed) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * f + seed) * Math.sin(y * f * 1.3 + seed * 2.1) * Math.sin(z * f * 0.9 + seed * 0.7) + 0.5 * Math.sin((x + z) * f * 2.3 + y * f * 1.7 + seed);
    const k = 1 + amp * n;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
/* sculpt a limb tube (axis along y, +x forward): bulges are [y, width, front amount, back amount, outer amount] */
function sculptLimb(g, bulges, flatX, flatZ, side) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z) || 1e-6, cf = x / r, cs = z * side / r;
    let k = 1;
    for (const [by, bw, fr, bk, ou] of bulges) {
      const bell = Math.exp(-((y - by) * (y - by)) / (bw * bw));
      k += bell * (fr * Math.max(0, cf) ** 2 + bk * Math.max(0, -cf) ** 2 + (ou || 0) * Math.max(0, cs) ** 2);
    }
    p.setXYZ(i, x * k * flatX, y, z * k * flatZ);
  }
  g.computeVertexNormals();
  return g;
}
/* a piece = geometry in its bone's local frame, moved into mesh space, with skin weights and baked AO */
function piece(g, off, weights, ao) {
  g.translate(off[0], off[1], off[2]);
  const p = g.attributes.position, nrm = g.attributes.normal, n = p.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const w = weights(x, y, z);
    for (let q = 0; q < Math.min(4, w.length / 2); q++) { si[i * 4 + q] = w[q * 2]; sw[i * 4 + q] = w[q * 2 + 1]; }
    const a = ao ? ao(x, y, z, nrm.getX(i), nrm.getY(i), nrm.getZ(i)) : 1;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = a;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function mergeSkin(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const A = { position: [3, Float32Array], normal: [3, Float32Array], uv: [2, Float32Array], color: [3, Float32Array], skinIndex: [4, Uint16Array], skinWeight: [4, Float32Array] };
  const out = {}; for (const k in A) out[k] = new A[k][1](nv * A[k][0]);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    for (const k in A) out[k].set(g.attributes[k].array, vo * A[k][0]);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const geo = new THREE.BufferGeometry();
  for (const k in A) geo.setAttribute(k, new THREE.BufferAttribute(out[k], A[k][0]));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}
const blend = (a, b, t) => (t <= 0 ? [a, 1] : t >= 1 ? [b, 1] : [a, 1 - t, b, t]);
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/* a modern low-cut performance sneaker: sculpted upper, thick midsole with a heel counter, toe spring */
function shoePieces() {
  const s = new THREE.Shape();
  s.moveTo(-0.26, -0.17); s.lineTo(0.5, -0.17);
  s.quadraticCurveTo(0.68, -0.16, 0.66, -0.05);
  s.quadraticCurveTo(0.62, 0.04, 0.38, 0.07);
  s.lineTo(0.14, 0.15); s.lineTo(0.08, 0.3); s.lineTo(-0.2, 0.28);
  s.quadraticCurveTo(-0.33, 0.12, -0.31, -0.06); s.lineTo(-0.26, -0.17);
  const up = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 3, curveSegments: 8 });
  up.translate(0, 0, -0.16);
  const so = new THREE.Shape();
  so.moveTo(-0.32, -0.27); so.lineTo(0.6, -0.27); so.quadraticCurveTo(0.74, -0.25, 0.71, -0.13);
  so.lineTo(0.5, -0.14); so.lineTo(-0.33, -0.13); so.quadraticCurveTo(-0.36, -0.2, -0.32, -0.27);
  const sg = new THREE.ExtrudeGeometry(so, { depth: 0.38, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 6 });
  sg.translate(0, 0, -0.19);
  const heel = boxG(0.12, 0.2, 0.36, -0.29, -0.05, 0);
  const tab = boxG(0.05, 0.18, 0.2, -0.34, 0.16, 0);
  const sw = boxG(0.46, 0.055, 0.405, 0.12, -0.03, 0); sw.rotateZ(0.25);
  const lace = boxG(0.28, 0.035, 0.17, 0.25, 0.115, 0); lace.rotateZ(-0.45);
  const collar = cylG(0.15, 0.17, 0.08, 14, -0.12, 0.27, 0);
  return [constUV(up, 'shoe'), constUV(sg, 'sole'), constUV(heel, 'shoe2'), constUV(tab, 'accent'), constUV(sw, 'accent'), constUV(lace, 'shoe2'), constUV(collar, 'shoe2')];
}

/* ---------- what each player wears and looks like, stable per name ---------- */
function nameHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function playerLook(d, ref) {
  const r = mulberry32(nameHash(d.n) + 77), pick = (a) => a[Math.floor(r() * a.length)];
  if (ref) return { hair: d.hair === 0 ? 'bald' : 'fade', beard: 'none', legs: 'none', socks: 'crew', tattoo: 'none', wrist: 'none', shoe: 1, brow: 0.8 };
  const hair = [() => (r() < 0.55 ? 'bald' : 'buzz'), () => pick(['fade', 'fade', 'waves', 'flow']), () => pick(['hightop', 'twists']), () => pick(['afro', 'dreads', 'dreads']), () => pick(['bun', 'braids'])][d.hair % 5]();
  const bt = r(), lt = r(), tt = r(), wt = r();
  return {
    hair,
    beard: bt < 0.3 ? 'none' : bt < 0.5 ? 'stubble' : bt < 0.7 ? 'goatee' : bt < 0.88 ? 'full' : 'chin',
    legs: lt < 0.16 ? 'tightsR' : lt < 0.26 ? 'tightsBoth' : lt < 0.36 ? 'kneeL' : lt < 0.42 ? 'kneeBoth' : 'none',
    gearC: pick(['#121315', '#121315', '#121315', '#f1f1f1', 'kit']),
    socks: r() < 0.6 ? 'high' : 'crew',
    tattoo: tt < 0.2 ? 'R' : tt < 0.32 ? 'L' : tt < 0.44 ? 'both' : 'none',
    tatSeed: Math.floor(r() * 1e6),
    wrist: wt < 0.25 ? 'L' : wt < 0.4 ? 'both' : 'none',
    shoe: Math.floor(r() * 4),
    brow: 0.8 + r() * 0.5,
  };
}

/* ---------- atlas painting ---------- */
function fitFont(g, text, weight, size, maxW, min) {
  let fs = size; g.font = `${weight} ${fs}px ${FONT_D}`;
  while (g.measureText(text).width > maxW && fs > min) { fs -= 2; g.font = `${weight} ${fs}px ${FONT_D}`; }
  return fs;
}
function folds(g, x0, y0, w, h, n, a) {
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.random() * w, ww = 8 + Math.random() * 26, dk = Math.random() < 0.6;
    const gr = g.createLinearGradient(x - ww, 0, x + ww, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, dk ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.8})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - ww, y0 + Math.random() * h * 0.3, ww * 2, h);
  }
}
const rgba = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`; };
/* skin for a limb region: base tone, soft muscle shading front and back, pores */
function paintLimbSkin(g, x0, y0, w, h, skin, jv, ju) {
  g.fillStyle = skin; g.fillRect(x0, y0, w, h);
  // the joint (elbow / knee) is a touch darker and warmer, as is the inner side of the limb
  for (const du of [-1, 0, 1]) {
    const cx = x0 + (ju + du) * w, cy = y0 + (1 - jv) * h;
    g.save(); g.translate(cx, cy); g.scale(w * 0.22, h * 0.09);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(90,30,20,0.16)'); gr.addColorStop(1, 'rgba(90,30,20,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
  }
  const top = g.createLinearGradient(0, y0, 0, y0 + h); top.addColorStop(0, 'rgba(255,235,220,0.05)'); top.addColorStop(1, 'rgba(60,20,10,0.08)');
  g.fillStyle = top; g.fillRect(x0, y0, w, h);
  const gr = g.createLinearGradient(x0, 0, x0 + w, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0.06)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.07)'); gr.addColorStop(0.75, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.06)');
  g.fillStyle = gr; g.fillRect(x0, y0, w, h);
  for (let i = 0; i < w * h / 36; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.045)' : 'rgba(255,220,200,0.045)'; g.fillRect(x0 + Math.random() * w, y0 + Math.random() * h, 1.5, 1.5); }
}
/* tattoo ink on an arm region (u wraps the arm, v runs wrist (bottom) to shoulder (top)) */
function paintTattoo(g, x0, y0, w, h, outer, seed, skin) {
  const r = mulberry32(seed);
  const dark = new THREE.Color(skin).getHSL({}).l < 0.3;
  const ink = (a) => `rgba(${dark ? '18,14,20' : '24,30,46'},${a * (dark ? 0.75 : 1)})`;
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  const cx = x0 + outer * w;
  // a sleeve: a big piece on the upper arm, script and filler down the forearm
  const pieceAt = (u, v, s) => {
    const x = x0 + u * w, y = y0 + (1 - v) * h;
    for (const dx of [-w, 0, w]) {
      g.save(); g.translate(x + dx, y); g.scale(s, s * 0.6);
      const kind = Math.floor(r() * 4);
      g.strokeStyle = ink(0.75); g.fillStyle = ink(0.55); g.lineWidth = 2.2;
      if (kind === 0) { for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(0, 0, 4 + k * 4, r() * 6, r() * 6 + 3.5); g.stroke(); } }
      else if (kind === 1) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * PI / 5, rr = k % 2 ? 7 : 18; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); }
      else if (kind === 2) { g.beginPath(); g.moveTo(-20, 10); g.bezierCurveTo(-10, -22, 10, 22, 20, -10); g.lineWidth = 5; g.stroke(); g.beginPath(); g.moveTo(-18, -4); g.bezierCurveTo(-6, 18, 8, -18, 18, 6); g.lineWidth = 3; g.stroke(); }
      else { g.beginPath(); g.ellipse(0, 0, 16, 12, 0, 0, TAU); g.lineWidth = 3; g.stroke(); g.beginPath(); g.ellipse(0, 0, 8, 6, 0.6, 0, TAU); g.fill(); }
      g.restore();
    }
  };
  pieceAt(outer, 0.78, 1.25); pieceAt(outer + 0.25, 0.68, 0.9); pieceAt(outer - 0.22, 0.62, 0.8);
  pieceAt(outer + 0.05, 0.38, 0.85); pieceAt(outer - 0.2, 0.3, 0.7);
  // script down the forearm
  g.fillStyle = ink(0.7); g.font = `italic 700 ${Math.round(h * 0.09)}px Georgia, serif`;
  g.save(); g.translate(cx + w * 0.22, y0 + h * 0.7); g.rotate(-PI / 2); g.textAlign = 'center'; g.fillText(['Faith', 'Legacy', 'Blessed', 'Family'][Math.floor(r() * 4)], 0, 0); g.restore();
  // shading fill to tie it together
  for (let i = 0; i < 260; i++) { g.fillStyle = ink(0.08 + r() * 0.1); const u = outer + (r() - 0.5) * 0.7, v = 0.2 + r() * 0.75; g.fillRect(x0 + ((u % 1) + 1) % 1 * w, y0 + (1 - v) * h, 3, 3); }
  g.restore();
}
function paintHair(g, L, C) {
  const x0 = 256, y0 = 768, W = 256, H = 128;
  g.fillStyle = C.hair; g.fillRect(x0, y0, W, H);
  const curly = /afro|hightop|twists|fade|waves|buzz/.test(L.hair);
  if (L.hair === 'braids') {
    for (let u = 0; u < W; u += 10) {
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x0 + u, y0, 3, H);
      for (let v = 0; v < H; v += 6) { g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0 + u + 3, y0 + v); g.lineTo(x0 + u + 9, y0 + v + 4); g.stroke(); }
    }
  } else if (L.hair === 'dreads') {
    for (let u = 0; u < W; u += 7) for (let v = 0; v < H; v += 5) {
      g.strokeStyle = (u + v) % 2 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.09)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x0 + u, y0 + v); g.lineTo(x0 + u + 5, y0 + v + 4); g.stroke();
    }
  } else if (curly) {
    const light = new THREE.Color(C.hair).getHSL({}).l > 0.35, dk = rgba(shade(C.hair, -0.45), light ? 0.22 : 0.4);
    for (let i = 0; i < 5200; i++) {
      const x = x0 + Math.random() * W, y = y0 + Math.random() * H;
      g.fillStyle = Math.random() < 0.55 ? dk : 'rgba(255,255,255,0.07)';
      g.beginPath(); g.arc(x, y, 0.8 + Math.random() * 1.6, 0, TAU); g.fill();
    }
    if (L.hair === 'waves') for (let k = 0; k < 9; k++) { g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2.5; g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x0 + x, y0 + 6 + k * 6 + Math.sin(x * 0.2) * 2.5); g.stroke(); }
  } else {
    for (let i = 0; i < 2600; i++) {
      const x = x0 + Math.random() * W, y = y0 + Math.random() * 120, l = 3 + Math.random() * 7;
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y + l); g.stroke();
    }
  }
  // a skin fade at the edge of short caps: the cap's lower rim sits around 0.42 of the region height
  if (L.hair === 'fade' || L.hair === 'waves' || L.hair === 'hightop' || L.hair === 'twists') {
    const fg = g.createLinearGradient(0, y0 + H * 0.3, 0, y0 + H * 0.46);
    fg.addColorStop(0, rgba(C.skin, 0)); fg.addColorStop(1, rgba(C.skin, 0.9));
    g.fillStyle = fg; g.fillRect(x0, y0 + H * 0.3, W, H * 0.7);
    for (let i = 0; i < 900; i++) { g.fillStyle = rgba(C.hair, 0.25); g.fillRect(x0 + Math.random() * W, y0 + H * (0.34 + Math.random() * 0.12), 1.2, 1.2); }
  }
}
function paintFace(g, L, C) {
  const fx = 0, fy = 768, cx = fx + 128, ey = fy + 122;
  g.fillStyle = C.skin; g.fillRect(fx, fy, 256, 256);
  for (let i = 0; i < 1800; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,225,205,0.035)'; g.fillRect(fx + Math.random() * 256, fy + Math.random() * 256, 1.5, 1.5); }
  const radial = (x, y, rx, ry, col) => { g.save(); g.translate(x, y); g.scale(rx, ry); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); };
  // sculpting: forehead and nose highlights, cheek warmth, eye sockets, under the jaw
  radial(cx, fy + 92, 46, 26, 'rgba(255,240,225,0.12)');
  radial(cx, ey + 18, 7, 24, 'rgba(255,240,225,0.14)');
  for (const s of [-1, 1]) { radial(cx + s * 34, ey + 30, 20, 16, 'rgba(190,70,50,0.07)'); radial(cx + s * 15, ey + 1, 17, 11, 'rgba(40,20,10,0.2)'); radial(cx + s * 44, ey + 40, 16, 34, 'rgba(0,0,0,0.08)'); }
  const jaw = g.createLinearGradient(0, fy + 196, 0, fy + 256); jaw.addColorStop(0, 'rgba(0,0,0,0)'); jaw.addColorStop(1, 'rgba(0,0,0,0.32)');
  g.fillStyle = jaw; g.fillRect(fx, fy + 196, 256, 60);
  // eyes
  for (const s of [-1, 1]) {
    const ex = cx + s * 15;
    g.fillStyle = '#ece6dc'; g.beginPath(); g.ellipse(ex, ey, 6.6, 4.4, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(ex, ey - 1.5, 6.6, 2.4, 0, PI, TAU); g.fill();
    g.fillStyle = '#3b2617'; g.beginPath(); g.arc(ex + s * 0.4, ey + 0.3, 3.3, 0, TAU); g.fill();
    g.fillStyle = '#070504'; g.beginPath(); g.arc(ex + s * 0.4, ey + 0.3, 1.5, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(ex + s * 0.4 - 1.6, ey - 1.4, 1.2, 1.2);
    g.strokeStyle = 'rgba(14,8,4,0.9)'; g.lineWidth = 1.8; g.beginPath(); g.ellipse(ex, ey + 0.4, 7.2, 4.8, 0, PI * 1.02, TAU - 0.02); g.stroke();
    g.strokeStyle = 'rgba(30,15,8,0.35)'; g.lineWidth = 1.1; g.beginPath(); g.ellipse(ex, ey - 0.6, 7.6, 6.4, 0, PI * 1.1, TAU - 0.1); g.stroke();
    g.strokeStyle = 'rgba(30,15,8,0.3)'; g.lineWidth = 1; g.beginPath(); g.ellipse(ex, ey, 6.4, 4.6, 0, 0.15, PI - 0.15); g.stroke();
    // brows: hair strokes along an arch
    g.save(); g.translate(ex, ey - 12); g.rotate(-s * 0.06);
    for (let i = 0; i < 46; i++) {
      const t = i / 45, x = (t - 0.5) * 22 * s, y = -Math.sin(t * PI) * 2.4 + (s > 0 ? t : 1 - t) * 1.2;
      g.strokeStyle = rgba(shade(C.hair, -0.35), 0.55 + Math.random() * 0.35); g.lineWidth = 1.3 * L.brow;
      g.beginPath(); g.moveTo(x, y + 2.4 * L.brow); g.lineTo(x + s * 2.6, y - 1.6 * L.brow); g.stroke();
    }
    g.restore();
  }
  // nose: nostrils, the shadow under the tip and the sides
  for (const s of [-1, 1]) { g.fillStyle = 'rgba(20,8,4,0.55)'; g.beginPath(); g.ellipse(cx + s * 5, ey + 31, 3, 1.6, s * 0.3, 0, TAU); g.fill(); radial(cx + s * 9, ey + 22, 4, 12, 'rgba(0,0,0,0.14)'); }
  radial(cx, ey + 34, 12, 3, 'rgba(0,0,0,0.16)');
  // mouth
  const my = fy + 172;
  radial(cx, my - 7, 14, 5, 'rgba(0,0,0,0.08)');
  g.fillStyle = shade(C.lip, -0.12); g.beginPath(); g.moveTo(cx - 13, my); g.quadraticCurveTo(cx - 5, my - 5, cx, my - 3); g.quadraticCurveTo(cx + 5, my - 5, cx + 13, my); g.closePath(); g.fill();
  g.fillStyle = C.lip; g.beginPath(); g.moveTo(cx - 12, my); g.quadraticCurveTo(cx, my + 8, cx + 12, my); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(cx, my + 3, 5, 1.4, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(25,8,4,0.7)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx - 13, my); g.quadraticCurveTo(cx, my + 1.5, cx + 13, my); g.stroke();
  radial(cx, my + 16, 12, 4, 'rgba(0,0,0,0.1)');
  // facial hair, drawn as short strokes so the edges stay soft
  const hairStroke = (x, y, a) => { g.strokeStyle = rgba(C.hair, a); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 1.5, y + 2 + Math.random() * 2); g.stroke(); };
  const fillArea = (inside, n, a) => { for (let i = 0; i < n; i++) { const x = fx + Math.random() * 256, y = fy + 120 + Math.random() * 136; if (inside(x - cx, y - fy)) hairStroke(x, y, a * (0.6 + Math.random() * 0.4)); } };
  const lipsOut = (dx, dy) => !(Math.abs(dx) < 14 && dy > 165 && dy < 180);
  const beardZone = (dx, dy) => { const ax = Math.abs(dx); return ax < 66 && dy > 140 + ax * 0.12 && (ax > 40 ? dy > 146 : dy > 157 - ax * 0.25) && lipsOut(dx, dy); };
  if (L.beard === 'stubble') fillArea(beardZone, 2600, 0.28);
  if (L.beard === 'full') { fillArea(beardZone, 11000, 0.82); fillArea((dx, dy) => Math.abs(dx) > 58 && Math.abs(dx) < 70 && dy > 100 && dy < 146, 600, 0.75); }
  if (L.beard === 'goatee') { fillArea((dx, dy) => Math.abs(dx) < 17 && dy > 160 && dy < 167, 900, 0.85); fillArea((dx, dy) => Math.abs(dx) < 20 - (dy - 182) * 0.1 && dy > 182 && dy < 236, 1800, 0.85); fillArea(beardZone, 900, 0.18); }
  if (L.beard === 'chin') fillArea((dx, dy) => { const ax = Math.abs(dx), jaw = 214 - ax * 0.62 + (ax > 52 ? (ax - 52) * -6 : 0); return ax < 70 && Math.abs(dy - jaw) < 8 && lipsOut(dx, dy); }, 2600, 0.85);
  if (L.hair !== 'bald') for (const s of [-1, 1]) fillArea((dx, dy) => dx * s > 60 && dx * s < 70 && dy > 92 && dy < 128, 260, 0.8);
  // hairline across the top of the face region
  if (L.hair === 'bald') { radial(cx, fy + 10, 140, 60, 'rgba(255,255,255,0.06)'); }
  else {
    const hl = g.createLinearGradient(0, fy, 0, fy + 74); hl.addColorStop(0, C.hair); hl.addColorStop(L.hair === 'buzz' ? 0.6 : 0.78, rgba(C.hair, L.hair === 'buzz' ? 0.75 : 0.95)); hl.addColorStop(1, rgba(C.hair, 0));
    g.fillStyle = hl; g.fillRect(fx, fy, 256, 74);
    if (L.hair === 'buzz') for (let i = 0; i < 2400; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.3)' : rgba(C.skin, 0.25); g.fillRect(fx + Math.random() * 256, fy + Math.random() * 60, 1.4, 1.4); }
  }
}
function paintAtlas(T, home, d, C, L) {
  const c = mkCanvas(AT, AT), g = c.getContext('2d');
  const kit = C.kit, ink = home ? '#ffffff' : T.c1, trim = C.trim;
  // jersey (u 0 = right side, 0.25 = front, 0.5 = left side, 0.75 = back)
  g.fillStyle = kit; g.fillRect(0, 0, 1024, 512);
  for (let y = 0; y < 512; y += 3) { g.fillStyle = 'rgba(0,0,0,0.03)'; g.fillRect(0, y, 1024, 1); }
  for (let i = 0; i < 4000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.035)'; g.fillRect(Math.random() * 1024, Math.random() * 512, 2, 2); }
  folds(g, 0, 150, 1024, 362, 40, 0.08);
  const hem = g.createLinearGradient(0, 330, 0, 512); hem.addColorStop(0, 'rgba(0,0,0,0)'); hem.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = hem; g.fillRect(0, 330, 1024, 182);
  if (C.ref) {
    for (let x = 6; x < 1024; x += 36) { g.fillStyle = '#121212'; g.fillRect(x, 0, 12, 512); }
    g.fillStyle = '#121212'; g.beginPath(); g.moveTo(196, 0); g.lineTo(256, 92); g.lineTo(316, 0); g.fill();
    g.fillStyle = C.skin; g.beginPath(); g.moveTo(212, 0); g.lineTo(256, 70); g.lineTo(300, 0); g.fill();
    g.fillStyle = '#e8e8e8'; g.fillRect(708, 220, 120, 150);
    g.font = `900 120px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#111'; g.fillText(String(d.num), 768, 300);
  }
  if (!C.ref) {
    // side panels in the trim colour
    for (const x of [0, 1008, 496]) { g.fillStyle = trim; g.fillRect(x, 190, x === 496 ? 32 : 16, 322); }
    for (const x of [-34, 990, 462, 562]) { g.fillStyle = rgba(trim, 0.35); g.fillRect(x, 230, 44, 282); }
    const hole = (cx, cy, rx, ry) => {
      g.fillStyle = trim; g.beginPath(); g.ellipse(cx, cy, rx + 14, ry + 14, 0, 0, TAU); g.fill();
      g.fillStyle = ink === '#ffffff' ? shade(trim, -0.3) : '#ffffff'; g.beginPath(); g.ellipse(cx, cy, rx + 6, ry + 6, 0, 0, TAU); g.fill();
      g.fillStyle = C.skin; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
    };
    hole(0, 40, 170, 150); hole(1024, 40, 170, 150); hole(512, 40, 170, 150);
    hole(256, -8, 120, 74); hole(768, -18, 110, 46);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const word = T.name.toUpperCase();
    fitFont(g, word, '900 italic', 64, 300, 30);
    g.lineWidth = 7; g.strokeStyle = trim; g.fillStyle = ink;
    g.strokeText(word, 256, 172); g.fillText(word, 256, 172);
    g.font = `900 176px ${FONT_D}`; g.lineWidth = 11;
    g.shadowColor = 'rgba(0,0,0,0.28)'; g.shadowBlur = 8; g.shadowOffsetY = 4;
    g.strokeText(String(d.num), 256, 300); g.shadowColor = 'rgba(0,0,0,0)'; g.fillText(String(d.num), 256, 300);
    const last = d.n.split(' ').slice(1).join(' ').toUpperCase();
    fitFont(g, last, '800', 54, 300, 26);
    g.fillText(last, 768, 150);
    g.font = `900 196px ${FONT_D}`; g.lineWidth = 11;
    g.strokeText(String(d.num), 768, 300); g.fillText(String(d.num), 768, 300);
    g.fillStyle = trim; g.fillRect(0, 494, 1024, 18);
    // small league tag at the collar and a team patch on the front
    g.fillStyle = rgba(ink, 0.85); g.fillRect(250, 78, 12, 18);
  }
  // shorts legs (u 0/1 = +z side, 0.5 = -z side; v 0 = hem at the bottom of the region)
  const kitB = C.ref ? C.pants : kit;
  for (const x0 of [0, 512]) {
    g.fillStyle = kitB; g.fillRect(x0, 512, 512, 256);
    folds(g, x0, 512, 512, 256, 26, 0.09);
    const sh = g.createLinearGradient(0, 640, 0, 768); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = sh; g.fillRect(x0, 640, 512, 128);
    if (!C.ref) {
      g.fillStyle = trim;
      for (const x of [0, 498, 242]) g.fillRect(x0 + x, 512, x === 242 ? 28 : 14, 256);
      g.fillStyle = rgba(trim, 0.4); for (const x of [-20, 476, 222, 262]) g.fillRect(x0 + x, 560, 34, 208);
      g.fillStyle = trim; g.fillRect(x0, 734, 512, 16);
      g.fillStyle = ink === '#ffffff' ? shade(trim, -0.3) : '#ffffff'; g.fillRect(x0, 750, 512, 6);
    }
  }
  // one team badge on the outside front of the left leg (u 0.375 on that leg)
  if (!C.ref) {
    g.save(); g.beginPath(); g.arc(512 + 192, 636, 30, 0, TAU); g.fillStyle = home ? T.c2 : T.c1; g.fill();
    g.lineWidth = 4; g.strokeStyle = trim; g.stroke();
    g.font = `900 italic 28px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(T.id, 512 + 192, 638); g.restore();
  }
  // shorts pelvis with waistband
  g.fillStyle = kitB; g.fillRect(512, 896, 256, 128);
  folds(g, 512, 896, 256, 128, 8, 0.07);
  g.fillStyle = C.ref ? '#0c0c0c' : trim; g.fillRect(512, 896, 256, 26);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(512, 922, 256, 4);
  paintFace(g, L, C);
  paintHair(g, L, C);
  // limb skin (u around the limb, v from wrist/ankle at the bottom to shoulder/hip at the top)
  paintLimbSkin(g, 256, 896, 256, 128, C.skin, 0.58, 0.25);
  paintLimbSkin(g, 768, 896, 128, 128, C.skin, 0.5, 0.75); paintLimbSkin(g, 896, 896, 128, 128, C.skin, 0.5, 0.75);
  if (L.tattoo === 'R' || L.tattoo === 'both') paintTattoo(g, 768, 896, 128, 128, 0, L.tatSeed, C.skin);
  if (L.tattoo === 'L' || L.tattoo === 'both') paintTattoo(g, 896, 896, 128, 128, 0.5, L.tatSeed + 9, C.skin);
  // solid patches
  const pc = { skin: C.skin, sock: C.sock, shoe: C.shoe, sole: C.sole, accent: C.accent, trim, dark: '#140d09', white: '#f2f2f2', band: C.band, sleeve: C.sleeve, lip: C.lip, kit, hairSolid: C.hair, shoe2: C.shoe2, pants: C.pants || C.gear || C.skin, shirt: C.shirt || kit };
  for (const k in PATCH) { const [x, y] = patchXY(PATCH[k]); g.fillStyle = pc[k]; g.fillRect(x, y, 64, 64); }
  return c;
}
let ROUGH_TEX = null;
function roughAtlas() {
  if (ROUGH_TEX) return ROUGH_TEX;
  const c = mkCanvas(256, 256), g = c.getContext('2d'), k = 256 / AT;
  const v = (r, skin) => { const n = Math.round(r * 255); return `rgb(${skin ? 255 : 0},${n},${n})`; };
  for (const r in REG) { const [x, y, w, h] = REG[r]; g.fillStyle = v(ROUGH[r], SKIN_REG[r]); g.fillRect(x * k, y * k, w * k, h * k); }
  for (const p in PATCH) { const i = PATCH[p], [x, y] = patchXY(i); g.fillStyle = v(ROUGH.patch[i], p === 'skin' || p === 'lip'); g.fillRect(x * k, y * k, 64 * k, 64 * k); }
  ROUGH_TEX = new THREE.CanvasTexture(c);
  return ROUGH_TEX;
}

/* fabric detail as a height map in the same layout: mesh holes on the jersey, a fine twill on the shorts, strands in the hair */
let DETAIL_TEX = null;
function detailAtlas() {
  if (DETAIL_TEX) return DETAIL_TEX;
  const c = mkCanvas(1024, 1024), g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = 'rgb(108,108,108)';
  for (let y = 1; y < 512; y += 3) for (let x = (y / 3 % 2) * 1.5; x < 1024; x += 3) g.fillRect(x, y, 1, 1);
  for (let x = 0; x < 1024; x += 2) { g.fillStyle = x % 4 ? 'rgb(134,134,134)' : 'rgb(122,122,122)'; g.fillRect(x, 512, 1, 256); }
  for (let i = 0; i < 2600; i++) { const x = 256 + Math.random() * 256, y = 768 + Math.random() * 124; g.fillStyle = Math.random() < 0.5 ? 'rgb(90,90,90)' : 'rgb(170,170,170)'; if (i % 2) g.fillRect(x, y, 1, 3 + Math.random() * 4); else { g.beginPath(); g.arc(x, y, 1.2, 0, TAU); g.fill(); } }
  // muscle definition on the limbs: bulges front (biceps, quads) and back (triceps, calves), with tendon lines
  const muscles = (rx, ry, rw, rh) => {
    const blob = (u, vv, ru, rv, a) => { const cx = rx + u * rw, cy = ry + (1 - vv) * rh; const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 1); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.save(); g.translate(cx, cy); g.scale(ru * rw / 256, rv); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); };
    for (const off of [0, 1]) {
      blob(0.25, 0.72, 34, 22, 0.6); blob(0.75, 0.68, 30, 24, 0.5); blob(0.75, 0.3, 30, 18, 0.55); blob(0.25, 0.36, 26, 16, 0.4);
      blob(0.0 + off, 0.55, 16, 30, 0.25); blob(0.5, 0.55, 16, 30, 0.25); blob(0.12 + off * 0.5, 0.86, 18, 12, 0.35);
    }
    g.strokeStyle = 'rgba(60,60,60,0.35)'; g.lineWidth = 2;
    for (const u of [0.12, 0.38, 0.62, 0.88]) { g.beginPath(); g.moveTo(rx + u * rw, ry + rh); g.lineTo(rx + u * rw, ry + rh - 24); g.stroke(); }
    // veins on the forearm
    g.strokeStyle = 'rgba(175,175,175,0.5)'; g.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) { g.beginPath(); let x = rx + (0.2 + k * 0.08) * rw; g.moveTo(x, ry + rh); for (let y = rh; y > rh * 0.45; y -= 6) { x += (Math.random() - 0.5) * 3; g.lineTo(x, ry + y); } g.stroke(); }
  };
  muscles(256, 896, 256, 128); muscles(768, 896, 128, 128); muscles(896, 896, 128, 128);
  // soft fabric folds hanging from the armpits and across the waist
  for (let i = 0; i < 18; i++) {
    const x0 = Math.random() * 1024, y0 = 150 + Math.random() * 120, x1 = x0 + (Math.random() - 0.5) * 120, y1 = 470;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(70,70,70,0.5)' : 'rgba(185,185,185,0.45)'; g.lineWidth = 6 + Math.random() * 8;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + 20, (y0 + y1) / 2, x1, y1); g.stroke();
  }
  // face: brow furrow, nasolabial folds, lips
  { const cx = 128, ey = 768 + 122;
    g.strokeStyle = 'rgba(95,95,95,0.5)'; g.lineWidth = 2.5;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 8, ey + 30); g.quadraticCurveTo(cx + s * 20, ey + 40, cx + s * 17, ey + 56); g.stroke(); }
    g.strokeStyle = 'rgba(160,160,160,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 11, ey + 53); g.quadraticCurveTo(cx, ey + 58, cx + 11, ey + 53); g.stroke(); }
  DETAIL_TEX = new THREE.CanvasTexture(c);
  return DETAIL_TEX;
}

/* ---------- the model ---------- */
const BI = { body: 0, hips: 1, torso: 2, head: 3, shR: 4, elR: 5, shL: 6, elL: 7, hipR: 8, knR: 9, ankR: 10, hipL: 11, knL: 12, ankL: 13, hem: 14 };
const SHOE_CW = [
  (T, home) => ({ shoe: '#f4f4f4', shoe2: '#d8d8d8', sole: '#f2f2f2', accent: home ? T.c1 : T.c1 }),
  (T, home) => ({ shoe: '#16171a', shoe2: '#2a2c31', sole: '#f0f0f0', accent: T.c3 }),
  (T, home) => ({ shoe: T.c1, shoe2: shade(T.c1, -0.3), sole: '#f2f2f2', accent: '#ffffff' }),
  (T, home) => ({ shoe: '#f4f4f4', shoe2: '#1c1c1e', sole: '#1c1c1e', accent: '#1c1c1e' }),
];
function buildHumanoid(pl, home) {
  const d = pl.d, T = pl.team.def, ref = !!pl.ref;
  const bulk = { PG: 0.95, SG: 0.98, SF: 1.01, PF: 1.07, C: 1.12 }[d.pos];
  const L = playerLook(d, ref);
  const hairC = HAIRC[d.skin <= 1 && d.hair === 2 ? 4 : d.hair % 3];
  const skinC = new THREE.Color(SKIN[d.skin]);
  const C = {
    skin: SKIN[d.skin], hair: hairC, kit: home ? T.c1 : '#f1f0ec', trim: home ? T.c3 : T.c2,
    sock: L.socks === 'high' ? (L.legs !== 'none' && L.gearC !== 'kit' ? L.gearC : home ? '#f5f5f5' : '#f5f5f5') : home ? '#f5f5f5' : T.c1,
    band: home ? '#ffffff' : T.c1, sleeve: home ? '#ffffff' : T.c1,
    lip: '#' + skinC.clone().multiplyScalar(0.72).lerp(new THREE.Color('#7a3b30'), 0.25).getHexString(),
    gear: L.gearC === 'kit' ? (home ? T.c1 : '#f1f1f1') : L.gearC,
  };
  Object.assign(C, SHOE_CW[L.shoe](T, home));
  if (ref) Object.assign(C, { kit: '#dcdddf', trim: '#111111', sock: '#111111', shoe: '#101010', shoe2: '#1c1c1c', sole: '#202020', accent: '#101010', pants: '#141518', shirt: '#cfd0d2', ref: true });
  const b = bulk;
  // bind-pose joint positions in mesh space (feet at the origin, facing +x)
  const J = { hips: [0, 3.35, 0], head: [0, 5.77, 0], shR: [0, 5.25, 0.76 * b], shL: [0, 5.25, -0.76 * b], hipR: [0, 3.27, 0.32 * b], hipL: [0, 3.27, -0.32 * b] };
  const P = [];
  // torso / jersey: lower third follows the hips, upper body follows the spine; broad through the chest and lats
  P.push(piece(regionUV(lathe([[0.57, 0.08], [0.56, 0.45], [0.6, 0.85], [0.69, 1.3], [0.76, 1.6], [0.79, 1.82], [0.71, 1.99], [0.46, 2.11], [0.26, 2.2]], 32, 0.62, b), 'jersey'), J.hips,
    (x, y) => { const t = sstep(3.6, 4.3, y), hw = 0.8 * (1 - sstep(3.45, 4.15, y)); return [BI.hips, (1 - t) * (1 - hw), BI.torso, t * (1 - hw), BI.hem, hw]; },
    (x, y, z, nx, ny, nz) => 1 - 0.14 * (1 - sstep(3.45, 4.1, y)) - 0.18 * sstep(0.45, 0.7, Math.abs(z)) * sstep(4.6, 5.0, y) * (1 - sstep(5.15, 5.35, y))));
  // shorts top
  P.push(piece(regionUV(lathe([[0.44, -0.86], [0.58, -0.62], [0.67, -0.32], [0.71, -0.05], [0.68, 0.16], [0.6, 0.32]], 24, 0.74 * b, b), 'pelvis'), J.hips,
    () => [BI.hips, 1], (x, y) => 0.84 + 0.16 * sstep(2.6, 3.3, y)));
  // neck with a hint of the sternocleidomastoid
  P.push(piece(constUV(lathe([[0.235, 2.0], [0.205, 2.2], [0.2, 2.34], [0.205, 2.47]], 16, 1, 1.05), 'skin'), J.hips,
    (x, y) => blend(BI.torso, BI.head, sstep(5.45, 5.75, y)), (x, y, z, nx) => 0.78 + 0.22 * (nx < 0 ? 1 : 1 - nx * 0.6)));
  // head: sculpted skull with jaw and chin, face painted from the atlas
  const sk = new THREE.SphereGeometry(0.34, 32, 24);
  { const p = sk.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const dy = y / 0.34, dx = x / 0.34;
      x *= 0.98; y *= 1.13; z *= 0.88;
      if (dy < 0) { z *= 1 - 0.24 * -dy; if (dx > -0.2) x += 0.07 * -dy * Math.max(0, dx + 0.2); y *= 1 + 0.08 * -dy; }
      if (dy > 0.25 && dx < 0) x *= 1.06;
      const fz = Math.abs(z / 0.34);
      if (dx > 0.55 && dy > 0.12 && dy < 0.38) x += 0.024 * (1 - Math.abs(dy - 0.25) / 0.13);                 // brow ridge
      if (dx > 0.7 && dy > 0.0 && dy < 0.2 && fz > 0.15 && fz < 0.5) x -= 0.018 * Math.sin(Math.PI * (fz - 0.15) / 0.35);   // eye sockets
      if (dx > 0.25 && dy > -0.25 && dy < 0.08 && fz > 0.5) { z *= 1.035; x += 0.01; }                          // cheekbones
      if (dx > 0.6 && dy < -0.62 && fz < 0.3) x += 0.016 * (1 - fz / 0.3);                                    // chin
      if (dx > 0.8 && dy > -0.44 && dy < -0.3 && fz < 0.18) x += 0.012 * (1 - fz / 0.18);                     // lips
      p.setXYZ(i, x + 0.02, y + 0.33, z);
    }
    sk.computeVertexNormals(); }
  const headW = () => [BI.head, 1];
  P.push(piece(regionUV(sk, 'face'), J.head, headW, (x, y, z, nx, ny) => (ny < -0.5 ? 0.82 : 1)));
  // nose: bridge, tip and wings
  { const ns = new THREE.SphereGeometry(0.06, 14, 12), p = ns.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / 0.06, y = p.getY(i) / 0.06, z = p.getZ(i) / 0.06, t = (y + 1) / 2;
      const fx = x > 0 ? x * lerp(1.0, 0.45, t * t) : x * 0.4;
      p.setXYZ(i, 0.322 + fx * 0.06 * (1 + 0.25 * (1 - t)), 0.3 + y * 0.06 * 1.55, z * 0.06 * lerp(1.15, 0.5, t));
    }
    ns.computeVertexNormals();
    P.push(piece(constUV(ns, 'skin'), J.head, headW)); }
  for (const s of [-1, 1]) P.push(piece(constUV(sphereG(0.028, 8, 6, 0.9, 0.8, 1, 0.34, 0.225, s * 0.042), 'skin'), J.head, headW, () => 0.9));
  // ears: a rim and a lobe
  for (const s of [-1, 1]) {
    const e = sphereG(0.085, 12, 9, 0.5, 1.0, 0.3, 0, 0, 0); e.rotateZ(0.12); e.rotateY(s * 0.25); e.translate(-0.02, 0.32, s * 0.305);
    P.push(piece(constUV(e, 'skin'), J.head, headW, () => 0.84));
    P.push(piece(constUV(sphereG(0.03, 8, 6, 0.8, 1, 0.6, -0.005, 0.245, s * 0.31), 'skin'), J.head, headW, () => 0.86));
  }
  const hairUV = (g) => regionUV(g, 'hair');
  const topUV = (g) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (1 - uv.getY(i)) * 0.25); return g; };
  // a hair cap whose hairline sits higher over the forehead than at the temples and nape:
  // vertices below the hairline sink just under the scalp
  const cap = (r, tl, sx, sy, sz, x, y) => {
    const g = hairUV(sphereG(r, 36, 18, sx, sy, sz, 0, 0, 0, 0, PI * tl)), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const nx = p.getX(i) / (r * sx), ny = p.getY(i) / (r * sy), nz = Math.abs(p.getZ(i) / (r * sz));
      const line = lerp(0.0, 0.38, sstep(0.25, 0.85, nx)) + 0.12 * sstep(0.55, 0.95, nz) * (1 - sstep(0.0, 0.5, nx));
      if (ny < line) p.setXYZ(i, p.getX(i) * 0.9, p.getY(i) * 0.9, p.getZ(i) * 0.9);
    }
    g.computeVertexNormals(); g.translate(x, y, 0); return g;
  };
  const H = L.hair, hs = nameHash(d.n) % 97;
  if (H === 'fade' || H === 'waves') P.push(piece(cap(0.352, 0.44, 1.0, 1.13, 0.91, 0.012, 0.355), J.head, headW));
  else if (H === 'flow') { P.push(piece(cap(0.358, 0.56, 1.02, 1.14, 0.93, 0.0, 0.35), J.head, headW)); P.push(piece(hairUV(sphereG(0.3, 18, 10, 0.7, 1.0, 1.0, -0.18, 0.18, 0, PI * 0.35, PI * 0.4)), J.head, headW)); }
  else if (H === 'hightop') {
    P.push(piece(cap(0.352, 0.44, 1.0, 1.13, 0.91, 0.012, 0.355), J.head, headW));
    const top = sphereG(0.33, 24, 14, 1.0, 1.0, 0.92, 0, 0, 0, 0, PI * 0.6);
    { const p = top.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, Math.min(p.getY(i), 0.2) * 1.35); }
    lumpy(top, 0.035, 34, hs); top.translate(-0.01, 0.68, 0);
    P.push(piece(hairUV(topUV(top)), J.head, headW));
  } else if (H === 'twists') {
    // sponge curls: a tight, lumpy crop with a little height on top
    P.push(piece(cap(0.352, 0.44, 1.0, 1.13, 0.91, 0.012, 0.355), J.head, headW));
    const top = sphereG(0.36, 34, 16, 1.0, 1.0, 0.92, 0, 0, 0, 0, PI * 0.46);
    { const p = top.attributes.position; for (let i = 0; i < p.count; i++) { const k = lerp(0.9, 1, sstep(0.0, 0.14, p.getY(i))); p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); } }
    lumpy(top, 0.04, 52, hs); top.scale(1, 1.22, 1); top.translate(0.0, 0.43, 0);
    P.push(piece(hairUV(topUV(top)), J.head, headW));
  } else if (H === 'afro') P.push(piece(hairUV(lumpy(sphereG(0.5, 30, 18, 1.0, 0.86, 1.0, 0, 0, 0, 0, PI * 0.62), 0.03, 26, hs)).translate(-0.06, 0.52, 0), J.head, headW));
  else if (H === 'dreads') {
    P.push(piece(cap(0.358, 0.5, 1.0, 1.13, 0.92, 0.0, 0.355), J.head, headW));
    const r = mulberry32(hs + 9);
    for (let i = 0; i < 26; i++) {
      // locs fall from the crown around the sides and back, shorter at the front
      const ph = PI * 0.28 + (i / 25) * PI * 1.44, len = 0.52 + r() * 0.3 - Math.max(0, Math.cos(ph)) * 0.25;
      const ox = Math.cos(ph) * 0.3, oz = Math.sin(ph) * 0.3;
      const lc = hairUV(cylG(0.036, 0.03, len, 6, 0, -len / 2, 0));
      lc.rotateZ(Math.cos(ph) * 0.32); lc.rotateX(-Math.sin(ph) * 0.32);
      lc.translate(ox * 1.04, 0.5 + r() * 0.08, oz * 1.02);
      P.push(piece(lc, J.head, headW, () => 0.85));
    }
  } else if (H === 'bun') { P.push(piece(cap(0.352, 0.47, 1.0, 1.12, 0.91, 0.01, 0.36), J.head, headW)); P.push(piece(hairUV(sphereG(0.13, 14, 10, 1, 1, 1, -0.3, 0.62, 0)), J.head, headW)); }
  else if (H === 'braids') { P.push(piece(cap(0.35, 0.48, 1.0, 1.12, 0.91, 0.01, 0.355), J.head, headW)); for (let i = 0; i < 6; i++) { const z = (i - 2.5) * 0.08, lc = hairUV(cylG(0.03, 0.022, 0.42, 6, 0, -0.21, 0)); lc.rotateZ(-0.35); lc.translate(-0.32, 0.36, z); P.push(piece(lc, J.head, headW)); } }
  if (d.acc === 1) P.push(piece(constUV(cylG(0.37, 0.37, 0.1, 28, 0.015, 0.47, 0), 'band'), J.head, headW));
  // arms: one continuous tube per arm that bends smoothly at the elbow; athletic deltoids, biceps and forearms
  const ARM = [[0.104, -2.22], [0.114, -2.12], [0.156, -1.85], [0.19, -1.55], [0.17, -1.3], [0.155, -1.18], [0.182, -1.02], [0.24, -0.75], [0.272, -0.48], [0.26, -0.2], [0.22, 0.05]];
  for (const s of [1, -1]) {
    const sh = s > 0 ? BI.shR : BI.shL, el = s > 0 ? BI.elR : BI.elL, j = s > 0 ? J.shR : J.shL;
    const ys = j[1];
    const armAO = (x, y, z, nx, ny, nz) => { const inner = clamp(-nz * s, 0, 1); return 1 - 0.18 * inner - 0.2 * inner * sstep(ys - 0.7, ys - 0.1, y); };
    const armW = (x, y) => blend(sh, el, sstep(ys - 0.98, ys - 1.32, y));
    const armG = sculptLimb(lathe(ARM, 20, b, b), [[-0.55, 0.22, 0.13, 0.02, 0], [-0.42, 0.26, 0, 0.11, 0.03], [-1.42, 0.2, 0.03, 0, 0.1], [-1.2, 0.05, 0, 0.06, 0]], 0.97, 0.98, s);
    P.push(piece(regionUV(armG, s > 0 ? 'armR' : 'armL'), j, armW, armAO));
    P.push(piece(constUV(sphereG(0.235, 18, 12, 0.92, 1.28, 0.86, 0.005, -0.13, -s * 0.005), 'skin'), j, () => [sh, 1], armAO));
    // hand: palm, four fingers and the thumb
    P.push(piece(constUV(sphereG(0.14, 12, 9, 0.6, 1.12, 1.0, 0.01, -2.32, 0), 'skin'), j, () => [el, 1], () => 0.92));
    for (let f = 0; f < 4; f++) {
      // two segments per finger, slightly curled toward the palm
      const fz = (f - 1.5) * 0.05, fl = [0.11, 0.125, 0.12, 0.095][f];
      const f1 = cylG(0.028, 0.03, fl, 6, 0, -fl / 2, 0); f1.rotateZ(0.2); f1.translate(0.035, -2.43, fz);
      const f2 = cylG(0.024, 0.027, fl * 0.85, 6, 0, -fl * 0.42, 0); f2.rotateZ(0.65); f2.translate(0.035 + Math.sin(0.2) * fl, -2.43 - Math.cos(0.2) * fl, fz);
      P.push(piece(constUV(f1, 'skin'), j, () => [el, 1], () => 0.9)); P.push(piece(constUV(f2, 'skin'), j, () => [el, 1], () => 0.84));
    }
    { const th = boxG(0.06, 0.16, 0.06, 0, -0.08, 0); th.rotateX(-s * 0.5); th.rotateZ(0.35); th.translate(0.08, -2.27, s * 0.1); P.push(piece(constUV(th, 'skin'), j, () => [el, 1])); }
    if (d.acc === 2 && s > 0) P.push(piece(constUV(lathe(bandProf(ARM, -2.05, -0.25, 0.012, 12), 18, b, b), 'sleeve'), j, armW));
    const wrist = (d.acc === 2 && s < 0) || L.wrist === 'both' || (L.wrist === 'L' && s < 0);
    if (wrist && !(d.acc === 2 && s > 0)) P.push(piece(constUV(lathe(bandProf(ARM, -2.16, -1.98, 0.022, 3), 16, b, b), 'band'), j, () => [el, 1]));
    if (ref) P.push(piece(constUV(lathe([[0.22, -0.62], [0.245, -0.45], [0.25, -0.2], [0.26, 0.02], [0.22, 0.14]], 16, b, b), 'shirt'), j, () => [sh, 1], armAO));
  }
  // legs: continuous skin from hip to ankle, baggy shorts over the thigh, sock and shoe
  const LEG = [[0.118, -3.14], [0.124, -3.05], [0.147, -2.9], [0.188, -2.6], [0.234, -2.22], [0.216, -1.95], [0.2, -1.75], [0.21, -1.6], [0.244, -1.4], [0.298, -1.0], [0.332, -0.55], [0.332, -0.2], [0.31, 0.02]];
  const sockTop = L.socks === 'high' ? -2.3 : -2.62;
  for (const s of [1, -1]) {
    const hp = s > 0 ? BI.hipR : BI.hipL, kn = s > 0 ? BI.knR : BI.knL, an = s > 0 ? BI.ankR : BI.ankL, j = s > 0 ? J.hipR : J.hipL;
    const yh = j[1], yk = yh - 1.6, ya = yk - 1.52;
    const legW = (x, y) => { if (y > yk + 0.2) return [hp, 1]; if (y > yk - 0.18) return blend(hp, kn, sstep(yk + 0.2, yk - 0.18, y)); if (y > ya + 0.1) return [kn, 1]; return blend(kn, an, sstep(ya + 0.1, ya - 0.02, y)); };
    const legAO = (x, y, z, nx, ny, nz) => 1 - 0.22 * clamp(-nz * s, 0, 1) * sstep(yk + 0.5, yh - 0.6, y) - 0.1 * clamp(-nx, 0, 1) * (1 - Math.min(1, Math.abs(y - yk) / 0.4));
    const lp = ref ? 'pants' : 'skin', lw = ref ? 1.12 : 1;
    { const lg = lathe(LEG.map((q) => [q[0] * lw, q[1]]), 20, b, b);
      if (!ref) sculptLimb(lg, [[-2.18, 0.22, 0.0, 0.16, 0.04], [-1.05, 0.34, 0.08, 0.03, 0.04], [-1.62, 0.08, 0.1, 0, 0], [-0.4, 0.3, 0, 0, 0.03]], 0.96, 0.95, s);
      P.push(piece(ref ? constUV(lg, lp) : regionUV(lg, 'limb'), j, legW, legAO)); }
    P.push(piece(constUV(sphereG(0.2 * lw, 12, 9, 1.05, 1, 1, 0.02, -1.6, 0), lp), j, legW, legAO));
    if (!ref) {
      // compression gear: full-length tights or a padded knee sleeve
      const full = L.legs === 'tightsBoth' || (L.legs === 'tightsR' && s > 0);
      const knee = L.legs === 'kneeBoth' || (L.legs === 'kneeL' && s < 0);
      if (full) P.push(piece(constUV(lathe(bandProf(LEG, sockTop - 0.06, -0.9, 0.012, 16), 18, b, b), 'pants'), j, legW, legAO));
      if (knee) P.push(piece(constUV(lathe(bandProf(LEG, -1.98, -1.22, (y) => 0.024 + 0.02 * Math.cos((y + 1.6) / 0.38 * PI / 2), 10), 18, b, b), 'pants'), j, legW, legAO));
      P.push(piece(regionUV(lathe([[0.43, -1.52], [0.45, -1.3], [0.465, -0.6], [0.46, -0.12], [0.41, 0.06]], 22, b, b), s > 0 ? 'shortsR' : 'shortsL'), j,
        (x, y) => blend(BI.hips, hp, sstep(yh + 0.05, yh - 0.35, y)),
        (x, y, z, nx, ny, nz) => 1 - 0.09 * clamp(-nz * s, 0, 1) - 0.12 * (1 - sstep(yh - 1.52, yh - 1.2, y))));
    }
    P.push(piece(constUV(lathe(bandProf(LEG, -3.14, sockTop, 0.016, 8).concat([[profR(LEG, sockTop) + 0.006, sockTop + 0.02]]), 18, b, b), 'sock'), j, legW, legAO));
    for (const g of shoePieces()) {
      g.scale(1.03, 1.0, 1.08); g.translate(0.07, -2.99, 0);
      P.push(piece(g, j, () => [an, 1], (x, y) => 0.8 + 0.2 * sstep(0.0, 0.25, y)));
    }
  }
  const geo = mergeSkin(P);
  geo.computeBoundingSphere();
  // skeleton mirrors the old group hierarchy, so the pose solver drives it unchanged
  const bones = [];
  const bone = (parent, x, y, z) => { const o = new THREE.Bone(); o.position.set(x, y, z); if (parent) parent.add(o); bones.push(o); return o; };
  const bBody = bone(null, 0, 0, 0), bHips = bone(bBody, 0, 3.35, 0), bTorso = bone(bHips, 0, 0, 0), bHead = bone(bTorso, 0, 2.42, 0);
  const bShR = bone(bTorso, 0, 1.9, 0.76 * b), bElR = bone(bShR, 0, -1.15, 0), bShL = bone(bTorso, 0, 1.9, -0.76 * b), bElL = bone(bShL, 0, -1.15, 0);
  const bHipR = bone(bHips, 0, -0.08, 0.32 * b), bKnR = bone(bHipR, 0, -1.6, 0), bAnkR = bone(bKnR, 0, -1.52, 0);
  const bHipL = bone(bHips, 0, -0.08, -0.32 * b), bKnL = bone(bHipL, 0, -1.6, 0), bAnkL = bone(bKnL, 0, -1.52, 0);
  const bHem = bone(bTorso, 0, 0.75, 0);
  const skel = new THREE.Skeleton(bones);
  const atlas = canvasTex(paintAtlas(T, home, d, C, L));
  const mat = new THREE.MeshStandardMaterial({ map: atlas, roughnessMap: roughAtlas(), bumpMap: detailAtlas(), bumpScale: 0.05, roughness: 1, metalness: 0, vertexColors: true, skinning: true, envMapIntensity: 0.7 });
  mat.onBeforeCompile = (sh) => {
    // sweat: skin gets a stronger, tighter specular than cloth
    sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>',
      `#include <aomap_fragment>
       float sweat = texture2D(roughnessMap, vUv).r;
       reflectedLight.directSpecular *= 1.0 + 0.8 * sweat;
       reflectedLight.indirectSpecular *= 1.0 + 0.45 * sweat;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <tonemapping_fragment>',
      `float skinM = texture2D(roughnessMap, vUv).r;
       float ndv = clamp(dot(normalize(geometryNormal), normalize(vViewPosition)), 0.0, 1.0);
       gl_FragColor.rgb += diffuseColor.rgb * vec3(0.5, 0.16, 0.07) * skinM * (0.1 + 0.45 * pow(1.0 - ndv, 2.0));
       gl_FragColor.rgb += vec3(0.5, 0.58, 0.72) * pow(1.0 - ndv, 3.0) * 0.32 * (1.0 - 0.45 * skinM);
       #include <tonemapping_fragment>`);
  };
  mat.customProgramCacheKey = () => 'player-skin-rim-2';
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(bBody);
  mesh.bind(skel);
  mesh.castShadow = true; mesh.frustumCulled = false;
  bBody.scale.set(pl.sc, pl.sc, pl.sc);
  const root = new THREE.Group(); root.add(mesh);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), R.blobMat);
  blob.rotation.x = -PI / 2; blob.position.y = 0.03;
  R.scene.add(root); R.scene.add(blob);
  return { root, mesh, skel, atlas, mat, body: bBody, hips: bHips, torso: bTorso, headG: bHead,
    hem: bHem, armR: { sh: bShR, el: bElR }, armL: { sh: bShL, el: bElL }, legR: { hp: bHipR, kn: bKnR, ank: bAnkR }, legL: { hp: bHipL, kn: bKnL, ank: bAnkL },
    blob, stride: 0, j: { lean: 0, crouch: 0, twist: 0 } };
}
/* three officials: purely visual, they follow the play with standard lead / trail / centre mechanics */
const REF_TEAM = { idx: -1, def: { c1: '#dcdddf', c2: '#111111', c3: '#111111', name: '', id: '', city: '' } };
function buildRefs() {
  if (R.refs) for (const r of R.refs) disposeHumanoid(r.h);
  R.refs = [];
  if (G.mode === 'threept') return;
  const skins = [1, 4, 2];
  for (let i = 0; i < 3; i++) {
    const p = { ref: true, id: 100 + i, team: REF_TEAM, d: { n: 'Official ' + (i + 1), pos: 'SF', h: 73, num: [34, 21, 58][i], skin: skins[i], hair: i === 1 ? 0 : 1, acc: 0 },
      x: [44, -10, 4][i], y: 0, z: [-12, 26.8, -26.6][i], vx: 0, vz: 0, face: 0, act: 'none', actT: 0, shot: null, hasBall: false, gather: false, holdT: 0,
      expectPass: false, handsUp: false, celebT: 0, dribHand: 1, mv: null, signalT: 0, signal: null };
    p.hgt = p.d.h / 12; p.sc = p.hgt / 6.5;
    R.refs.push({ p, h: buildHumanoid(p, false) });
  }
}
/* the second unit: five substitutes per team in full uniform, seated on each bench, following the ball */
const BENCH_FIRST = ['Marcus', 'Theo', 'Jalen', 'Owen', 'Darius', 'Luca', 'Isaiah', 'Kofi', 'Mateus', 'Rory', 'Andre', 'Nate', 'Elijah', 'Tariq', 'Henrik', 'Cam'];
const BENCH_LAST = ['Reid', 'Okafor', 'Lindgren', 'Barros', 'Cole', 'Hayes', 'Mensah', 'Duarte', 'Price', 'Vance', 'Sato', 'Ellis', 'Navarro', 'Booker', 'Strand', 'Achebe'];
function buildBench() {
  if (R.bench) for (const b of R.bench) disposeHumanoid(b.h);
  R.bench = [];
  if (G.mode === 'threept') return;
  G.teams.forEach((T, ti) => {
    const s = T.idx === 0 ? -1 : 1;
    const used = new Set(T.players.map((p) => p.d.num));
    const r = mulberry32(nameHash(T.def.id + ti) + 5);
    [1, 2, 3, 5, 6].forEach((slot, k) => {
      let num = 0; do { num = Math.floor(r() * 55); } while (used.has(num)); used.add(num);
      const d = { n: BENCH_FIRST[Math.floor(r() * 16)] + ' ' + BENCH_LAST[Math.floor(r() * 16)], pos: ['SG', 'SF', 'PF', 'C', 'PG'][k], h: 74 + Math.floor(r() * 10), num,
        skin: Math.floor(r() * 6), hair: Math.floor(r() * 5), acc: r() < 0.2 ? 1 : 0 };
      const p = { ref: false, bench: true, id: 300 + ti * 10 + k, team: T, d, hgt: d.h / 12, sc: d.h / 12 / 6.5, x: s * (20 + slot * 2.15) + (r() - 0.5) * 0.2, y: 0, z: -30.5, face: PI / 2 + (r() - 0.5) * 0.25 };
      const h = buildHumanoid(p, T.idx === 0);
      h.mesh.castShadow = false; h.blob.visible = false;
      poseSeated(h, p, r);
      R.bench.push({ p, h });
    });
  });
}
function poseSeated(h, p, r) {
  const sc = p.sc, hipY = 1.78 + 0.3 * sc;
  const th = Math.acos(clamp((hipY - 1.77 * sc) / (1.6 * sc), 0.05, 0.95));
  h.root.position.set(p.x, hipY - 3.35 * sc, p.z); h.root.rotation.y = -p.face;
  const spread = 0.1 + r() * 0.12;
  h.legR.hp.rotation.set(0, -spread, th); h.legL.hp.rotation.set(0, spread, th);
  for (const leg of [h.legR, h.legL]) { leg.kn.rotation.set(0, 0, -th); leg.ank.rotation.set(0, 0, 0); }
  h.hips.position.y = 3.35; h.torso.rotation.z = 0.04 - r() * 0.12;
  const kx = 1.6 * Math.sin(th), ky = 3.27 - 1.6 * Math.cos(th);
  if (r() < 0.3) {   // elbows on the knees, leaning in
    h.torso.rotation.z = -0.3;
    armIK(h, h.armR, 1, kx * 0.9, ky + 0.7, 0.3, 1); armIK(h, h.armL, -1, kx * 0.9, ky + 0.7, -0.3, 1);
  } else { armIK(h, h.armR, 1, kx * 0.62, ky + 0.42, 0.46, 1); armIK(h, h.armL, -1, kx * 0.62, ky + 0.42, -0.46, 1); }
  h.benchLook = r() * 10;
}
function stepBench(dt) {
  if (!R.bench || !R.bench.length) return;
  const b = G.ball, k = 1 - Math.exp(-4 * dt);
  for (const q of R.bench) {
    const lb = toLocal(q.p, b.x, b.y, b.z);
    const yaw = clamp(Math.atan2(lb.z, Math.max(0.3, lb.x)), -1.15, 1.15) + Math.sin(R.t * 0.3 + q.h.benchLook) * 0.08;
    q.h.headG.rotation.y += (-yaw - q.h.headG.rotation.y) * k;
    q.h.headG.rotation.z += (clamp(Math.atan2(lb.y - 4.6, Math.max(1, hyp(lb.x, lb.z))), -0.4, 0.4) * 0.6 - q.h.headG.rotation.z) * k;
  }
}
function refSignal(kind, x, z) {
  if (!R.refs || !R.refs.length) return;
  let best = R.refs[0], bd = 1e9;
  for (const r of R.refs) { const d = hyp(r.p.x - x, r.p.z - z); if (d < bd) { bd = d; best = r; } }
  best.p.signal = kind; best.p.signalT = kind === 'three' ? 1.4 : 1.2;
}
function stepRefs(dt) {
  if (!R.refs || !R.refs.length) return;
  const b = G.ball, O = G.teams[G.offense], dir = O ? O.dir : 1;
  let bx = b.x, bz = b.z;
  if (b.state === 'held' && b.holder) { bx = b.holder.x; bz = b.holder.z; }
  if (G.state === 'dead' && G.dead) { bx = clamp(G.dead.sx, -45, 45); bz = clamp(G.dead.sz, -22, 22); }
  let T = [
    [dir * (CT.HL + 1.7), clamp(bz * 0.35 + (bz > 0 ? -9 : 9), -19, 19)],
    [clamp(bx - dir * 11, -42, 42), CT.HW + 1.8],
    [clamp(bx * 0.7 + dir * 5, -40, 40), -(CT.HW + 1.6)],
  ];
  if ((G.state === 'ft' || G.state === 'ftcut') && G.ft) {
    const s = G.ft.shooter.team.dir;
    T = [[s * (CT.HL + 1.7), -9], [s * 16, CT.HW + 1.8], [s * 30, -(CT.HW + 1.6)]];
  } else if (G.state === 'tip') T = [[0, 6.5], [-12, CT.HW + 1.8], [12, -(CT.HW + 1.6)]];
  R.refs.forEach((r, i) => {
    const p = r.p, t = T[i];
    const dx = t[0] - p.x, dz = t[1] - p.z, d = hyp(dx, dz);
    const sp = Math.min(14, d * 2.0);
    const tvx = d > 0.4 ? dx / d * sp : 0, tvz = d > 0.4 ? dz / d * sp : 0;
    p.vx = damp(p.vx, tvx, 5, dt); p.vz = damp(p.vz, tvz, 5, dt);
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.face = turnToward(p.face, Math.atan2(bz - p.z, bx - p.x), 7 * dt);
    if (p.signalT > 0) p.signalT -= dt;
    p.actT += dt;
    poseHumanoid(r.h, p, Math.max(dt, 1e-4), p.x, 0, p.z, p.face);
  });
}
function disposeHumanoid(h) {
  R.scene.remove(h.root); R.scene.remove(h.blob);
  h.mesh.geometry.dispose(); h.mat.dispose(); h.atlas.dispose();
  if (h.skel.dispose) h.skel.dispose();
  h.blob.geometry.dispose();
}
function buildPlayers() {
  for (const h of R.players) disposeHumanoid(h);
  R.players = G.players.map((p) => buildHumanoid(p, p.team.idx === 0));
  buildRefs();
  buildBench();
  R.prev = G.players.map((p) => ({ x: p.x, y: p.y, z: p.z, f: p.face }));
  R.prevBall = { x: G.ball.x, y: G.ball.y, z: G.ball.z };
  paintArena(G.teams[0].def, G.teams[1].def);
  R.racks.visible = G.mode === 'threept';
  if (G.mode === 'threept') buildRacks();
  stopConfetti();
}

/* ---------------- posing ---------------- */
function dampR(o, key, v, k) { o[key] += (v - o[key]) * k; }
function setArm(arm, z, x, el, k) { dampR(arm.sh.rotation, 'z', z, k); dampR(arm.sh.rotation, 'x', x, k); dampR(arm.el.rotation, 'z', el, k); }
function setLeg(leg, z, x, kn, k) { dampR(leg.hp.rotation, 'z', z, k); dampR(leg.hp.rotation, 'x', x, k); dampR(leg.kn.rotation, 'z', kn, k); }
/* point a hand at a target in the player's local frame (feet origin, +x forward, +z right, unscaled feet) */
function armIK(h, arm, side, tx, ty, tz, k) {
  const sy = h.hips.position.y + 1.9, sz = side * 0.76;
  let dx = tx, dy = ty - sy, dz = tz - sz;
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
  const a = 1.15, b = 1.22;
  const reach = Math.min(L, a + b - 0.02);
  dx /= L; dy /= L; dz /= L;
  const r = Math.sqrt(dy * dy + dz * dz);
  const thx = Math.atan2(-dz, -dy), phi = Math.atan2(dx, r);
  const alpha = Math.acos(clamp((a * a + reach * reach - b * b) / (2 * a * reach), -1, 1));
  const elbow = PI - Math.acos(clamp((a * a + b * b - reach * reach) / (2 * a * b), -1, 1));
  let x = thx;
  const cx = arm.sh.rotation.x;
  while (x - cx > PI) x -= TAU;
  while (x - cx < -PI) x += TAU;
  setArm(arm, phi - alpha, x, elbow, k);
}
function toLocal(p, wx, wy, wz) {
  const c = Math.cos(p.face), s = Math.sin(p.face);
  const dx = wx - p.x, dz = wz - p.z;
  return { x: (dx * c + dz * s) / p.sc, y: (wy - p.y) / p.sc, z: (-dx * s + dz * c) / p.sc };
}
/* ---------------- locomotion: a real gait instead of a sine wave ----------------
   One stride = two steps. Each leg spends a stance phase planted (the foot travels back
   at exactly ground speed, so it doesn't skate) and a swing phase (heel kick, knee drive).
   Walk, jog and sprint differ in cadence, stance share and joint ranges; sprints get a
   flight phase where both feet are off the floor. */
function legCycle(psi, A, st, run) {
  psi -= Math.floor(psi);
  if (psi < st) {
    const u = psi / st;
    return [lerp(0.85 * A, -A, u), -(0.1 + (0.2 + 0.28 * run) * Math.sin(Math.PI * u)), true, u];
  }
  const u = (psi - st) / (1 - st);
  return [-A + 1.85 * A * smooth(u), -(0.14 + (0.72 + 1.1 * run) * Math.sin(Math.PI * Math.min(1, u * 1.1))), false, u];
}
function poseHumanoid(h, p, dt, px, py, pz, pf) {
  const k = 1 - Math.exp(-16 * dt), kf = 1 - Math.exp(-28 * dt), kg = 1 - Math.exp(-45 * dt);
  h.root.position.set(px, py, pz);
  h.root.rotation.y = -pf;
  h.blob.position.set(px, 0.03, pz);
  const bs = clamp(1.2 - py * 0.08, 0.45, 1.2) * p.sc; h.blob.scale.set(bs, bs, 1);
  h.blob.material.opacity = 1;
  const sp = hyp(p.vx, p.vz);
  const cf = Math.cos(p.face), sf = Math.sin(p.face);
  const fwdV = p.vx * cf + p.vz * sf, latV = -p.vx * sf + p.vz * cf;
  const air = py > 0.05;
  const S = p.shot, b = G.ball;
  const live = G.state === 'live' || G.state === 'dead';
  const def = !p.ref && p.team.idx !== G.offense && live;
  const J = h.j;
  // smoothed speed, acceleration and turn rate drive lean and banking
  if (h.spS == null) { h.spS = sp; h.acc = 0; h.turn = 0; h.lastFace = p.face; h.gph = Math.random(); h.sph = 0; h.landT = 0; h.wasAir = false; }
  const dts = Math.max(dt, 1e-4);
  const spPrev = h.spS;
  h.spS = damp(h.spS, sp, 10, dts);
  h.acc = damp(h.acc, (h.spS - spPrev) / dts, 6, dts);
  h.turn = damp(h.turn, angDiff(h.lastFace, p.face) / dts, 8, dts);
  h.lastFace = p.face;
  if (h.wasAir && !air) h.landT = 0.24;
  h.wasAir = air;
  if (h.landT > 0) h.landT -= dt;
  let lean = 0, crouch = 0, bob = 0, twist = 0, roll = 0, hipYaw = 0, hipRoll = 0, headMode = 'ball';
  let legs = false, arms = false;
  const spS = h.spS, run = clamp((spS - 5) / 12, 0, 1);
  const handler = p.hasBall && !p.gather && p.holdT <= 0;
  const hs = p.dribHand || 1;
  const mv = p.act === 'move' && p.mv ? p.mv : null;
  const mu = mv ? clamp(p.actT / p.actDur, 0, 1) : 0;

  /* ---------- special actions ---------- */
  if (p.act === 'stumble') {
    const u = clamp(p.actT / p.actDur, 0, 1), fall = u < 0.45 ? smooth(u / 0.45) : u > 0.75 ? 1 - smooth((u - 0.75) / 0.25) : 1;
    lean = -0.75 * fall; crouch = 1.35 * fall;
    setLeg(h.legR, 1.15 * fall, 0, -1.7 * fall, kf); setLeg(h.legL, 0.6 * fall, 0, -1.25 * fall, kf);
    setArm(h.armR, -0.7 * fall, -0.8 * fall, 0.4, kf); setArm(h.armL, -0.7 * fall, 0.8 * fall, 0.4, kf);
    legs = arms = true;
  } else if (p.act === 'shoot' && S) {
    const bl = toLocal(p, b.x, b.y, b.z);
    headMode = 'rim';
    if (S.type === 'jump' || S.type === 'ft') {
      const pre = !S.jumped;
      const u0 = clamp(p.actT / Math.max(0.08, S.tJump || 0.3), 0, 1);
      crouch = pre ? 0.62 * Math.sin(Math.PI * Math.min(1, u0 * 0.9 + 0.1)) : 0;
      if (S.type === 'ft' && pre) crouch = 0.5 * Math.sin(clamp(p.actT / S.ideal, 0, 1) * PI);
      const kb = pre ? -crouch * 1.75 : -0.08;
      setLeg(h.legR, pre ? crouch * 0.95 : 0.06, -0.05, kb, kf); setLeg(h.legL, pre ? crouch * 0.95 - 0.08 : -0.1, 0.05, pre ? kb * 0.9 : -0.18, kf);
      if (!S.released) {
        armIK(h, h.armR, 1, bl.x - 0.16, bl.y - 0.22, bl.z + 0.2, kf);
        armIK(h, h.armL, -1, bl.x + 0.02, bl.y + 0.02, bl.z - 0.42, kf);
      } else {
        // follow-through: shooting arm high with a relaxed "gooseneck", guide hand peels away
        const ft = clamp((p.actT - S.relT) / 0.12, 0, 1);
        setArm(h.armR, 2.78, -0.1, 0.06 + 0.22 * ft, kf); setArm(h.armL, lerp(2.4, 1.6, ft), 0.5, 0.6, k);
      }
      lean = pre ? 0.08 * crouch : -0.04;
    } else if (!S.jumped) {
      // gather steps into the layup or dunk: low, driving, ball tucked
      const g = legCycle(h.gph, 0.62, 0.42, 1);
      const g2 = legCycle(h.gph + 0.5, 0.62, 0.42, 1);
      h.gph += Math.max(1.3, spS / 13) * dt;
      setLeg(h.legL, g[0], 0, g[1] - 0.2, kg); setLeg(h.legR, g2[0], 0, g2[1] - 0.2, kg);
      lean = 0.3; crouch = 0.24;
      armIK(h, h.armR, 1, bl.x - 0.1, bl.y, bl.z + 0.22, kf);
      armIK(h, h.armL, -1, bl.x, bl.y, bl.z - 0.38, kf);
    } else {
      const lead = hs > 0 ? h.legL : h.legR, trail = hs > 0 ? h.legR : h.legL;
      setLeg(lead, 1.55, 0, -1.7, kf); setLeg(trail, -0.4, 0, -0.5, kf);
      const shoot = hs > 0 ? h.armR : h.armL, other = hs > 0 ? h.armL : h.armR;
      if (!S.released) {
        if (S.type === 'dunk') {   // ball cocked back behind the head before the slam
          armIK(h, shoot, hs, bl.x - 0.25, bl.y - 0.1, bl.z, kf);
          armIK(h, other, -hs, bl.x - 0.15, bl.y - 0.15, bl.z - hs * 0.38, kf);
        } else { armIK(h, shoot, hs, bl.x - 0.1, bl.y - 0.25, bl.z, kf); setArm(other, 1.3, -hs * 0.6, 0.9, k); }
      } else if (S.type === 'dunk') {   // slam through, hands come down over the rim
        const u = clamp((p.actT - S.relT) / 0.18, 0, 1);
        setArm(shoot, lerp(2.9, 1.9, u), -hs * 0.05, 0.25, kf); setArm(other, lerp(2.8, 1.8, u), hs * 0.15, 0.3, kf);
      } else { setArm(shoot, 2.85, -hs * 0.08, 0.08, kf); setArm(other, 1.0, hs * 0.4, 0.6, k); }
      lean = S.type === 'dunk' ? 0.14 : 0.04;
      twist = hs * 0.15;
    }
    legs = arms = true;
  } else if (p.act === 'jump') {
    setLeg(h.legR, 0.32, -0.04, -0.62, kf); setLeg(h.legL, 0.1, 0.04, -0.38, kf);
    const bl = toLocal(p, b.x, b.y, b.z);
    if (b.state !== 'held' && hyp(bl.x, bl.z) < 4.5 && bl.y > 5) {   // reach for the ball on rebounds and blocks
      armIK(h, h.armR, 1, bl.x, bl.y, bl.z + 0.3, kf); armIK(h, h.armL, -1, bl.x, bl.y, bl.z - 0.3, kf);
    } else { setArm(h.armR, 2.95, -0.16, 0.08, kf); setArm(h.armL, 2.95, 0.16, 0.08, kf); }
    legs = arms = true;
  } else if (p.act === 'land') {
    crouch = 0.55; setLeg(h.legR, 0.7, -0.1, -1.1, kf); setLeg(h.legL, 0.6, 0.1, -1.0, kf);
    legs = true;
  } else if (p.act === 'steal') {
    const u = clamp(p.actT / 0.42, 0, 1), e = Math.sin(u * PI);
    lean = 0.5 * e; crouch = 0.42 * e; twist = -0.3 * e;
    const bl = toLocal(p, b.x, b.y, b.z);
    if (e > 0.2 && hyp(bl.x, bl.z) < 4) armIK(h, h.armR, 1, lerp(1.6, bl.x, e), lerp(3.2, bl.y, e * 0.7), lerp(0.6, bl.z, e), kf);
    else setArm(h.armR, 1.3 * e + 0.25, -0.12, 0.12, kf);
    setArm(h.armL, 0.35, 0.35, 0.6, k);
    setLeg(h.legR, 0.7 * e, -0.15, -0.9 * e - 0.3, kf); setLeg(h.legL, -0.3 * e, 0.15, -0.5, kf);
    legs = arms = true;
  } else if (p.act === 'pass') {
    const u = clamp(p.actT / 0.24, 0, 1), e = u < 0.4 ? u / 0.4 : 1;
    setArm(h.armR, 0.9 + 0.75 * e, -0.15, 1.45 * (1 - e) + 0.08, kf); setArm(h.armL, 0.9 + 0.75 * e, 0.15, 1.45 * (1 - e) + 0.08, kf);
    lean = 0.16 * e; headMode = 'target';
    arms = true;
  }

  /* ---------- dribble moves ---------- */
  if (mv && !legs) {
    const k2 = mv.kind;
    headMode = 'rim';
    if (k2 === 'cross') {
      // drop the hips, plant wide toward the new side, shoulders dip with the ball
      const plant = hs > 0 ? h.legR : h.legL, other = hs > 0 ? h.legL : h.legR, ps = hs > 0 ? -1 : 1;
      const e = Math.sin(Math.PI * mu);
      crouch = 0.55 + 0.25 * e; lean = 0.32; roll = hs * 0.16 * e;
      setLeg(plant, 0.55 + 0.25 * e, ps * (0.32 + 0.22 * e), -1.05 - 0.3 * e, kf);
      setLeg(other, 0.35 - 0.2 * e, -ps * 0.16, -0.75, kf);
      twist = -hs * 0.2 * e;
    } else if (k2 === 'spin') {
      // pivot on the inside foot, swing the other leg around, stay low with the ball on the hip
      const pivot = hs > 0 ? h.legL : h.legR, swingL = hs > 0 ? h.legR : h.legL, ps = hs > 0 ? 1 : -1;
      const e = Math.sin(Math.PI * mu);
      crouch = 0.62; lean = 0.38;
      setLeg(pivot, 0.45, -ps * 0.12, -1.0, kf);
      setLeg(swingL, 0.2 + 0.6 * e, ps * (0.25 + 0.35 * e), -0.9 - 0.4 * e, kf);
    } else if (k2 === 'hesi') {
      // rise up and freeze for a beat, eyes to the rim, then explode out of it
      const pause = mu < 0.4;
      crouch = pause ? 0.18 : 0.5; lean = pause ? -0.06 : 0.4;
      setLeg(h.legR, pause ? 0.15 : 0.75, -0.08, pause ? -0.3 : -1.0, kf); setLeg(h.legL, pause ? 0.05 : -0.35, 0.08, pause ? -0.25 : -0.6, kf);
    } else if (k2 === 'stepback') {
      // push off the front foot into a small hop backwards, land balanced on both feet
      const hop = mu > 0.15 && mu < 0.7 ? Math.sin(Math.PI * (mu - 0.15) / 0.55) : 0;
      bob = hop * 0.42; crouch = 0.5 - hop * 0.2; lean = -0.12;
      setLeg(h.legR, 0.3 + 0.35 * hop, -0.12, -0.8 - 0.5 * hop, kf); setLeg(h.legL, 0.05 + 0.4 * hop, 0.12, -0.7 - 0.6 * hop, kf);
    }
    legs = true;
  }

  /* ---------- feet: gait, defensive slides, backpedal, idle ---------- */
  if (!legs) {
    if (air) {
      setLeg(h.legR, 0.45, -0.05, -0.95, k); setLeg(h.legL, 0.12, 0.05, -0.6, k);
    } else {
      const lateral = Math.abs(latV) > Math.abs(fwdV) * 1.05 && spS > 1.8;
      const back = fwdV < -1.5 && Math.abs(fwdV) >= Math.abs(latV);
      if (lateral && (def || spS < 13)) {
        // defensive slide: lead foot steps out, trail foot closes, feet never cross
        h.sph += spS * dt / 2.6;
        const u = h.sph - Math.floor(h.sph), dir = latV > 0 ? 1 : -1;
        const lead = dir > 0 ? h.legR : h.legL, trail = dir > 0 ? h.legL : h.legR, ls = dir > 0 ? -1 : 1;
        const out = u < 0.5 ? smooth(u * 2) : 1 - smooth((u - 0.5) * 2);
        crouch = 0.7;
        setLeg(lead, 0.68, ls * (0.34 + 0.22 * out), -1.28 - 0.08 * out, kg);
        setLeg(trail, 0.68, -ls * (0.34 - 0.08 * out), -1.28, kg);
        bob = 0.05 * Math.sin(Math.PI * u * 2);
        lean = def ? 0.34 : 0.2;
      } else if (spS > 0.7) {
        // walking, jogging, sprinting or backpedalling
        const f = spS < 6 ? lerp(0.78, 1.05, spS / 6) : lerp(1.1, 1.58, clamp((spS - 6) / 15, 0, 1));
        const st = lerp(0.6, 0.36, run);
        const travel = spS * st / f / p.sc;
        const A = Math.min(0.74, Math.asin(clamp(travel / 6.0, 0, 0.95))) * (back ? 0.7 : 1);
        h.gph += f * dt * (back ? -1 : 1);
        const gl = legCycle(h.gph, A, st, run), gr = legCycle(h.gph + 0.5, A, st, run);
        setLeg(h.legL, gl[0], 0.04, gl[1] - (handler ? 0.15 : 0), kg);
        setLeg(h.legR, gr[0], -0.04, gr[1] - (handler ? 0.15 : 0), kg);
        // flight phase on the run: both feet off the floor between steps
        const ph = h.gph - Math.floor(h.gph), fw = 0.5 - st;
        if (run > 0.3 && fw > 0.02) {
          const a = ph % 0.5;
          if (a >= st && a < 0.5) bob = Math.sin(Math.PI * (a - st) / fw) * 0.22 * run;
        }
        hipYaw = (gr[0] - gl[0]) * 0.2;
        hipRoll = (gl[2] ? 1 : -1) * 0.03 * (1 - run);
        lean = (back ? -0.08 : 0.04 + run * 0.14) + (handler ? 0.08 : 0);
        crouch = handler ? 0.22 : 0.06 * run;
        h.armSwing = [gr[0], gl[0]];
      } else {
        // standing: athletic stance on defense (bouncing on the toes), relaxed weight shift on offense
        h.armSwing = null;
        if (def) {
          crouch = 0.7; bob = 0.035 * Math.sin(R.t * 8.5 + p.id);
          setLeg(h.legR, 0.68, -0.36, -1.28, k); setLeg(h.legL, 0.64, 0.36, -1.24, k);
        } else if (handler) {
          crouch = 0.45;
          setLeg(h.legR, 0.4, -0.16, -0.82, k); setLeg(h.legL, 0.32, 0.16, -0.75, k);
        } else {
          const w = Math.sin(R.t * 0.9 + p.id * 1.7);
          crouch = 0.08 + 0.04 * Math.abs(w);
          setLeg(h.legR, 0.1 + 0.05 * w, -0.1, -0.18 - 0.1 * Math.max(0, w), k); setLeg(h.legL, 0.08 - 0.05 * w, 0.1, -0.16 - 0.1 * Math.max(0, -w), k);
          hipRoll = 0.04 * w;
        }
      }
      if (!lateral) { h.sph = 0; }
    }
  }

  /* ---------- arms ---------- */
  const tiredRest = !p.hasBall && p.stam < 35 && (G.state === 'dead' || G.state === 'ftcut' || G.state === 'ft') && spS < 1 && !arms;
  if (tiredRest) {
    // hands on knees during the stoppage
    lean = 0.75; crouch = 0.35;
    armIK(h, h.armR, 1, 0.75, 1.95, 0.42, k); armIK(h, h.armL, -1, 0.75, 1.95, -0.42, k);
    headMode = 'down';
    arms = true;
  }
  if (!arms && p.ref && p.signalT > 0) {
    if (p.signal === 'three') { setArm(h.armR, 3.0, -0.3, 0.05, kf); setArm(h.armL, 3.0, 0.3, 0.05, kf); }
    else { setArm(h.armR, 3.05, -0.1, 0.35, kf); setArm(h.armL, 0.4, 0.2, 0.4, k); }
    arms = true;
  }
  if (!arms) {
    if (handler && !mv) {
      // the hand rides the top of the ball and lets it go near the floor; the other arm guards
      const bl = toLocal(p, b.x, b.y, b.z);
      const mk = markerOf(p), close = mk && hyp(mk.x - p.x, mk.z - p.z) < 5;
      if (close) crouch = Math.max(crouch, 0.5);
      armIK(h, hs > 0 ? h.armR : h.armL, hs, bl.x - 0.05, Math.max(bl.y + CT.BALL_R / p.sc + 0.05, 2.3), bl.z, kf);
      if (close) setArm(hs > 0 ? h.armL : h.armR, 1.15, -hs * 0.45, 1.25, k);
      else if (h.armSwing && spS > 6) { const a = hs > 0 ? h.armSwing[1] : h.armSwing[0]; setArm(hs > 0 ? h.armL : h.armR, -a * 1.1 + 0.25, -hs * 0.12, 1.2, kg); }
      else setArm(hs > 0 ? h.armL : h.armR, 0.7, -hs * 0.3, 1.0, k);
      headMode = 'rim';
    } else if (mv && p.hasBall) {
      const bl = toLocal(p, b.x, b.y, b.z);
      const touch = mv.kind === 'cross' ? (mu < 0.5 ? -hs : hs) : hs;
      armIK(h, touch > 0 ? h.armR : h.armL, touch, bl.x - 0.05, Math.max(bl.y + CT.BALL_R / p.sc, 2.2), bl.z, kf);
      const free = touch > 0 ? h.armL : h.armR;
      if (mv.kind === 'cross' || mv.kind === 'stepback') armIK(h, free, -touch, bl.x, Math.max(bl.y + 0.2, 2.6), bl.z - touch * 0.35, k);
      else if (mv.kind === 'spin') setArm(free, 0.75, -touch * 0.35, 1.5, kf);          // forearm tucked as a guard through the pivot
      else setArm(free, mu < 0.4 ? 0.25 : 0.6, -touch * 0.22, mu < 0.4 ? 0.5 : 1.1, k);   // relaxed on the pause, then into the burst
    } else if (p.hasBall) {
      const bl = toLocal(p, b.x, b.y, b.z);
      armIK(h, h.armR, 1, bl.x - 0.05, bl.y, bl.z + 0.36, kf);
      armIK(h, h.armL, -1, bl.x - 0.05, bl.y, bl.z - 0.36, kf);
    } else if (b.state === 'pass' && b.passTo === p) {
      // reach out to meet the pass
      const bl = toLocal(p, b.x, b.y, b.z), dist = hyp(bl.x, bl.z);
      if (dist < 9) { armIK(h, h.armR, 1, Math.min(bl.x, 1.6), bl.y, bl.z + 0.3, kf); armIK(h, h.armL, -1, Math.min(bl.x, 1.6), bl.y, bl.z - 0.3, kf); }
      else { setArm(h.armR, 1.4, -0.25, 0.32, k); setArm(h.armL, 1.4, 0.25, 0.32, k); }
    } else if (p.expectPass) {
      setArm(h.armR, 1.4, -0.25, 0.32, k); setArm(h.armL, 1.4, 0.25, 0.32, k);
    } else if (p.handsUp) {
      setArm(h.armR, 2.92, -0.2, 0.12, k); setArm(h.armL, 2.92, 0.2, 0.12, k);
    } else if (p.celebT > 0) {
      const pump = Math.sin(p.celebT * 9) > 0 ? 3.0 : 2.35;
      setArm(h.armR, pump, -0.2, 0.65, k); setArm(h.armL, 0.25, 0.3, 0.7, k);
    } else if (def && spS < 9) {
      // active hands in a wide, low stance: arms out to the sides covering the passing lanes, palms working
      const w = Math.sin(R.t * 3 + p.id);
      setArm(h.armR, 0.62 + 0.14 * w, -1.08, 0.5 + 0.1 * w, k); setArm(h.armL, 0.55 - 0.14 * w, 1.08, 0.55 - 0.1 * w, k);
    } else if (h.armSwing && spS > 0.7) {
      // arms counter-swing to the legs; elbows bend more as the pace picks up
      const ar = h.armSwing[0], al = h.armSwing[1], amp = 0.8 + 0.6 * run;
      setArm(h.armR, -ar * amp + 0.18, -0.1, 0.35 + 1.15 * run + Math.max(0, -ar) * 0.4, kg);
      setArm(h.armL, -al * amp + 0.18, 0.1, 0.35 + 1.15 * run + Math.max(0, -al) * 0.4, kg);
    } else {
      setArm(h.armR, 0.1, -0.13, 0.25, k); setArm(h.armL, 0.1, 0.13, 0.25, k);
    }
  }
  if (G.state === 'final' && p.celebT > 0) {
    setArm(h.armR, 3.0, -0.45, 0.2, k); setArm(h.armL, 3.0, 0.45, 0.2, k);
    bob = Math.abs(Math.sin(R.t * 7 + p.id)) * 0.6;
  }

  /* ---------- body: landing, acceleration lean, banking into turns ---------- */
  if (h.landT > 0) crouch += 0.45 * (h.landT / 0.24);
  if (!air && !mv && p.act !== 'stumble') {
    lean += clamp(h.acc * 0.011, -0.16, 0.16);
    roll += clamp(h.turn * spS * 0.006, -0.26, 0.26);
  }
  J.lean += (lean - J.lean) * k; J.crouch += (crouch - J.crouch) * k; J.twist += (twist - J.twist) * k;
  J.roll = (J.roll || 0) + (roll - (J.roll || 0)) * k;
  J.hipYaw = (J.hipYaw || 0) + (hipYaw - (J.hipYaw || 0)) * kg;
  h.hips.position.y = 3.35 - J.crouch * 0.9;
  // plant the feet: the lowest sole sits on the floor whenever the player is grounded
  const sole = (leg) => { const a = leg.hp.rotation.z, kz = leg.kn.rotation.z; return h.hips.position.y - 0.08 - (1.6 * Math.cos(a) + 1.52 * Math.cos(a + kz)) * Math.cos(leg.hp.rotation.x) - 0.15; };
  const fmin = Math.min(sole(h.legR), sole(h.legL));
  if (py < 0.05) h.hips.position.y += Math.max(-0.9, Math.min(0.9, -fmin)) + bob;
  else if (fmin < -py / p.sc) h.hips.position.y += -py / p.sc - fmin;
  h.hips.rotation.y = J.twist * 0.6 + J.hipYaw;
  h.hips.rotation.x = hipRoll;
  h.torso.rotation.z = -J.lean;
  h.torso.rotation.y = -J.twist * 1.4 - J.hipYaw * 1.3;
  h.body.position.x = -J.lean * 0.25;
  h.body.rotation.x = J.roll;
  // the jersey hem swings with momentum: lags on acceleration, flares out in turns, bounces on the run
  if (h.hem) {
    const H = h.hemS || (h.hemS = { z: 0, vz: 0, x: 0, vx: 0 });
    const tz = -clamp(h.acc * 0.012, -0.32, 0.32) + (run > 0.3 && !air ? Math.sin(h.gph * TAU * 2) * 0.05 * run : 0) + (air ? 0.12 : 0);
    const tx = clamp(-h.turn * spS * 0.004, -0.25, 0.25);
    H.vz += (60 * (tz - H.z) - 7 * H.vz) * dts; H.z += H.vz * dts;
    H.vx += (60 * (tx - H.x) - 7 * H.vx) * dts; H.x += H.vx * dts;
    h.hem.rotation.z = clamp(H.z, -0.4, 0.4); h.hem.rotation.x = clamp(H.x, -0.35, 0.35);
  }
  // feet stay flat while planted; toes point down in the air
  for (const leg of [h.legR, h.legL]) {
    const want = air ? 0.35 : -(leg.hp.rotation.z + leg.kn.rotation.z) * 0.9 + J.lean * 0.3;
    dampR(leg.ank.rotation, 'z', clamp(want, -0.8, 1.0), kf);
  }
  // head: ball handlers keep their eyes up on the court; everyone else tracks the ball
  let tx = b.x, ty = b.y, tz = b.z;
  if (headMode === 'rim') { tx = p.team.dir * CT.RIM_X; ty = 9; tz = 0; if (p.ref) { tx = b.x; ty = b.y; tz = b.z; } }
  else if (headMode === 'target' && b.passTo) { tx = b.passTo.x; ty = 5.5; tz = b.passTo.z; }
  const lb = toLocal(p, tx, ty, tz);
  let yaw = clamp(Math.atan2(lb.z, Math.max(0.2, lb.x)), -1.1, 1.1);
  let pitch = clamp(Math.atan2(lb.y - 6.2, Math.max(1, hyp(lb.x, lb.z))), -0.5, 0.6);
  if (headMode === 'down') { yaw = 0; pitch = -0.35; }
  h.headG.rotation.y += (-yaw - h.headG.rotation.y) * k;
  h.headG.rotation.z += (pitch * 0.6 + J.lean * 0.5 - h.headG.rotation.z) * k;
}
