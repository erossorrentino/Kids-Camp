/**
 * ARENA GENERATION
 * ------------------------------------------------------------------
 * Builds a playable map from a (seed, layout, biome) triple. Everything
 * is deterministic: the same map id always produces the same geometry,
 * so players can genuinely learn a layout.
 *
 * The world exposes three things the simulation needs:
 *   colliders   axis-aligned boxes, bucketed into a uniform grid
 *   heightAt()  ground height sampling for walking and spawning
 *   spawns      per-team spawn rings, plus objective zones
 *
 * Rendering-side, static geometry is merged per material and drawn as a
 * handful of meshes rather than hundreds, which keeps draw calls flat no
 * matter how dense a map is.
 */
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, clamp, lerp } from '../core/rng.js';
import { BIOMES } from '../data/maps.js';
import { surface } from './textures.js';

const CELL = 32; // spatial-hash cell size in metres

class Collider {
  constructor(min, max, kind = 'solid', meta = null) {
    this.min = min; this.max = max; this.kind = kind; this.meta = meta;
    this.destructible = kind === 'destructible';
    this.hp = meta?.hp || 0;
    this.alive = true;
  }
  contains(p, r = 0) {
    return p.x > this.min.x - r && p.x < this.max.x + r &&
           p.z > this.min.z - r && p.z < this.max.z + r &&
           p.y > this.min.y - r && p.y < this.max.y + r;
  }
}

export class Arena {
  constructor(mapDef, quality) {
    this.def = mapDef;
    this.biome = BIOMES[mapDef.biome];
    this.size = mapDef.size;
    this.half = mapDef.size / 2;
    this.rng = makeRng(mapDef.seed);
    this.gravity = (mapDef.gravity || 1) * 26;
    this.quality = quality;

    this.group = new THREE.Group();
    this.colliders = [];
    this.grid = new Map();
    this.spawns = { a: [], b: [], ffa: [] };
    this.zones = [];
    this.heightField = null;
    this.hazards = [];
    this.barriers = [];
    this.smokes = [];
    this.lights = [];
    this.decor = [];
    this.deckCenters = [];
    this.spawnHint = null;
    // Foundry layouts are roofed, so the directional sun cannot reach the
    // floor; the renderer needs to know to lean on ambient instead.
    this.interior = mapDef.layout === 'foundry';

    this._materials();
    this._buildGround();
    this._buildLayout();
    this._buildBoundary();
    this._placeSpawns();
    this._placeZones();
    this._indexColliders();
  }

  /* ------------------------------------------------------------------ */
  _materials() {
    const b = this.biome;
    const seed = this.def.seed;
    // Ground styling follows the biome so sand ripples, cracked rock and
    // plated decking each read as the right material underfoot.
    const groundStyle = { dunes:'sand', desert:'sand', arctic:'sand', orbital:'metal', platform:'metal' }[this.def.layout]
      || { desert:'sand', arctic:'sand', orbital:'metal', underwater:'sand' }[this.def.biome]
      || 'rock';

    const g = surface('ground', b.ground, { seed, repeat: 26, style: groundStyle, normalStrength: 2.6 });
    const c = surface('concrete', mixHex(b.ground, 0xffffff, 0.26), { seed: seed + 11, repeat: 1 });
    const m = surface('metal', mixHex(b.ground, 0x8899aa, 0.55), { seed: seed + 23, repeat: 1 });
    const dk = surface('metal', mixHex(b.ground, 0x000000, 0.6), { seed: seed + 37, repeat: 1 });

    this.mat = {
      ground: new THREE.MeshStandardMaterial({ ...g, roughness: 1.0, metalness: 0.04, envMapIntensity: 0.5 }),
      concrete: new THREE.MeshStandardMaterial({ ...c, roughness: 1.0, metalness: 0.06, envMapIntensity: 0.6 }),
      metal: new THREE.MeshStandardMaterial({ ...m, roughness: 1.0, metalness: 0.78, envMapIntensity: 1.0 }),
      dark: new THREE.MeshStandardMaterial({ ...dk, roughness: 1.0, metalness: 0.42, envMapIntensity: 0.8 }),
      accent: new THREE.MeshStandardMaterial({ color: b.accent, emissive: b.accent, emissiveIntensity: 1.7, roughness: 0.4 }),
      hazard: new THREE.MeshStandardMaterial({ color: 0xff5a2d, emissive: 0xff3a10, emissiveIntensity: 2.6, roughness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 1, roughness: 0.12, transparent: true, opacity: 0.55 }),
    };
    this.mat.window = new THREE.MeshBasicMaterial({ color: mixHex(b.accent, 0xffe6b0, 0.55), fog: true });
    this.mat.windowWarm = new THREE.MeshBasicMaterial({ color: 0xffc98a, fog: true });
    this._buckets = { concrete: [], metal: [], dark: [], accent: [], hazard: [], glass: [], window: [], windowWarm: [] };
  }

