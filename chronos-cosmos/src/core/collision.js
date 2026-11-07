import * as THREE from 'three';

// Lightweight collision world: terrain heightfield + oriented boxes (yaw
// only) + vertical cylinders, bucketed in a uniform grid. Characters are
// vertical capsules approximated by a circle footprint and a height range.

const CS = 16;
const key = (i, j) => i * 73856093 ^ j * 19349663;

export class CollisionWorld {
  constructor(terrain) {
    this.terrain = terrain;
    this.cells = new Map();
    this.all = new Set();
    this.stamp = 0;
    this.waterLevel = () => -1e9;
  }

  _cellsFor(c) {
    const r = c.bound;
    const i0 = Math.floor((c.x - r) / CS), i1 = Math.floor((c.x + r) / CS);
    const j0 = Math.floor((c.z - r) / CS), j1 = Math.floor((c.z + r) / CS);
    const out = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(key(i, j));
    return out;
  }
  _insert(c) {
    c.keys = this._cellsFor(c);
    for (const k of c.keys) {
      let a = this.cells.get(k);
      if (!a) this.cells.set(k, (a = []));
      a.push(c);
    }
    this.all.add(c);
    return c;
  }
  remove(c) {
    if (!c || !c.keys) return;
    for (const k of c.keys) {
      const a = this.cells.get(k);
      if (!a) continue;
      const i = a.indexOf(c);
      if (i >= 0) a.splice(i, 1);
    }
    this.all.delete(c);
    c.keys = null;
  }
  // Box centered at (x,y,z) with half extents, rotated by yaw ry.
  addBox(x, y, z, hx, hy, hz, ry = 0, opts = {}) {
    const c = {
      type: 'box', x, y, z, hx, hy, hz, ry, cos: Math.cos(ry), sin: Math.sin(ry),
      bound: Math.hypot(hx, hz), top: y + hy, bottom: y - hy, active: true, climbable: opts.climbable !== false,
      tag: opts.tag || null, owner: opts.owner || null, ramp: opts.ramp || null,
    };
    return this._insert(c);
  }
  // Vertical cylinder; give opts.rTop for a tapered one (r is the bottom radius).
  addCyl(x, z, y0, y1, r, opts = {}) {
    const rTop = opts.rTop ?? r;
    const c = {
      type: 'cyl', x, z, y: (y0 + y1) / 2, r: Math.max(r, rTop), r0: r, r1: rTop, taper: rTop !== r, bound: Math.max(r, rTop), top: y1, bottom: y0, active: true,
      climbable: opts.climbable !== false, tag: opts.tag || null, owner: opts.owner || null, dome: opts.dome || 0,
    };
    return this._insert(c);
  }
  // radius of a (possibly tapered) cylinder at height y
  radiusAt(c, y) {
    if (!c.taper) return c.r;
    const u = THREE.MathUtils.clamp((y - c.bottom) / (c.top - c.bottom), 0, 1);
    return c.r0 + (c.r1 - c.r0) * u;
  }
  move(c, x, y, z) {
    this.remove(c);
    const dy = y - c.y;
    c.x = x; c.z = z; c.y = y; c.top += dy; c.bottom += dy;
    this._insert(c);
  }

