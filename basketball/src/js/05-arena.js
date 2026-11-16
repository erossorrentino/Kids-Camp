'use strict';
/* ============================================================
   Arena: court art, lacquered reflective floor, seating bowl,
   GPU-animated crowd, LED boards, center-hung scoreboard,
   ceiling rig and haze, hoops with deformable nets, the ball,
   and effects (confetti, camera flashes, backboard LEDs).
   ============================================================ */

/* ---------------- court art ---------------- */
function ringText(g, text, rad, center, size, color, top) {
  g.font = `800 ${size}px ${FONT_D}`; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  const sp = size * 0.12, ws = text.split('').map((c) => g.measureText(c).width + sp);
  const total = ws.reduce((a, b) => a + b, 0) / rad;
  let a = top ? center - total / 2 : center + total / 2;
  text.split('').forEach((ch, i) => {
    const da = ws[i] / rad, mid = top ? a + da / 2 : a - da / 2;
    g.save(); g.translate(Math.cos(mid) * rad, Math.sin(mid) * rad); g.rotate(top ? mid + PI / 2 : mid - PI / 2);
    g.fillText(ch, 0, 0); g.restore();
    a = top ? a + da : a - da;
  });
}
function star(g, x, y, r, color) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = color; g.fill();
}
function drawEmblem(g, T, cx, cy, r) {
  g.save(); g.translate(cx, cy);
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fillStyle = T.c2; g.fill();
  g.lineWidth = r * 0.05; g.strokeStyle = T.c3; g.stroke();
  g.beginPath(); g.arc(0, 0, r * 0.7, 0, TAU); g.fillStyle = T.c1; g.fill();
  g.lineWidth = r * 0.025; g.strokeStyle = '#ffffff'; g.stroke();
  ringText(g, T.city.toUpperCase(), r * 0.85, -PI / 2, r * 0.17, '#ffffff', true);
  ringText(g, T.name.toUpperCase(), r * 0.85, PI / 2, r * 0.17, T.c3, false);
  star(g, -r * 0.85, 0, r * 0.065, T.c3); star(g, r * 0.85, 0, r * 0.065, T.c3);
  // monogram over a slashing bar
  g.save(); g.rotate(-0.18);
  g.fillStyle = T.c3; g.fillRect(-r * 0.62, r * 0.12, r * 1.24, r * 0.1);
  g.restore();
  g.font = `900 italic ${r * 0.6}px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = r * 0.05; g.strokeStyle = T.c2; g.strokeText(T.id, 0, -r * 0.02);
  g.fillStyle = '#ffffff'; g.fillText(T.id, 0, -r * 0.02);
  g.restore();
}
function drawCourt(home, W) {
  const H = Math.round(W * 66 / 110), k = W / 110;
  const c = mkCanvas(W, H), g = c.getContext('2d');
  const X = (x) => (x + 55) * k, Y = (z) => (z + 33) * k;
  const rnd = mulberry32(7);
  // stained apron in team colour
  const ap = g.createLinearGradient(0, 0, 0, H);
  ap.addColorStop(0, shade(home.c1, -0.3)); ap.addColorStop(0.5, shade(home.c1, -0.12)); ap.addColorStop(1, shade(home.c1, -0.3));
  g.fillStyle = ap; g.fillRect(0, 0, W, H);
  // maple planks running baseline to baseline
  const plank = 0.19;
  for (let z = -25; z < 25; z += plank) {
    let x = -47 - rnd() * 9;
    const rowTone = rnd() * 14 - 7;
    while (x < 47) {
      // pale northern maple: every board a slightly different tone
      const len = 3 + rnd() * 9, t = rnd(), t2 = t * t;
      const r0 = 214 + t * 26 + rowTone, g0 = 178 + t * 26 + rowTone * 0.9 - t2 * 4, b0 = 132 + t * 26 + rowTone * 0.8 - t2 * 6;
      g.fillStyle = `rgb(${r0 | 0},${g0 | 0},${b0 | 0})`;
      const x0 = Math.max(x, -47), x1 = Math.min(x + len, 47);
      g.fillRect(X(x0), Y(z), (x1 - x0) * k + 1, plank * k + 1);
      g.fillStyle = 'rgba(80,45,15,0.22)'; g.fillRect(X(x1) - 1, Y(z), 1.3, plank * k);
      x += len;
    }
    g.fillStyle = 'rgba(90,50,20,0.13)'; g.fillRect(X(-47), Y(z), 94 * k, Math.max(1, k * 0.012));
  }
  // grain streaks and knots
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = `rgba(${110 + rnd() * 40 | 0},${60 + rnd() * 20 | 0},25,${0.03 + rnd() * 0.05})`;
    g.fillRect(X(-47 + rnd() * 94), Y(-25 + rnd() * 50), 3 + rnd() * k * 1.6, Math.max(1, k * 0.02));
  }
  for (let i = 0; i < 120; i++) {
    const x = X(-47 + rnd() * 94), y = Y(-25 + rnd() * 50), r = k * (0.05 + rnd() * 0.08);
    g.fillStyle = 'rgba(110,60,25,0.18)'; g.beginPath(); g.ellipse(x, y, r * 2.5, r, 0, 0, TAU); g.fill();
  }
  // darker stain inside the arcs, team paint in the lanes
  g.save();
  for (const s of [-1, 1]) {
    g.beginPath();
    const rim = s * CT.RIM_X, a = Math.asin(22 / CT.THREE_R);
    g.moveTo(X(s * 47), Y(-22)); g.lineTo(X(s * CT.CORNER_X), Y(-22));
    if (s > 0) g.arc(X(rim), Y(0), CT.THREE_R * k, PI + a, PI - a, true); else g.arc(X(rim), Y(0), CT.THREE_R * k, -a, a);
    g.lineTo(X(s * 47), Y(22)); g.closePath();
    g.fillStyle = 'rgba(120,60,20,0.12)'; g.fill();
  }
  g.restore();
  // painted lanes in the secondary colour with a primary-colour circle at the free-throw line
  const laneC = shade(home.c2, 0.16), circC = shade(home.c1, -0.06);
  g.globalAlpha = 0.95;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? X(28) : X(-47);
    const lg = g.createLinearGradient(x0, 0, x0 + 19 * k, 0);
    lg.addColorStop(0, shade(laneC, s > 0 ? 0.04 : -0.1)); lg.addColorStop(1, shade(laneC, s > 0 ? -0.1 : 0.04));
    g.fillStyle = lg; g.fillRect(x0, Y(-8), 19 * k, 16 * k);
    g.beginPath(); g.arc(X(s * 28), Y(0), 6 * k, 0, TAU); g.fillStyle = circC; g.fill();
  }
  g.globalAlpha = 1;
  // wood grain showing through the paint
  for (let i = 0; i < 5000; i++) {
    const s = rnd() < 0.5 ? -1 : 1, xx = s * (28 + rnd() * 19 + (rnd() < 0.3 ? -6 * rnd() : 0)), zz = -8 + rnd() * 16;
    g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.04})`; g.fillRect(X(xx), Y(zz), 3 + rnd() * k * 1.4, Math.max(1, k * 0.02));
  }
  g.beginPath(); g.arc(X(0), Y(0), 6 * k, 0, TAU); g.fillStyle = shade(home.c1, -0.25); g.fill();
  drawEmblem(g, home, X(0), Y(0), 5.4 * k);
  // apron wordmarks
  g.fillStyle = 'rgba(255,255,255,0.94)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  // big baseline lettering either side of the stanchion, reading from the court
  for (const s of [-1, 1]) {
    g.save(); g.translate(X(s * 51.2), Y(0)); g.rotate(s * PI / 2);
    for (const [w, x] of [[home.city.toUpperCase(), -12.5], [home.name.toUpperCase(), 12.5]]) {
      let fs = 4.6 * k; g.font = `900 italic ${fs}px ${FONT_D}`;
      while (g.measureText(w).width > 19 * k && fs > 2 * k) { fs -= k * 0.1; g.font = `900 italic ${fs}px ${FONT_D}`; }
      g.lineWidth = 0.22 * k; g.strokeStyle = shade(home.c2, -0.2); g.strokeText(w, x * k, 0);
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillText(w, x * k, 0);
    }
    g.restore();
  }
  g.font = `800 ${2.1 * k}px ${FONT_D}`; g.fillStyle = 'rgba(255,255,255,0.6)';
  g.fillText('HARDWOOD KINGS', X(-26), Y(29.2)); g.fillText(home.name.toUpperCase(), X(26), Y(29.2));
  g.save(); g.translate(X(0), Y(-29.2)); g.rotate(PI); g.fillText(home.name.toUpperCase(), 0, 0); g.restore();
  drawEmblem(g, home, X(-26), Y(-29.4), 2.6 * k); drawEmblem(g, home, X(26), Y(-29.4), 2.6 * k);
  // lines
  g.strokeStyle = '#fbfaf6'; g.lineWidth = 0.17 * k; g.lineCap = 'butt';
  const line = (x0, z0, x1, z1) => { g.beginPath(); g.moveTo(X(x0), Y(z0)); g.lineTo(X(x1), Y(z1)); g.stroke(); };
  g.strokeRect(X(-47), Y(-25), 94 * k, 50 * k);
  line(0, -25, 0, 25);
  g.beginPath(); g.arc(X(0), Y(0), 6 * k, 0, TAU); g.stroke();
  g.beginPath(); g.arc(X(0), Y(0), 2 * k, 0, TAU); g.stroke();
  for (const s of [-1, 1]) {
    const bx = s * 47, rim = s * CT.RIM_X, ft = s * 28;
    g.strokeStyle = '#fbfaf6';
    line(bx, -8, ft, -8); line(bx, 8, ft, 8); line(ft, -8, ft, 8);
    line(bx, -6, ft, -6); line(bx, 6, ft, 6);
    g.beginPath(); g.arc(X(ft), Y(0), 6 * k, s > 0 ? PI / 2 : -PI / 2, s > 0 ? PI * 1.5 : PI / 2); g.stroke();
    g.setLineDash([1.2 * k, 1.0 * k]);
    g.beginPath(); g.arc(X(ft), Y(0), 6 * k, s > 0 ? -PI / 2 : PI / 2, s > 0 ? PI / 2 : PI * 1.5); g.stroke();
    g.setLineDash([]);
    line(bx, -22, s * CT.CORNER_X, -22); line(bx, 22, s * CT.CORNER_X, 22);
    const a = Math.asin(22 / CT.THREE_R);
    g.beginPath();
    if (s > 0) g.arc(X(rim), Y(0), CT.THREE_R * k, PI - a, PI + a); else g.arc(X(rim), Y(0), CT.THREE_R * k, -a, a);
    g.stroke();
    g.beginPath();
    if (s > 0) g.arc(X(rim), Y(0), 4 * k, PI / 2, PI * 1.5); else g.arc(X(rim), Y(0), 4 * k, -PI / 2, PI / 2);
    g.stroke();
    line(s * 43, -3, s * 43, 3);
    for (const d of [7, 8, 11, 14]) { const xx = bx - s * d; line(xx, 8, xx, 8.7); line(xx, -8, xx, -8.7); }
    line(s * 19, 25, s * 19, 22); line(s * 19, -25, s * 19, -22);
    g.font = `800 ${1.4 * k}px ${FONT_D}`; g.fillStyle = 'rgba(255,255,255,0.85)';
    g.save(); g.translate(X(s * 37), Y(0)); g.rotate(s * PI / 2); g.fillText(home.id, 0, 0); g.restore();
  }
  // lacquer sheen
  const grd = g.createRadialGradient(X(0), Y(0), 6 * k, X(0), Y(0), 62 * k);
  grd.addColorStop(0, 'rgba(255,236,200,0.08)'); grd.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  return c;
}
/* height map for the floor: same plank layout as the colour texture, with seams and grain */
function drawCourtBump(W) {
  const H = Math.round(W * 66 / 110), k = W / 110;
  const c = mkCanvas(W, H), g = c.getContext('2d');
  const X = (x) => (x + 55) * k, Y = (z) => (z + 33) * k;
  const rnd = mulberry32(7);
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, W, H);
  const plank = 0.19;
  for (let z = -25; z < 25; z += plank) {
    let x = -47 - rnd() * 9;
    rnd();
    while (x < 47) {
      const len = 3 + rnd() * 9, t = rnd();
      const x0 = Math.max(x, -47), x1 = Math.min(x + len, 47), v = 122 + t * 12;
      g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`; g.fillRect(X(x0), Y(z), (x1 - x0) * k + 1, plank * k + 1);
      g.fillStyle = 'rgb(70,70,70)'; g.fillRect(X(x1) - 1, Y(z), 1.5, plank * k);
      x += len;
    }
    g.fillStyle = 'rgb(84,84,84)'; g.fillRect(X(-47), Y(z), 94 * k, Math.max(1, k * 0.014));
  }
  const gr = mulberry32(19);
  for (let i = 0; i < 30000; i++) {
    const v = gr() < 0.5 ? 100 : 150;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.fillRect(X(-47 + gr() * 94), Y(-25 + gr() * 50), 3 + gr() * k * 1.6, Math.max(1, k * 0.018));
  }
  return c;
}
/* roughness map: lacquered maple is glossy, painted lanes and apron a little less, per-plank variation */
function drawCourtRough(W) {
  const H = Math.round(W * 66 / 110), k = W / 110;
  const c = mkCanvas(W, H), g = c.getContext('2d'), rnd = mulberry32(11);
  const X = (x) => (x + 55) * k, Y = (z) => (z + 33) * k;
  g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, W, H);
  for (let z = -25; z < 25; z += 0.19) {
    let x = -47 - rnd() * 9;
    while (x < 47) {
      const len = 3 + rnd() * 9, v = 108 + rnd() * 30;
      g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
      const x0 = Math.max(x, -47), x1 = Math.min(x + len, 47);
      g.fillRect(X(x0), Y(z), (x1 - x0) * k + 1, 0.19 * k + 1);
      x += len;
    }
  }
  for (let i = 0; i < 400; i++) {
    const v = 130 + rnd() * 50; g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.35)`;
    g.beginPath(); g.ellipse(X(-47 + rnd() * 94), Y(-25 + rnd() * 50), k * (1 + rnd() * 4), k * (0.4 + rnd()), rnd() * PI, 0, TAU); g.fill();
  }
  g.fillStyle = 'rgba(128,128,128,0.85)';
  g.fillRect(X(28), Y(-8), 19 * k, 16 * k); g.fillRect(X(-47), Y(-8), 19 * k, 16 * k);
  return c;
}
function makeFloorMat() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1.0, metalness: 0, envMapIntensity: 0.4 });
  R.floorU = { tRefl: { value: R.reflRT.texture }, texMat: { value: R.texMatrix }, reflStr: { value: 0.42 }, reflTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, R.floorU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 texMat;\nvarying vec4 vReflUv;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvReflUv = texMat * modelMatrix * vec4(transformed, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tRefl;\nuniform float reflStr;\nuniform vec2 reflTexel;\nvarying vec4 vReflUv;')
      .replace('#include <tonemapping_fragment>', `
        if (reflStr > 0.0) {
          vec2 ruv = vReflUv.xy / vReflUv.w + (normal.xy - geometryNormal.xy) * 0.035;
          float blur = 0.8 + roughnessFactor * 4.0;
          vec3 rc = vec3(0.0); float tot = 0.0;
          for (int i = -4; i <= 4; i++) {
            float fi = float(i); float w = exp(-fi * fi / 10.0);
            rc += texture2D(tRefl, ruv + vec2(fi * 0.28, fi) * reflTexel * blur).rgb * w; tot += w;
          }
          rc /= tot;
          float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
          float k = clamp(reflStr * (0.1 + 0.55 * fres) * clamp(1.35 - roughnessFactor * 1.2, 0.0, 1.0), 0.0, 0.62);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, rc, k);
        }
        #include <tonemapping_fragment>`);
  };
  m.customProgramCacheKey = () => 'floor-reflect';
  return m;
}

