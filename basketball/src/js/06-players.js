'use strict';
/* ============================================================
   Players: anatomical procedural models (lathe-profiled limbs
   with muscle shape, tank-top jerseys with armholes, baggy
   shorts, high-top sneakers, faces and hair), and the pose
   solver that animates them from simulation state.
   ============================================================ */

const SKIN = ['#f0c8a2', '#dcaa7c', '#c48a5c', '#9c6640', '#76482a', '#4c2e1b'];
const HAIRC = ['#14100c', '#221710', '#35261a', '#6a4a2a', '#c9a35e'];

/* lathe from [radius, y] pairs with increasing y; sx/sz squash the cross-section */
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
function T_(g, col) { return tintGeo(g.index ? g : g, col); }
function noUV(g) { if (g.attributes.uv) g.deleteAttribute('uv'); return g; }
function vmerge(list) { return mergeGeos(list.map(noUV)); }

function shoeGeos(upper, sole, accent) {
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
  const ni = (g) => (g.index ? g.toNonIndexed() : g);
  return [T_(ni(up), upper), T_(ni(sg), sole), T_(tab, accent), T_(sw, accent)];
}

function jerseyCanvas(T, home, p, skin) {
  const c = mkCanvas(512, 512), g = c.getContext('2d');
  const base = home ? T.c1 : '#f3f2ee', ink = home ? '#ffffff' : T.c1, trim = home ? T.c3 : T.c2;
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  // fabric texture
  for (let y = 0; y < 512; y += 3) { g.fillStyle = 'rgba(0,0,0,0.035)'; g.fillRect(0, y, 512, 1); }
  // side panels
  g.fillStyle = trim; g.fillRect(0, 180, 16, 332); g.fillRect(496, 180, 16, 332); g.fillRect(240, 180, 32, 332);
  // armholes (sides at u=0/1 and u=0.5) and neck scoop, with trim
  const hole = (cx, cy, rx, ry) => {
    g.fillStyle = trim; g.beginPath(); g.ellipse(cx, cy, rx + 10, ry + 10, 0, 0, TAU); g.fill();
    g.fillStyle = skin; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
  };
  hole(0, 40, 92, 150); hole(512, 40, 92, 150); hole(256, 40, 92, 150);
  hole(128, -6, 70, 70); hole(384, -16, 62, 44);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const word = T.name.toUpperCase();
  let fs = 54; g.font = `900 italic ${fs}px ${FONT_D}`;
  while (g.measureText(word).width > 150 && fs > 26) { fs -= 2; g.font = `900 italic ${fs}px ${FONT_D}`; }
  g.fillStyle = ink; g.lineWidth = 6; g.strokeStyle = trim;
  g.strokeText(word, 128, 168); g.fillText(word, 128, 168);
  g.font = `900 150px ${FONT_D}`; g.lineWidth = 9;
  g.strokeText(String(p.num), 128, 285); g.fillText(String(p.num), 128, 285);
  const last = p.n.split(' ').slice(1).join(' ').toUpperCase();
  let ls = 46; g.font = `800 ${ls}px ${FONT_D}`;
  while (g.measureText(last).width > 170 && ls > 24) { ls -= 2; g.font = `800 ${ls}px ${FONT_D}`; }
  g.fillText(last, 384, 150);
  g.font = `900 170px ${FONT_D}`; g.lineWidth = 9;
  g.strokeText(String(p.num), 384, 285); g.fillText(String(p.num), 384, 285);
  // hem
  g.fillStyle = trim; g.fillRect(0, 496, 512, 16);
  return c;
}
function nameHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