  query(x, z, r, out = []) {
    out.length = 0;
    this.stamp++;
    const i0 = Math.floor((x - r) / CS), i1 = Math.floor((x + r) / CS);
    const j0 = Math.floor((z - r) / CS), j1 = Math.floor((z + r) / CS);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const a = this.cells.get(key(i, j));
        if (!a) continue;
        for (const c of a) {
          if (c._s === this.stamp || !c.active) continue;
          c._s = this.stamp;
          out.push(c);
        }
      }
    return out;
  }

  // local coords of point in box space
  _toLocal(c, x, z) {
    const dx = x - c.x, dz = z - c.z;
    return [dx * c.cos - dz * c.sin, dx * c.sin + dz * c.cos];
  }
  _toWorldDir(c, lx, lz) {
    return [lx * c.cos + lz * c.sin, -lx * c.sin + lz * c.cos];
  }

  // Surface height of a collider at (x,z) if the footprint contains it.
  topAt(c, x, z, pad = 0) {
    if (c.type === 'box') {
      const [lx, lz] = this._toLocal(c, x, z);
      if (Math.abs(lx) > c.hx + pad || Math.abs(lz) > c.hz + pad) return null;
      if (c.ramp) {
        // ramp rises along local +z (dir 1) or -z
        const t = THREE.MathUtils.clamp((lz * c.ramp + c.hz) / (2 * c.hz), 0, 1);
        return c.bottom + (c.top - c.bottom) * t;
      }
      return c.top;
    }
    const d = Math.hypot(x - c.x, z - c.z);
    const rt = c.taper ? c.r1 : c.r;
    if (d > rt + pad) return null;
    if (c.dome) return c.top - c.dome * (d / rt) * (d / rt);
    return c.top;
  }

  groundAt(x, z, yFeet, radius = 0.3, step = 0.55) {
    let h = this.terrain.heightAt(x, z);
    let col = null;
    const list = this.query(x, z, radius + 1, this._q || (this._q = []));
    for (const c of list) {
      const t = this.topAt(c, x, z, radius * 0.6);
      if (t === null) continue;
      if (t <= yFeet + step && t > h) {
        h = t;
        col = c;
      }
    }
    return { h, col };
  }

  // Push a character footprint out of colliders. Returns wall info.
  resolve(pos, radius, height, step = 0.5, result = {}) {
    result.wall = null;
    result.wallNormal = result.wallNormal || new THREE.Vector3();
    result.ceiling = null;
    const list = this.query(pos.x, pos.z, radius + 2, this._r || (this._r = []));
    for (let iter = 0; iter < 2; iter++) {
      for (const c of list) {
        if (c.top <= pos.y + step || c.bottom >= pos.y + height) continue;
        if (c.ramp) {
          // a slope is walkable wherever its surface (at the nearest point of
          // its footprint) is no higher than a comfortable step
          const [rlx, rlz] = this._toLocal(c, pos.x, pos.z);
          const qz = THREE.MathUtils.clamp(rlz, -c.hz, c.hz);
          const u = THREE.MathUtils.clamp((qz * c.ramp + c.hz) / (2 * c.hz), 0, 1);
          const surf = c.bottom + (c.top - c.bottom) * u;
          if (surf <= pos.y + Math.max(step, 0.45) && Math.abs(rlx) <= c.hx + radius) continue;
        }
        if (c.type === 'box') {
          const [lx, lz] = this._toLocal(c, pos.x, pos.z);
          const cx = THREE.MathUtils.clamp(lx, -c.hx, c.hx);
          const cz = THREE.MathUtils.clamp(lz, -c.hz, c.hz);
          let dx = lx - cx, dz = lz - cz;
          let d = Math.hypot(dx, dz);
          if (d >= radius) continue;
          let nx, nz, push;
          if (d < 1e-5) {
            // inside: push out along the shallowest axis
            const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
            if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + radius; }
            else { nx = 0; nz = Math.sign(lz) || 1; push = pz + radius; }
          } else {
            nx = dx / d; nz = dz / d; push = radius - d;
          }
          const [wx, wz] = this._toWorldDir(c, nx, nz);
          pos.x += wx * push;
          pos.z += wz * push;
          result.wall = c;
          result.wallNormal.set(wx, 0, wz);
        } else {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d = Math.hypot(dx, dz);
          // tapered walls: use the radius at chest height (clamped to the span we overlap)
          const rr = radius + (c.taper ? this.radiusAt(c, Math.max(pos.y + step, Math.min(pos.y + 0.9, c.top))) : c.r);
          if (d >= rr) continue;
          const nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
          pos.x = c.x + nx * rr;
          pos.z = c.z + nz * rr;
          result.wall = c;
          result.wallNormal.set(nx, 0, nz);
        }
      }
    }
    // ceiling (for jumping into overhangs)
    for (const c of list) {
      if (c.bottom > pos.y + height - 0.2 && c.bottom < pos.y + height + 0.3) {
        if (this.topAt(c, pos.x, pos.z, -0.05) !== null) result.ceiling = c;
      }
    }
    return result;
  }

  // Ray vs terrain + colliders. Returns {t, normal, col} or null.
  raycast(o, d, maxDist, opts = {}) {
    let best = maxDist, bestN = null, bestC = null;
    if (!opts.noTerrain) {
      const t = this.terrain.raycast(o, d, Math.min(maxDist, opts.terrainMax || maxDist), opts.step || 1);
      if (t >= 0 && t < best) {
        best = t;
        bestN = this.terrain.normalAt(o.x + d.x * t, o.z + d.z * t);
        bestC = null;
      }
    }
    // collect colliders along ray by sampling cells
    const steps = Math.ceil(best / CS) + 1;
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const tt = Math.min(best, s * CS);
      const px = o.x + d.x * tt, pz = o.z + d.z * tt;
      const list = this.query(px, pz, CS * 0.8, []);
      for (const c of list) {
        if (seen.has(c)) continue;
        seen.add(c);
        if (opts.filter && !opts.filter(c)) continue;
        const hit = this._rayCollider(c, o, d, best);
        if (hit && hit.t < best) {
          best = hit.t;
          bestN = hit.n;
          bestC = c;
        }
      }
    }
    if (bestN === null) return null;
    return { t: best, normal: bestN, col: bestC };
  }

  _rayCollider(c, o, d, maxT) {
    if (c.type === 'box') {
      // transform into local space
      const ox = o.x - c.x, oz = o.z - c.z;
      const lox = ox * c.cos - oz * c.sin, loz = ox * c.sin + oz * c.cos;
      const ldx = d.x * c.cos - d.z * c.sin, ldz = d.x * c.sin + d.z * c.cos;
      const loy = o.y - c.y, ldy = d.y;
      let tmin = 0, tmax = maxT, nAxis = -1, nSign = 0;
      const slab = (oo, dd, h, axis) => {
        if (Math.abs(dd) < 1e-8) return oo >= -h && oo <= h;
        let t1 = (-h - oo) / dd, t2 = (h - oo) / dd;
        let s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; nAxis = axis; nSign = s; }
        if (t2 < tmax) tmax = t2;
        return tmin <= tmax;
      };
      if (!slab(lox, ldx, c.hx, 0) || !slab(loy, ldy, c.hy, 1) || !slab(loz, ldz, c.hz, 2)) return null;
      if (nAxis < 0) return null;
      let n;
      if (nAxis === 1) n = new THREE.Vector3(0, nSign, 0);
      else {
        const lx = nAxis === 0 ? nSign : 0, lz = nAxis === 2 ? nSign : 0;
        const [wx, wz] = this._toWorldDir(c, lx, lz);
        n = new THREE.Vector3(wx, 0, wz);
      }
      return { t: tmin, n };
    }
    // vertical cylinder
    const ox = o.x - c.x, oz = o.z - c.z;
    const a = d.x * d.x + d.z * d.z;
    let best = null;
    if (a > 1e-8) {
      const b = 2 * (ox * d.x + oz * d.z);
      const rm = c.taper ? (c.r0 + c.r1) / 2 : c.r;
      const cc = ox * ox + oz * oz - rm * rm;
      const disc = b * b - 4 * a * cc;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t >= 0 && t < maxT) {
          const y = o.y + d.y * t;
          if (y >= c.bottom && y <= c.top) best = { t, n: new THREE.Vector3(ox + d.x * t, 0, oz + d.z * t).normalize() };
        }
      }
    }
    // caps
    if (Math.abs(d.y) > 1e-6) {
      for (const [y, s] of [[c.top, 1], [c.bottom, -1]]) {
        const t = (y - o.y) / d.y;
        if (t < 0 || t > maxT || (best && t > best.t)) continue;
        const x = ox + d.x * t, z = oz + d.z * t;
        const rc = c.taper ? (s > 0 ? c.r1 : c.r0) : c.r;
        if (x * x + z * z <= rc * rc) best = { t, n: new THREE.Vector3(0, s, 0) };
      }
    }
    return best;
  }

  // Is a point inside any solid collider (used to validate placements).
  pointInside(x, y, z, pad = 0) {
    const list = this.query(x, z, 2, []);
    for (const c of list) {
      if (y < c.bottom - pad || y > c.top + pad) continue;
      if (this.topAt(c, x, z, pad) !== null) return c;
    }
    return null;
  }
}