/* ---------------- seating bowl ---------------- */
function rrPath(ax, az, rc, nc) {
  const pts = [];
  const cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) {
    const cx = cs[k][0] * (ax - rc), cz = cs[k][1] * (az - rc);
    for (let i = 0; i <= nc; i++) {
      const a = k * PI / 2 + i / nc * PI / 2;
      pts.push({ x: cx + Math.cos(a) * rc, z: cz + Math.sin(a) * rc, nx: Math.cos(a), nz: Math.sin(a) });
    }
  }
  return pts;
}
function bowlGeo(o) {
  // o: { ax, az, rc, rows, depth, rise, base, off0, wall }
  const pos = [], nor = [], col = [];
  const tread = new THREE.Color('#2a2e38'), riser = new THREE.Color('#3a3f4c');
  const quad = (a, b, c, d, n, cl) => {
    for (const p of [a, b, c, a, c, d]) { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); col.push(cl.r, cl.g, cl.b); }
  };
  for (let i = 0; i < o.rows; i++) {
    const o0 = o.off0 + i * o.depth, o1 = o0 + o.depth;
    const h = o.base + i * o.rise, h2 = i === o.rows - 1 ? h + o.wall : h + o.rise;
    const P0 = rrPath(o.ax + o0, o.az + o0, o.rc + o0, 10), P1 = rrPath(o.ax + o1, o.az + o1, o.rc + o1, 10);
    const n = P0.length;
    for (let j = 0; j < n; j++) {
      const a = P0[j], b = P0[(j + 1) % n], c = P1[(j + 1) % n], d = P1[j];
      quad([a.x, h, a.z], [b.x, h, b.z], [c.x, h, c.z], [d.x, h, d.z], [0, 1, 0], tread);
      const m = [-(d.nx + c.nx) / 2, 0, -(d.nz + c.nz) / 2];
      quad([d.x, h, d.z], [c.x, h, c.z], [c.x, h2, c.z], [d.x, h2, d.z], m, riser);
    }
    if (i === 0) {
      const n0 = P0.length;
      for (let j = 0; j < n0; j++) {
        const a = P0[j], b = P0[(j + 1) % n0];
        quad([a.x, 0, a.z], [b.x, 0, b.z], [b.x, h, b.z], [a.x, h, a.z], [-(a.nx + b.nx) / 2, 0, -(a.nz + b.nz) / 2], riser);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function bowlSeats(o, list, density) {
  for (let i = 0; i < o.rows; i++) {
    const off = o.off0 + i * o.depth + o.depth * 0.42;
    const h = o.base + i * o.rise;
    const P = rrPath(o.ax + off, o.az + off, o.rc + off, 24);
    let carry = 0, arc = 0;
    for (let j = 0; j < P.length; j++) {
      const a = P[j], b = P[(j + 1) % P.length];
      const seg = hyp(b.x - a.x, b.z - a.z);
      let t = carry;
      while (t < seg) {
        const u = t / seg, x = lerp(a.x, b.x, u), z = lerp(a.z, b.z, u);
        const nx = lerp(a.nx, b.nx, u), nz = lerp(a.nz, b.nz, u);
        const s = (arc + t) % 26;
        if (s > 2.6 && vr() < density) list.push({ x, y: h, z, face: Math.atan2(-nz, -nx), ang: Math.atan2(z, x), row: i });
        t += 2.05;
      }
      carry = t - seg; arc += seg;
    }
  }
}
function crowdGeo(lite) {
  const parts = [];
  const add = (g, part) => {
    const n = g.attributes.position.count, a = new Float32Array(n).fill(part);
    g.setAttribute('aPart', new THREE.BufferAttribute(a, 1));
    if (g.attributes.uv) g.deleteAttribute('uv');
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  // parts: 0 shirt, 1 skin, 2/3 arms, 4 hair or cap crown, 5 trousers, 6 cap brim
  // the upper deck sits far away in the dark, so it gets a lighter figure
  const torso = new THREE.LatheGeometry([[0.3, 0.72], [0.37, 1.15], [0.45, 1.7], [0.45, 1.98], [0.2, 2.16], [0.13, 2.22]].map((q) => new THREE.Vector2(q[0], q[1])), lite ? 5 : 7);
  torso.scale(0.7, 1, 1.18); torso.computeVertexNormals(); add(torso, 0);
  if (!lite) { const neck = new THREE.CylinderGeometry(0.11, 0.13, 0.2, 6, 1, true); neck.translate(0, 2.26, 0); add(neck, 1); }
  const head = new THREE.SphereGeometry(0.33, lite ? 6 : 7, lite ? 4 : 5); head.scale(0.97, 1.14, 0.88); head.translate(0.02, 2.58, 0); add(head, 1);
  { const hg = parts[parts.length - 1], hp = hg.attributes.position, ap = hg.attributes.aPart;
    for (let i = 0; i < hp.count; i++) if (hp.getY(i) > 2.66 || (hp.getX(i) < -0.12 && hp.getY(i) > 2.42)) ap.setX(i, 4); }
  if (!lite) { const brim = new THREE.BoxGeometry(0.34, 0.035, 0.5); brim.translate(0.34, 2.78, 0); add(brim, 6); }
  for (const s of [-1, 1]) {
    const thigh = new THREE.BoxGeometry(0.98, 0.34, 0.34); thigh.translate(0.36, 0.86, s * 0.2); add(thigh, 5);
    const arm = new THREE.CylinderGeometry(0.12, 0.1, 1.05, lite ? 4 : 6, 1, true); arm.translate(0.06, 1.5, s * 0.55); add(arm, s < 0 ? 2 : 3);
    if (!lite) { const hand = new THREE.BoxGeometry(0.15, 0.18, 0.13); hand.translate(0.06, 0.92, s * 0.55); add(hand, s < 0 ? 2 : 3); }
  }
  // merge (all non-indexed now)
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), part = new Float32Array(n);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); part.set(g.attributes.aPart.array, o);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  return out;
}
function crowdMat() {
  const m = new THREE.MeshLambertMaterial({ color: '#d0d0d0' });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, R.crowdU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPart; attribute vec3 aShirt; attribute vec3 aSkin; attribute vec4 aAnim;
        uniform float uTime; uniform float uExcite; uniform float uWave; uniform float uFar; varying vec3 vCrowd;`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float ph = aAnim.x, amp = aAnim.y;
        float wd = abs(mod(aAnim.z - uWave + 3.14159265, 6.2831853) - 3.14159265);
        float wave = exp(-wd * wd * 16.0);
        float ex = clamp(uExcite * amp, 0.0, 1.6);
        float stand = clamp(ex * 1.3 + wave * 1.2 + aAnim.w, 0.0, 1.0);
        float jump = max(0.0, sin(uTime * (6.5 + amp * 3.0) + ph)) * clamp(ex - 0.25, 0.0, 1.0) * 0.8;
        float capOn = step(0.86, fract(ph * 5.13));
        if (aPart > 5.5) transformed *= capOn;
        if (aPart > 1.5 && aPart < 3.5) {
          float side = aPart > 2.5 ? 1.0 : -1.0;
          float clapper = step(0.45, fract(ph * 3.17));
          float clap = clamp((uExcite * amp - 0.1) * 3.0, 0.0, 1.0) * clapper * (1.0 - wave) * (1.0 - step(0.85, ex));
          float up = clamp(ex * (0.75 + 0.5 * sin(uTime * 8.0 + ph * 3.0 + side)) + wave * 1.5, 0.0, 1.0) * (1.0 - clap);
          float raise = up * 2.75 + clap * 1.3;
          vec3 sh = vec3(0.0, 2.05, side * 0.56);
          vec3 p = transformed - sh;
          float c = cos(raise), s = sin(raise);
          p = vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z + side * 0.12 * sin(raise) * up);
          float inward = side * clap * (0.42 + 0.14 * sin(uTime * 15.0 + ph * 5.0));
          float ci = cos(inward), si = sin(inward);
          p = vec3(p.x * ci + p.z * si, p.y, -p.x * si + p.z * ci);
          transformed = sh + p;
        }
        if ((aPart < 0.5 || aPart > 4.5 && aPart < 5.5) && position.y < 1.05) transformed.x -= stand * 0.45;
        transformed.y += stand * 0.85 + jump + sin(uTime * 1.3 + ph) * 0.03;
        float ht = fract(ph * 7.31);
        vec3 hair = ht > 0.9 ? vec3(0.55, 0.45, 0.3) : ht > 0.8 ? vec3(0.42, 0.42, 0.44) : aSkin * 0.22 + 0.015;
        float pt = fract(ph * 3.71);
        vec3 pants = pt < 0.45 ? vec3(0.1, 0.13, 0.22) : pt < 0.7 ? vec3(0.035) : pt < 0.85 ? vec3(0.3, 0.26, 0.18) : vec3(0.16, 0.16, 0.17);
        vec3 cap = fract(ph * 9.7) < 0.5 ? aShirt : vec3(0.04);
        vCrowd = aPart > 5.5 ? cap : aPart > 4.5 ? pants : aPart > 3.5 ? mix(hair, cap, capOn) : (aPart > 0.5 && aPart < 1.5) ? aSkin : aShirt;
        // the house lights are down: fans fade into the dark the further they sit from the floor
        vec4 wp0 = modelMatrix * instanceMatrix * vec4(0.0, 1.5, 0.0, 1.0);
        float ddx = max(abs(wp0.x) - 47.0, 0.0), ddz = max(abs(wp0.z) - 25.0, 0.0);
        float dd = length(vec2(ddx, ddz)) + max(wp0.y - 2.0, 0.0) * 0.55;
        vCrowd *= mix(1.0, uFar, pow(smoothstep(3.0, 58.0, dd), 0.7)) * (0.78 + 0.4 * fract(ph * 2.39));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCrowd;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCrowd;');
  };
  m.customProgramCacheKey = () => 'crowd-gpu';
  return m;
}
function buildCrowdMesh(seats, upper) {
  const geo = crowdGeo(upper || R.mobile);
  const n = seats.length;
  const shirt = new Float32Array(n * 3), skin = new Float32Array(n * 3), anim = new Float32Array(n * 4);
  const mats = [];
  const SK = ['#f0c8a2', '#dcaa7c', '#c48a5c', '#9c6640', '#76482a', '#4c2e1b'].map((h) => new THREE.Color(h));
  seats.forEach((s, i) => {
    const c = SK[(i * 7 + (i >> 2)) % SK.length];
    skin[i * 3] = c.r * 0.8; skin[i * 3 + 1] = c.g * 0.8; skin[i * 3 + 2] = c.b * 0.8;
    anim[i * 4] = vr() * TAU; anim[i * 4 + 1] = vrr(0.6, 1.35); anim[i * 4 + 2] = s.ang; anim[i * 4 + 3] = vr() < 0.04 ? 1 : 0;
  });
  geo.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
  geo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3));
  geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(anim, 4));
  const mesh = new THREE.InstancedMesh(geo, R.crowdMaterial, n);
  const d = new THREE.Object3D();
  seats.forEach((s, i) => {
    const sc = vrr(0.9, 1.08);
    d.position.set(s.x, s.y, s.z); d.rotation.set(0, -s.face, 0); d.scale.set(sc, sc, sc); d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.userData.seats = seats;
  return mesh;
}
function colorCrowd(mesh, home, away) {
  const a = mesh.geometry.attributes.aShirt, n = mesh.count;
  // mostly everyday clothes, with pockets of home colours and a few away fans
  const pal = [home.c1, home.c1, home.c1, home.c1, home.c3, home.c2, away.c1, '#e9e6df', '#e9e6df', '#1b1c20', '#1b1c20', '#2c3a55', '#5b2b2b', '#7a6a55',
    '#4b4f57', '#8a8f99', '#2f5d3a', '#a83232', '#c9a227', '#3b6ea8', '#d9773a', '#6b4c8a', '#e8b9b9', '#26292f'];
  const col = new THREE.Color(), rnd = mulberry32(31 + n);
  for (let i = 0; i < n; i++) {
    col.set(pal[Math.floor(rnd() * pal.length)]);
    { const l = col.r * 0.3 + col.g * 0.55 + col.b * 0.15; col.lerp(new THREE.Color(l, l, l), 0.28); }
    col.multiplyScalar(0.42 + 0.28 * rnd());
    a.array[i * 3] = col.r; a.array[i * 3 + 1] = col.g; a.array[i * 3 + 2] = col.b;
  }
  a.needsUpdate = true;
}

/* ---------------- painted crowd ----------------
   Every fan in the bowl is a camera-facing card painted from an atlas of
   16 people in 8 poses (sitting, clapping, arms crossed, on the phone,
   standing, arms up, fist pump). Clothes, skin and hair are painted as
   shading only, with a mask, so each fan gets their own colours. */
const CROWD_COLS = 16, CROWD_ROWS = 8;
function crowdVariant(c) {
  const r = mulberry32(1000 + c * 7), pick = (a) => a[Math.floor(r() * a.length)];
  const hair = pick(['short', 'short', 'long', 'bald', 'cap', 'curly', 'buzz', 'pony', 'short', 'long']);
  const fem = hair === 'long' || hair === 'pony' ? 1 : 0;
  const bw = (fem ? 0.86 : 0.92) + r() * 0.32;
  return {
    hair, fem, bw, sh: (fem ? 1.2 : 1.34 + r() * 0.16) * bw, top: pick(['tee', 'tee', 'hoodie', 'jacket', 'jersey', 'longsleeve', 'tee', 'hoodie']),
    hw: 0.54 + r() * 0.08, hh: 0.72 + r() * 0.06, shoe: pick(['#e6e6e6', '#141414', '#6e1f1f', '#26354f', '#d8d0c0']), inner: pick(['#ededed', '#141414', '#bdb5a5']),
    glasses: r() < 0.15,
  };
}
function paintFan(a, m, x0, y0, CW, CH, K, V, row) {
  const X = (x) => x0 + CW / 2 + x * K, Y = (y) => y0 + CH - y * K;
  const MK = { shirt: '#ff0000', pants: '#00ff00', skin: '#0000ff', hair: '#ffff00', none: '#000000' };
  const gr = (l) => { const v = Math.round(clamp(l, 0, 1) * 255); return `rgb(${v},${v},${v})`; };
  const both = (fn) => { fn(a, false); fn(m, true); };
  const poly = (pts, fillA, mk) => both((g, isM) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.closePath(); g.fillStyle = isM ? MK[mk] : fillA; g.fill(); });
  const ell = (x, y, rx, ry, fillA, mk) => both((g, isM) => { g.beginPath(); g.ellipse(X(x), Y(y), Math.max(0.5, rx * K), Math.max(0.5, ry * K), 0, 0, TAU); g.fillStyle = isM ? MK[mk] : fillA; g.fill(); });
  const line = (pts, w, strokeA, mk) => both((g, isM) => { g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = w * K; g.strokeStyle = isM ? MK[mk] : strokeA; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke(); });
  const shadeA = (fn) => { a.save(); fn(a); a.restore(); };   // albedo-only shading on top of a region
  for (const g of [a, m]) { g.save(); g.beginPath(); g.rect(x0, y0, CW, CH); g.clip(); }
  const seated = !(row === 3 || row === 4 || row === 5);
  const hip = seated ? 1.25 : 2.85, shY = hip + 1.52, hcY = shY + 0.5, bw = V.bw, sh = V.sh;
  const sleeveSkin = V.top === 'jersey', shortSleeve = V.top === 'tee' || V.top === 'jersey';
  // seat back behind the fan
  poly([[-0.8, 1.15], [0.8, 1.15], [0.78, 2.5], [-0.78, 2.5]], '#1b1e24', 'none');
  // legs
  if (seated) {
    for (const s of [-1, 1]) { poly([[s * 0.1, 0.18], [s * 0.44, 0.18], [s * 0.47, 1.3], [s * 0.07, 1.3]], gr(0.62), 'pants'); ell(s * 0.28, 0.1, 0.24, 0.11, V.shoe, 'none'); }
    poly([[-0.6 * bw, hip + 0.12], [0.6 * bw, hip + 0.12], [0.5, 1.12], [-0.5, 1.12]], gr(0.8), 'pants');
    for (const s of [-1, 1]) ell(s * 0.27, 1.22, 0.22, 0.12, gr(0.86), 'pants');
  } else {
    for (const s of [-1, 1]) { poly([[s * 0.06, 0.18], [s * 0.42, 0.18], [s * 0.52 * bw, hip + 0.1], [s * 0.02, hip + 0.1]], gr(0.66), 'pants'); ell(s * 0.27, 0.1, 0.24, 0.11, V.shoe, 'none'); }
    shadeA((g) => { const gg = g.createLinearGradient(0, Y(hip), 0, Y(0.2)); gg.addColorStop(0, 'rgba(255,255,255,0.12)'); gg.addColorStop(1, 'rgba(0,0,0,0.22)'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = gg; g.fillRect(X(-0.6), Y(hip + 0.1), 1.2 * K, (hip - 0.1) * K); });
  }
  // arms: shoulder, elbow, hand per pose
  const S = [sh / 2 - 0.12, shY - 0.1];
  const arms = {
    0: [[0.6 * bw + 0.06, hip + 0.62], [0.34, hip + 0.18]],
    1: [[0.62 * bw + 0.04, hip + 0.7], [0.2, shY - 0.42]],
    2: [[0.6 * bw, hip + 0.7], [0.03, shY - 0.4]],
    3: [[0.6 * bw + 0.1, hip + 0.68], [0.6 * bw + 0.04, hip - 0.08]],
    4: [[sh / 2 + 0.32, shY + 0.68], [sh / 2 + 0.52, shY + 1.36]],
    5: [[sh / 2 + 0.3, shY + 0.6], [sh / 2 + 0.12, shY + 1.28]],
    6: [[0.56 * bw, hip + 0.82], [-0.3, hip + 0.98]],
    7: [[0.56 * bw, hip + 0.75], [0.12, shY - 0.05]],
  };
  const armPts = (s) => {
    let [e, h] = arms[row];
    if (row === 5 && s < 0) { e = [0.6 * bw + 0.1, shY - 0.72]; h = [-0.22, shY - 0.4]; }
    if (row === 7 && s < 0) { e = arms[0][0]; h = arms[0][1]; }
    return [[s * S[0], S[1]], [s * e[0], e[1]], [s * h[0], h[1]]];
  };
  const drawArm = (s) => {
    const p = armPts(s), mid = [lerp(p[0][0], p[1][0], 0.5), lerp(p[0][1], p[1][1], 0.5)];
    const upMk = sleeveSkin ? 'skin' : 'shirt', loMk = sleeveSkin || shortSleeve ? 'skin' : 'shirt';
    line([p[0], p[1]], 0.33, gr(0.58), upMk); line([p[0], p[1]], 0.27, gr(sleeveSkin ? 0.8 : 0.78), upMk);
    if (shortSleeve && !sleeveSkin) { line([mid, p[1]], 0.25, gr(0.8), 'skin'); }
    line([p[1], p[2]], 0.27, gr(0.58), loMk); line([p[1], p[2]], 0.22, gr(0.82), loMk);
    ell(p[2][0], p[2][1], 0.12, 0.13, gr(0.88), 'skin');
  };
  const raised = row === 4 || row === 5;
  if (raised) { drawArm(1); if (row === 4) drawArm(-1); }
  // torso
  const tw = 0.56 * bw, cw = 0.64 * bw;
  const torso = [[-tw, hip + 0.08], [tw, hip + 0.08], [cw, shY - 0.42], [sh / 2, shY - 0.08], [sh / 2 - 0.16, shY + 0.04], [0.16, shY + 0.1], [-0.16, shY + 0.1], [-(sh / 2 - 0.16), shY + 0.04], [-sh / 2, shY - 0.08], [-cw, shY - 0.42]];
  if (V.top === 'hoodie') ell(0, shY + 0.02, 0.36, 0.16, gr(0.6), 'shirt');
  poly(torso, gr(0.84), 'shirt');
  shadeA((g) => {
    g.globalCompositeOperation = 'source-atop';
    const hg = g.createLinearGradient(X(-sh / 2), 0, X(sh / 2), 0);
    hg.addColorStop(0, 'rgba(0,0,0,0.42)'); hg.addColorStop(0.35, 'rgba(255,255,255,0.08)'); hg.addColorStop(0.6, 'rgba(0,0,0,0.02)'); hg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = hg; g.fillRect(X(-sh / 2), Y(shY + 0.2), sh * K, (shY - hip) * K);
    const vg = g.createLinearGradient(0, Y(shY), 0, Y(hip));
    vg.addColorStop(0, 'rgba(255,255,255,0.06)'); vg.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = vg; g.fillRect(X(-sh / 2), Y(shY + 0.2), sh * K, (shY - hip) * K);
  });
  if (V.top === 'jersey') {
    for (const s of [-1, 1]) poly([[s * (sh / 2 + 0.02), shY - 0.06], [s * (sh / 2 - 0.2), shY + 0.06], [s * (cw - 0.08), shY - 0.55]], gr(0.8), 'skin');
    a.fillStyle = 'rgba(255,255,255,0.85)'; a.font = `900 ${0.5 * K}px ${FONT_D}`; a.textAlign = 'center'; a.textBaseline = 'middle';
    a.fillText(String((row * 7 + Math.round(bw * 31)) % 50), X(0), Y(hip + 0.85));
  }
  if (V.top === 'jacket') {
    poly([[-0.16, hip + 0.1], [0.16, hip + 0.1], [0.14, shY + 0.08], [-0.14, shY + 0.08]], V.inner, 'none');
    line([[-0.17, hip + 0.1], [-0.15, shY + 0.08]], 0.03, gr(0.3), 'shirt'); line([[0.17, hip + 0.1], [0.15, shY + 0.08]], 0.03, gr(0.3), 'shirt');
  }
  if (V.top === 'hoodie') line([[-0.32, hip + 0.42], [0.32, hip + 0.42]], 0.03, gr(0.45), 'shirt');
  if (!raised) { drawArm(1); drawArm(-1); } else if (row === 5) drawArm(-1);
  if (row === 7) { const h = armPts(1)[2]; poly([[h[0] - 0.13, h[1] - 0.05], [h[0] + 0.13, h[1] - 0.05], [h[0] + 0.13, h[1] + 0.38], [h[0] - 0.13, h[1] + 0.38]], '#cfe0ff', 'none'); }
  // neck and head
  poly([[-0.12, shY - 0.02], [0.12, shY - 0.02], [0.11, shY + 0.24], [-0.11, shY + 0.24]], gr(0.66), 'skin');
  const hw = V.hw / 2, hh = V.hh / 2;
  if (V.hair === 'long') poly([[-hw - 0.05, hcY + 0.1], [hw + 0.05, hcY + 0.1], [hw + 0.1, shY - 0.15], [-hw - 0.1, shY - 0.15]], gr(0.7), 'hair');
  if (V.hair === 'curly') ell(0, hcY + 0.1, hw + 0.13, hh + 0.08, gr(0.68), 'hair');
  for (const s of [-1, 1]) ell(s * hw * 0.98, hcY - 0.02, 0.06, 0.1, gr(0.72), 'skin');
  ell(0, hcY, hw, hh, gr(0.86), 'skin');
  shadeA((g) => {
    g.globalCompositeOperation = 'source-atop';
    const rg = g.createRadialGradient(X(-0.06), Y(hcY + 0.08), 0, X(0), Y(hcY), hh * K * 1.2);
    rg.addColorStop(0, 'rgba(255,255,255,0.12)'); rg.addColorStop(0.7, 'rgba(0,0,0,0.06)'); rg.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = rg; g.fillRect(X(-hw - 0.1), Y(hcY + hh + 0.1), (hw * 2 + 0.2) * K, (hh * 2 + 0.2) * K);
  });
  // face: brows, eyes, nose shadow, mouth
  for (const s of [-1, 1]) {
    ell(s * 0.1, hcY + 0.04, 0.05, 0.03, '#1a1310', 'none');
    line([[s * 0.04, hcY + 0.11], [s * 0.16, hcY + 0.12]], 0.035, gr(0.3), 'hair');
  }
  if (V.glasses) for (const s of [-1, 1]) both((g, isM) => { g.lineWidth = 0.025 * K; g.strokeStyle = isM ? MK.none : '#111'; g.beginPath(); g.ellipse(X(s * 0.1), Y(hcY + 0.04), 0.075 * K, 0.055 * K, 0, 0, TAU); g.stroke(); });
  shadeA((g) => { g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(X(0.01), Y(hcY - 0.08), 0.04 * K, 0.025 * K, 0, 0, TAU); g.fill(); });
  line([[-0.07, hcY - 0.18], [0.07, hcY - 0.18]], 0.03, 'rgba(70,30,25,0.9)', 'none');
  // hair on top
  const capTop = (y0, ext, mk, l) => both((g, isM) => { g.beginPath(); g.ellipse(X(0), Y(hcY + 0.02), (hw + ext) * K, (hh + ext) * K, 0, PI, TAU); g.lineTo(X(hw + ext), Y(y0)); g.lineTo(X(-hw - ext), Y(y0)); g.closePath(); g.fillStyle = isM ? MK[mk] : gr(l); g.fill(); });
  if (V.hair === 'short' || V.hair === 'pony') capTop(hcY + 0.16, 0.025, 'hair', 0.72);
  else if (V.hair === 'buzz') capTop(hcY + 0.2, 0.0, 'hair', 0.6);
  else if (V.hair === 'long') capTop(hcY + 0.12, 0.04, 'hair', 0.74);
  else if (V.hair === 'curly') capTop(hcY + 0.17, 0.09, 'hair', 0.7);
  else if (V.hair === 'cap') { capTop(hcY + 0.18, 0.04, 'shirt', 0.66); poly([[-hw - 0.02, hcY + 0.2], [hw + 0.02, hcY + 0.2], [hw * 0.9, hcY + 0.12], [-hw * 0.9, hcY + 0.12]], gr(0.38), 'shirt'); }
  for (const g of [a, m]) g.restore();
}
function paintCrowdAtlas(S) {
  const CW = Math.round(128 * S), CH = Math.round(256 * S), K = 42.67 * S;
  const A = mkCanvas(CROWD_COLS * CW, CROWD_ROWS * CH), M = mkCanvas(CROWD_COLS * CW, CROWD_ROWS * CH);
  const a = A.getContext('2d'), m = M.getContext('2d');
  m.fillStyle = '#000'; m.fillRect(0, 0, M.width, M.height);
  for (let c = 0; c < CROWD_COLS; c++) { const V = crowdVariant(c); for (let r = 0; r < CROWD_ROWS; r++) paintFan(a, m, c * CW, r * CH, CW, CH, K, V, r); }
  return { A, M };
}
function crowdBoardMat() {
  if (!R.crowdAtlas) {
    const { A, M } = paintCrowdAtlas(R.mobile ? 0.5 : 1);
    R.crowdAtlas = { a: new THREE.CanvasTexture(A), m: new THREE.CanvasTexture(M) };
    R.crowdAtlas.a.anisotropy = 4;
  }
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({}, R.crowdU, { tA: { value: R.crowdAtlas.a }, tM: { value: R.crowdAtlas.m } }),
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aShirt; attribute vec3 aSkin; attribute vec4 aAnim; attribute float aVar;
      uniform float uTime; uniform float uExcite; uniform float uWave; uniform float uFar; uniform float uLight;
      varying vec2 vUv; varying vec3 vShirt; varying vec3 vSkin; varying vec3 vPants; varying vec3 vHair; varying float vDim;
      void main(){
        vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sc = length(instanceMatrix[0].xyz);
        float ph = aAnim.x, amp = aAnim.y;
        float wd = abs(mod(aAnim.z - uWave + 3.14159265, 6.2831853) - 3.14159265);
        float wave = exp(-wd * wd * 16.0);
        float ex = clamp(uExcite * amp, 0.0, 1.6);
        // each fan has their own threshold: big plays bring part of the crowd up, never the whole bowl at once
        float thr = 0.3 + 0.95 * fract(ph * 4.7);
        float hype = ex - thr;
        float stand = max(max(step(0.0, hype), step(0.35, wave)), aAnim.w);
        float jump = max(0.0, sin(uTime * (6.5 + amp * 3.0) + ph)) * clamp(hype * 2.0, 0.0, 1.0) * 0.6;
        float calm = fract(ph * 1.913);
        float row = calm < 0.62 ? 0.0 : calm < 0.8 ? 6.0 : calm < 0.9 ? 7.0 : 0.0;
        float clap = step(0.35, fract(ph * 3.17)) * step(0.08, uExcite * amp - 0.06);
        if (clap > 0.5) row = fract(uTime * (3.2 + amp) + ph) < 0.5 ? 1.0 : 2.0;
        float yOff = 0.0;
        if (stand > 0.5) {
          float up = max(hype * 2.5, wave * 2.0);
          row = up > 0.45 ? (wave > 0.3 ? 4.0 : fract(uTime * 1.7 + ph * 3.0) < 0.5 ? 4.0 : 5.0) : 3.0;
          yOff = jump;
        }
        vUv = vec2((aVar + uv.x) / ${CROWD_COLS}.0, (${CROWD_ROWS - 1}.0 - row + uv.y) / ${CROWD_ROWS}.0);
        vec3 toCam = cameraPosition - c; toCam.y = 0.0;
        vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5, 0.0, 0.0));
        vec3 wp = c + right * position.x * sc + vec3(0.0, position.y * sc + yOff, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        vShirt = aShirt; vSkin = aSkin;
        float pt = fract(ph * 3.71);
        vPants = pt < 0.45 ? vec3(0.1, 0.13, 0.22) : pt < 0.7 ? vec3(0.03) : pt < 0.85 ? vec3(0.3, 0.26, 0.18) : vec3(0.15, 0.15, 0.16);
        float ht = fract(ph * 7.31);
        vHair = ht > 0.9 ? vec3(0.5, 0.4, 0.26) : ht > 0.8 ? vec3(0.4, 0.4, 0.42) : ht > 0.6 ? vec3(0.16, 0.09, 0.05) : vec3(0.025, 0.02, 0.018);
        float ddx = max(abs(c.x) - 47.0, 0.0), ddz = max(abs(c.z) - 25.0, 0.0);
        float dd = length(vec2(ddx, ddz)) + max(c.y - 2.0, 0.0) * 0.55;
        vDim = mix(0.86, uFar, pow(smoothstep(3.0, 52.0, dd), 0.65)) * (0.78 + 0.36 * fract(ph * 2.39)) * uLight;
      }`,
    fragmentShader: `
      uniform sampler2D tA; uniform sampler2D tM;
      varying vec2 vUv; varying vec3 vShirt; varying vec3 vSkin; varying vec3 vPants; varying vec3 vHair; varying float vDim;
      void main(){
        vec4 a = texture2D(tA, vUv);
        if (a.a < 0.42) discard;
        vec3 m = texture2D(tM, vUv).rgb;
        float hair = m.r * m.g, shirt = m.r * (1.0 - m.g), pants = m.g * (1.0 - m.r), skin = m.b;
        float rec = clamp(shirt + pants + skin + hair, 0.0, 1.0);
        vec3 lin = pow(a.rgb, vec3(2.2));
        vec3 tint = (vShirt * shirt + vPants * pants + vSkin * skin + vHair * hair) / max(rec, 0.001);
        vec3 col = mix(lin * 0.5, lin.r * tint * 1.2, rec) * vDim;
        col += (1.0 - rec) * step(0.15, lin.b - lin.r) * lin * 1.8;   // phone screens glow
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
}
function buildCrowdBoards(seats) {
  const geo = new THREE.PlaneGeometry(3, 6); geo.translate(0, 3, 0);
  const n = seats.length;
  const shirt = new Float32Array(n * 3), skin = new Float32Array(n * 3), anim = new Float32Array(n * 4), vari = new Float32Array(n);
  const SK = ['#f0c8a2', '#dcaa7c', '#c48a5c', '#9c6640', '#76482a', '#4c2e1b'].map((h) => new THREE.Color(h));
  const rnd = mulberry32(77 + n);
  seats.forEach((s, i) => {
    const c = SK[Math.floor(rnd() * SK.length)];
    skin[i * 3] = c.r * 0.85; skin[i * 3 + 1] = c.g * 0.85; skin[i * 3 + 2] = c.b * 0.85;
    anim[i * 4] = rnd() * TAU; anim[i * 4 + 1] = 0.6 + rnd() * 0.75; anim[i * 4 + 2] = s.ang; anim[i * 4 + 3] = rnd() < 0.03 ? 1 : 0;
    vari[i] = Math.floor(rnd() * CROWD_COLS);
  });
  geo.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
  geo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3));
  geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(anim, 4));
  geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(vari, 1));
  const mesh = new THREE.InstancedMesh(geo, R.crowdBoardMaterial, n);
  const d = new THREE.Object3D();
  seats.forEach((s, i) => {
    const sc = 0.92 + rnd() * 0.14;
    d.position.set(s.x + (rnd() - 0.5) * 0.3, s.y, s.z + (rnd() - 0.5) * 0.3); d.rotation.set(0, 0, 0); d.scale.set(sc, sc, sc); d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.userData.seats = seats;
  return mesh;
}

/* ---------------- arena build ---------------- */
function buildArena() {
  R.courtW = R.mobile ? 2048 : 4096;
  R.floorMat = makeFloorMat();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(110, 66), R.floorMat);
  floor.rotation.x = -PI / 2; floor.receiveShadow = true;
  R.scene.add(floor); R.floor = floor; R.reflHide.push(floor);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), stdMat('#0b0d12', 0.85));
  ground.rotation.x = -PI / 2; ground.position.y = -0.03; ground.receiveShadow = true;
  R.scene.add(ground); R.reflHide.push(ground);
  // bowl
  R.crowdU = { uTime: { value: 0 }, uExcite: { value: 0 }, uWave: { value: -9 }, uFar: { value: 0.2 }, uLight: { value: 1 } };
  R.crowdMaterial = crowdMat();
  R.crowdBoardMaterial = crowdBoardMat();
  const lower = { ax: 57.5, az: 35.5, rc: 12, rows: 17, depth: 2.7, rise: 1.3, base: 1.8, off0: 0, wall: 4 };
  const upper = { ax: 57.5, az: 35.5, rc: 12, rows: 13, depth: 2.6, rise: 1.85, base: 37, off0: 52, wall: 14 };
  R.bowlMat = new THREE.MeshStandardMaterial({ color: '#30343f', roughness: 0.85, vertexColors: true, side: THREE.DoubleSide });
  const lb = new THREE.Mesh(bowlGeo(lower), R.bowlMat); lb.receiveShadow = true; R.scene.add(lb); R.reflHide.push(lb);
  // reflection-only stand-in for the crowd: a soft colourful band the glossy floor can mirror cheaply
  R.reflCrowdC = mkCanvas(2048, 256); R.reflCrowdT = canvasTex(R.reflCrowdC); R.reflCrowdT.wrapS = THREE.RepeatWrapping;
  R.reflOnly = [ringBand(lower.ax + 4, lower.az + 4, lower.rc + 4, 2.2, 26, new THREE.MeshBasicMaterial({ map: R.reflCrowdT, color: new THREE.Color(0.75, 0.75, 0.75), toneMapped: false }), 3)];
  for (const m of R.reflOnly) { m.visible = false; R.scene.add(m); }
  const ub = new THREE.Mesh(bowlGeo(upper), R.bowlMat); R.scene.add(ub); R.reflHide.push(ub);
  const ls = [], us = [];
  bowlSeats(lower, ls, 0.95);
  bowlSeats(upper, us, R.mobile ? 0.45 : 0.9);
  R.crowdLower = buildCrowdBoards(ls); R.scene.add(R.crowdLower); R.reflHide.push(R.crowdLower);
  R.crowdUpper = buildCrowdBoards(us); R.scene.add(R.crowdUpper); R.reflHide.push(R.crowdUpper);
  R.seatsAll = ls.concat(us);
  buildSigns(ls);
  // 360-degree ribbon board on the lower bowl fascia, and the suite level above it
  R.ribbonC = mkCanvas(4096, 96); R.ribbonT = canvasTex(R.ribbonC); R.ribbonT.wrapS = THREE.RepeatWrapping;
  const fasc = ringBand(lower.ax + 17 * 2.7, lower.az + 17 * 2.7, lower.rc + 17 * 2.7, 24.2, 27.4, hdrBasic('#ffffff', 1.9, { map: R.ribbonT }), 6);
  R.scene.add(fasc);
  R.suiteMat = new THREE.MeshBasicMaterial({ map: suitesTex(), color: new THREE.Color(1.25, 1.15, 1.0), toneMapped: false });
  R.suiteMat.map.wrapS = THREE.RepeatWrapping;
  const suites = ringBand(lower.ax + 49, lower.az + 49, lower.rc + 49, 28.5, 36, R.suiteMat, 40);
  R.scene.add(suites); R.reflHide.push(suites);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(420, 340), new THREE.MeshBasicMaterial({ color: '#05070b' }));
  roof.rotation.x = PI / 2; roof.position.y = 96; R.scene.add(roof);
  // courtside: ribbon boards on the floor along the far side and baselines, scorer's table, benches
  const lowRib = hdrBasic('#ffffff', 1.8, { map: R.ribbonT });
  const b1 = new THREE.Mesh(new THREE.PlaneGeometry(112, 2.2), lowRib); b1.position.set(0, 1.1, -34.8); R.scene.add(b1);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(62, 2.2), lowRib); b.position.set(s * 57.3, 1.1, 0); b.rotation.y = -s * PI / 2; R.scene.add(b);
  }
  const table = new THREE.Mesh(new THREE.BoxGeometry(34, 2.7, 2.6), stdMat('#0d0f14', 0.4, { metalness: 0.3 }));
  table.position.set(0, 1.35, -29.8); table.castShadow = true; R.scene.add(table);
  R.tableC = mkCanvas(2048, 128); R.tableT = canvasTex(R.tableC); R.tableT.wrapS = THREE.RepeatWrapping;
  const tf = new THREE.Mesh(new THREE.PlaneGeometry(33.6, 2.1), hdrBasic('#ffffff', 1.6, { map: R.tableT }));
  tf.position.set(0, 1.35, -28.48); R.scene.add(tf);
  const top = new THREE.Mesh(new THREE.BoxGeometry(34.4, 0.12, 3.0), stdMat('#20242c', 0.3, { metalness: 0.5 }));
  top.position.set(0, 2.75, -29.8); R.scene.add(top);
  R.benchMats = [];
  for (const s of [-1, 1]) {
    const bm = stdMat('#333', 0.55), leg = stdMat('#15171c', 0.5);
    for (let i = 0; i < 8; i++) {
      const x = s * (20 + i * 2.15);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.4), bm); seat.position.set(x, 1.6, -30.6); seat.castShadow = true; R.scene.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 0.25), bm); back.position.set(x, 2.55, -31.25); R.scene.add(back);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 6), leg); st.position.set(x, 0.75, -30.6); R.scene.add(st);
    }
    R.benchMats.push(bm);
  }
  // courtside people: bench players, coaches and baseline photographers share the crowd shader
  const cs = [];
  for (const s of [-1, 1]) {
    for (const i of [0, 7]) cs.push({ x: s * (20 + i * 2.15), y: 1.0, z: -30.45, face: -PI / 2, ang: 9, row: 0, kind: 'coach', side: s });
    for (let i = 0; i < 4; i++) cs.push({ x: s * (49.2 + (i % 2) * 0.9), y: -0.45, z: (i < 2 ? 1 : -1) * (9 + i * 2.6), face: s > 0 ? PI : 0, ang: 9, row: 0, kind: 'photo' });
  }
  // two rows of courtside seats along the near sideline
  const cf = [];
  for (const [z, y] of [[29.4, 0.8], [31.5, 1.35]]) for (let x = -43; x <= 43; x += 2.25) cf.push({ x: x + vrr(-0.15, 0.15), y, z, face: -PI / 2, ang: Math.atan2(z, x), row: 0 });
  R.courtFans = buildCrowdBoards(cf.map((c) => Object.assign({}, c, { y: c.y - 0.55, z: c.z + 0.15 }))); R.scene.add(R.courtFans); R.courtFansSeats = cf;
  { const seatG = new THREE.BoxGeometry(1.5, 0.3, 1.4), backG = new THREE.BoxGeometry(1.5, 1.4, 0.2);
    const cm = stdMat('#1d2027', 0.55);
    const seats = new THREE.InstancedMesh(seatG, cm, cf.length), backs = new THREE.InstancedMesh(backG, cm, cf.length);
    const d = new THREE.Object3D();
    cf.forEach((c, i) => {
      d.position.set(c.x, c.y + 0.6, c.z); d.rotation.set(0, 0, 0); d.updateMatrix(); seats.setMatrixAt(i, d.matrix);
      d.position.set(c.x, c.y + 1.35, c.z + 0.65); d.updateMatrix(); backs.setMatrixAt(i, d.matrix);
    });
    R.scene.add(seats); R.scene.add(backs); }
  const nearRib = new THREE.Mesh(new THREE.PlaneGeometry(96, 1.6), hdrBasic('#ffffff', 1.8, { map: R.ribbonT }));
  nearRib.position.set(0, 0.8, 27.6); nearRib.rotation.y = PI; R.scene.add(nearRib);
  R.courtside = buildCrowdMesh(cs); R.scene.add(R.courtside);
  { const a = R.courtside.geometry.attributes.aAnim; cs.forEach((c, i) => { a.array[i * 4 + 3] = c.stand ? 1 : 0; a.array[i * 4 + 1] = c.kind === 'photo' ? 0.2 : 0.9; }); a.needsUpdate = true;
    const d = new THREE.Object3D(); cs.forEach((c, i) => { const sc = c.kind === 'bench' ? 1.22 : 1.05; d.position.set(c.x, c.y, c.z); d.rotation.set(0, -c.face, 0); d.scale.set(sc, sc, sc); d.updateMatrix(); R.courtside.setMatrixAt(i, d.matrix); });
    R.courtside.instanceMatrix.needsUpdate = true; }
  R.courtsideSeats = cs;
  buildCeiling();
  buildJumbotron();
}
/* fans holding up signs: an instanced quad per sign, painted from an 8-design atlas, raised on big moments */
function buildSigns(seats) {
  const pickS = seats.filter((q) => q.row <= 10);
  const N = Math.min(150, pickS.length), chosen = [];
  for (let i = 0; i < N; i++) chosen.push(pickS[Math.floor(Math.random() * pickS.length)]);
  const geo = new THREE.PlaneGeometry(2.8, 1.76);
  const cell = new Float32Array(N), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { cell[i] = i % 8; seed[i] = Math.random(); }
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 1));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  R.signC = mkCanvas(1024, 512); R.signT = canvasTex(R.signC);
  const m = new THREE.MeshBasicMaterial({ map: R.signT, color: new THREE.Color(0.82, 0.82, 0.82), side: THREE.DoubleSide, toneMapped: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, R.crowdU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell; attribute float aSeed; uniform float uTime; uniform float uExcite;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv = vUv * vec2(0.25, 0.5) + vec2(mod(aCell, 4.0) * 0.25, 0.5 * (1.0 - floor(aCell / 4.0)));\n#endif')
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        float up = clamp(uExcite * (1.4 + aSeed) - 0.35, 0.0, 1.0);
        float sway = sin(uTime * (2.0 + aSeed * 2.0) + aSeed * 30.0);
        transformed.xy = mat2(cos(sway * 0.12 * up), -sin(sway * 0.12 * up), sin(sway * 0.12 * up), cos(sway * 0.12 * up)) * transformed.xy;
        transformed.y += mix(-2.2, 0.0, up) + abs(sway) * 0.25 * up;
        transformed *= mix(0.6, 1.0, up);`);
  };
  m.customProgramCacheKey = () => 'crowd-signs';
  const im = new THREE.InstancedMesh(geo, m, N);
  const d = new THREE.Object3D();
  chosen.forEach((q, i) => {
    d.position.set(q.x, q.y + 3.3, q.z);
    d.rotation.set(0, PI / 2 - q.face, 0); d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
  });
  im.frustumCulled = false;
  R.scene.add(im); R.signs = im; R.reflHide.push(im);
}
function drawSigns(home) {
  const c = R.signC, g = c.getContext('2d');
  const designs = [
    (x, y) => { bg(x, y, '#ffffff'); txt(x, y, 'DEFENSE', '#111', 70); fence(x, y); },
    (x, y) => { bg(x, y, home.c1); txt(x, y - 34, "LET'S GO", '#fff', 46); txt(x, y + 30, home.name.toUpperCase(), home.c3, 58); },
    (x, y) => { bg(x, y, home.c2); drawEmblem(g, home, x, y, 72); },
    (x, y) => { bg(x, y, '#ffd23f'); txt(x, y, 'MVP!', '#111', 96); },
    (x, y) => { bg(x, y, '#111111'); txt(x, y, 'BUCKETS', '#ff7a1a', 66); },
    (x, y) => { bg(x, y, '#ffffff'); txt(x, y - 22, 'SLAM', home.c1, 74); txt(x, y + 44, 'CITY', '#111', 44); },
    (x, y) => { bg(x, y, home.c1); txt(x, y - 26, 'HOME', '#fff', 60); txt(x, y + 34, 'COURT', home.c3, 60); },
    (x, y) => { bg(x, y, '#f4f1ea'); txt(x, y - 26, '\u2665', '#e0193b', 64); txt(x, y + 40, home.city.toUpperCase(), '#111', 40); },
  ];
  function bg(x, y, col) { g.fillStyle = col; g.fillRect(x - 124, y - 78, 248, 156); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6; g.strokeRect(x - 124, y - 78, 248, 156); }
  function txt(x, y, t, col, size) { g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = size; g.font = `900 italic ${fs}px ${FONT_D}`; while (g.measureText(t).width > 228 && fs > 20) { fs -= 2; g.font = `900 italic ${fs}px ${FONT_D}`; } g.fillText(t, x, y); }
  function fence(x, y) { g.fillStyle = '#111'; for (let i = -4; i <= 4; i++) g.fillRect(x + i * 22 - 3, y + 40, 6, 30); g.fillRect(x - 96, y + 48, 192, 5); }
  g.clearRect(0, 0, 1024, 512);
  designs.forEach((fn, i) => fn((i % 4) * 256 + 128, Math.floor(i / 4) * 256 + 128));
  R.signT.needsUpdate = true;
}
function ringBand(ax, az, rc, y0, y1, mat, repeatU) {
  const P = rrPath(ax, az, rc, 16), n = P.length;
  let total = 0; const L = [0];
  for (let j = 0; j < n; j++) { const a = P[j], b = P[(j + 1) % n]; total += hyp(b.x - a.x, b.z - a.z); L.push(total); }
  const pos = [], uv = [], nor = [];
  for (let j = 0; j < n; j++) {
    const a = P[j], b = P[(j + 1) % n], ua = L[j] / total * repeatU, ub = L[j + 1] / total * repeatU;
    const v = [[a.x, y0, a.z, ua, 0], [b.x, y0, b.z, ub, 0], [b.x, y1, b.z, ub, 1], [a.x, y1, a.z, ua, 1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(v[k][0], v[k][1], v[k][2]); uv.push(v[k][3], v[k][4]); nor.push(-a.nx, 0, -a.nz); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const m = new THREE.Mesh(g, mat);
  m.material.side = THREE.DoubleSide;
  return m;
}
function suitesTex() {
  const c = mkCanvas(512, 128), g = c.getContext('2d');
  g.fillStyle = '#0a0b0f'; g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 8; i++) {
    const x = i * 64 + 4;
    const gr = g.createLinearGradient(0, 20, 0, 110);
    gr.addColorStop(0, '#3a2a1a'); gr.addColorStop(0.5, i % 3 ? '#a8774a' : '#6c5a46'); gr.addColorStop(1, '#2a1d12');
    g.fillStyle = gr; g.fillRect(x, 22, 56, 84);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, 70, 56, 3);
    for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(20,15,10,0.8)'; g.beginPath(); g.ellipse(x + 12 + k * 16, 84, 5, 9, 0, 0, TAU); g.fill(); }
  }
  g.fillStyle = '#1a1c22'; g.fillRect(0, 0, 512, 14); g.fillRect(0, 114, 512, 14);
  return canvasTex(c);
}
function buildCeiling() {
  const truss = stdMat('#1a1c22', 0.6, { metalness: 0.6 });
  const fix = hdrBasic('#fff4e6', 9);
  const glow = mkCanvas(64, 64), gg = glow.getContext('2d');
  const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,220,1)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
  gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
  R.glowTex = new THREE.CanvasTexture(glow);
  for (const z of [-30, -10, 10, 30]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(120, 1.6, 1.6), truss); bar.position.set(0, 84, z); R.scene.add(bar);
    for (let i = -3; i <= 3; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 2.6), fix); f.position.set(i * 16, 82.8, z); R.scene.add(f);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.glowTex, color: new THREE.Color(3, 2.8, 2.5), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      sp.position.set(i * 16, 82.2, z); sp.scale.set(9, 9, 1); R.scene.add(sp);
    }
  }
  // soft volumetric shafts down onto the court
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0.018 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 2.5); float h = smoothstep(0.0, 0.35, vUv.y) * (0.35 + 0.65 * vUv.y); gl_FragColor = vec4(vec3(1.0, 0.95, 0.86) * uA * f * h, 1.0); }',
  });
  R.coneMat = coneMat;
  for (const [x, z] of [[-32, -10], [0, -10], [32, -10], [-32, 10], [0, 10], [32, 10]]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(15, 80, 28, 1, true), coneMat);
    c.position.set(x, 42, z); R.scene.add(c); R.reflHide.push(c);
  }
}
function buildJumbotron() {
  const g = new THREE.Group(); g.position.set(0, 54, 0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(24, 13, 18), stdMat('#0c0d11', 0.4, { metalness: 0.5 }));
  g.add(body);
  R.jumboC = mkCanvas(1024, 512); R.jumboT = canvasTex(R.jumboC);
  const sm = hdrBasic('#ffffff', 1.5, { map: R.jumboT });
  const scr = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 11), sm); m.position.set(x, 0, z); m.rotation.y = ry; g.add(m); };
  scr(22.4, 0, 9.05, 0); scr(22.4, 0, -9.05, PI); scr(16.4, 12.05, 0, PI / 2); scr(16.4, -12.05, 0, -PI / 2);
  R.jumboRing = hdrBasic('#ff7a1a', 2.2);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 14.5, 1.4, 48, 1, true), R.jumboRing); ring.position.y = -7.4; g.add(ring);
  const ring2 = ring.clone(); ring2.position.y = 7.4; g.add(ring2);
  R.scene.add(g); R.jumbo = g; R.reflHide.push(g);
  R.jumboKey = '';
}
function drawJumbo(force) {
  const key = G.state === 'none' ? 'x' : `${G.teams[0].score}|${G.teams[1].score}|${G.quarter}|${Math.ceil(G.clock)}|${G.mode}`;
  if (!force && key === R.jumboKey) return;
  R.jumboKey = key;
  const c = R.jumboC, g = c.getContext('2d');
  const H = R.home || TEAMS[0], A = R.away || TEAMS[1];
  g.fillStyle = '#050608'; g.fillRect(0, 0, 1024, 512);
  if (G.state === 'none') return;
  g.fillStyle = A.c1; g.fillRect(0, 0, 512, 360); g.fillStyle = H.c1; g.fillRect(512, 0, 512, 360);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.font = `900 italic 92px ${FONT_D}`; g.fillText(A.id, 256, 90); g.fillText(H.id, 768, 90);
  g.font = `900 200px ${FONT_D}`;
  if (G.mode === 'threept' && G.tp) { g.fillStyle = '#111'; g.fillRect(0, 0, 1024, 360); g.fillStyle = '#fff'; g.font = `900 italic 90px ${FONT_D}`; g.fillText('3-POINT CONTEST', 512, 90); g.font = `900 200px ${FONT_D}`; g.fillText(String(G.tp.score), 512, 240); }
  else { g.fillText(String(G.teams[1].score), 256, 245); g.fillText(String(G.teams[0].score), 768, 245); }
  g.fillStyle = '#0a0b0f'; g.fillRect(0, 360, 1024, 152);
  g.fillStyle = '#ffb347'; g.font = `800 100px ${FONT_D}`;
  const q = G.quarter <= 4 ? ['1ST', '2ND', '3RD', '4TH'][G.quarter - 1] : 'OT';
  g.fillText(G.mode === 'threept' && G.tp ? Math.max(0, G.tp.time).toFixed(0) + 's' : `${q}  ${fmtClockShort(G.clock)}`, 512, 438);
  for (let y = 0; y < 512; y += 4) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, 1024, 1); }
  R.jumboT.needsUpdate = true;
}
function fmtClockShort(t) { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60); return t < 60 ? t.toFixed(0) : m + ':' + (s < 10 ? '0' : '') + s; }

