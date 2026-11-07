'use strict';
// ============================================================
// Chunks, streaming, meshing, raycasting
// ============================================================

const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz; this.key = ckey(cx, cz); this.skey = chunkKey(cx, cz);
    this.blocks = new Uint8Array(CH_VOL);
    this.hO = new Int16Array(256); this.hA = new Int16Array(256);
    this.maxY = 0; this.generated = false; this.dirty = true;
    this.lights = []; this.gl = null;
  }
}

// ---------------- mesher tables ----------------
const PADX = 18, PADY = 18 * 18;
const padB = new Uint8Array(PADY * 130);
const padHO = new Int16Array(PADY), padHA = new Int16Array(PADY);
const FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_V = [
  [[1, 0, 1, 0, 1], [1, 0, 0, 1, 1], [1, 1, 0, 1, 0], [1, 1, 1, 0, 0]],
  [[0, 0, 0, 0, 1], [0, 0, 1, 1, 1], [0, 1, 1, 1, 0], [0, 1, 0, 0, 0]],
  [[0, 1, 1, 0, 1], [1, 1, 1, 1, 1], [1, 1, 0, 1, 0], [0, 1, 0, 0, 0]],
  [[0, 0, 0, 0, 1], [1, 0, 0, 1, 1], [1, 0, 1, 1, 0], [0, 0, 1, 0, 0]],
  [[0, 0, 1, 0, 1], [1, 0, 1, 1, 1], [1, 1, 1, 1, 0], [0, 1, 1, 0, 0]],
  [[1, 0, 0, 0, 1], [0, 0, 0, 1, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]],
];
const FACE_SHADE = [0.72, 0.72, 1.0, 0.55, 0.86, 0.86];
const AO_CURVE = [0.5, 0.68, 0.84, 1.0];
const FACE_D = FACE_N.map(n => n[0] + n[2] * PADX + n[1] * PADY);
// per face/vertex: 4 neighbor cells (front, side1, side2, corner) as [dx,dy,dz]
const FACE_CELLS = FACE_V.map((verts, f) => {
  const n = FACE_N[f], axis = n[0] ? 0 : n[1] ? 1 : 2;
  const tang = [0, 1, 2].filter(a => a !== axis);
  return verts.map(v => {
    const s = [0, 0, 0], t = [0, 0, 0];
    s[tang[0]] = v[tang[0]] ? 1 : -1; t[tang[1]] = v[tang[1]] ? 1 : -1;
    const f0 = n, s1 = [n[0] + s[0], n[1] + s[1], n[2] + s[2]], s2 = [n[0] + t[0], n[1] + t[1], n[2] + t[2]];
    const cr = [n[0] + s[0] + t[0], n[1] + s[1] + t[1], n[2] + s[2] + t[2]];
    return [f0, s1, s2, cr];
  });
});

let VB_O = new Float32Array(1 << 18), VB_T = new Float32Array(1 << 16);
let nO = 0, nT = 0;
function growO() { const b = new Float32Array(VB_O.length * 2); b.set(VB_O); VB_O = b; }
function growT() { const b = new Float32Array(VB_T.length * 2); b.set(VB_T); VB_T = b; }
function pushV(trans, x, y, z, u, v, shade, sky, flag) {
  if (trans) {
    if (nT + 8 > VB_T.length) growT();
    VB_T[nT++] = x; VB_T[nT++] = y; VB_T[nT++] = z; VB_T[nT++] = u; VB_T[nT++] = v; VB_T[nT++] = shade; VB_T[nT++] = sky; VB_T[nT++] = flag;
  } else {
    if (nO + 8 > VB_O.length) growO();
    VB_O[nO++] = x; VB_O[nO++] = y; VB_O[nO++] = z; VB_O[nO++] = u; VB_O[nO++] = v; VB_O[nO++] = shade; VB_O[nO++] = sky; VB_O[nO++] = flag;
  }
}
function cellSky(px, py, pz) {
  const col = pz * PADX + px, y = py - 1;
  return y > padHA[col] ? 1 : (y > padHO[col] ? 0.62 : 0);
}

