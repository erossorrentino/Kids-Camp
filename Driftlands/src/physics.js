import * as THREE from 'three';

const _v = new THREE.Vector3();

// Surfaces: island tops, ruin/box tops (island-local), ship deck + ship boxes (ship-local).
export class Physics {
  constructor(G) { this.G = G; this.lastWall = new THREE.Vector3(); }

  // Highest walkable surface whose height is <= y + tol at (x, z).
  groundAt(x, y, z, tol) {
    const G = this.G;
    let best = null;
    const lim = y + tol;
    for (const isl of G.islands.list) {
      const lx = x - isl.pos.x, lz = z - isl.pos.z;
      const R = isl.R * 1.35;
      if (lx > R || lx < -R || lz > R || lz < -R) continue;
      const u = isl.uAt(lx, lz);
      if (u < 1) {
        const h = isl.pos.y + isl.topHu(lx, lz, u);
        if (h <= lim && (!best || h > best.h) && h > y - 60) best = { h, plat: isl, kind: 'island' };
      }
      for (const b of isl.boxes) {
        if (lx > b.min.x && lx < b.max.x && lz > b.min.z && lz < b.max.z) {
          const h = isl.pos.y + b.max.y;
          if (h <= lim && (!best || h > best.h)) best = { h, plat: isl, kind: 'box' };
        }
      }
    }
    const ship = G.ship;
    if (ship) {
      _v.set(x, y, z);
      ship.root.worldToLocal(_v);
      const s = ship.surfaceAt(_v.x, _v.z, _v.y, tol);
      if (s !== null) {
        const h = ship.root.position.y + s;
        if (_v.y > s - 3 && (!best || h > best.h)) best = { h, plat: ship, kind: 'ship' };
      }
    }
    return best;
  }

  // Push a vertical capsule (radius r, height hgt, feet at pos) out of boxes. Returns wall normal or null.
  collideWalls(pos, r, hgt) {
    const G = this.G;
    let hit = null;
    for (const isl of G.islands.list) {
      const lx = pos.x - isl.pos.x, lz = pos.z - isl.pos.z;
      if (Math.abs(lx) > isl.R * 1.4 || Math.abs(lz) > isl.R * 1.4) continue;
      const ly = pos.y - isl.pos.y;
      for (const b of isl.boxes) {
        const n = this.pushOut(lx, ly, lz, r, hgt, b);
        if (n) { pos.x += n.x; pos.z += n.z; hit = this.lastWall.set(n.nx, 0, n.nz); }
      }
      // island rock volume (sides/underside)
      const u = isl.uAt(lx, lz);
      if (u < 1.02) {
        const top = isl.topHu(lx, lz, u);
        const under = isl.undersideAt(u);
        if (ly < top - 0.9 && ly + hgt > under) {
          // radial target for this height
          const yy = ly;
          let uEdge = 1;
          if (yy < -1.4) {
            const t = Math.min(1, Math.pow((-1.4 - yy) / isl.depth, 1 / 0.85));
            uEdge = Math.pow(1 - t, 1.25);
          }
          const rad = Math.hypot(lx, lz) || 0.001;
          const er = rad / Math.max(u, 0.001);
          const penR = (uEdge - u) * er + r;
          const penD = ly + hgt - under;
          if (penR > 0 && penR < penD + 0.5) {
            pos.x += (lx / rad) * penR; pos.z += (lz / rad) * penR;
            hit = this.lastWall.set(lx / rad, 0, lz / rad);
          } else if (penD > 0) {
            pos.y -= penD;
            if (G.player && G.player.pos === pos && G.player.vel.y > 0) G.player.vel.y = 0;
          }
        }
      }
    }
    const ship = G.ship;
    if (ship) {
      _v.copy(pos); ship.root.worldToLocal(_v);
      if (Math.abs(_v.x) < 14 && Math.abs(_v.z) < 16) {
        for (const b of ship.boxes) {
          const n = this.pushOut(_v.x, _v.y, _v.z, r, hgt, b);
          if (n) {
            _v.x += n.x; _v.z += n.z;
            const w = ship.root.localToWorld(_v.clone());
            pos.x = w.x; pos.z = w.z;
            const nn = new THREE.Vector3(n.nx, 0, n.nz).applyQuaternion(ship.root.quaternion);
            hit = this.lastWall.copy(nn);
          }
        }
      }
    }
    return hit;
  }

  pushOut(x, y, z, r, hgt, b) {
    if (y + hgt <= b.min.y || y >= b.max.y - 0.35) return null;
    const cx = Math.max(b.min.x, Math.min(x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(z, b.max.z));
    let dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) return null;
    if (d2 < 1e-8) {
      // centre inside the box: push along the shallowest axis
      const px1 = x - b.min.x, px2 = b.max.x - x, pz1 = z - b.min.z, pz2 = b.max.z - z;
      const m = Math.min(px1, px2, pz1, pz2);
      if (m === px1) return { x: -(px1 + r), z: 0, nx: -1, nz: 0 };
      if (m === px2) return { x: px2 + r, z: 0, nx: 1, nz: 0 };
      if (m === pz1) return { x: 0, z: -(pz1 + r), nx: 0, nz: -1 };
      return { x: 0, z: pz2 + r, nx: 0, nz: 1 };
    }
    const d = Math.sqrt(d2);
    const push = r - d;
    dx /= d; dz /= d;
    return { x: dx * push, z: dz * push, nx: dx, nz: dz };
  }
}