function paintArena(home, away) {
  R.home = home; R.away = away;
  if (R.floorTex) R.floorTex.dispose();
  if (R.floorRough) R.floorRough.dispose();
  R.floorTex = canvasTex(drawCourt(home, R.courtW));
  R.floorRough = canvasTex(drawCourtRough(R.courtW >> 1), false);
  if (!R.floorBump) { R.floorBump = canvasTex(drawCourtBump(R.courtW >> 1), false); }
  R.floorMat.map = R.floorTex; R.floorMat.roughnessMap = R.floorRough; R.floorMat.bumpMap = R.floorBump; R.floorMat.bumpScale = 0.012;
  R.floorMat.needsUpdate = true;
  R.benchMats[0].color.set(shade(home.c1, -0.55)); R.benchMats[1].color.set(shade(away.c1, -0.55));
  R.bowlMat.color.set(shade(home.c2, -0.3)).lerp(new THREE.Color('#22252c'), 0.6);
  colorCrowd(R.crowdLower, home, away); colorCrowd(R.crowdUpper, home, away); colorCrowd(R.courtFans, home, away);
  { const a = R.courtside.geometry.attributes.aShirt, col = new THREE.Color();
    R.courtsideSeats.forEach((c, i) => {
      col.set(c.kind === 'bench' ? (c.side < 0 ? home.c1 : away.c1) : c.kind === 'coach' ? '#1c1f26' : '#2a2c31');
      if (c.kind === 'bench') col.multiplyScalar(0.85);
      a.array[i * 3] = col.r; a.array[i * 3 + 1] = col.g; a.array[i * 3 + 2] = col.b;
    });
    a.needsUpdate = true; }
  drawReflCrowd(home, away);
  if (R.signC) drawSigns(home);
  R.jumboRing.color.set(home.c1).multiplyScalar(2.2);
  for (const h of R.hoops) { drawPad(h, home); }
  drawRibbon(); drawTable(); drawJumbo(true);
}
function drawReflCrowd(home, away) {
  const c = R.reflCrowdC, g = c.getContext('2d');
  g.fillStyle = '#0d0f14'; g.fillRect(0, 0, c.width, c.height);
  const pal = [home.c1, home.c1, home.c2, home.c3, '#d8d4cc', '#2a2c33', away.c1, '#6a5a48', '#40536e'];
  for (let i = 0; i < 2600; i++) {
    const y = 60 + Math.random() * 190, x = Math.random() * c.width;
    g.fillStyle = pal[(Math.random() * pal.length) | 0];
    g.globalAlpha = 0.35 + Math.random() * 0.4;
    g.fillRect(x, y, 6 + Math.random() * 6, 8 + Math.random() * 10);
  }
  g.globalAlpha = 1;
  // LED fascia glow near the top of the band
  const gr = g.createLinearGradient(0, 0, 0, 60); gr.addColorStop(0, 'rgba(255,190,120,0.55)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, 60);
  R.reflCrowdT.needsUpdate = true;
}
function drawRibbon(msg) {
  const c = R.ribbonC, g = c.getContext('2d'), h = R.home || TEAMS[0];
  g.fillStyle = '#030406'; g.fillRect(0, 0, c.width, c.height);
  const txt = msg || `${h.city.toUpperCase()} ${h.name.toUpperCase()}   ◆   HARDWOOD KINGS   ◆   `;
  g.font = `900 italic 70px ${FONT_D}`;
  const tw = Math.ceil(g.measureText(txt).width), n = Math.max(2, Math.round(4096 / tw / 2) * 2);
  if (c.width !== tw * n) { c.width = tw * n; R.ribbonT.dispose(); }
  g.fillStyle = '#030406'; g.fillRect(0, 0, c.width, c.height);
  g.font = `900 italic 70px ${FONT_D}`; g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? h.c3 : '#ffffff'; g.fillText(txt, i * tw, 50); }
  for (let y = 0; y < c.height; y += 3) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y, c.width, 1); }
  R.ribbonT.needsUpdate = true;
}
function drawTable() {
  const c = R.tableC, g = c.getContext('2d'), h = R.home || TEAMS[0], a = R.away || TEAMS[1];
  const grd = g.createLinearGradient(0, 0, c.width, 0);
  grd.addColorStop(0, h.c1); grd.addColorStop(0.5, '#05060a'); grd.addColorStop(1, a.c1);
  g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
  g.font = `900 italic 92px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.fillText(`${h.id}   ◆   HARDWOOD KINGS   ◆   ${a.id}`, c.width / 2, 68);
  for (let y = 0; y < c.height; y += 3) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, c.width, 1); }
  R.tableT.needsUpdate = true;
}

/* ---------------- hoops ---------------- */
function netTex() {
  const c = mkCanvas(128, 128), g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#ffffff'; g.lineWidth = 11; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 128); g.moveTo(128, 0); g.lineTo(0, 128); g.stroke();
  g.beginPath(); g.moveTo(-64, 64); g.lineTo(64, 192); g.moveTo(64, -64); g.lineTo(192, 64); g.moveTo(192, 64); g.lineTo(64, 192); g.moveTo(64, -64); g.lineTo(-64, 64); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function buildHoops() {
  R.hoops = [];
  const nt = netTex();
  for (const s of [-1, 1]) {
    const grp = new THREE.Group(); R.scene.add(grp);
    const padM = stdMat('#1d2129', 0.75), steel = stdMat('#23262d', 0.35, { metalness: 0.7 });
    const padC = mkCanvas(512, 256), padT = canvasTex(padC);
    const front = stdMat('#ffffff', 0.7, { map: padT });
    const mats = s > 0 ? [padM, front, padM, padM, padM, padM] : [front, padM, padM, padM, padM, padM];
    const base = new THREE.Mesh(new THREE.BoxGeometry(5, 4.4, 6.4), mats);
    base.position.set(s * 53.6, 2.2, 0); base.castShadow = true; grp.add(base);
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.1, 9.5, 1.1), padM);
    post.position.set(s * 52.6, 8.9, 0); post.castShadow = true; grp.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(10, 0.9, 0.9), padM);
    arm.position.set(s * 48.3, 12.9, 0); arm.rotation.z = s * -0.24; arm.castShadow = true; grp.add(arm);
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.45, 0.45), steel);
    arm2.position.set(s * 45.6, 11.0, 0); grp.add(arm2);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.5, 6), new THREE.MeshStandardMaterial({ color: '#d8ecff', transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.0, envMapIntensity: 2.2, depthWrite: false }));
    glass.position.set(s * (CT.BB_X + 0.06), (CT.BB_BOT + CT.BB_TOP) / 2, 0); glass.renderOrder = 3; grp.add(glass);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.4 });
    const fx = s * CT.BB_X;
    const bar = (w, h, y, z, m) => { const me = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, w), m || frameMat); me.position.set(fx, y, z); grp.add(me); return me; };
    bar(2, 0.1, 11.5, 0); bar(2, 0.1, 10.0, 0); bar(0.1, 1.5, 10.75, 1); bar(0.1, 1.5, 10.75, -1);
    // LED edge that lights red at the end of a period
    const led = new THREE.MeshBasicMaterial({ color: '#1a1a1a', toneMapped: false });
    bar(6.1, 0.16, CT.BB_TOP, 0, led); bar(6.1, 0.16, CT.BB_BOT, 0, led); bar(0.16, 3.6, 10.75, 3.02, led); bar(0.16, 3.6, 10.75, -3.02, led);
    const pads = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 6.2), padM);
    pads.position.set(fx + s * 0.1, CT.BB_BOT - 0.17, 0); grp.add(pads);
    const sc = mkCanvas(256, 96), sct = canvasTex(sc);
    const scf = hdrBasic('#ffffff', 1.6, { map: sct });
    const dark = stdMat('#0b0b0d', 0.5);
    const scm = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.05, 0.7), [dark, dark, dark, dark, scf, scf]);
    scm.position.set(fx, CT.BB_TOP + 0.68, 0); scm.rotation.y = PI / 2; grp.add(scm);
    const rimMat = stdMat('#ff4f12', 0.3, { metalness: 0.45 });
    const rimG = new THREE.Group(); rimG.position.set(s * CT.RIM_X, CT.RIM_Y, 0); grp.add(rimG);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(CT.RIM_R, CT.RIM_TUBE * 1.5, 10, 40), rimMat);
    rim.rotation.x = PI / 2; rim.castShadow = true; rimG.add(rim);
    const brk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.42), rimMat);
    brk.position.set(s * 0.98, -0.03, 0); rimG.add(brk);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, hk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), rimMat);
      hk.position.set(Math.cos(a) * CT.RIM_R, -0.07, Math.sin(a) * CT.RIM_R); rimG.add(hk);
    }
    // deformable net mesh
    const NS = 16, NL = 8, nodes = [], pos = [], uv = [], idx = [];
    for (let l = 0; l <= NL; l++) {
      const t = l / NL, rr = lerp(CT.RIM_R - 0.02, 0.43, Math.pow(t, 0.85)), yy = CT.RIM_Y - 0.08 - t * 1.55;
      for (let i = 0; i <= NS; i++) {
        const a = i / NS * TAU + (l % 2) * 0.0;
        const n = { rx: s * CT.RIM_X + Math.cos(a) * rr, ry: yy, rz: Math.sin(a) * rr, dx: 0, dy: 0, dz: 0, vx: 0, vy: 0, vz: 0, l, i };
        nodes.push(n); pos.push(n.rx, n.ry, n.rz); uv.push(i / NS * 12, 1 - t * 1);
      }
    }
    for (let l = 0; l < NL; l++) for (let i = 0; i < NS; i++) {
      const a = l * (NS + 1) + i, b = a + 1, c = a + NS + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ng.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    ng.setIndex(idx); ng.computeVertexNormals();
    const ntx = nt.clone(); ntx.needsUpdate = true; ntx.repeat.set(1, 4.5);
    const net = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ color: '#f6f6f6', alphaMap: ntx, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 }));
    net.frustumCulled = false; net.renderOrder = 2; grp.add(net);
    // everything but the rim and net: hidden whenever the camera swings behind this backboard
    const occ = grp.children.filter((c) => c !== rimG && c !== net);
    R.hoops.push({ s, nodes, NS, NL, net, sc, sct, scVal: -2, rimG, led, ledT: 0, wob: 0, padC, padT, occ, occHidden: false });
  }
}
function drawPad(h, T) {
  const c = h.padC, g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, shade(T.c1, -0.1)); gr.addColorStop(1, shade(T.c1, -0.45));
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  drawEmblem(g, T, 256, 128, 100);
  h.padT.needsUpdate = true;
}
function drawShotClock(h, v) {
  if (h.scVal === v) return;
  h.scVal = v;
  const g = h.sc.getContext('2d');
  g.fillStyle = '#060606'; g.fillRect(0, 0, 256, 96);
  g.font = `800 86px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = v <= 5 ? '#ff3b2f' : '#ffb347';
  g.fillText(v < 0 ? '' : String(v), 128, 52);
  h.sct.needsUpdate = true;
}
function stepNets(dt) {
  const balls = [G.ball].concat(G.xballs || []);
  for (const h of R.hoops) {
    const N = h.nodes, NS = h.NS;
    for (const n of N) {
      if (n.l === 0) continue;
      const k = 75, c = 7.5;
      n.vx += (-k * n.dx - c * n.vx) * dt; n.vy += (-k * n.dy - c * n.vy) * dt; n.vz += (-k * n.dz - c * n.vz) * dt;
      n.dx += n.vx * dt; n.dy += n.vy * dt; n.dz += n.vz * dt;
      for (const b of balls) {
        if (!b || !b.visible || b.state === 'held') continue;
        const px = n.rx + n.dx, py = n.ry + n.dy, pz = n.rz + n.dz;
        const ex = px - b.x, ey = py - b.y, ez = pz - b.z, d = Math.sqrt(ex * ex + ey * ey + ez * ez);
        const rr = CT.BALL_R + 0.06;
        if (d < rr && d > 1e-4) {
          const push = (rr - d) / d;
          n.dx += ex * push; n.dy += ey * push * 0.4; n.dz += ez * push;
          n.vx += b.vx * 0.05; n.vy += b.vy * 0.06; n.vz += b.vz * 0.05;
        }
      }
    }
    // keep the seam closed
    for (let l = 0; l <= h.NL; l++) { const a = N[l * (NS + 1)], z = N[l * (NS + 1) + NS]; z.dx = a.dx; z.dy = a.dy; z.dz = a.dz; }
    const P = h.net.geometry.attributes.position.array;
    for (let i = 0; i < N.length; i++) { const n = N[i]; P[i * 3] = n.rx + n.dx; P[i * 3 + 1] = n.ry + n.dy; P[i * 3 + 2] = n.rz + n.dz; }
    h.net.geometry.attributes.position.needsUpdate = true;
    // rim wobble after dunks, LED glow at the buzzer
    if (h.wob > 0) { h.wob = Math.max(0, h.wob - dt * 1.6); h.rimG.rotation.z = Math.sin(R.t * 38) * 0.05 * h.wob * h.s; h.rimG.position.y = CT.RIM_Y - 0.06 * h.wob; }
    if (h.ledT > 0) { h.ledT -= dt; h.led.color.setRGB(3.2, 0.25, 0.15); } else h.led.color.setRGB(0.08, 0.08, 0.09);
  }
}
function netSwish(side) {
  const h = R.hoops.find((q) => q.s === side);
  if (!h) return;
  for (const n of h.nodes) if (n.l > 0) { n.vy -= 3.5 + n.l * 0.7; n.vx += (n.rx - side * CT.RIM_X) * 2.2; n.vz += n.rz * 2.2; }
}
function rimShake(side) { const h = R.hoops.find((q) => q.s === side); if (h) h.wob = 1; }
function backboardLights() { for (const h of R.hoops) h.ledT = 2.2; }