  _emit(bucket, geo, pos, rot, scale) {
    const g = geo.clone();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot?.[0] || 0, rot?.[1] || 0, rot?.[2] || 0));
    m.compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]), q,
      new THREE.Vector3(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1),
    );
    g.applyMatrix4(m);
    boxMapUVs(g);
    this._buckets[bucket].push(g);
  }

  _flush() {
    for (const [name, geos] of Object.entries(this._buckets)) {
      if (!geos.length) continue;
      const merged = BGU.mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.mat[name]);
      mesh.castShadow = name !== 'hazard' && !name.startsWith('window');
      mesh.receiveShadow = true;
      mesh.name = 'static_' + name;
      this.group.add(mesh);
      this._buckets[name] = [];
    }
  }

  /* ------------------------------------------------------------------ */
  _buildGround() {
    const res = 64;
    const size = this.size * 1.6;
    const geo = new THREE.PlaneGeometry(size, size, res, res);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const rng = this.rng;
    const amp = this.def.layout === 'dunes' ? 9 : this.def.layout === 'platform' ? 0 : 3.2;
    const phases = Array.from({ length: 4 }, () => ({
      fx: rng.range(0.004, 0.02), fz: rng.range(0.004, 0.02),
      px: rng.range(0, 7), pz: rng.range(0, 7), a: rng.range(0.4, 1),
    }));
    const H = (x, z) => {
      let h = 0;
      for (const p of phases) h += Math.sin(x * p.fx + p.px) * Math.cos(z * p.fz + p.pz) * p.a;
      return h * amp;
    };
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, H(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, this.mat.ground);
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);
    this._heightFn = H;
    this.hasFloor = this.def.layout !== 'platform';
    if (!this.hasFloor) {
      ground.position.y = -140;              // a visible floor far below the decks
      this.voidLevel = -60;
    } else {
      this.voidLevel = -400;
    }
  }

  heightAt(x, z) {
    if (!this.hasFloor) {
      // Platform maps: the "ground" is whatever deck is under you.
      const deck = this.deckAt(x, z);
      return deck != null ? deck : this.voidLevel - 200;
    }
    return this._heightFn(x, z);
  }

  deckAt(x, z) {
    let best = null;
    for (const c of this.queryPoint(x, z)) {
      if (c.kind === 'deck' && x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z) {
        if (best == null || c.max.y > best) best = c.max.y;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  _addBox(cx, cy, cz, w, h, d, bucket = 'concrete', kind = 'solid', meta = null) {
    const c = new Collider(
      new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
      new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2),
      kind, meta,
    );
    this.colliders.push(c);
    this._emit(bucket, boxGeo(w, h, d), [cx, cy, cz]);
    return c;
  }

  _buildLayout() {
    const L = this.def.layout;
    const fn = {
      grid: this._layoutGrid, canyon: this._layoutCanyon, basin: this._layoutBasin,
      spires: this._layoutSpires, ruins: this._layoutRuins, platform: this._layoutPlatform,
      foundry: this._layoutFoundry, dunes: this._layoutDunes,
    }[L] || this._layoutRuins;
    fn.call(this);
    this._scatterDetail();
    this._flush();
  }

  /* ---- layouts ---- */

  _layoutGrid() {
    const rng = this.rng;
    const blocks = Math.round(lerp(4, 7, this.def.density));
    const step = this.size / blocks;
    const road = step * 0.38;
    for (let i = 0; i < blocks; i++) {
      for (let j = 0; j < blocks; j++) {
        if (rng.chance(0.14)) continue;   // plazas and gaps keep it from being a pure grid
        const cx = -this.half + step * (i + 0.5);
        const cz = -this.half + step * (j + 0.5);
        const w = step - road, d = step - road;
        const tall = rng.chance(0.42 * this.def.verticality + 0.1);
        const h = tall ? rng.range(26, 54) * this.def.verticality + 14 : rng.range(9, 20);
        const y = this.heightAt(cx, cz);
        this._addBox(cx, y + h / 2, cz, w * rng.range(0.66, 0.94), h, d * rng.range(0.66, 0.94), 'concrete');
        // Stepped upper storeys give jump-jet users a route to the roof.
        if (tall && rng.chance(0.6)) {
          const h2 = h * rng.range(0.3, 0.55);
          this._addBox(cx + rng.range(-4, 4), y + h + h2 / 2, cz + rng.range(-4, 4), w * 0.45, h2, d * 0.45, 'metal');
        }
        if (rng.chance(0.5)) this._ramp(cx, y, cz, step * 0.5, rng);
        if (this.biome.night) this._windows(cx, y, cz, w * rng.range(0.66, 0.94), h, d * rng.range(0.66, 0.94), rng);
      }
    }
  }

  _layoutCanyon() {
    const rng = this.rng;
    const wallH = 34 * (0.6 + this.def.verticality);
    const trench = this.size * 0.28;
    // Fighting happens in the trench, so that is where everyone starts.
    this.spawnHint = 'axis-z';
    this.trenchHalfWidth = trench / 2;
    for (const side of [-1, 1]) {
      let z = -this.half;
      while (z < this.half) {
        const seg = rng.range(28, 62);
        const inset = trench / 2 + rng.range(0, 26);
        const h = wallH * rng.range(0.7, 1.3);
        const cx = side * inset + side * h * 0.1;
        const y = this.heightAt(cx, z);
        // A continuous wall would make the flanks unreachable; breaches turn
        // them into the flanking routes the layout is supposed to have.
        if (rng.chance(0.18)) {
          this._addBox(cx + side * 24, y + h * 0.78, z + seg / 2, 48, h * 0.44, seg, 'concrete');
          z += seg;
          continue;
        }
        this._addBox(cx + side * 24, y + h / 2, z + seg / 2, 48, h, seg, 'concrete');
        // Ledges above the trench: the whole point of a canyon map.
        if (rng.chance(0.55)) {
          const lh = h * rng.range(0.4, 0.75);
          this._addBox(side * (inset - 6), y + lh, z + seg / 2, 16, 2.4, seg * 0.8, 'metal', 'deck');
        }
        z += seg;
      }
    }
    // Cross-bridges make the trench survivable.
    for (let i = 0; i < 4; i++) {
      const z = rng.range(-this.half * 0.8, this.half * 0.8);
      const y = this.heightAt(0, z) + rng.range(14, 26);
      this._addBox(0, y, z, trench + 40, 2.2, rng.range(12, 22), 'metal', 'deck');
    }
    // Cover in the trench floor.
    for (let i = 0; i < 26 * this.def.density + 8; i++) {
      const x = rng.range(-trench / 2, trench / 2);
      const z = rng.range(-this.half, this.half);
      const h = rng.range(5, 12);
      this._addBox(x, this.heightAt(x, z) + h / 2, z, rng.range(5, 12), h, rng.range(5, 12), 'dark');
    }
  }

  _layoutBasin() {
    const rng = this.rng;
    const ringR = this.half * 0.72;
    const segs = 26;
    for (let i = 0; i < segs; i++) {
      if (rng.chance(0.18)) continue;   // gaps become the approach lanes
      const a = (i / segs) * Math.PI * 2;
      const r = ringR * rng.range(0.94, 1.08);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = rng.range(16, 30) * (0.6 + this.def.verticality);
      const y = this.heightAt(x, z);
      this._addBox(x, y + h / 2, z, 34, h, 34, 'concrete');
      // Terrace on the inner face -- the high ground everyone fights for.
      const ir = r - 22;
      this._addBox(Math.cos(a) * ir, y + h * 0.62, Math.sin(a) * ir, 18, 2.4, 22, 'metal', 'deck');
    }
    // Central structure.
    const ch = rng.range(14, 22);
    this._addBox(0, this.heightAt(0, 0) + ch / 2, 0, 34, ch, 34, 'metal');
    this._addBox(0, this.heightAt(0, 0) + ch + 1.2, 0, 46, 2.4, 46, 'metal', 'deck');
    for (let i = 0; i < 30 * this.def.density; i++) {
      const a = rng.range(0, 7), r = rng.range(40, ringR * 0.9);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = rng.range(4, 11);
      this._addBox(x, this.heightAt(x, z) + h / 2, z, rng.range(6, 14), h, rng.range(6, 14), 'dark');
    }
  }

  _layoutSpires() {
    const rng = this.rng;
    const n = Math.round(lerp(14, 26, this.def.density));
    const towers = [];
    for (let i = 0; i < n; i++) {
      let x, z, tries = 0;
      do {
        x = rng.range(-this.half * 0.85, this.half * 0.85);
        z = rng.range(-this.half * 0.85, this.half * 0.85);
        tries++;
      } while (tries < 24 && towers.some(t => Math.hypot(t.x - x, t.z - z) < 52));
      const h = rng.range(30, 74) * (0.5 + this.def.verticality);
      const w = rng.range(14, 26);
      const y = this.heightAt(x, z);
      this._addBox(x, y + h / 2, z, w, h, w, 'concrete');
      this._addBox(x, y + h + 1.2, z, w * 1.7, 2.4, w * 1.7, 'metal', 'deck');
      towers.push({ x, z, y: y + h, w });
      // Mid-height perch.
      if (rng.chance(0.5)) {
        this._addBox(x + w * rng.sign(), y + h * rng.range(0.4, 0.7), z, w * 1.3, 2, w * 0.7, 'metal', 'deck');
      }
    }
    // Sky bridges between nearby towers.
    for (let i = 0; i < towers.length; i++) {
      for (let j = i + 1; j < towers.length; j++) {
        const A = towers[i], B = towers[j];
        const d = Math.hypot(A.x - B.x, A.z - B.z);
        if (d > 86 || d < 30 || !rng.chance(0.42)) continue;
        const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, my = Math.min(A.y, B.y);
        const ang = Math.atan2(B.z - A.z, B.x - A.x);
        this._bridge(mx, my, mz, d, ang);
      }
    }
    for (let i = 0; i < 24 * this.def.density; i++) {
      const x = rng.range(-this.half, this.half), z = rng.range(-this.half, this.half);
      const h = rng.range(4, 9);
      this._addBox(x, this.heightAt(x, z) + h / 2, z, rng.range(6, 13), h, rng.range(6, 13), 'dark');
    }
  }

  _bridge(x, y, z, len, ang) {
    const c = new Collider(
      new THREE.Vector3(x - len / 2, y - 1.2, z - 5),
      new THREE.Vector3(x + len / 2, y + 1.2, z + 5),
      'deck',
    );
    // Rotate the collider's footprint conservatively: use the AABB of the
    // rotated span so walking on a diagonal bridge still feels solid.
    const hw = Math.abs(Math.cos(ang)) * len / 2 + Math.abs(Math.sin(ang)) * 5;
    const hd = Math.abs(Math.sin(ang)) * len / 2 + Math.abs(Math.cos(ang)) * 5;
    c.min.set(x - hw, y - 1.2, z - hd);
    c.max.set(x + hw, y + 1.2, z + hd);
    this.colliders.push(c);
    this._emit('metal', boxGeo(len, 1.6, 9), [x, y, z], [0, -ang, 0]);
    for (const s of [-1, 1]) {
      this._emit('metal', boxGeo(len, 2.6, 0.5), [x + Math.sin(ang) * s * 4.4, y + 2, z + Math.cos(ang) * s * 4.4], [0, -ang, 0]);
    }
  }

  _layoutRuins() {
    const rng = this.rng;
    const n = Math.round(lerp(40, 90, this.def.density));
    for (let i = 0; i < n; i++) {
      const x = rng.range(-this.half * 0.92, this.half * 0.92);
      const z = rng.range(-this.half * 0.92, this.half * 0.92);
      const y = this.heightAt(x, z);
      const kind = rng();
      if (kind < 0.34) {
        // Broken wall sections.
        const len = rng.range(14, 40), h = rng.range(7, 17), th = rng.range(2.4, 4.5);
        const ang = rng.chance(0.5) ? 0 : Math.PI / 2;
        const w = ang ? th : len, d = ang ? len : th;
        this._addBox(x, y + h / 2, z, w, h, d, 'concrete');
      } else if (kind < 0.6) {
        // Half-collapsed buildings: a shell with a climbable stub.
        const w = rng.range(16, 30), h = rng.range(10, 22);
        this._addBox(x, y + h / 2, z, w, h, w * rng.range(0.6, 1), 'concrete');
        this._addBox(x + w * 0.4, y + h * 1.2, z, w * 0.4, h * 0.5, w * 0.4, 'dark');
      } else if (kind < 0.82) {
        const h = rng.range(4, 9);
        this._addBox(x, y + h / 2, z, rng.range(6, 14), h, rng.range(6, 14), 'dark');
      } else {
        // Mech wrecks -- destructible cover that tells a story.
        this._wreck(x, y, z, rng);
      }
    }
  }

  _wreck(x, y, z, rng) {
    const s = rng.range(0.8, 1.5);
    const ang = rng.range(0, 7);
    this._addBox(x, y + 2.4 * s, z, 7 * s, 5 * s, 4 * s, 'dark', 'destructible', { hp: 900 });
    this._emit('dark', boxGeo(2.2 * s, 7 * s, 2.2 * s), [x + 4 * s, y + 1.4 * s, z + 2 * s], [0.4, ang, 1.2]);
    this._emit('metal', boxGeo(1.6 * s, 5 * s, 1.6 * s), [x - 3.6 * s, y + 0.9 * s, z - 1.6 * s], [1.4, ang, 0.2]);
  }

  _layoutPlatform() {
    const rng = this.rng;
    const decks = Math.round(lerp(10, 18, this.def.density));
    const placed = [];
    // A guaranteed central deck so matches always have a contested middle.
    this._deck(0, 0, 0, 68, 68, rng);
    placed.push({ x: 0, z: 0, r: 48 });
    for (let i = 0; i < decks; i++) {
      let x, z, tries = 0;
      do {
        const a = rng.range(0, 7);
        const r = rng.range(60, this.half * 0.86);
        x = Math.cos(a) * r; z = Math.sin(a) * r;
        tries++;
      } while (tries < 30 && placed.some(p => Math.hypot(p.x - x, p.z - z) < 62));
      const w = rng.range(34, 66), d = rng.range(34, 66);
      const y = rng.range(-6, 26) * this.def.verticality;
      this._deck(x, y, z, w, d, rng);
      placed.push({ x, z, r: Math.max(w, d) / 2 });
    }
    // Catwalks stitching the decks together.
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const A = placed[i], B = placed[j];
        const dd = Math.hypot(A.x - B.x, A.z - B.z);
        if (dd > 110 || !rng.chance(0.45)) continue;
        const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
        this._bridge(mx, this.deckAt(A.x, A.z) ?? 0, mz, dd, Math.atan2(B.z - A.z, B.x - A.x));
      }
    }
  }

  _deck(x, y, z, w, d, rng) {
    this.deckCenters.push(new THREE.Vector3(x, y + 1.4, z));
    const c = new Collider(
      new THREE.Vector3(x - w / 2, y - 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + 1.4, z + d / 2),
      'deck',
    );
    this.colliders.push(c);
    this._emit('metal', boxGeo(w, 3, d), [x, y, z]);
    this._emit('dark', boxGeo(w * 0.9, 1.2, d * 0.9), [x, y - 2.2, z]);
    // Support pylon so decks do not look like they float.
    this._emit('dark', boxGeo(w * 0.12, 90, d * 0.12), [x, y - 46, z]);
    // Railings and a couple of crates for cover.
    for (const [sx, sz, rw, rd] of [[0, d / 2, w, 0.5], [0, -d / 2, w, 0.5], [w / 2, 0, 0.5, d], [-w / 2, 0, 0.5, d]]) {
      if (rng.chance(0.35)) continue;   // gaps are how you fall off
      this._emit('metal', boxGeo(rw, 2.6, rd), [x + sx, y + 2.6, z + sz]);
    }
    for (let i = 0; i < rng.int(1, 4); i++) {
      const h = rng.range(4, 8);
      this._addBox(x + rng.range(-w * 0.35, w * 0.35), y + 1.4 + h / 2, z + rng.range(-d * 0.35, d * 0.35),
                   rng.range(5, 10), h, rng.range(5, 10), 'dark');
    }
  }

  _layoutFoundry() {
    const rng = this.rng;
    // Interior map: a roof, thick pillars, catwalk level.
    const roofY = 46;
    this._emit('dark', boxGeo(this.size * 1.2, 3, this.size * 1.2), [0, roofY, 0]);
    const pillars = Math.round(lerp(18, 34, this.def.density));
    const grid = Math.ceil(Math.sqrt(pillars));
    const step = this.size * 0.9 / grid;
    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        if (rng.chance(0.2)) continue;
        const x = -this.size * 0.45 + step * (i + 0.5) + rng.range(-5, 5);
        const z = -this.size * 0.45 + step * (j + 0.5) + rng.range(-5, 5);
        const y = this.heightAt(x, z);
        const w = rng.range(7, 13);
        this._addBox(x, y + roofY / 2, z, w, roofY, w, 'concrete');
        if (rng.chance(0.5)) {
          this._addBox(x, y + rng.range(16, 26), z, w * 2.6, 2, w * 1.6, 'metal', 'deck');
        }
        if (this.def.hazard === 'heat' && rng.chance(0.3)) {
          this._hazardPool(x + rng.range(-step * 0.3, step * 0.3), y, z + rng.range(-step * 0.3, step * 0.3), rng.range(7, 16));
        }
      }
    }
    // Work lights hanging from the roof: a foundry has no sun.
    const lamps = Math.min(10, Math.round(6 + this.def.density * 5));
    for (let i = 0; i < lamps; i++) {
      const a = (i / lamps) * Math.PI * 2;
      const r = i === 0 ? 0 : this.half * (0.3 + (i % 3) * 0.22);
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      const light = new THREE.PointLight(0xffd9a8, 900, this.half * 0.95, 2);
      light.position.set(lx, roofY - 6, lz);
      this.group.add(light);
      this.lights.push(light);
      this._emit('accent', boxGeo(4, 0.5, 4), [lx, roofY - 4, lz]);
    }

    // Machinery clutter.
    for (let i = 0; i < 40 * this.def.density; i++) {
      const x = rng.range(-this.half * 0.9, this.half * 0.9), z = rng.range(-this.half * 0.9, this.half * 0.9);
      const h = rng.range(4, 12);
      this._addBox(x, this.heightAt(x, z) + h / 2, z, rng.range(5, 14), h, rng.range(5, 14),
                   rng.chance(0.5) ? 'metal' : 'dark');
    }
  }

  _layoutDunes() {
    const rng = this.rng;
    const n = Math.round(lerp(18, 40, this.def.density));
    for (let i = 0; i < n; i++) {
      const x = rng.range(-this.half * 0.9, this.half * 0.9);
      const z = rng.range(-this.half * 0.9, this.half * 0.9);
      const y = this.heightAt(x, z);
      if (rng.chance(0.45)) {
        const h = rng.range(9, 20);
        this._addBox(x, y + h / 2, z, rng.range(16, 34), h, rng.range(16, 34), 'concrete');
      } else {
        const h = rng.range(4, 8);
        this._addBox(x, y + h / 2, z, rng.range(7, 16), h, rng.range(7, 16), 'dark');
      }
    }
    // A single tall landmark stops open maps feeling directionless.
    const h = 58;
    this._addBox(0, this.heightAt(0, 0) + h / 2, 0, 18, h, 18, 'metal');
    this._addBox(0, this.heightAt(0, 0) + h + 1.2, 0, 34, 2.4, 34, 'metal', 'deck');
  }

  /**
   * Lit windows on a building face. Emissive, unlit quads cost nothing and
   * are most of what makes a night city look inhabited rather than modelled.
   */
  _windows(cx, y, cz, w, h, d, rng) {
    if (h < 10) return;
    const rows = Math.max(1, Math.floor(h / 5.5));
    const cols = Math.max(1, Math.floor(w / 5.5));
    for (const [nx, nz, sw, sd] of [[0, 1, w, 0], [0, -1, w, 0], [1, 0, 0, d], [-1, 0, 0, d]]) {
      if (rng.chance(0.25)) continue;
      const faceW = sw || sd;
      const n = Math.max(1, Math.floor(faceW / 5.5));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < n; c++) {
          if (!rng.chance(0.42)) continue;
          const ox = nx !== 0 ? nx * (w / 2 + 0.12) : (c / (n - 1 || 1) - 0.5) * w * 0.86;
          const oz = nz !== 0 ? nz * (d / 2 + 0.12) : (c / (n - 1 || 1) - 0.5) * d * 0.86;
          const oy = y + 3 + (r + 0.5) * (h / rows) * 0.92;
          // A few dead windows and a mix of sizes stop the facade looking stamped.
          const ww = rng.range(1.4, 2.2), wh = rng.range(0.9, 1.5);
          this._emit(rng.chance(0.22) ? 'windowWarm' : 'window',
            boxGeo(nx !== 0 ? 0.18 : ww, wh, nz !== 0 ? 0.18 : ww), [cx + ox, oy, cz + oz]);
        }
      }
    }
  }

  _ramp(cx, y, cz, len, rng) {
    const ang = rng.range(0, 7);
    const x = cx + Math.cos(ang) * len * 0.7;
    const z = cz + Math.sin(ang) * len * 0.7;
    const h = rng.range(5, 11);
    // Stepped blocks: cheap, collidable, and a mech can walk them.
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const sh = h * (i + 1) / steps;
      this._addBox(x + Math.cos(ang) * i * 4, y + sh / 2, z + Math.sin(ang) * i * 4, 9, sh, 9, 'dark');
    }
  }

  _hazardPool(x, y, z, r) {
    const geo = new THREE.CircleGeometry(r, 18);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, this.mat.hazard);
    m.position.set(x, y + 0.12, z);
    this.group.add(m);
    this.hazards.push({ x, z, r, y, type: 'heat', heat: 26 });
    const light = new THREE.PointLight(0xff5a2d, 14, r * 5, 2);
    light.position.set(x, y + 3, z);
    this.group.add(light);
    this.lights.push(light);
  }

  _scatterDetail() {
    const rng = this.rng;
    // Pipes, antennas, crates: no collision, pure silhouette interest.
    const n = Math.round(90 * (this.quality?.particles ?? 1));
    for (let i = 0; i < n; i++) {
      const x = rng.range(-this.half, this.half), z = rng.range(-this.half, this.half);
      const y = this.heightAt(x, z);
      const t = rng();
      if (t < 0.4) this._emit('metal', boxGeo(0.7, rng.range(4, 14), 0.7), [x, y + 6, z], [rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2)]);
      else if (t < 0.7) this._emit('dark', boxGeo(rng.range(2, 4), rng.range(2, 3), rng.range(2, 4)), [x, y + 1.2, z], [0, rng.range(0, 7), 0]);
      else this._emit('metal', boxGeo(rng.range(8, 22), 0.9, 0.9), [x, y + rng.range(8, 24), z], [0, rng.range(0, 7), 0]);
    }
  }

  _buildBoundary() {
    const h = 90, t = 8, s = this.size + t;
    for (const [dx, dz, w, d] of [[0, this.half, s, t], [0, -this.half, s, t], [this.half, 0, t, s], [-this.half, 0, t, s]]) {
      const c = new Collider(
        new THREE.Vector3(dx - w / 2, -60, dz - d / 2),
        new THREE.Vector3(dx + w / 2, h, dz + d / 2), 'wall',
      );
      this.colliders.push(c);
    }
    // Boundary shell. A flat translucent box would tint the whole arena, so
    // it only becomes visible as you approach it -- which is also exactly
    // the feedback a player wants from an out-of-bounds marker.
    const geo = new THREE.BoxGeometry(this.size, h, this.size);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(this.biome.accent) },
        uCam: { value: new THREE.Vector3() },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main(){
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor, uCam;
        uniform float uTime;
        varying vec3 vWorld;
        void main(){
          float d = distance(vWorld.xz, uCam.xz);
          float near = 1.0 - smoothstep(0.0, 70.0, d);
          // A slow horizontal scan so the wall reads as a projected field.
          float grid = step(0.86, fract(vWorld.y * 0.09 + uTime * 0.15))
                     + step(0.93, fract((vWorld.x + vWorld.z) * 0.06));
          float a = near * (0.10 + grid * 0.18);
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true, side: THREE.BackSide, depthWrite: false,
    });
    const shell = new THREE.Mesh(geo, mat);
    shell.position.y = h / 2 - 20;
    this.group.add(shell);
    this._shell = shell;
  }

  /**
   * Ground height at a point, or null when there is nothing to stand on --
   * which is the normal case over the gaps in a platform map.
   */
  standableAt(x, z) {
    if (Math.abs(x) > this.half - 8 || Math.abs(z) > this.half - 8) return null;
    const y = this.safeGround(x, z);
    return y > this.voidLevel + 1 ? y : null;
  }

  /**
   * Horizontal room around a point, up to `want` metres. Spawning a mech in
   * a one-metre alley technically works and is miserable to play, so spawn
   * selection prefers points with space to turn around in.
   */
  clearanceAt(x, z, y, want = 10) {
    let worst = want;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dir = _v3.set(Math.cos(a), 0, Math.sin(a));
      const hit = this.raycast(_v4.set(x, y + 4, z), dir, want);
      if (hit) worst = Math.min(worst, hit.t);
    }
    return worst;
  }

  /** Spiral outward from a point until we find somewhere legal to stand. */
  findStandable(x, z, maxRadius = 90, minClearance = 0) {
    const direct = this.standableAt(x, z);
    if (direct != null && (!minClearance || this.clearanceAt(x, z, direct, minClearance) >= minClearance)) {
      return new THREE.Vector3(x, direct, z);
    }
    let fallback = direct != null ? new THREE.Vector3(x, direct, z) : null;
    let best = null, bestClear = -1;
    for (let r = 8; r <= maxRadius; r += 8) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + r * 0.31;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const y = this.standableAt(px, pz);
        if (y == null) continue;
        if (!minClearance) return new THREE.Vector3(px, y, pz);
        const c = this.clearanceAt(px, pz, y, minClearance);
        if (c >= minClearance) return new THREE.Vector3(px, y, pz);
        if (c > bestClear) { bestClear = c; best = new THREE.Vector3(px, y, pz); }
      }
    }
    if (best) return best;
    if (fallback) return fallback;
    // Last resort: the centre of a deck, or the middle of the map.
    if (this.deckCenters.length) return this.deckCenters[0].clone();
    return new THREE.Vector3(0, this.safeGround(0, 0), 0);
  }

  _placeSpawns() {
    const rng = this.rng;
    const R = this.half * 0.78;
    const mk = (angle) => {
      const p = this.findStandable(Math.cos(angle) * R, Math.sin(angle) * R, 90, 11);
      return p.setY(p.y + 1);
    };
    const baseAngle = rng.range(0, Math.PI * 2);

    if (this.spawnHint === 'axis-z') {
      // Canyon maps: the two ends of the trench, facing each other down it.
      const w = (this.trenchHalfWidth || this.size * 0.14) * 0.7;
      const mkEnd = (sign) => {
        const x = rng.range(-w, w);
        const z = sign * this.half * 0.82;
        const p = this.findStandable(x, z, 90, 11);
        return p.setY(p.y + 1);
      };
      for (let i = 0; i < 6; i++) this.spawns.a.push(mkEnd(-1));
      for (let i = 0; i < 6; i++) this.spawns.b.push(mkEnd(1));
      for (let i = 0; i < 12; i++) {
        const x = rng.range(-w, w);
        const z = rng.range(-this.half * 0.85, this.half * 0.85);
        const p = this.findStandable(x, z, 90, 11);
        this.spawns.ffa.push(p.setY(p.y + 1));
      }
      return;
    }

    if (!this.hasFloor && this.deckCenters.length >= 4) {
      // Platform maps: spawn on the decks furthest from the centre, split
      // into two arcs so the teams start opposite one another.
      const sorted = [...this.deckCenters]
        .map(p => ({ p, a: Math.atan2(p.z, p.x), r: Math.hypot(p.x, p.z) }))
        .filter(d => d.r > 30)
        .sort((x, y) => x.a - y.a);
      const half = Math.max(1, Math.floor(sorted.length / 2));
      const take = (list, n) => Array.from({ length: n }, (_, i) => {
        const d = list[i % list.length];
        return new THREE.Vector3(d.p.x + rng.range(-6, 6), d.p.y + 1, d.p.z + rng.range(-6, 6));
      });
      this.spawns.a = take(sorted.slice(0, half), 6);
      this.spawns.b = take(sorted.slice(half), 6);
      this.spawns.ffa = take(sorted, 12);
      return;
    }

    for (let i = 0; i < 6; i++) this.spawns.a.push(mk(baseAngle + (i - 2.5) * 0.14));
    for (let i = 0; i < 6; i++) this.spawns.b.push(mk(baseAngle + Math.PI + (i - 2.5) * 0.14));
    for (let i = 0; i < 12; i++) this.spawns.ffa.push(mk(baseAngle + (i / 12) * Math.PI * 2));
  }

  /** Ground height that is guaranteed not to be inside a building. */
  safeGround(x, z) {
    let y = this.heightAt(x, z);
    for (const c of this.queryPoint(x, z)) {
      if (c.kind === 'wall') continue;
      if (x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z) y = Math.max(y, c.max.y);
    }
    return y;
  }

  _placeZones() {
    const rng = this.rng;
    const R = this.half * 0.45;
    const a0 = rng.range(0, 7);
    const names = ['ALPHA', 'BRAVO', 'CHARLIE'];
    for (let i = 0; i < 3; i++) {
      const a = a0 + (i / 3) * Math.PI * 2;
      const wx = i === 0 ? 0 : Math.cos(a) * R;
      const wz = i === 0 ? 0 : Math.sin(a) * R;
      const p = this.findStandable(wx, wz, 110, 16);
      this.zones.push({
        id: i, name: names[i],
        pos: p,
        radius: 26, owner: null, progress: 0, contested: false,
      });
    }
    this._zoneMeshes = this.zones.map(z => {
      const g = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(z.radius - 1.4, z.radius, 48);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
      }));
      ring.position.copy(z.pos).setY(z.pos.y + 0.4);
      g.add(ring);
      const pillarGeo = new THREE.CylinderGeometry(z.radius * 0.9, z.radius * 0.9, 34, 28, 1, true);
      const pillar = new THREE.Mesh(pillarGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false,
      }));
      pillar.position.copy(z.pos).setY(z.pos.y + 17);
      g.add(pillar);
      g.visible = false;
      this.group.add(g);
      return { group: g, ring, pillar };
    });
  }

  setZonesVisible(v) { this._zoneMeshes.forEach(m => { m.group.visible = v; }); }

  updateZoneVisual(i, color, progress) {
    const m = this._zoneMeshes[i];
    if (!m) return;
    m.ring.material.color.setHex(color);
    m.pillar.material.color.setHex(color);
    m.ring.material.opacity = 0.32 + progress * 0.5;
    m.pillar.material.opacity = 0.05 + progress * 0.13;
  }

  /* ------------------------------------------------------------------ */
  _indexColliders() {
    this.grid.clear();
    for (const c of this.colliders) {
      const x0 = Math.floor(c.min.x / CELL), x1 = Math.floor(c.max.x / CELL);
      const z0 = Math.floor(c.min.z / CELL), z1 = Math.floor(c.max.z / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const k = x + ',' + z;
          let arr = this.grid.get(k);
          if (!arr) { arr = []; this.grid.set(k, arr); }
          arr.push(c);
        }
      }
    }
  }

  queryPoint(x, z) {
    return this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || EMPTY;
  }

  /** All colliders whose cells overlap the given AABB footprint. */
  queryBox(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    const seen = _seen;
    seen.clear();
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const arr = this.grid.get(x + ',' + z);
        if (!arr) continue;
        for (const c of arr) {
          if (!c.alive || seen.has(c)) continue;
          seen.add(c);
          out.push(c);
        }
      }
    }
    return out;
  }

  /* ---- ray casting against the collider set (used by hitscan + AI LOS) ---- */

  /**
   * Slab-test a ray against every collider along its path.
   * @returns {{t:number, collider:Collider, normal:THREE.Vector3}|null}
   */
  raycast(origin, dir, maxDist, skipKinds = null) {
    let best = null;
    const steps = Math.ceil(maxDist / CELL) + 1;
    const seen = _seen2; seen.clear();
    const px = origin.x, pz = origin.z;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * maxDist;
      const cx = Math.floor((px + dir.x * t) / CELL);
      const cz = Math.floor((pz + dir.z * t) / CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const arr = this.grid.get((cx + ox) + ',' + (cz + oz));
          if (!arr) continue;
          for (const c of arr) {
            if (!c.alive || seen.has(c)) continue;
            seen.add(c);
            if (skipKinds && skipKinds.includes(c.kind)) continue;
            const hit = slab(origin, dir, c, maxDist);
            if (hit && (!best || hit.t < best.t)) best = { t: hit.t, collider: c, normal: hit.normal };
          }
        }
      }
      if (best && best.t < t) break;   // nothing further along can beat it
    }
    return best;
  }

  /** True if a clear line exists between two points. */
  lineOfSight(from, to, pad = 0) {
    const d = _v1.subVectors(to, from);
    const len = d.length();
    if (len < 0.001) return true;
    d.multiplyScalar(1 / len);
    const hit = this.raycast(from, d, len - pad, ['deck_thin']);
    return !hit;
  }

  /** Farthest clear point along a direction -- used by the blink ability. */
  raycastTeleport(origin, dir, dist, radius) {
    const probe = _v2.copy(origin).setY(origin.y + 2);
    const hit = this.raycast(probe, dir, dist);
    const t = hit ? Math.max(0, hit.t - radius - 1) : dist;
    const dest = origin.clone().addScaledVector(dir, t);
    dest.y = this.safeGround(dest.x, dest.z) + 0.2;
    return dest;
  }

  /** Where the player's crosshair meets the world. */
  aimPoint(mech, maxDist = 600) {
    const o = mech.eyePosition();
    const d = mech.aimForward();
    const hit = this.raycast(o, d, maxDist);
    if (hit) return o.clone().addScaledVector(d, hit.t);
    const p = o.clone().addScaledVector(d, maxDist);
    p.y = this.safeGround(p.x, p.z);
    return p;
  }

  /* ---- deployables ---- */
  spawnBarrier(pos, yaw, team, life) {
    const w = 14, h = 9;
    const c = new Collider(
      new THREE.Vector3(pos.x - w / 2, pos.y, pos.z - 1.4),
      new THREE.Vector3(pos.x + w / 2, pos.y + h, pos.z + 1.4),
      'barrier', { team },
    );
    // Orient the footprint with the caster's facing.
    const hw = Math.abs(Math.cos(yaw)) * w / 2 + Math.abs(Math.sin(yaw)) * 1.4;
    const hd = Math.abs(Math.sin(yaw)) * w / 2 + Math.abs(Math.cos(yaw)) * 1.4;
    c.min.set(pos.x - hw, pos.y, pos.z - hd);
    c.max.set(pos.x + hw, pos.y + h, pos.z + hd);
    this.colliders.push(c);
    this._indexColliders();

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.5),
      new THREE.MeshStandardMaterial({
        color: team === 'a' ? 0x49d6ff : 0xff6a4d, emissive: team === 'a' ? 0x49d6ff : 0xff6a4d,
        emissiveIntensity: 1.4, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
      }),
    );
    mesh.position.copy(pos).setY(pos.y + h / 2);
    mesh.rotation.y = -yaw;
    this.group.add(mesh);
    const rec = { collider: c, mesh, life, team };
    this.barriers.push(rec);
    return rec;
  }

  removeBarrier(rec) {
    if (!rec) return;
    rec.collider.alive = false;
    this.group.remove(rec.mesh);
    rec.mesh.geometry.dispose();
    rec.mesh.material.dispose();
    const i = this.barriers.indexOf(rec);
    if (i >= 0) this.barriers.splice(i, 1);
    this.colliders = this.colliders.filter(c => c !== rec.collider);
    this._indexColliders();
  }

  spawnSmoke(pos, radius, life) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xb8c4cc, transparent: true, opacity: 0.0, depthWrite: false }),
    );
    mesh.position.copy(pos);
    this.group.add(mesh);
    const rec = { pos: pos.clone(), radius, life, maxLife: life, mesh };
    this.smokes.push(rec);
    return rec;
  }

  /** Smoke blocks sight: true if the segment passes through any cloud. */
  smokeBlocks(from, to) {
    for (const s of this.smokes) {
      if (s.life <= 0) continue;
      if (segmentSphere(from, to, s.pos, s.radius * 0.85)) return true;
    }
    return false;
  }

  update(dt, cameraPos) {
    if (this._shell && cameraPos) {
      this._shell.material.uniforms.uCam.value.copy(cameraPos);
      this._shell.material.uniforms.uTime.value += dt;
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.life -= dt;
      const t = clamp(s.life / s.maxLife, 0, 1);
      const grow = clamp((s.maxLife - s.life) / 0.8, 0, 1);
      s.mesh.material.opacity = 0.62 * t * grow;
      s.mesh.scale.setScalar(0.4 + grow * 0.6);
      if (s.life <= 0) {
        this.group.remove(s.mesh);
        s.mesh.geometry.dispose(); s.mesh.material.dispose();
        this.smokes.splice(i, 1);
      }
    }
    for (let i = this.barriers.length - 1; i >= 0; i--) {
      const b = this.barriers[i];
      b.life -= dt;
      b.mesh.material.opacity = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(performance.now() * 0.006));
      if (b.life <= 0) this.removeBarrier(b);
    }
  }

  dispose() {
    this.group.traverse(o => {
      if (o.isMesh) { o.geometry?.dispose?.(); }
    });
    for (const m of Object.values(this.mat)) m.dispose();
  }
}

