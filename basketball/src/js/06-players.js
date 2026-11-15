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
const REG = { jersey: [0, 0, 1024, 512], shortsR: [0, 512, 512, 256], shortsL: [512, 512, 512, 256], pelvis: [512, 896, 512, 128], face: [0, 768, 256, 256], hair: [256, 768, 256, 128], limb: [256, 896, 256, 128] };
const PATCH = { skin: 0, sock: 1, shoe: 2, sole: 3, accent: 4, trim: 5, dark: 6, white: 7, band: 8, sleeve: 9, lip: 10, kit: 11, hairSolid: 12, shoe2: 13, pants: 14, shirt: 15 };
const ROUGH = { jersey: 0.74, shortsR: 0.6, shortsL: 0.6, pelvis: 0.6, face: 0.5, hair: 0.85, limb: 0.46,
  patch: [0.47, 0.85, 0.32, 0.55, 0.38, 0.6, 0.35, 0.6, 0.8, 0.5, 0.4, 0.6, 0.82, 0.3, 0.7, 0.72] };
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

function shoePieces() {
  const s = new THREE.Shape();
  s.moveTo(-0.26, -0.17); s.lineTo(0.5, -0.17);
  s.quadraticCurveTo(0.66, -0.16, 0.64, -0.05);
  s.quadraticCurveTo(0.6, 0.03, 0.38, 0.05);
  s.lineTo(0.13, 0.13); s.lineTo(0.07, 0.27); s.lineTo(-0.2, 0.25);
  s.quadraticCurveTo(-0.31, 0.1, -0.3, -0.06); s.lineTo(-0.26, -0.17);
  const up = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 2, curveSegments: 6 });
  up.translate(0, 0, -0.15);
  const so = new THREE.Shape();
  so.moveTo(-0.31, -0.25); so.lineTo(0.6, -0.25); so.quadraticCurveTo(0.71, -0.24, 0.68, -0.15);
  so.lineTo(-0.32, -0.15); so.lineTo(-0.31, -0.25);
  const sg = new THREE.ExtrudeGeometry(so, { depth: 0.38, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  sg.translate(0, 0, -0.19);
  const tab = boxG(0.05, 0.16, 0.2, -0.33, 0.12, 0);
  const sw = boxG(0.42, 0.05, 0.4, 0.12, -0.04, 0); sw.rotateZ(0.25);
  const lace = boxG(0.26, 0.03, 0.16, 0.24, 0.1, 0); lace.rotateZ(-0.45);
  return [constUV(up, 'shoe'), constUV(sg, 'sole'), constUV(tab, 'accent'), constUV(sw, 'accent'), constUV(lace, 'shoe2')];
}

/* ---------- atlas painting ---------- */
function nameHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
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
function paintAtlas(T, home, d, C) {
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
  g.fillStyle = trim;
  for (const x of [0, 1008, 496]) g.fillRect(x, 190, x === 496 ? 32 : 16, 322);
  const hole = (cx, cy, rx, ry) => {
    g.fillStyle = trim; g.beginPath(); g.ellipse(cx, cy, rx + 12, ry + 12, 0, 0, TAU); g.fill();
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
      g.fillRect(x0, 740, 512, 14);
    }
  }
  // one team badge on the outside front of the left leg (u 0.375 on that leg)
  if (!C.ref) {
    g.save(); g.beginPath(); g.arc(512 + 192, 636, 30, 0, TAU); g.fillStyle = home ? T.c2 : T.c1; g.fill();
    g.lineWidth = 4; g.strokeStyle = trim; g.stroke();
    g.font = `900 italic 28px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(T.id, 512 + 192, 638); g.restore();
  }
  // shorts pelvis with waistband
  g.fillStyle = kitB; g.fillRect(512, 896, 512, 128);
  folds(g, 512, 896, 512, 128, 14, 0.07);
  g.fillStyle = C.ref ? '#0c0c0c' : trim; g.fillRect(512, 896, 512, 26);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(512, 922, 512, 4);
  // face: u 0.5 = front, v 1 = crown
  const fx = 0, fy = 768;
  g.fillStyle = C.skin; g.fillRect(fx, fy, 256, 256);
  const shadeF = g.createLinearGradient(0, fy, 0, fy + 256);
  shadeF.addColorStop(0, 'rgba(0,0,0,0)'); shadeF.addColorStop(0.62, 'rgba(0,0,0,0)'); shadeF.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = shadeF; g.fillRect(fx, fy, 256, 256);
  const cx = fx + 128, ey = fy + 122;
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 15, ey + 2, 11, 6, 0, 0, TAU); g.fill(); }
  for (const s of [-1, 1]) {
    g.fillStyle = '#f2ede6'; g.beginPath(); g.ellipse(cx + s * 15, ey, 7.5, 4.2, 0, 0, TAU); g.fill();
    g.fillStyle = '#3a2416'; g.beginPath(); g.arc(cx + s * 15 + s * 0.5, ey, 3.3, 0, TAU); g.fill();
    g.fillStyle = '#0b0705'; g.beginPath(); g.arc(cx + s * 15 + s * 0.5, ey, 1.6, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(20,10,5,0.75)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(cx + s * 15, ey, 8, 4.6, 0, PI, TAU); g.stroke();
    g.fillStyle = C.hair; g.save(); g.translate(cx + s * 15, ey - 10); g.rotate(-s * 0.08); g.fillRect(-10, -2, 20, 4.5); g.restore();
  }
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(cx, ey + 26, 6, 3, 0, 0, TAU); g.fill();
  g.fillStyle = C.lip; g.beginPath(); g.ellipse(cx, fy + 172, 12, 4, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(30,10,5,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - 12, fy + 172); g.quadraticCurveTo(cx, fy + 175, cx + 12, fy + 172); g.stroke();
  if (C.beard) {
    g.fillStyle = C.hair; g.globalAlpha = 0.55;
    g.beginPath(); g.ellipse(cx, fy + 190, 44, 34, 0, 0, PI); g.fill();
    g.globalAlpha = 0.35; g.fillRect(cx - 42, fy + 150, 84, 40);
    g.globalAlpha = 1;
    g.fillStyle = C.lip; g.beginPath(); g.ellipse(cx, fy + 172, 11, 3.5, 0, 0, TAU); g.fill();
  }
  // hairline across the top of the face region
  const hl = g.createLinearGradient(0, fy, 0, fy + 70); hl.addColorStop(0, C.hair); hl.addColorStop(C.bald ? 0.2 : 0.75, C.hair); hl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hl; g.globalAlpha = C.bald ? 0.5 : 0.95; g.fillRect(fx, fy, 256, 70); g.globalAlpha = 1;
  // hair: strands
  g.fillStyle = C.hair; g.fillRect(256, 768, 256, 128);
  for (let i = 0; i < 2600; i++) {
    const x = 256 + Math.random() * 256, y = 768 + Math.random() * 120, l = 3 + Math.random() * 6;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y + l); g.stroke();
  }
  // limb skin (u around the limb, v from wrist/ankle at the bottom to shoulder/hip at the top)
  g.fillStyle = C.skin; g.fillRect(256, 896, 256, 128);
  { const gr = g.createLinearGradient(256, 0, 512, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.06)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.04)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.06)'); gr.addColorStop(0.75, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.06)');
    g.fillStyle = gr; g.fillRect(256, 896, 256, 128); }
  for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.04)' : 'rgba(255,220,200,0.04)'; g.fillRect(256 + Math.random() * 256, 896 + Math.random() * 128, 2, 2); }
  // solid patches
  const pc = { skin: C.skin, sock: C.sock, shoe: C.shoe, sole: C.sole, accent: C.accent, trim, dark: '#140d09', white: '#f2f2f2', band: C.band, sleeve: C.sleeve, lip: C.lip, kit, hairSolid: C.hair, shoe2: C.shoe2, pants: C.pants || C.skin, shirt: C.shirt || kit };
  for (const k in PATCH) { const [x, y] = patchXY(PATCH[k]); g.fillStyle = pc[k]; g.fillRect(x, y, 64, 64); }
  return c;
}
let ROUGH_TEX = null;
function roughAtlas() {
  if (ROUGH_TEX) return ROUGH_TEX;
  const c = mkCanvas(256, 256), g = c.getContext('2d'), k = 256 / AT;
  const v = (r, skin) => { const n = Math.round(r * 255); return `rgb(${skin ? 255 : 0},${n},${n})`; };
  for (const r in REG) { const [x, y, w, h] = REG[r]; g.fillStyle = v(ROUGH[r], r === 'face' || r === 'limb'); g.fillRect(x * k, y * k, w * k, h * k); }
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
  for (let i = 0; i < 1600; i++) { const x = 256 + Math.random() * 256, y = 768 + Math.random() * 124; g.fillStyle = Math.random() < 0.5 ? 'rgb(90,90,90)' : 'rgb(170,170,170)'; g.fillRect(x, y, 1, 3 + Math.random() * 4); }
  // muscle definition on the limbs: bulges front (biceps, quads) and back (triceps, calves), with tendon lines
  { const blob = (u, vv, ru, rv, a) => { const cx = 256 + u * 256, cy = 896 + (1 - vv) * 128; const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 1); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.save(); g.translate(cx, cy); g.scale(ru, rv); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); };
    for (const off of [0, 1]) {
      blob(0.25 + off * 0, 0.72, 34, 22, 0.55); blob(0.75, 0.68, 30, 24, 0.45); blob(0.75, 0.3, 30, 18, 0.55); blob(0.25, 0.36, 26, 16, 0.35);
      blob(0.0 + off, 0.55, 16, 30, 0.25); blob(0.5, 0.55, 16, 30, 0.25);
    }
    g.strokeStyle = 'rgba(60,60,60,0.35)'; g.lineWidth = 2;
    for (const u of [0.12, 0.38, 0.62, 0.88]) { g.beginPath(); g.moveTo(256 + u * 256, 1024); g.lineTo(256 + u * 256, 1000); g.stroke(); } }
  // soft fabric folds hanging from the armpits and across the waist
  for (let i = 0; i < 18; i++) {
    const x0 = Math.random() * 1024, y0 = 150 + Math.random() * 120, x1 = x0 + (Math.random() - 0.5) * 120, y1 = 470;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(70,70,70,0.5)' : 'rgba(185,185,185,0.45)'; g.lineWidth = 6 + Math.random() * 8;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + 20, (y0 + y1) / 2, x1, y1); g.stroke();
  }
  for (const y of [420, 452]) { g.strokeStyle = 'rgba(80,80,80,0.4)'; g.lineWidth = 8; g.beginPath(); for (let x = 0; x <= 1024; x += 16) g.lineTo(x, y + Math.sin(x * 0.05) * 6); g.stroke(); }
  DETAIL_TEX = new THREE.CanvasTexture(c);
  return DETAIL_TEX;
}

/* ---------- the model ---------- */
const BI = { body: 0, hips: 1, torso: 2, head: 3, shR: 4, elR: 5, shL: 6, elL: 7, hipR: 8, knR: 9, ankR: 10, hipL: 11, knL: 12, ankL: 13, hem: 14 };
function buildHumanoid(pl, home) {
  const d = pl.d, T = pl.team.def, ref = !!pl.ref;
  const hsh = nameHash(d.n), bulk = { PG: 0.94, SG: 0.97, SF: 1.0, PF: 1.06, C: 1.12 }[d.pos];
  const hairC = HAIRC[d.skin <= 1 && d.hair === 2 ? 4 : d.hair % 3];
  const skinC = new THREE.Color(SKIN[d.skin]);
  const C = {
    skin: SKIN[d.skin], hair: hairC, kit: home ? T.c1 : '#f1f0ec', trim: home ? T.c3 : T.c2,
    sock: home ? '#f5f5f5' : T.c1, shoe: d.acc === 2 ? T.c3 : home ? '#16171a' : '#f4f4f4', shoe2: home ? '#2a2c31' : '#d9d9d9',
    sole: home ? '#f0f0f0' : '#e8e2d6', accent: home ? T.c3 : T.c1, band: home ? '#ffffff' : T.c1, sleeve: home ? '#ffffff' : T.c1,
    lip: '#' + skinC.clone().multiplyScalar(0.72).lerp(new THREE.Color('#7a3b30'), 0.25).getHexString(),
    beard: hsh % 3 === 0, bald: d.hair === 0,
  };
  if (ref) Object.assign(C, { kit: '#dcdddf', trim: '#111111', sock: '#111111', shoe: '#101010', shoe2: '#1c1c1c', sole: '#202020', accent: '#101010', pants: '#141518', shirt: '#cfd0d2', ref: true });
  const b = bulk;
  // bind-pose joint positions in mesh space (feet at the origin, facing +x)
  const J = { hips: [0, 3.35, 0], head: [0, 5.77, 0], shR: [0, 5.25, 0.76 * b], shL: [0, 5.25, -0.76 * b], hipR: [0, 3.27, 0.32 * b], hipL: [0, 3.27, -0.32 * b] };
  const P = [];
  // torso / jersey: lower third follows the hips, upper body follows the spine
  P.push(piece(regionUV(lathe([[0.56, 0.08], [0.55, 0.45], [0.58, 0.85], [0.66, 1.3], [0.72, 1.6], [0.75, 1.82], [0.68, 1.99], [0.44, 2.11], [0.25, 2.2]], 28, 0.62, b), 'jersey'), J.hips,
    (x, y) => { const t = sstep(3.6, 4.3, y), hw = 0.8 * (1 - sstep(3.45, 4.15, y)); return [BI.hips, (1 - t) * (1 - hw), BI.torso, t * (1 - hw), BI.hem, hw]; },
    (x, y, z, nx, ny, nz) => 1 - 0.14 * (1 - sstep(3.45, 4.1, y)) - 0.18 * sstep(0.45, 0.7, Math.abs(z)) * sstep(4.6, 5.0, y) * (1 - sstep(5.15, 5.35, y))));
  // shorts top
  P.push(piece(regionUV(lathe([[0.54, -0.5], [0.64, -0.3], [0.68, -0.05], [0.65, 0.16], [0.58, 0.32]], 20, 0.74 * b, b), 'pelvis'), J.hips,
    () => [BI.hips, 1], (x, y) => 0.82 + 0.18 * sstep(2.9, 3.4, y)));
  // neck
  P.push(piece(constUV(lathe([[0.22, 2.0], [0.195, 2.22], [0.2, 2.47]], 14, 1, 1), 'skin'), J.hips,
    (x, y) => blend(BI.torso, BI.head, sstep(5.45, 5.75, y)), (x, y, z, nx) => 0.78 + 0.22 * sstep(5.55, 5.8, y) * 0 + 0.22 * (nx < 0 ? 1 : 1 - nx * 0.6)));
  // head: sculpted skull with jaw and chin, face painted from the atlas
  const sk = new THREE.SphereGeometry(0.34, 28, 20);
  { const p = sk.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const dy = y / 0.34, dx = x / 0.34;
      x *= 0.98; y *= 1.13; z *= 0.88;
      if (dy < 0) { z *= 1 - 0.24 * -dy; if (dx > -0.2) x += 0.07 * -dy * Math.max(0, dx + 0.2); y *= 1 + 0.08 * -dy; }
      if (dy > 0.25 && dx < 0) x *= 1.06;
      const fz = Math.abs(z / 0.34);
      if (dx > 0.55 && dy > 0.12 && dy < 0.38) x += 0.022 * (1 - Math.abs(dy - 0.25) / 0.13);                 // brow ridge
      if (dx > 0.7 && dy > 0.0 && dy < 0.2 && fz > 0.15 && fz < 0.5) x -= 0.016 * Math.sin(Math.PI * (fz - 0.15) / 0.35);   // eye sockets
      if (dx > 0.25 && dy > -0.25 && dy < 0.08 && fz > 0.5) { z *= 1.035; x += 0.01; }                          // cheekbones
      p.setXYZ(i, x + 0.02, y + 0.33, z);
    }
    sk.computeVertexNormals(); }
  const headW = () => [BI.head, 1];
  P.push(piece(regionUV(sk, 'face'), J.head, headW, (x, y, z, nx, ny) => (ny < -0.5 ? 0.82 : 1)));
  P.push(piece(constUV(sphereG(0.058, 8, 6, 1.15, 1.45, 0.9, 0.35, 0.27, 0), 'skin'), J.head, headW));
  { const nb = boxG(0.05, 0.13, 0.055, 0.335, 0.34, 0); P.push(piece(constUV(nb, 'skin'), J.head, headW)); }
  for (const s of [-1, 1]) P.push(piece(constUV(sphereG(0.078, 8, 6, 0.45, 1.0, 0.38, -0.01, 0.32, s * 0.31), 'skin'), J.head, headW, () => 0.86));
  const hairUV = (g) => regionUV(g, 'hair');
  const hs = d.hair;
  if (hs === 1) P.push(piece(hairUV(sphereG(0.35, 26, 12, 1.0, 1.13, 0.91, 0.01, 0.36, 0, 0, PI * 0.47)), J.head, headW));
  else if (hs === 2) { P.push(piece(hairUV(sphereG(0.345, 26, 12, 1.0, 1.12, 0.9, 0.01, 0.35, 0, 0, PI * 0.44)), J.head, headW)); P.push(piece(hairUV(cylG(0.27, 0.31, 0.42, 20, -0.01, 0.66, 0)), J.head, headW)); }
  else if (hs === 3) P.push(piece(hairUV(sphereG(0.5, 22, 14, 1.0, 0.86, 1.0, -0.06, 0.52, 0, 0, PI * 0.62)), J.head, headW));
  else if (hs === 4) { P.push(piece(hairUV(sphereG(0.35, 26, 12, 1.0, 1.12, 0.91, 0.01, 0.36, 0, 0, PI * 0.47)), J.head, headW)); P.push(piece(hairUV(sphereG(0.13, 12, 8, 1, 1, 1, -0.3, 0.62, 0)), J.head, headW)); }
  else P.push(piece(hairUV(sphereG(0.343, 26, 12, 0.995, 1.12, 0.9, 0.015, 0.345, 0, 0, PI * 0.4)), J.head, headW));
  if (C.beard) P.push(piece(constUV(sphereG(0.25, 18, 10, 1.0, 0.86, 0.86, 0.11, 0.1, 0, PI * 0.5, PI * 0.5), 'hairSolid'), J.head, headW));
  if (d.acc === 1) P.push(piece(constUV(cylG(0.365, 0.365, 0.1, 24, 0.015, 0.47, 0), 'band'), J.head, headW));
  // arms: one continuous tube per arm that bends smoothly at the elbow
  for (const s of [1, -1]) {
    const sh = s > 0 ? BI.shR : BI.shL, el = s > 0 ? BI.elR : BI.elL, j = s > 0 ? J.shR : J.shL;
    const ys = j[1];
    const armAO = (x, y, z, nx, ny, nz) => { const inner = clamp(-nz * s, 0, 1); return 1 - 0.18 * inner - 0.2 * inner * sstep(ys - 0.7, ys - 0.1, y); };
    P.push(piece(regionUV(lathe([[0.095, -2.22], [0.1, -2.12], [0.13, -1.85], [0.156, -1.55], [0.142, -1.3], [0.132, -1.18], [0.15, -1.02], [0.19, -0.75], [0.212, -0.48], [0.2, -0.2], [0.17, 0.05]], 16, b, b), 'limb'), j,
      (x, y) => blend(sh, el, sstep(ys - 0.98, ys - 1.32, y) === 0 ? 0 : sstep(ys - 0.98, ys - 1.32, y)), armAO));
    P.push(piece(constUV(sphereG(0.215, 16, 12, 1.0, 1.08, 0.8, 0, -0.07, -s * 0.03), 'skin'), j,
      () => [sh, 1], armAO));
    P.push(piece(constUV(sphereG(0.13, 12, 9, 0.6, 1.05, 1.0, 0.01, -2.31, 0), 'skin'), j, () => [el, 1], () => 0.92));
    for (let f = 0; f < 4; f++) {
      const fz = (f - 1.5) * 0.058, fl = [0.17, 0.2, 0.19, 0.15][f];
      const fg = boxG(0.052, fl, 0.05, 0, -fl / 2, 0); fg.rotateZ(0.15); fg.translate(0.03, -2.41, fz);
      P.push(piece(constUV(fg, 'skin'), j, () => [el, 1], () => 0.88));
    }
    { const th = boxG(0.055, 0.15, 0.055, 0, -0.075, 0); th.rotateX(-s * 0.5); th.rotateZ(0.35); th.translate(0.08, -2.27, s * 0.1); P.push(piece(constUV(th, 'skin'), j, () => [el, 1])); }
    if (d.acc === 2 && s > 0) P.push(piece(constUV(lathe([[0.108, -2.05], [0.14, -1.85], [0.165, -1.55], [0.148, -1.3], [0.14, -1.18], [0.158, -1.02], [0.2, -0.75], [0.222, -0.48], [0.21, -0.25]], 16, b, b), 'sleeve'), j,
      (x, y) => blend(sh, el, sstep(ys - 0.98, ys - 1.32, y))));
    if (d.acc === 2 && s < 0) P.push(piece(constUV(cylG(0.108, 0.1, 0.16, 14, 0, -2.08, 0), 'band'), j, () => [el, 1]));
    if (ref) P.push(piece(constUV(lathe([[0.2, -0.62], [0.225, -0.45], [0.23, -0.2], [0.24, 0.02], [0.2, 0.14]], 16, b, b), 'shirt'), j, () => [sh, 1], armAO));
  }
  // legs: continuous skin from hip to ankle, baggy shorts over the thigh, sock and shoe
  for (const s of [1, -1]) {
    const hp = s > 0 ? BI.hipR : BI.hipL, kn = s > 0 ? BI.knR : BI.knL, an = s > 0 ? BI.ankR : BI.ankL, j = s > 0 ? J.hipR : J.hipL;
    const yh = j[1], yk = yh - 1.6, ya = yk - 1.52;
    const legW = (x, y) => { if (y > yk + 0.2) return [hp, 1]; if (y > yk - 0.18) return blend(hp, kn, sstep(yk + 0.2, yk - 0.18, y)); if (y > ya + 0.1) return [kn, 1]; return blend(kn, an, sstep(ya + 0.1, ya - 0.02, y)); };
    const legAO = (x, y, z, nx, ny, nz) => 1 - 0.22 * clamp(-nz * s, 0, 1) * sstep(yk + 0.5, yh - 0.6, y) - 0.1 * clamp(-nx, 0, 1) * (1 - Math.min(1, Math.abs(y - yk) / 0.4));
    const lp = ref ? 'pants' : 'skin', lw = ref ? 1.18 : 1;
    { const lg = lathe([[0.115 * lw, -3.14], [0.12 * lw, -3.05], [0.14 * lw, -2.9], [0.176 * lw, -2.6], [0.212 * lw, -2.22], [0.2 * lw, -1.95], [0.19 * lw, -1.75], [0.2 * lw, -1.6], [0.23 * lw, -1.4], [0.28 * lw, -1.0], [0.31 * lw, -0.55], [0.31 * lw, -0.2], [0.29 * lw, 0.02]], 16, b, b);
      P.push(piece(ref ? constUV(lg, lp) : regionUV(lg, 'limb'), j, legW, legAO)); }
    P.push(piece(constUV(sphereG(0.19 * lw, 12, 9, 1.05, 1, 1, 0.02, -1.6, 0), lp), j, legW, legAO));
    if (!ref) P.push(piece(regionUV(lathe([[0.43, -1.42], [0.452, -1.2], [0.46, -0.6], [0.45, -0.12], [0.4, 0.06]], 20, b, b), s > 0 ? 'shortsR' : 'shortsL'), j,
      (x, y) => blend(BI.hips, hp, sstep(yh + 0.05, yh - 0.35, y)),
      (x, y, z, nx, ny, nz) => 1 - 0.2 * clamp(-nz * s, 0, 1) - 0.12 * (1 - sstep(yh - 1.42, yh - 1.1, y))));
    P.push(piece(constUV(lathe([[0.127, -3.14], [0.133, -2.98], [0.158, -2.75], [0.183, -2.54], [0.179, -2.5]], 16, b, b), 'sock'), j, legW, legAO));
    for (const g of shoePieces()) {
      g.scale(1.12, 1.08, 1.2); g.translate(0.07, -2.98, 0);
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
  const atlas = canvasTex(paintAtlas(T, home, d, C));
  const mat = new THREE.MeshStandardMaterial({ map: atlas, roughnessMap: roughAtlas(), bumpMap: detailAtlas(), bumpScale: 0.05, roughness: 1, metalness: 0, vertexColors: true, skinning: true, envMapIntensity: 0.65 });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <tonemapping_fragment>',
      `float skinM = texture2D(roughnessMap, vUv).r;
       float ndv = clamp(dot(normalize(geometryNormal), normalize(vViewPosition)), 0.0, 1.0);
       gl_FragColor.rgb += diffuseColor.rgb * vec3(0.5, 0.16, 0.07) * skinM * (0.1 + 0.45 * pow(1.0 - ndv, 2.0));
       gl_FragColor.rgb += vec3(0.5, 0.58, 0.72) * pow(1.0 - ndv, 3.0) * 0.32 * (1.0 - 0.45 * skinM);
       #include <tonemapping_fragment>`);
  };
  mat.customProgramCacheKey = () => 'player-skin-rim';
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
      // active hands in the stance: one up to contest the pass, one low for the ball
      const w = Math.sin(R.t * 3 + p.id);
      setArm(h.armR, 1.0 + 0.18 * w, -0.62, 1.05, k); setArm(h.armL, 0.85 - 0.18 * w, 0.62, 1.1, k);
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