/* ---------------- ball ---------------- */
function buildBall() {
  const W = 1024, H = 512;
  const c = mkCanvas(W, H), g = c.getContext('2d'), bc = mkCanvas(W, H), bg = bc.getContext('2d');
  g.fillStyle = '#c4581b'; g.fillRect(0, 0, W, H);
  bg.fillStyle = '#808080'; bg.fillRect(0, 0, W, H);
  const rnd = mulberry32(3);
  for (let i = 0; i < 60000; i++) {
    const x = rnd() * W, y = rnd() * H, r = 1 + rnd() * 1.6;
    bg.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.35})`; bg.beginPath(); bg.arc(x, y, r, 0, TAU); bg.fill();
    if (i % 3 === 0) { g.fillStyle = rnd() < 0.5 ? 'rgba(90,30,0,0.12)' : 'rgba(255,160,80,0.08)'; g.fillRect(x, y, 2, 2); }
  }
  const seam = (ctx, col, w) => {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 4, 0); ctx.lineTo(W / 4, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3 * W / 4, 0); ctx.lineTo(3 * W / 4, H); ctx.stroke();
    for (const [cx, dir] of [[0, 1], [W / 2, -1], [W / 2, 1], [W, -1]]) {
      ctx.beginPath();
      for (let y = 0; y <= H; y += 4) { const x = cx + dir * Math.sin(y / H * PI) * W * 0.16; y ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
  };
  seam(g, '#1a0e07', 10); seam(bg, '#000000', 16);
  g.font = `800 30px ${FONT_D}`; g.fillStyle = 'rgba(15,8,4,0.7)'; g.textAlign = 'center';
  g.fillText('HARDWOOD KINGS · OFFICIAL GAME BALL', 640, 196);
  const t = canvasTex(c), bt = canvasTex(bc, false);
  const m = new THREE.Mesh(new THREE.SphereGeometry(CT.BALL_R, 40, 28), stdMat('#ffffff', 0.58, { map: t, bumpMap: bt, bumpScale: 0.006, envMapIntensity: 0.8 }));
  m.castShadow = true;
  R.scene.add(m); R.ball = m;
  R.xballs = [];
  for (let i = 0; i < 6; i++) { const x = m.clone(); x.visible = false; R.scene.add(x); R.xballs.push(x); }
  R.racks = new THREE.Group(); R.racks.visible = false; R.scene.add(R.racks);
}
function buildRacks() {
  while (R.racks.children.length) R.racks.remove(R.racks.children[0]);
  R.rackBalls = [];
  const mm = R.ball.material;
  const money = stdMat('#ffffff', 0.5, { map: R.ball.material.map, bumpMap: R.ball.material.bumpMap, bumpScale: 0.006, color: '#ff6fe0', emissive: '#3a0c34' });
  TP_RACKS.forEach((r) => {
    const out = hyp(r[0] - CT.RIM_X, r[1]) || 1;
    const ox = (r[0] - CT.RIM_X) / out, oz = r[1] / out;
    const px = r[0] + ox * 3.2, pz = r[1] + oz * 3.2;
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.6, 4.4), stdMat('#1c2028', 0.35, { metalness: 0.6 }));
    rack.position.set(px, 1.3, pz); rack.rotation.y = -Math.atan2(oz, ox); rack.castShadow = true;
    R.racks.add(rack);
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(R.ball.geometry, i === 4 ? money : mm);
      const t = (i - 2) * 0.84;
      b.position.set(px - oz * t, 2.98, pz + ox * t); b.castShadow = true;
      R.racks.add(b); R.rackBalls.push(b);
    }
  });
}

/* ---------------- indicators and effects ---------------- */
function radialTex(stops) {
  const c = mkCanvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function buildIndicators() {
  const rt = radialTex([[0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0)'], [0.72, 'rgba(255,255,255,1)'], [0.8, 'rgba(255,255,255,0.9)'], [0.86, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: rt, color: new THREE.Color(2, 1.7, 0.4), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -PI / 2; ring.position.y = 0.05; ring.renderOrder = 4;
  R.scene.add(ring); R.ring = ring; R.reflHide.push(ring);
  const dt = radialTex([[0, 'rgba(255,255,255,0.0)'], [0.55, 'rgba(255,255,255,0.0)'], [0.7, 'rgba(255,255,255,0.9)'], [0.85, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']]);
  const tgt = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: dt, color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  tgt.rotation.x = -PI / 2; tgt.position.y = 0.05; R.scene.add(tgt); R.tgt = tgt; R.reflHide.push(tgt);
  // teammate markers for the third-person camera: a chevron over each teammate's head
  { const c = mkCanvas(64, 64), g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(10, 14); g.lineTo(32, 46); g.lineTo(54, 14); g.lineTo(32, 26); g.closePath(); g.stroke(); g.fill();
    const t = new THREE.CanvasTexture(c);
    R.mates = [];
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: new THREE.Color(1, 1, 1), depthTest: false, depthWrite: false, toneMapped: false, transparent: true }));
      sp.renderOrder = 10; sp.visible = false; sp.scale.set(1.1, 1.1, 1);
      R.scene.add(sp); R.mates.push(sp); R.reflHide.push(sp);
    } }
  R.blobTex = radialTex([[0, 'rgba(0,0,0,0.6)'], [0.5, 'rgba(0,0,0,0.32)'], [1, 'rgba(0,0,0,0)']]);
  R.blobMat = new THREE.MeshBasicMaterial({ map: R.blobTex, transparent: true, depthWrite: false });
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), R.blobMat); bb.rotation.x = -PI / 2; R.scene.add(bb); R.ballBlob = bb; R.reflHide.push(bb);
}
function buildFX() {
  // confetti
  const N = R.mobile ? 350 : 900;
  const geo = new THREE.PlaneGeometry(0.32, 0.2);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 });
  const im = new THREE.InstancedMesh(geo, mat, N);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false; im.visible = false;
  R.scene.add(im);
  R.conf = { mesh: im, n: N, p: [], on: false, t: 0, d: new THREE.Object3D() };
  buildTrail();
  buildShow();
  // camera flashes in the bowl
  const M = 600, fp = new Float32Array(M * 3), seed = new Float32Array(M);
  R.flashGeo = new THREE.BufferGeometry();
  R.flashGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  R.flashGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  R.flashU = { uTime: { value: 0 }, uRate: { value: 0.0 }, uScale: { value: 600 } };
  const fm = new THREE.ShaderMaterial({
    uniforms: R.flashU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSeed; uniform float uTime; uniform float uRate; uniform float uScale; varying float vA;
      void main(){ float slot = floor(uTime * 9.0 + aSeed * 37.0); float r = fract(sin(slot * 12.9898 + aSeed * 78.233) * 43758.5453);
        float ph = fract(uTime * 9.0 + aSeed * 37.0); vA = step(1.0 - uRate, r) * (1.0 - ph);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = vA > 0.0 ? uScale / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float f = exp(-dot(d, d) * 18.0); gl_FragColor = vec4(vec3(6.0, 6.0, 7.0) * f * vA, 1.0); }`,
  });
  R.flashes = new THREE.Points(R.flashGeo, fm);
  R.flashes.frustumCulled = false;
  R.scene.add(R.flashes); R.reflHide.push(R.flashes);
  const seats = R.seatsAll;
  for (let i = 0; i < M; i++) {
    const s = seats[Math.floor(vr() * seats.length)];
    fp[i * 3] = s.x; fp[i * 3 + 1] = s.y + 2.5; fp[i * 3 + 2] = s.z; seed[i] = vr();
  }
}
function buildTrail() {
  const N = 28, pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3), idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  m.frustumCulled = false; m.visible = false;
  R.scene.add(m); R.reflHide.push(m);
  R.trail = { mesh: m, N, pts: [], on: false, t: 0, col: new THREE.Color(0.25, 2.4, 0.9) };
  const burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.glowTex, color: new THREE.Color(0.6, 3.5, 1.4), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }));
  burst.visible = false; R.scene.add(burst); R.burst = { s: burst, t: 0 };
}
function startTrail(kind) {
  const T = R.trail;
  T.on = true; T.t = 0; T.pts = [];
  T.col.setRGB(kind === 'perfect' ? 0.25 : 2.2, kind === 'perfect' ? 2.4 : 1.6, kind === 'perfect' ? 0.9 : 0.3);
  const b = G.ball; R.burst.t = 0.45; R.burst.s.position.set(b.x, b.y, b.z); R.burst.s.visible = true;
  R.burst.s.material.color.copy(T.col).multiplyScalar(1.4);
}
const _tv = new THREE.Vector3(), _ts = new THREE.Vector3(), _tc = new THREE.Vector3();
function stepTrail(rdt) {
  const T = R.trail, B = R.burst;
  if (B.t > 0) { B.t -= rdt; const u = 1 - B.t / 0.45; const sc = 1.5 + u * 5; B.s.scale.set(sc, sc, 1); B.s.material.opacity = Math.max(0, 1 - u); if (B.t <= 0) B.s.visible = false; }
  if (!T.on) { T.mesh.visible = false; return; }
  T.t += rdt;
  let b = G.ball, src = R.ball.position;
  if (G.mode === 'threept' && G.xballs && G.xballs.length) { b = G.xballs[G.xballs.length - 1]; src = R.xballs[G.xballs.length - 1].position; }
  if (b.state === 'shot' || b.shotLive || (b.state === 'loose' && T.t < 1.6)) T.pts.unshift({ x: src.x, y: src.y, z: src.z });
  else if (T.pts.length) T.pts.pop();
  if (T.pts.length > T.N) T.pts.length = T.N;
  if ((T.pts.length < 2 && T.t > 0.3) || T.t > 3.2) { T.on = false; T.mesh.visible = false; return; }
  const pos = T.mesh.geometry.attributes.position.array, col = T.mesh.geometry.attributes.color.array;
  const n = T.pts.length;
  for (let i = 0; i < T.N; i++) {
    const p = T.pts[Math.min(i, n - 1)] || { x: 0, y: -10, z: 0 }, q = T.pts[Math.min(i + 1, n - 1)] || p;
    _tv.set(p.x - q.x, p.y - q.y, p.z - q.z);
    _tc.set(p.x - R.cam.position.x, p.y - R.cam.position.y, p.z - R.cam.position.z);
    _ts.crossVectors(_tv, _tc).normalize();
    const u = i / (T.N - 1), w = CT.BALL_R * 0.9 * (1 - u * 0.85) * (i < n ? 1 : 0);
    for (let k = 0; k < 2; k++) {
      const o = (i * 2 + k) * 3, sg = k ? 1 : -1;
      pos[o] = p.x + _ts.x * w * sg; pos[o + 1] = p.y + _ts.y * w * sg; pos[o + 2] = p.z + _ts.z * w * sg;
      const f = Math.pow(1 - u, 1.6) * (i < n ? 1 : 0);
      col[o] = T.col.r * f; col[o + 1] = T.col.g * f; col[o + 2] = T.col.b * f;
    }
  }
  T.mesh.geometry.attributes.position.needsUpdate = true; T.mesh.geometry.attributes.color.needsUpdate = true;
  T.mesh.visible = true;
}
/* pre-game light show: arena dims, coloured pools and beams sweep the court, then the lights slam on */
function buildShow() {
  const pt = radialTex([[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  R.showPools = []; R.showBeams = [];
  const beamMat = () => new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(1, 1, 1) }, uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uC; uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 1.6); gl_FragColor = vec4(uC * uA * f * (0.25 + 0.75 * vUv.y), 1.0); }',
  });
  for (let i = 0; i < 5; i++) {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: pt, color: new THREE.Color(0, 0, 0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    pool.rotation.x = -PI / 2; pool.position.y = 0.06; pool.visible = false; pool.renderOrder = 5;
    R.scene.add(pool); R.showPools.push(pool); R.reflHide.push(pool);
    const g = new THREE.CylinderGeometry(0.6, 6.5, 1, 20, 1, true); g.translate(0, -0.5, 0);
    const beam = new THREE.Mesh(g, beamMat()); beam.visible = false; R.scene.add(beam); R.showBeams.push(beam); R.reflHide.push(beam);
  }
  R.show = 0; R.showDur = 3.6;
  R.baseLights = { key: R.key.intensity, hemi: R.hemi.intensity, fill: R.fill.intensity, rim: R.rimL.intensity, bowl: R.bowlL.intensity };
}
function startShow(home, away) {
  R.show = R.showDur; R.showCols = [home.c1, home.c3, '#ffffff', away.c1, home.c1].map((h) => new THREE.Color(h));
  drawRibbon(`${away.city.toUpperCase()} ${away.name.toUpperCase()}  AT  ${home.city.toUpperCase()} ${home.name.toUpperCase()}   ◆   `);
}
function endShow() {
  R.show = 0; R.showActive = false;
  R.key.intensity = R.baseLights.key; R.hemi.intensity = R.baseLights.hemi;
  R.fill.intensity = R.baseLights.fill; R.rimL.intensity = R.baseLights.rim; R.bowlL.intensity = R.baseLights.bowl;
  R.showPools.forEach((p) => (p.visible = false)); R.showBeams.forEach((b) => (b.visible = false));
}
function stepShow(rdt) {
  if (!R.showPools) return;
  if (R.show <= 0 && R.showActive) endShow();
  const on = R.show > 0;
  if (on) {
    R.showActive = true;
    R.show -= rdt;
    const u = 1 - R.show / R.showDur;
    const dim = R.show > 0.25 ? 0.1 : 1;
    const lo = dim < 1;
    R.key.intensity = R.baseLights.key * dim; R.hemi.intensity = R.baseLights.hemi * (lo ? 0.3 : 1);
    R.fill.intensity = R.baseLights.fill * (lo ? 0.15 : 1); R.rimL.intensity = R.baseLights.rim * (lo ? 0.6 : 1); R.bowlL.intensity = R.baseLights.bowl * (lo ? 0.25 : 1);
    R.showPools.forEach((p, i) => {
      const t = R.t * (0.7 + i * 0.13) + i * 1.7;
      const x = Math.sin(t * 1.1) * 34 * (i % 2 ? 1 : -0.8), z = Math.cos(t * 0.8 + i) * 19;
      p.visible = true; p.position.x = x; p.position.z = z;
      const c = R.showCols[i], k = (R.show > 0.25 ? 2.4 : 0) * clamp(u * 5, 0, 1);
      p.material.color.setRGB(c.r * k, c.g * k, c.b * k);
      const b = R.showBeams[i], top = V3((i - 2) * 22, 80, i % 2 ? -26 : 26);
      b.visible = k > 0; b.position.copy(top);
      const d = V3(x, 0, z).sub(top), len = d.length();
      b.scale.set(1, len, 1); b.quaternion.setFromUnitVectors(V3(0, -1, 0), d.normalize());
      b.material.uniforms.uC.value.copy(c); b.material.uniforms.uA.value = k * 0.1;
    });
    R.excite = Math.max(R.excite, 0.55); R.flashRate = Math.max(R.flashRate, 0.08);
    if (R.show <= 0) {
      endShow(); R.flash = 0.4; R.excite = 1; R.flashRate = 0.25;
      drawRibbon(G.mode === 'threept' ? 'THREE-POINT CONTEST  •  HARDWOOD KINGS  •  ' : null);
      if (typeof crowdRoar === 'function') crowdRoar(1, 3);
    }
  }
}
function startConfetti(T) {
  const C = R.conf, cols = [T.c1, T.c3, '#ffffff', '#ffd23f', T.c1].map((h) => new THREE.Color(h));
  C.p = [];
  for (let i = 0; i < C.n; i++) {
    C.p.push({ x: vrr(-45, 45), y: vrr(40, 90), z: vrr(-28, 28), vy: -vrr(4, 8), sw: vrr(1, 3), ph: vr() * TAU, rx: vr() * TAU, ry: vr() * TAU, sp: vrr(3, 9) });
    C.mesh.setColorAt(i, cols[i % cols.length]);
  }
  if (C.mesh.instanceColor) C.mesh.instanceColor.needsUpdate = true;
  C.on = true; C.t = 0; C.mesh.visible = true;
}
function stopConfetti() { R.conf.on = false; R.conf.mesh.visible = false; }
function stepFX(dt, rdt) {
  const C = R.conf;
  if (C.on) {
    C.t += rdt;
    const d = C.d;
    for (let i = 0; i < C.n; i++) {
      const p = C.p[i];
      p.y += p.vy * rdt; p.ph += rdt * p.sp;
      if (p.y < 0.1) { p.y = 0.05; } else { p.x += Math.sin(p.ph) * p.sw * rdt; p.z += Math.cos(p.ph * 0.7) * p.sw * rdt; p.rx += rdt * p.sp; p.ry += rdt * p.sp * 0.6; }
      d.position.set(p.x, p.y, p.z); d.rotation.set(p.y > 0.1 ? p.rx : PI / 2, p.ry, 0); d.updateMatrix();
      C.mesh.setMatrixAt(i, d.matrix);
    }
    C.mesh.instanceMatrix.needsUpdate = true;
    if (C.t > 30) stopConfetti();
  }
  stepTrail(rdt);
  stepShow(rdt);
  R.flashU.uTime.value = R.t;
  R.flashRate = Math.max(0.004, R.flashRate - rdt * 0.08);
  R.flashU.uRate.value = R.flashRate;
  R.flashU.uScale.value = 260 * R.dpr * (innerHeight / 800);
}