class World {
  constructor(realm, seed, edits) {
    this.realm = realm; this.seed = seed;
    this.G = realm.makeGen(seed);
    this.edits = edits;        // Map<string chunkKey, Map<idx, id>>
    this.chunks = new Map();
    this.wanted = []; this.center = null; this.radius = -1;
    this.onMesh = null; this.onFree = null;
    this.lavaLights = realm.key !== 'emberdeep';
  }
  chunk(cx, cz) { return this.chunks.get(ckey(cx, cz)); }
  // returns -1 for not-yet-generated chunks
  getBlock(x, y, z) {
    if (y >= HEIGHT) return 0;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return -1;
    if (y < 0) return (this.realm.voidBelow || c.blocks[((z & 15) << 4) | (x & 15)] === 0) ? 0 : B.worldstone;
    return c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }
  blockAt(x, y, z) { const b = this.getBlock(x, y, z); return b < 0 ? 0 : b; }
  solidAt(x, y, z) { const b = this.getBlock(x, y, z); return b < 0 ? true : SOLID[b] === 1; }
  isLoaded(x, z) { return this.chunks.has(ckey(x >> 4, z >> 4)); }

  setBlock(x, y, z, id, record = true) {
    if (y < 0 || y >= HEIGHT) return false;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return false;
    const lx = x & 15, lz = z & 15, i = (y << 8) | (lz << 4) | lx;
    if (c.blocks[i] === id) return false;
    c.blocks[i] = id;
    if (record) {
      let m = this.edits.get(c.skey);
      if (!m) { m = new Map(); this.edits.set(c.skey, m); }
      m.set(i, id);
    }
    if (y > c.maxY) c.maxY = y;
    this.columnHeights(c, lx, lz);
    c.dirty = true; c.urgent = true;
    const nx = lx === 0 ? -1 : lx === 15 ? 1 : 0, nz = lz === 0 ? -1 : lz === 15 ? 1 : 0;
    const mark = (dx, dz) => { const n = this.chunks.get(ckey(c.cx + dx, c.cz + dz)); if (n) { n.dirty = true; n.urgent = true; } };
    if (nx) mark(nx, 0);
    if (nz) mark(0, nz);
    if (nx && nz) mark(nx, nz);
    return true;
  }
  columnHeights(c, lx, lz) {
    const ci = (lz << 4) | lx; let hO = -1, hA = -1;
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const s = SKYB[c.blocks[(y << 8) | ci]];
      if (s && hA < 0) hA = y;
      if (s === 2) { hO = y; break; }
    }
    c.hO[ci] = hO; c.hA[ci] = hA;
  }
  computeHeights(c) {
    let maxY = 0;
    for (let ci = 0; ci < 256; ci++) {
      let hO = -1, hA = -1, top = -1;
      for (let y = HEIGHT - 1; y >= 0; y--) {
        const id = c.blocks[(y << 8) | ci];
        if (!id) continue;
        if (top < 0) top = y;
        const s = SKYB[id];
        if (s && hA < 0) hA = y;
        if (s === 2) { hO = y; break; }
      }
      c.hO[ci] = hO; c.hA[ci] = hA;
      if (top > maxY) maxY = top;
    }
    c.maxY = maxY;
  }
  generate(cx, cz) {
    const c = new Chunk(cx, cz);
    this.realm.gen(c, this.G);
    const e = this.edits.get(c.skey);
    if (e) for (const [i, id] of e) c.blocks[i] = id;
    this.computeHeights(c);
    c.generated = true;
    this.chunks.set(c.key, c);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.chunks.get(ckey(cx + dx, cz + dz));
      if (n) n.dirty = true;
    }
    return c;
  }
  neighborsReady(c) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.chunks.has(ckey(c.cx + dx, c.cz + dz))) return false;
    return true;
  }
  // skylight estimate at a world position (for entities)
  skyAt(x, y, z) {
    const c = this.chunks.get(ckey(Math.floor(x) >> 4, Math.floor(z) >> 4));
    if (!c) return 1;
    const ci = ((Math.floor(z) & 15) << 4) | (Math.floor(x) & 15), yy = Math.floor(y);
    return yy > c.hA[ci] ? 1 : (yy > c.hO[ci] ? 0.62 : 0);
  }
  surfaceY(x, z) {
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return -1;
    return c.hO[((z & 15) << 4) | (x & 15)];
  }
  // generate synchronously around a point (used when entering a realm)
  generateArea(x, z, r) {
    const cx0 = Math.floor(x / 16), cz0 = Math.floor(z / 16);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (!this.chunk(cx0 + dx, cz0 + dz)) this.generate(cx0 + dx, cz0 + dz);
  }
  update(px, pz, radius, budgetMs) {
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    if (!this.center || this.center[0] !== pcx || this.center[1] !== pcz || this.radius !== radius) {
      this.center = [pcx, pcz]; this.radius = radius;
      const R = radius + 1, list = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dz);
        if (d <= R + 0.5) list.push([pcx + dx, pcz + dz, d]);
      }
      list.sort((a, b) => a[2] - b[2]);
      this.wanted = list;
      for (const c of [...this.chunks.values()]) {
        if (Math.hypot(c.cx - pcx, c.cz - pcz) > radius + 3.5) {
          if (this.onFree) this.onFree(c);
          this.chunks.delete(c.key);
        }
      }
    }
    const t0 = performance.now();
    // urgent remeshes first (player edits)
    for (const c of this.chunks.values()) if (c.urgent && c.dirty && this.neighborsReady(c)) { this.mesh(c); c.urgent = false; }
    for (const w of this.wanted) {
      if (performance.now() - t0 > budgetMs * 0.6) break;
      if (!this.chunks.has(ckey(w[0], w[1]))) this.generate(w[0], w[1]);
    }
    for (const w of this.wanted) {
      if (w[2] > radius + 0.5) continue;
      if (performance.now() - t0 > budgetMs) break;
      const c = this.chunks.get(ckey(w[0], w[1]));
      if (c && c.dirty && this.neighborsReady(c)) this.mesh(c);
    }
  }
  pendingCount() {
    let n = 0;
    for (const w of this.wanted) { if (w[2] > this.radius + 0.5) continue; const c = this.chunks.get(ckey(w[0], w[1])); if (!c || c.dirty) n++; }
    return n;
  }

  // ---------------- meshing ----------------
  mesh(c) {
    c.dirty = false; c.urgent = false;
    const ch = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ch.push(this.chunks.get(ckey(c.cx + dx, c.cz + dz)));
    const voidBelow = this.realm.voidBelow;
    for (let pz = 0; pz < 18; pz++) for (let px = 0; px < 18; px++) {
      const wx = px - 1, wz = pz - 1;
      const sx = wx < 0 ? 0 : wx > 15 ? 2 : 1, sz = wz < 0 ? 0 : wz > 15 ? 2 : 1;
      const src = ch[sz * 3 + sx];
      const lx = wx & 15, lz = wz & 15, col = pz * PADX + px;
      if (!src) { for (let y = 0; y < 130; y++) padB[y * PADY + col] = 0; padHO[col] = padHA[col] = -1; continue; }
      const b = src.blocks, ci = (lz << 4) | lx;
      for (let y = 0; y < HEIGHT; y++) padB[(y + 1) * PADY + col] = b[(y << 8) | ci];
      padB[col] = (voidBelow || b[ci] === 0) ? 0 : B.worldstone;
      padB[129 * PADY + col] = 0;
      padHO[col] = src.hO[ci]; padHA[col] = src.hA[ci];
    }
    nO = 0; nT = 0;
    const lights = [], geodes = [];
    const bx = c.cx * 16, bz = c.cz * 16;
    const maxY = Math.min(c.maxY + 1, HEIGHT - 1);
    for (let y = 0; y <= maxY; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const p = (y + 1) * PADY + (z + 1) * PADX + (x + 1);
      const id = padB[p];
      if (!id) continue;
      const rt = RENDER[id];
      if (id === B.mod_geode) geodes.push([bx + x, y, bz + z]);
      if (LIGHTR[id] > 0 && lights.length < 48) {
        if (LIQ[id] === 2) { if (this.lavaLights && padB[p + PADY] === 0 && ((x * 7 + z * 3 + y) & 3) === 0) lights.push([bx + x + .5, y + 1, bz + z + .5, id]); }
        else lights.push([bx + x + .5, y + .5, bz + z + .5, id]);
      }
      if (rt === R_CROSS) { this.emitCross(id, bx + x, y, bz + z, x + 1, y + 1, z + 1); continue; }
      const liq = LIQ[id], trans = rt === R_GLASS || rt === R_LIQUID;
      const lowerTop = liq && LIQ[padB[p + PADY]] !== liq;
      for (let f = 0; f < 6; f++) {
        const nid = padB[p + FACE_D[f]];
        if (OPAQUE[nid]) continue;
        if (rt === R_GLASS && nid === id) continue;
        if (liq) { if (LIQ[nid] === liq) continue; if (liq === 1 && WLOG[nid]) continue; if (rt === R_LIQUID && f !== 2 && SOLID[nid] && nid !== 0 && RENDER[nid] === R_GLASS) continue; }
        let tile;
        if (f === 2) tile = TEX_T[id]; else if (f === 3) tile = TEX_B[id]; else tile = (f === 4) ? TEX_F[id] : TEX_S[id];
        const u0 = (tile & 15) / 16, v0 = (tile >> 4) / 16;
        let flag = EMIT[id] ? 1 : 0;
        if (LEAF[id] && !flag) flag = 3;
        if (liq) { if (liq === 2) flag = f === 2 && lowerTop ? 5 : 6; else if (f === 2 && lowerTop) flag = 4; }
        const cells = FACE_CELLS[f], verts = FACE_V[f];
        const L = [0, 0, 0, 0], S = [0, 0, 0, 0];
        for (let v = 0; v < 4; v++) {
          const cs = cells[v];
          const s1 = OPAQUE[padB[p + cs[1][0] + cs[1][2] * PADX + cs[1][1] * PADY]];
          const s2 = OPAQUE[padB[p + cs[2][0] + cs[2][2] * PADX + cs[2][1] * PADY]];
          const cr = OPAQUE[padB[p + cs[3][0] + cs[3][2] * PADX + cs[3][1] * PADY]];
          const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + cr);
          let sky = 0, cnt = 0;
          for (let k = 0; k < 4; k++) {
            if (k === 3 && s1 && s2) continue;
            const d = cs[k], q = p + d[0] + d[2] * PADX + d[1] * PADY;
            if (k > 0 && OPAQUE[padB[q]]) continue;
            sky += cellSky(x + 1 + d[0], y + 1 + d[1], z + 1 + d[2]); cnt++;
          }
          L[v] = (rt === R_LIQUID || EMIT[id]) ? 1 : AO_CURVE[ao];
          S[v] = cnt ? sky / cnt : 0;
        }
        const shade = FACE_SHADE[f];
        const flip = L[0] * (S[0] + .3) + L[2] * (S[2] + .3) < L[1] * (S[1] + .3) + L[3] * (S[3] + .3);
        const order = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
        for (const v of order) {
          const vt = verts[v];
          let vy = y + vt[1];
          if (lowerTop && vt[1] === 1) vy -= 0.12;
          pushV(trans, bx + x + vt[0], vy, bz + z + vt[2], u0 + vt[3] / 16, v0 + vt[4] / 16, shade * L[v], S[v], flag);
        }
      }
    }
    c.geodes = geodes;
    c.lights = lights.map(l => { const d = BLOCKS[l[3]].light; return [l[0], l[1], l[2], d[3], d[0], d[1], d[2]]; });
    if (this.onMesh) this.onMesh(c, VB_O.subarray(0, nO), VB_T.subarray(0, nT));
  }
  emitCross(id, wx, y, wz, px, py, pz) {
    const tile = TEX_S[id], u0 = (tile & 15) / 16, v0 = (tile >> 4) / 16;
    const sky = cellSky(px, py, pz);
    const emit = EMIT[id], sway = SWAY[id];
    let ox = 0, oz = 0;
    if (sway) { ox = (ihash(wx, y, wz, 5) - 0.5) * 0.3; oz = (ihash(wx, y, wz, 6) - 0.5) * 0.3; }
    const ins = id === B.torch ? 0.3 : 0.08;
    const quads = [[ins, ins, 1 - ins, 1 - ins], [1 - ins, ins, ins, 1 - ins]];
    const topFlag = emit ? 1 : (sway ? 2 : 0), botFlag = emit ? 1 : 0;
    const top = id === B.torch ? 0.75 : 1;
    for (const [x0, z0, x1, z1] of quads) {
      const a = [wx + x0 + ox, y, wz + z0 + oz], b = [wx + x1 + ox, y, wz + z1 + oz];
      const V = [[a[0], y, a[2], 0, 1, botFlag], [b[0], y, b[2], 1, 1, botFlag], [b[0], y + top, b[2], 1, 1 - top, topFlag], [a[0], y + top, a[2], 0, 1 - top, topFlag]];
      for (const idx of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) {
        const v = V[idx];
        pushV(false, v[0], v[1], v[2], u0 + v[3] / 16, v0 + v[4] / 16, 0.92, sky, v[5]);
      }
    }
  }

  // ---------------- raycast (Amanatides & Woo) ----------------
  raycast(ox, oy, oz, dx, dy, dz, maxDist, pred) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) * tdx : Infinity;
    let tmy = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) * tdy : Infinity;
    let tmz = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 256 && t <= maxDist; i++) {
      const id = this.blockAt(x, y, z);
      if (pred(id)) return { x, y, z, id, nx, ny, nz, t };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
}
