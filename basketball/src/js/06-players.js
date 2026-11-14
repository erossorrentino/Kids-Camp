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
const REG = { jersey: [0, 0, 1024, 512], shorts: [0, 512, 512, 256], pelvis: [512, 512, 512, 256], face: [0, 768, 256, 256], hair: [256, 768, 256, 256] };
const PATCH = { skin: 0, sock: 1, shoe: 2, sole: 3, accent: 4, trim: 5, dark: 6, white: 7, band: 8, sleeve: 9, lip: 10, kit: 11, hairSolid: 12, shoe2: 13 };
const ROUGH = { jersey: 0.74, shorts: 0.6, pelvis: 0.6, face: 0.5, hair: 0.85,
  patch: [0.47, 0.85, 0.32, 0.55, 0.38, 0.6, 0.35, 0.6, 0.8, 0.5, 0.4, 0.6, 0.82, 0.3] };
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
    si[i * 4] = w[0]; sw[i * 4] = w[1];
    if (w.length > 2) { si[i * 4 + 1] = w[2]; sw[i * 4 + 1] = w[3]; }
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
  // shorts legs (u 0/1 = +z side, 0.5 = -z side; v 0 = hem at the bottom of the region)
  g.fillStyle = kit; g.fillRect(0, 512, 512, 256);
  folds(g, 0, 512, 512, 256, 26, 0.09);
  const sh = g.createLinearGradient(0, 640, 0, 768); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = sh; g.fillRect(0, 640, 512, 128);
  g.fillStyle = trim;
  for (const x of [0, 498, 242]) g.fillRect(x, 512, x === 242 ? 28 : 14, 256);
  g.fillRect(0, 740, 512, 14);
  g.save(); g.beginPath(); g.arc(128, 580, 30, 0, TAU); g.fillStyle = home ? T.c2 : T.c1; g.fill();
  g.font = `900 italic 30px ${FONT_D}`; g.fillStyle = '#fff'; g.fillText(T.id, 128, 582); g.restore();
  // shorts pelvis with waistband
  g.fillStyle = kit; g.fillRect(512, 512, 512, 256);
  folds(g, 512, 512, 512, 256, 20, 0.07);
  g.fillStyle = trim; g.fillRect(512, 512, 512, 46);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(512, 558, 512, 6);
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
  g.fillStyle = C.hair; g.fillRect(256, 768, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = 256 + Math.random() * 256, y = 768 + Math.random() * 256, l = 3 + Math.random() * 8;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y + l); g.stroke();
  }
  // solid patches
  const pc = { skin: C.skin, sock: C.sock, shoe: C.shoe, sole: C.sole, accent: C.accent, trim, dark: '#140d09', white: '#f2f2f2', band: C.band, sleeve: C.sleeve, lip: C.lip, kit, hairSolid: C.hair, shoe2: C.shoe2 };
  for (const k in PATCH) { const [x, y] = patchXY(PATCH[k]); g.fillStyle = pc[k]; g.fillRect(x, y, 64, 64); }
  return c;
}
let ROUGH_TEX = null;
function roughAtlas() {
  if (ROUGH_TEX) return ROUGH_TEX;
  const c = mkCanvas(256, 256), g = c.getContext('2d'), k = 256 / AT;
  const v = (r) => { const n = Math.round(r * 255); return `rgb(${n},${n},${n})`; };
  for (const r in REG) { const [x, y, w, h] = REG[r]; g.fillStyle = v(ROUGH[r]); g.fillRect(x * k, y * k, w * k, h * k); }
  for (const p in PATCH) { const i = PATCH[p], [x, y] = patchXY(i); g.fillStyle = v(ROUGH.patch[i]); g.fillRect(x * k, y * k, 64 * k, 64 * k); }
  ROUGH_TEX = new THREE.CanvasTexture(c);
  return ROUGH_TEX;
}