/* ---------------- per-frame world update ---------------- */
function updateWorld(dt, rdt) {
  const a = R.alpha;
  G.players.forEach((p, i) => {
    const q = R.prev[i];
    const px = lerp(q.x, p.x, a), py = lerp(q.y, p.y, a), pz = lerp(q.z, p.z, a);
    const pf = q.f + angDiff(q.f, p.face) * a;
    poseHumanoid(R.players[i], p, Math.max(dt, 1e-4), px, py, pz, pf);
  });
  stepRefs(dt);
  stepBench(rdt);
  const b = G.ball, bm = R.ball;
  bm.visible = b.visible;
  const bx = lerp(R.prevBall.x, b.x, a), by = lerp(R.prevBall.y, b.y, a), bz = lerp(R.prevBall.z, b.z, a);
  bm.position.set(bx, by, bz);
  spinBall(bm, b, dt);
  R.ballBlob.visible = b.visible && R.quality === 'low';
  if (R.ballBlob.visible) { R.ballBlob.position.set(bx, 0.03, bz); const s = clamp(1.2 - by * 0.05, 0.3, 1.2); R.ballBlob.scale.set(s, s, 1); }
  for (let i = 0; i < R.xballs.length; i++) {
    const x = G.xballs && G.xballs[i], m = R.xballs[i];
    if (x) { m.visible = true; m.position.set(x.x, x.y, x.z); spinBall(m, x, dt); } else m.visible = false;
  }
  if (G.mode === 'threept' && G.tp && R.rackBalls) {
    R.rackBalls.forEach((m, i) => { m.visible = i >= G.tp.ball + (b.state === 'held' ? 1 : 0); });
  }
  stepNets(dt);
  const scv = G.state === 'live' || G.state === 'dead' ? Math.ceil(Math.max(0, G.shotClock)) : -1;
  for (const h of R.hoops) drawShotClock(h, G.mode === 'threept' ? -1 : scv);
  const c = G.ctrl;
  const showRing = c && G.userTeam >= 0 && !G.auto && G.state !== 'final' && G.state !== 'periodEnd';
  R.ring.visible = !!showRing;
  if (showRing) {
    const i = G.players.indexOf(c), q = R.prev[i];
    R.ring.position.set(lerp(q.x, c.x, a), 0.05, lerp(q.z, c.z, a));
    const pulse = 1 + Math.sin(R.t * 6) * 0.05;
    R.ring.scale.set(pulse * c.sc, pulse * c.sc, 1);
    const col = c.hasBall ? [2.2, 1.7, 0.3] : c.team.idx === G.offense ? [0.5, 2.0, 1.8] : [2.2, 0.7, 0.3];
    R.ring.material.color.setRGB(col[0], col[1], col[2]);
  }
  const pt = G.passTarget;
  const showMates = showRing && R.camMode === 'third' && c.team.idx === G.offense && (G.state === 'live' || G.state === 'dead');
  const mates = showMates ? c.team.players.filter((q) => q !== c) : [];
  R.mates.forEach((sp, i) => {
    const q = mates[i];
    sp.visible = !!q;
    if (!q) return;
    const tgt = q === pt && c.hasBall, k = tgt ? 2.4 : 1.2;
    const col = new THREE.Color(q.team.def.c3);
    sp.material.color.setRGB(col.r * k, col.g * k, col.b * k);
    sp.material.opacity = tgt ? 1 : 0.75;
    const bob = Math.sin(R.t * 5 + i) * 0.12, s2 = tgt ? 1.5 : 1.0;
    sp.position.set(q.x, q.y + q.hgt + 1.3 + bob, q.z); sp.scale.set(s2, s2, 1);
  });
  R.tgt.visible = !!(pt && showRing && c.hasBall && G.state === 'live');
  if (R.tgt.visible) { R.tgt.position.set(pt.x, 0.05, pt.z); R.tgt.rotation.z += dt * 2; }
  // crowd, wave, boards, scoreboard
  R.excite = Math.max(0, R.excite - rdt * 0.32);
  R.crowdU.uTime.value = R.t;
  R.crowdU.uExcite.value = R.excite;
  R.crowdU.uLight.value = R.baseLights ? clamp(0.25 + 0.75 * R.key.intensity / R.baseLights.key, 0.2, 1.2) : 1;
  if (G.attract && G.state === 'dead' && R.wave < -5 && Math.random() < rdt * 0.08) R.wave = -PI;
  if (R.wave > -5) { R.wave += rdt * 1.1; if (R.wave > PI * 3) R.wave = -9; }
  R.crowdU.uWave.value = R.wave > -5 ? ((R.wave % TAU) + TAU) % TAU - PI : -9;
  R.ribbonT.offset.x = (R.ribbonT.offset.x + rdt * 0.012) % 1;
  R.tableT.offset.x = (R.tableT.offset.x - rdt * 0.02) % 1;
  R.coneMat.uniforms.uA.value = 0.016 + R.excite * 0.008;
  R.jumboTick = (R.jumboTick || 0) + rdt;
  if (R.jumboTick > 0.25) { R.jumboTick = 0; drawJumbo(false); }
  stepFX(dt, rdt);
}
const _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
function spinBall(m, b, dt) {
  let wx = 0, wz = 0;
  const v = hyp(b.vx, b.vz);
  if (b.state === 'held') { wx = b.vz / CT.BALL_R; wz = -b.vx / CT.BALL_R; }
  else if (b.state === 'shot' || b.shotLive) { wx = -b.vz / CT.BALL_R * 0.9; wz = b.vx / CT.BALL_R * 0.9; }
  else if (b.y < CT.BALL_R + 0.05) { wx = b.vz / CT.BALL_R; wz = -b.vx / CT.BALL_R; }
  else { wx = b.vz / CT.BALL_R * 0.4; wz = -b.vx / CT.BALL_R * 0.4; }
  const w = Math.sqrt(wx * wx + wz * wz);
  if (w > 1e-3 && v > 0.05) { _ax.set(wx / w, 0, wz / w); _q.setFromAxisAngle(_ax, w * dt); m.quaternion.premultiply(_q); }
}