/* ---------------- helpers ---------------- */

const EMPTY = [];
const _seen = new Set();
const _seen2 = new Set();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _boxGeoCache = new Map();

/**
 * Rewrite a geometry's UVs from world position, projected on whichever axis
 * each face points along. Box geometries otherwise stretch one 0..1 UV square
 * across every face, so a 40m wall and a 4m crate would show wildly different
 * texel densities. World-space mapping keeps one metre the same size
 * everywhere, which is most of what sells scale.
 */
const UV_METRES = 9;
function boxMapUVs(g) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  if (!pos || !nor) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u / UV_METRES;
    uv[i * 2 + 1] = v / UV_METRES;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function boxGeo(w, h, d) {
  const k = `${w.toFixed(2)},${h.toFixed(2)},${d.toFixed(2)}`;
  if (!_boxGeoCache.has(k)) _boxGeoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return _boxGeoCache.get(k);
}

function mixHex(a, b, t) {
  const A = new THREE.Color(a), B = new THREE.Color(b);
  return A.lerp(B, t).getHex();
}

/** Ray/AABB slab intersection. Returns {t, normal} or null. */
function slab(o, d, c, maxDist) {
  let tmin = 0, tmax = maxDist;
  let nAxis = 0, nSign = 1;
  const oc = [o.x, o.y, o.z], dc = [d.x, d.y, d.z];
  const mn = [c.min.x, c.min.y, c.min.z], mx = [c.max.x, c.max.y, c.max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dc[i]) < 1e-8) {
      if (oc[i] < mn[i] || oc[i] > mx[i]) return null;
      continue;
    }
    const inv = 1 / dc[i];
    let t1 = (mn[i] - oc[i]) * inv;
    let t2 = (mx[i] - oc[i]) * inv;
    let sign = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sign = 1; }
    if (t1 > tmin) { tmin = t1; nAxis = i; nSign = sign; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  const normal = new THREE.Vector3();
  normal.setComponent(nAxis, nSign);
  return { t: tmin, normal };
}

function segmentSphere(a, b, c, r) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  if (ab2 < 1e-6) return (acx * acx + acy * acy + acz * acz) < r * r;
  let t = (acx * abx + acy * aby + acz * abz) / ab2;
  t = clamp(t, 0, 1);
  const dx = acx - abx * t, dy = acy - aby * t, dz = acz - abz * t;
  return (dx * dx + dy * dy + dz * dz) < r * r;
}