/* ---------- the model ---------- */
const BI = { body: 0, hips: 1, torso: 2, head: 3, shR: 4, elR: 5, shL: 6, elL: 7, hipR: 8, knR: 9, ankR: 10, hipL: 11, knL: 12, ankL: 13 };
function buildHumanoid(pl, home) {
  const d = pl.d, T = pl.team.def;
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
  const b = bulk;
  // bind-pose joint positions in mesh space (feet at the origin, facing +x)
  const J = { hips: [0, 3.35, 0], head: [0, 5.77, 0], shR: [0, 5.25, 0.76 * b], shL: [0, 5.25, -0.76 * b], hipR: [0, 3.27, 0.32 * b], hipL: [0, 3.27, -0.32 * b] };
  const P = [];
  // torso / jersey: lower third follows the hips, upper body follows the spine
  P.push(piece(regionUV(lathe([[0.53, 0.12], [0.54, 0.45], [0.58, 0.85], [0.66, 1.3], [0.72, 1.6], [0.75, 1.82], [0.68, 1.99], [0.44, 2.11], [0.25, 2.2]], 28, 0.62, b), 'jersey'), J.hips,
    (x, y) => blend(BI.hips, BI.torso, sstep(3.6, 4.3, y)),
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
      p.setXYZ(i, x + 0.02, y + 0.33, z);
    }
    sk.computeVertexNormals(); }
  const headW = () => [BI.head, 1];
  P.push(piece(regionUV(sk, 'face'), J.head, headW, (x, y, z, nx, ny) => (ny < -0.5 ? 0.82 : 1)));
  P.push(piece(constUV(sphereG(0.058, 8, 6, 1.15, 1.45, 0.9, 0.35, 0.27, 0), 'skin'), J.head, headW));
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
    P.push(piece(constUV(lathe([[0.095, -2.22], [0.1, -2.12], [0.13, -1.85], [0.156, -1.55], [0.142, -1.3], [0.132, -1.18], [0.15, -1.02], [0.19, -0.75], [0.212, -0.48], [0.2, -0.2], [0.17, 0.05]], 16, b, b), 'skin'), j,
      (x, y) => blend(sh, el, sstep(ys - 0.98, ys - 1.32, y) === 0 ? 0 : sstep(ys - 0.98, ys - 1.32, y)), armAO));
    P.push(piece(constUV(sphereG(0.215, 16, 12, 1.0, 1.08, 0.8, 0, -0.07, -s * 0.03), 'skin'), j,
      () => [sh, 1], armAO));
    P.push(piece(constUV(sphereG(0.155, 12, 9, 0.62, 1.3, 1.0, 0.01, -2.35, 0), 'skin'), j, () => [el, 1], () => 0.92));
    P.push(piece(constUV(sphereG(0.06, 8, 6, 1, 1.6, 1, 0.08, -2.26, s * 0.1), 'skin'), j, () => [el, 1]));
    if (d.acc === 2 && s > 0) P.push(piece(constUV(lathe([[0.108, -2.05], [0.14, -1.85], [0.165, -1.55], [0.148, -1.3], [0.14, -1.18], [0.158, -1.02], [0.2, -0.75], [0.222, -0.48], [0.21, -0.25]], 16, b, b), 'sleeve'), j,
      (x, y) => blend(sh, el, sstep(ys - 0.98, ys - 1.32, y))));
    if (d.acc === 2 && s < 0) P.push(piece(constUV(cylG(0.108, 0.1, 0.16, 14, 0, -2.08, 0), 'band'), j, () => [el, 1]));
  }
  // legs: continuous skin from hip to ankle, baggy shorts over the thigh, sock and shoe
  for (const s of [1, -1]) {
    const hp = s > 0 ? BI.hipR : BI.hipL, kn = s > 0 ? BI.knR : BI.knL, an = s > 0 ? BI.ankR : BI.ankL, j = s > 0 ? J.hipR : J.hipL;
    const yh = j[1], yk = yh - 1.6, ya = yk - 1.52;
    const legW = (x, y) => { if (y > yk + 0.2) return [hp, 1]; if (y > yk - 0.18) return blend(hp, kn, sstep(yk + 0.2, yk - 0.18, y)); if (y > ya + 0.1) return [kn, 1]; return blend(kn, an, sstep(ya + 0.1, ya - 0.02, y)); };
    const legAO = (x, y, z, nx, ny, nz) => 1 - 0.22 * clamp(-nz * s, 0, 1) * sstep(yk + 0.5, yh - 0.6, y) - 0.1 * clamp(-nx, 0, 1) * (1 - Math.min(1, Math.abs(y - yk) / 0.4));
    P.push(piece(constUV(lathe([[0.115, -3.14], [0.12, -3.05], [0.14, -2.9], [0.176, -2.6], [0.212, -2.22], [0.2, -1.95], [0.182, -1.75], [0.19, -1.6], [0.22, -1.4], [0.27, -1.0], [0.3, -0.55], [0.3, -0.2], [0.28, 0.02]], 16, b, b), 'skin'), j, legW, legAO));
    P.push(piece(constUV(sphereG(0.19, 12, 9, 1.05, 1, 1, 0.02, -1.6, 0), 'skin'), j, legW, legAO));
    P.push(piece(regionUV(lathe([[0.43, -1.42], [0.452, -1.2], [0.46, -0.6], [0.45, -0.12], [0.4, 0.06]], 20, b, b), 'shorts'), j,
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
  const skel = new THREE.Skeleton(bones);
  const atlas = canvasTex(paintAtlas(T, home, d, C));
  const mat = new THREE.MeshStandardMaterial({ map: atlas, roughnessMap: roughAtlas(), roughness: 1, metalness: 0, vertexColors: true, skinning: true, envMapIntensity: 0.65 });
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
    armR: { sh: bShR, el: bElR }, armL: { sh: bShL, el: bElL }, legR: { hp: bHipR, kn: bKnR, ank: bAnkR }, legL: { hp: bHipL, kn: bKnL, ank: bAnkL },
    blob, stride: 0, j: { lean: 0, crouch: 0, twist: 0 } };
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
function poseHumanoid(h, p, dt, px, py, pz, pf) {
  const k = 1 - Math.exp(-16 * dt), kf = 1 - Math.exp(-28 * dt);
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
  const def = p.team.idx !== G.offense && (G.state === 'live' || G.state === 'dead');
  const J = h.j;
  let lean = 0, crouch = 0, bob = 0, twist = 0;
  const shuffle = !air && Math.abs(latV) > Math.abs(fwdV) * 1.1 && sp > 2;
  const strideLen = shuffle ? 3.0 : 5.0 + sp * 0.13;
  h.stride += sp * dt / strideLen * TAU;
  const ph = h.stride, run = clamp(sp / 17, 0, 1);
  let legs = false, arms = false;
  if (p.act === 'stumble') {
    const u = clamp(p.actT / p.actDur, 0, 1), fall = u < 0.45 ? smooth(u / 0.45) : u > 0.75 ? 1 - smooth((u - 0.75) / 0.25) : 1;
    lean = -0.75 * fall; crouch = 1.35 * fall;
    setLeg(h.legR, 1.15 * fall, 0, -1.7 * fall, kf); setLeg(h.legL, 0.6 * fall, 0, -1.25 * fall, kf);
    setArm(h.armR, -0.7 * fall, -0.8 * fall, 0.4, kf); setArm(h.armL, -0.7 * fall, 0.8 * fall, 0.4, kf);
    legs = arms = true;
  } else if (p.act === 'shoot' && S) {
    const bl = toLocal(p, b.x, b.y, b.z);
    if (S.type === 'jump' || S.type === 'ft') {
      const pre = !S.jumped;
      crouch = pre ? 0.6 * smooth(clamp(p.actT / Math.max(0.08, S.tJump || 0.3), 0, 1)) : 0;
      if (S.type === 'ft' && pre) crouch = 0.48 * Math.sin(clamp(p.actT / S.ideal, 0, 1) * PI);
      const kb = pre ? -crouch * 1.7 : -0.12;
      setLeg(h.legR, pre ? crouch * 0.95 : 0.1, 0, kb, kf); setLeg(h.legL, pre ? crouch * 0.95 : -0.06, 0, kb * 0.9, kf);
      if (!S.released) {
        armIK(h, h.armR, 1, bl.x - 0.16, bl.y - 0.22, bl.z + 0.22, kf);
        armIK(h, h.armL, -1, bl.x + 0.02, bl.y, bl.z - 0.42, kf);
      } else {
        setArm(h.armR, 2.8, -0.12, 0.06, kf); setArm(h.armL, 2.15, 0.38, 0.55, k * 0.6);
      }
      lean = -0.05;
    } else if (!S.jumped) {
      lean = 0.28; crouch = 0.22;
      setLeg(h.legR, Math.sin(ph) * 0.95, 0, -0.55 - Math.max(0, Math.sin(ph + 1.2)) * 1.25, k);
      setLeg(h.legL, -Math.sin(ph) * 0.95, 0, -0.55 - Math.max(0, -Math.sin(ph + 1.2)) * 1.25, k);
      armIK(h, h.armR, 1, bl.x - 0.1, bl.y, bl.z + 0.2, kf);
      armIK(h, h.armL, -1, bl.x, bl.y, bl.z - 0.38, kf);
    } else {
      const lead = p.dribHand > 0 ? h.legL : h.legR, trail = p.dribHand > 0 ? h.legR : h.legL;
      setLeg(lead, 1.5, 0, -1.65, kf); setLeg(trail, -0.35, 0, -0.45, kf);
      const shoot = p.dribHand > 0 ? h.armR : h.armL, other = p.dribHand > 0 ? h.armL : h.armR, ss = p.dribHand > 0 ? 1 : -1;
      if (!S.released) {
        armIK(h, shoot, ss, bl.x - 0.1, bl.y - 0.25, bl.z, kf);
        if (S.type === 'dunk') armIK(h, other, -ss, bl.x, bl.y - 0.2, bl.z - ss * 0.36, kf);
        else setArm(other, 1.3, -ss * 0.6, 0.9, k);
      } else {
        setArm(shoot, S.type === 'dunk' ? 2.95 : 2.85, -ss * 0.08, 0.08, kf); setArm(other, S.type === 'dunk' ? 2.75 : 1.0, ss * 0.4, 0.6, k);
      }
      lean = S.type === 'dunk' ? 0.1 : 0.03;
      twist = ss * 0.15;
    }
    legs = arms = true;
  } else if (p.act === 'jump') {
    setLeg(h.legR, 0.28, 0, -0.55, kf); setLeg(h.legL, 0.08, 0, -0.35, kf);
    setArm(h.armR, 2.95, -0.16, 0.08, kf); setArm(h.armL, 2.95, 0.16, 0.08, kf);
    legs = arms = true;
  } else if (p.act === 'land') {
    crouch = 0.5; setLeg(h.legR, 0.65, 0, -1.05, kf); setLeg(h.legL, 0.55, 0, -0.95, kf);
    legs = true;
  } else if (p.act === 'steal') {
    const u = clamp(p.actT / 0.42, 0, 1), e = Math.sin(u * PI);
    lean = 0.5 * e; crouch = 0.4 * e; twist = -0.3 * e;
    setArm(h.armR, 1.3 * e + 0.25, -0.12, 0.12, kf); setArm(h.armL, 0.35, 0.35, 0.6, k);
    arms = true;
  } else if (p.act === 'pass') {
    const u = clamp(p.actT / 0.24, 0, 1), e = u < 0.4 ? u / 0.4 : 1;
    setArm(h.armR, 0.9 + 0.75 * e, -0.15, 1.45 * (1 - e) + 0.08, kf); setArm(h.armL, 0.9 + 0.75 * e, 0.15, 1.45 * (1 - e) + 0.08, kf);
    lean = 0.12 * e;
    arms = true;
  }
  if (!legs) {
    if (air) { setLeg(h.legR, 0.45, 0, -0.95, k); setLeg(h.legL, 0.12, 0, -0.6, k); }
    else if (shuffle) {
      const s = Math.sin(ph), dir = latV > 0 ? 1 : -1;
      crouch = 0.62;
      setLeg(h.legR, 0.4, -0.3 - Math.max(0, s * dir) * 0.34, -0.95, k);
      setLeg(h.legL, 0.4, 0.3 + Math.max(0, -s * dir) * 0.34, -0.95, k);
      bob = Math.abs(Math.sin(ph)) * 0.08;
    } else if (sp > 1.2) {
      const amp = 0.38 + 0.68 * run, s = Math.sin(ph);
      setLeg(h.legR, s * amp, 0, -0.22 - Math.max(0, Math.sin(ph + 1.3)) * (0.75 + run * 1.05), k * 1.5);
      setLeg(h.legL, -s * amp, 0, -0.22 - Math.max(0, Math.sin(ph + 1.3 + PI)) * (0.75 + run * 1.05), k * 1.5);
      lean = Math.max(0, fwdV) * 0.011 + run * 0.12;
      bob = Math.abs(Math.cos(ph)) * 0.2 * run;
      crouch = 0.12 * run;
      twist = s * 0.16 * run;
    } else {
      crouch = def ? 0.66 : p.hasBall ? 0.38 : 0.08;
      const br = Math.sin(R.t * 2 + p.id) * 0.02;
      setLeg(h.legR, crouch * 0.72, -0.14, -crouch * 1.3 + br, k);
      setLeg(h.legL, crouch * 0.72 - 0.05, 0.14, -crouch * 1.3, k);
    }
    if (crouch > 0.3 && !shuffle && sp <= 1.2) lean = crouch * 0.48;
    if (def && shuffle) lean = 0.32;
  }
  if (!arms) {
    if (p.hasBall && !p.gather && p.holdT <= 0) {
      const bl = toLocal(p, b.x, b.y, b.z), hs = p.dribHand;
      armIK(h, hs > 0 ? h.armR : h.armL, hs, bl.x, bl.y + CT.BALL_R / p.sc, bl.z, kf);
      setArm(hs > 0 ? h.armL : h.armR, 0.85, -hs * 0.38, 1.05, k);
    } else if (p.hasBall) {
      const bl = toLocal(p, b.x, b.y, b.z);
      armIK(h, h.armR, 1, bl.x - 0.05, bl.y, bl.z + 0.36, kf);
      armIK(h, h.armL, -1, bl.x - 0.05, bl.y, bl.z - 0.36, kf);
    } else if (p.expectPass || (b.state === 'pass' && b.passTo === p)) {
      setArm(h.armR, 1.4, -0.25, 0.32, k); setArm(h.armL, 1.4, 0.25, 0.32, k);
    } else if (p.handsUp) {
      setArm(h.armR, 2.92, -0.2, 0.12, k); setArm(h.armL, 2.92, 0.2, 0.12, k);
    } else if (p.celebT > 0) {
      const pump = Math.sin(p.celebT * 9) > 0 ? 3.0 : 2.35;
      setArm(h.armR, pump, -0.2, 0.65, k); setArm(h.armL, 0.25, 0.3, 0.7, k);
    } else if (def && sp < 9) {
      setArm(h.armR, 0.6, -1.08, 0.55, k); setArm(h.armL, 0.6, 1.08, 0.55, k);
    } else if (sp > 1.2) {
      const s = Math.sin(ph), amp = 0.3 + 0.8 * run;
      setArm(h.armR, -s * amp + 0.18, -0.12, 0.5 + run * 0.95, k * 1.5);
      setArm(h.armL, s * amp + 0.18, 0.12, 0.5 + run * 0.95, k * 1.5);
    } else {
      setArm(h.armR, 0.12, -0.14, 0.28, k); setArm(h.armL, 0.12, 0.14, 0.28, k);
    }
  }
  if (G.state === 'final' && p.celebT > 0) {
    setArm(h.armR, 3.0, -0.45, 0.2, k); setArm(h.armL, 3.0, 0.45, 0.2, k);
    bob = Math.abs(Math.sin(R.t * 7 + p.id)) * 0.6;
  }
  J.lean += (lean - J.lean) * k; J.crouch += (crouch - J.crouch) * k; J.twist += (twist - J.twist) * k;
  h.hips.position.y = 3.35 - J.crouch * 0.9 + bob;
  // plant the feet: put the lowest sole on the floor whenever the player is grounded
  const sole = (leg) => { const a = leg.hp.rotation.z, kz = leg.kn.rotation.z; return h.hips.position.y - 0.08 - (1.6 * Math.cos(a) + 1.52 * Math.cos(a + kz)) * Math.cos(leg.hp.rotation.x) - 0.15; };
  const fmin = Math.min(sole(h.legR), sole(h.legL));
  if (py < 0.05) h.hips.position.y += Math.max(-0.9, Math.min(0.9, -fmin)) + bob * 0.5;
  else if (fmin < -py / p.sc) h.hips.position.y += -py / p.sc - fmin;
  h.hips.rotation.y = J.twist * 0.6;
  h.torso.rotation.z = -J.lean;
  h.torso.rotation.y = -J.twist * 1.4;
  h.body.position.x = -J.lean * 0.25;
  // keep the feet roughly flat on the floor
  for (const leg of [h.legR, h.legL]) {
    const want = air ? 0.35 : -(leg.hp.rotation.z + leg.kn.rotation.z) * 0.9 + J.lean * 0.3;
    dampR(leg.ank.rotation, 'z', clamp(want, -0.8, 1.0), kf);
  }
  const lb = toLocal(p, b.x, b.y, b.z);
  const yaw = clamp(Math.atan2(lb.z, Math.max(0.2, lb.x)), -1.1, 1.1);
  const pitch = clamp(Math.atan2(lb.y - 6.2, Math.max(1, hyp(lb.x, lb.z))), -0.5, 0.6);
  h.headG.rotation.y += (-yaw - h.headG.rotation.y) * k;
  h.headG.rotation.z += (pitch * 0.6 + J.lean * 0.5 - h.headG.rotation.z) * k;
}