let PLAYER_MAT = null;
function buildHumanoid(pl, home) {
  const d = pl.d, T = pl.team.def;
  if (!PLAYER_MAT) PLAYER_MAT = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.56, metalness: 0, envMapIntensity: 0.7 });
  const skin = SKIN[d.skin], hairC = HAIRC[d.skin <= 1 && d.hair === 2 ? 4 : d.hair % 3];
  const kit = home ? T.c1 : '#f1f0ec', trim = home ? T.c3 : T.c2, dark = '#15100d';
  const shoeUp = d.acc === 2 ? T.c3 : home ? '#16171a' : '#f4f4f4', sole = home ? '#f0f0f0' : '#e8e2d6', accent = home ? T.c3 : T.c1;
  const sock = home ? '#f5f5f5' : T.c1, accC = home ? '#ffffff' : T.c1;
  const hsh = nameHash(d.n), beard = hsh % 3 === 0, bulk = { PG: 0.94, SG: 0.97, SF: 1.0, PF: 1.06, C: 1.12 }[d.pos];
  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat || PLAYER_MAT); m.castShadow = true; return m; };
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  body.scale.set(pl.sc, pl.sc, pl.sc);
  const hips = new THREE.Group(); hips.position.y = 3.35; body.add(hips);
  // shorts top and waistband
  hips.add(mk(vmerge([
    T_(lathe([[0.54, -0.5], [0.64, -0.3], [0.68, -0.05], [0.65, 0.16], [0.58, 0.3]], 16, 0.74 * bulk, bulk), kit),
    T_(lathe([[0.59, 0.22], [0.6, 0.34]], 16, 0.74 * bulk, bulk), trim),
  ])));
  // torso: tank-top jersey on a chest/shoulder lathe
  const torso = new THREE.Group(); hips.add(torso);
  const jt = canvasTex(jerseyCanvas(T, home, d, skin));
  const jersey = new THREE.MeshStandardMaterial({ map: jt, roughness: 0.74, envMapIntensity: 0.5 });
  const chestG = lathe([[0.53, 0.12], [0.54, 0.45], [0.58, 0.85], [0.66, 1.3], [0.71, 1.62], [0.7, 1.86], [0.57, 2.05], [0.28, 2.18]], 24, 0.62, bulk);
  torso.add(mk(chestG, jersey));
  torso.add(mk(vmerge([T_(lathe([[0.22, 2.0], [0.195, 2.25], [0.2, 2.45]], 12, 1, 1), skin)])));
  // head: skull, jaw, ears, nose, eyes, brows, hair, beard, headband in one mesh
  const headG = new THREE.Group(); headG.position.y = 2.42; torso.add(headG);
  const hp = [
    T_(sphereG(0.335, 18, 14, 0.98, 1.12, 0.9, 0.02, 0.33, 0), skin),
    T_(sphereG(0.235, 14, 10, 1.0, 0.82, 0.92, 0.1, 0.1, 0), skin),
    T_(sphereG(0.06, 8, 6, 1.1, 1.5, 0.85, 0.335, 0.27, 0), skin),
    T_(sphereG(0.075, 8, 6, 0.45, 1.0, 0.35, 0.0, 0.3, 0.315), skin),
    T_(sphereG(0.075, 8, 6, 0.45, 1.0, 0.35, 0.0, 0.3, -0.315), skin),
    T_(sphereG(0.034, 6, 5, 1, 1, 1, 0.295, 0.355, 0.11), dark),
    T_(sphereG(0.034, 6, 5, 1, 1, 1, 0.295, 0.355, -0.11), dark),
    T_(boxG(0.05, 0.024, 0.12, 0.305, 0.425, 0.11), hairC),
    T_(boxG(0.05, 0.024, 0.12, 0.305, 0.425, -0.11), hairC),
    T_(boxG(0.03, 0.02, 0.1, 0.31, 0.14, 0), '#7a3b2e'),
  ];
  const hairStyle = d.hair;
  if (hairStyle === 1) hp.push(T_(sphereG(0.352, 18, 10, 1.0, 1.12, 0.93, 0.0, 0.36, 0, 0, PI * 0.5), hairC));
  else if (hairStyle === 2) { hp.push(T_(sphereG(0.345, 18, 10, 1.0, 1.1, 0.93, 0.0, 0.35, 0, 0, PI * 0.45), hairC)); hp.push(T_(cylG(0.27, 0.31, 0.42, 16, -0.02, 0.66, 0), hairC)); }
  else if (hairStyle === 3) hp.push(T_(sphereG(0.5, 16, 12, 1.0, 0.86, 1.0, -0.06, 0.52, 0, 0, PI * 0.62), hairC));
  else if (hairStyle === 4) { hp.push(T_(sphereG(0.35, 18, 10, 1.0, 1.1, 0.93, 0.0, 0.36, 0, 0, PI * 0.5), hairC)); hp.push(T_(sphereG(0.13, 10, 8, 1, 1, 1, -0.3, 0.62, 0), hairC)); }
  else hp.push(T_(sphereG(0.342, 18, 10, 1.0, 1.1, 0.92, 0.0, 0.35, 0, 0, PI * 0.42), hairC));
  if (beard) hp.push(T_(sphereG(0.248, 14, 10, 1.02, 0.85, 0.95, 0.1, 0.1, 0, PI * 0.45, PI * 0.55), hairC));
  if (d.acc === 1) hp.push(T_(cylG(0.36, 0.36, 0.1, 20, 0.0, 0.47, 0), accC));
  headG.add(mk(vmerge(hp)));
  // arms
  const mkArm = (side) => {
    const sh = new THREE.Group(); sh.position.set(0, 1.9, side * 0.76 * bulk); torso.add(sh);
    const sleeve = d.acc === 2 && side > 0;
    const ua = [T_(sphereG(0.26, 14, 10, 1, 1.08, 1, 0, -0.03, side * 0.03), skin),
      T_(lathe([[0.13, -1.15], [0.15, -1.0], [0.19, -0.72], [0.212, -0.47], [0.2, -0.22], [0.19, 0.02]], 14, bulk, bulk), sleeve ? accC : skin)];
    sh.add(mk(vmerge(ua)));
    const el = new THREE.Group(); el.position.y = -1.15; sh.add(el);
    const fa = [T_(sphereG(0.14, 10, 8), skin),
      T_(lathe([[0.1, -1.05], [0.106, -0.92], [0.14, -0.58], [0.162, -0.3], [0.148, -0.05], [0.138, 0.02]], 14, bulk, bulk), sleeve ? accC : skin),
      T_(sphereG(0.155, 10, 8, 0.6, 1.3, 1.0, 0.01, -1.2, 0), skin),
      T_(sphereG(0.06, 6, 5, 1, 1.6, 1, 0.08, -1.11, side * 0.1), skin)];
    if (d.acc === 2 && side < 0) fa.push(T_(cylG(0.1, 0.095, 0.14, 12, 0, -0.95, 0), accC));
    el.add(mk(vmerge(fa)));
    return { sh, el };
  };
  const mkLeg = (side) => {
    const hp2 = new THREE.Group(); hp2.position.set(0, -0.08, side * 0.32 * bulk); hips.add(hp2);
    hp2.add(mk(vmerge([
      T_(lathe([[0.43, -1.42], [0.45, -1.2], [0.46, -0.6], [0.45, -0.12], [0.4, 0.06]], 16, bulk, bulk), kit),
      T_(lathe([[0.437, -1.42], [0.452, -1.3]], 16, bulk * 1.01, bulk * 1.01), trim),
      T_(boxG(0.06, 1.2, 0.12, 0, -0.72, side * 0.455 * bulk), trim),
      T_(lathe([[0.19, -1.62], [0.24, -1.3], [0.29, -0.8], [0.31, -0.3], [0.3, 0.0]], 12, bulk, bulk), skin),
    ])));
    const kn = new THREE.Group(); kn.position.y = -1.6; hp2.add(kn);
    kn.add(mk(vmerge([
      T_(sphereG(0.19, 10, 8, 1.05, 1, 1), skin),
      T_(lathe([[0.115, -1.5], [0.125, -1.36], [0.17, -1.0], [0.21, -0.62], [0.2, -0.32], [0.175, 0.0]], 14, bulk, bulk), skin),
      T_(lathe([[0.127, -1.52], [0.133, -1.36], [0.158, -1.15], [0.183, -0.94], [0.179, -0.9]], 14, bulk, bulk), sock),
    ])));
    const ank = new THREE.Group(); ank.position.y = -1.52; kn.add(ank);
    const shoe = mk(vmerge(shoeGeos(shoeUp, sole, accent)));
    shoe.position.set(0.07, -0.08, 0); shoe.scale.set(1.12, 1.08, 1.2);
    ank.add(shoe);
    return { hp: hp2, kn, ank };
  };
  const armR = mkArm(1), armL = mkArm(-1), legR = mkLeg(1), legL = mkLeg(-1);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), R.blobMat);
  blob.rotation.x = -PI / 2; blob.position.y = 0.03;
  R.scene.add(root); R.scene.add(blob);
  return { root, body, hips, torso, headG, armR, armL, legR, legL, blob, stride: 0, jt, jersey, j: { lean: 0, crouch: 0, twist: 0 } };
}
function disposeHumanoid(h) {
  R.scene.remove(h.root); R.scene.remove(h.blob);
  h.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  h.jt.dispose(); h.jersey.dispose();
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
