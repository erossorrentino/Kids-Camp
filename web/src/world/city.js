import * as THREE from 'three';
import { CITY, PROPS } from '../config.js';
import { rngForChunk, pick, randRange } from '../utils/rng.js';

const ROAD_COLOR = 0x2b2e33;
const SIDEWALK_COLOR = 0xb9bec4;
const LINE_COLOR = 0xdcc23a;

// A destructible roadside prop (barrier/crate): one hit from a vehicle,
// explosion, or heavy enough gunfire clears it out of the way.
class Prop {
  constructor(mesh, health) {
    this.mesh = mesh;
    this.maxHealth = health;
    this.health = health;
    this.destroyed = false;
    mesh.userData.kind = 'prop';
    mesh.userData.ref = this;
  }

  // Returns true the moment this call is what destroys it (so the caller
  // can spawn a one-time debris/explosion effect).
  takeDamage(amount) {
    if (this.destroyed) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.destroyed = true;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }
}

function makeRoadMaterials() {
  return {
    road: new THREE.MeshStandardMaterial({ color: ROAD_COLOR, roughness: 0.95 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: SIDEWALK_COLOR, roughness: 0.9 }),
    line: new THREE.MeshBasicMaterial({ color: LINE_COLOR }),
  };
}

// One streamed city block: roads on the min-corner "L", a sidewalk square,
// and a lotsPerSide x lotsPerSide grid of instanced buildings inside it.
class Chunk {
  constructor(cx, cz, world) {
    this.cx = cx; this.cz = cz;
    this.key = `${cx},${cz}`;
    this.group = new THREE.Group();
    this.colliders = [];
    this.sidewalkLoop = [];
    this.roadLanes = [];
    this.props = [];
    this._build(world);
  }

  _build(world) {
    const { chunkSize: S, roadWidth: RW, lotsPerSide, minHeight, maxHeight, colorPalettes } = CITY;
    const ox = this.cx * S;
    const oz = this.cz * S;
    const rng = rngForChunk(this.cx, this.cz, world.seed);
    const isSpawnPlaza = this.cx === 0 && this.cz === 0;

    // --- roads (L shape at the min-corner, see module notes) ---
    const roadX = new THREE.Mesh(new THREE.PlaneGeometry(S - RW, RW), world.mats.road);
    roadX.rotation.x = -Math.PI / 2;
    roadX.position.set(ox + RW + (S - RW) / 2, 0, oz + RW / 2);
    roadX.receiveShadow = true;
    this.group.add(roadX);

    const roadZ = new THREE.Mesh(new THREE.PlaneGeometry(RW, S), world.mats.road);
    roadZ.rotation.x = -Math.PI / 2;
    roadZ.position.set(ox + RW / 2, 0, oz + S / 2);
    roadZ.receiveShadow = true;
    this.group.add(roadZ);

    // center line markings (dashed look via thin segments)
    const dash = (len, x, z, rotY) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.3), world.mats.line);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rotY;
      m.position.set(x, 0.01, z);
      this.group.add(m);
    };
    for (let x = ox + RW + 2; x < ox + S - 2; x += 6) dash(3, x, oz + RW / 2, 0);
    for (let z = oz + 2; z < oz + S - 2; z += 6) dash(3, ox + RW / 2, z, Math.PI / 2);

    this.roadLanes.push({ from: new THREE.Vector3(ox + RW, 0, oz + RW * 0.32), to: new THREE.Vector3(ox + S, 0, oz + RW * 0.32) });
    this.roadLanes.push({ from: new THREE.Vector3(ox + RW * 0.68, 0, oz), to: new THREE.Vector3(ox + RW * 0.68, 0, oz + S) });

    // --- sidewalk block ---
    const B = S - RW;
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(B, B), world.mats.sidewalk);
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(ox + RW + B / 2, 0.02, oz + RW + B / 2);
    sw.receiveShadow = true;
    this.group.add(sw);

    const margin = 3;
    this.sidewalkLoop = [
      new THREE.Vector3(ox + RW + margin, 0, oz + RW + margin),
      new THREE.Vector3(ox + S - margin, 0, oz + RW + margin),
      new THREE.Vector3(ox + S - margin, 0, oz + S - margin),
      new THREE.Vector3(ox + RW + margin, 0, oz + S - margin),
    ];

    if (isSpawnPlaza) return; // keep the starting block clear for vehicles

    // --- destructible roadside props (barriers/crates), individual meshes
    // since each needs its own health/destroyed state ---
    for (let i = 0; i < PROPS.perChunk; i++) {
      const alongXEdge = rng() < 0.5;
      const px = alongXEdge ? ox + RW + randRange(rng, 2, B - 2) : ox + RW + 1;
      const pz = alongXEdge ? oz + RW + 1 : oz + RW + randRange(rng, 2, B - 2);
      const isBarrier = rng() < 0.5;
      const geo = isBarrier ? new THREE.BoxGeometry(1.4, 0.9, 0.5) : new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: isBarrier ? 0xd97a1f : 0x8a6a45, roughness: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, isBarrier ? 0.45 : 0.5, pz);
      mesh.rotation.y = rng() * Math.PI;
      mesh.castShadow = true;
      this.group.add(mesh);
      this.props.push(new Prop(mesh, PROPS.health));
    }

    // --- buildings, instanced per chunk ---
    const lotSize = B / lotsPerSide;
    const palette = pick(rng, colorPalettes);
    const lots = [];
    for (let i = 0; i < lotsPerSide; i++) {
      for (let j = 0; j < lotsPerSide; j++) {
        if (rng() < 0.12) continue; // occasional empty plaza lot
        const cx = ox + RW + lotSize * (i + 0.5);
        const cz2 = oz + RW + lotSize * (j + 0.5);
        const w = lotSize * randRange(rng, 0.5, 0.8);
        const d = lotSize * randRange(rng, 0.5, 0.8);
        const h = randRange(rng, minHeight, maxHeight);
        lots.push({ x: cx, z: cz2, w, d, h, color: pick(rng, palette) });
      }
    }

    if (lots.length === 0) return;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 });
    const inst = new THREE.InstancedMesh(geo, mat, lots.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.userData.chunkKey = this.key;
    inst.userData.isBuilding = true;

    const m4 = new THREE.Matrix4();
    const color = new THREE.Color();
    lots.forEach((lot, i) => {
      m4.compose(
        new THREE.Vector3(lot.x, lot.h / 2, lot.z),
        new THREE.Quaternion(),
        new THREE.Vector3(lot.w, lot.h, lot.d)
      );
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, color.setHex(lot.color));
      this.colliders.push({
        minX: lot.x - lot.w / 2, maxX: lot.x + lot.w / 2,
        minZ: lot.z - lot.d / 2, maxZ: lot.z + lot.d / 2,
        minY: 0, maxY: lot.h,
        instanceId: i, chunkKey: this.key,
      });
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.group.add(inst);
    this.buildingMesh = inst;

    // LOD detail: near chunks get a thin emissive "window" strip per building,
    // far chunks stay as plain boxes to save draw calls / fill rate.
    const distChunks = Math.max(Math.abs(this.cx), Math.abs(this.cz));
    if (distChunks <= 1 && lots.length > 0) {
      const winGeo = new THREE.PlaneGeometry(1, 1);
      const winMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.85 });
      const winInst = new THREE.InstancedMesh(winGeo, winMat, lots.length);
      lots.forEach((lot, i) => {
        const stripH = lot.h * 0.7;
        m4.compose(
          new THREE.Vector3(lot.x, lot.h * 0.5, lot.z + lot.d / 2 + 0.02),
          new THREE.Quaternion(),
          new THREE.Vector3(lot.w * 0.6, stripH, 1)
        );
        winInst.setMatrixAt(i, m4);
      });
      winInst.instanceMatrix.needsUpdate = true;
      this.group.add(winInst);
    }
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      }
    });
  }
}

export class CityWorld {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.mats = makeRoadMaterials();
    this.chunks = new Map();
    this.container = new THREE.Group();
    scene.add(this.container);
  }

  get chunkSize() { return CITY.chunkSize; }

  worldToChunk(x, z) {
    return [Math.floor(x / CITY.chunkSize), Math.floor(z / CITY.chunkSize)];
  }

  update(playerX, playerZ) {
    const [pcx, pcz] = this.worldToChunk(playerX, playerZ);
    const needed = new Set();
    for (let dx = -CITY.renderRadius; dx <= CITY.renderRadius; dx++) {
      for (let dz = -CITY.renderRadius; dz <= CITY.renderRadius; dz++) {
        const cx = pcx + dx, cz = pcz + dz;
        const key = `${cx},${cz}`;
        needed.add(key);
        if (!this.chunks.has(key)) {
          const chunk = new Chunk(cx, cz, this);
          this.chunks.set(key, chunk);
          this.container.add(chunk.group);
        }
      }
    }
    // unload chunks beyond the unload radius
    for (const [key, chunk] of this.chunks) {
      const dist = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
      if (dist > CITY.unloadRadius) {
        this.container.remove(chunk.group);
        chunk.dispose();
        this.chunks.delete(key);
      }
    }
  }

  // Colliders within a radius (world units) of a point, for player/vehicle physics.
  getCollidersNear(x, z, radius = 40) {
    const out = [];
    for (const chunk of this.chunks.values()) {
      for (const c of chunk.colliders) {
        const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
        if (Math.abs(cx - x) < radius + 20 && Math.abs(cz - z) < radius + 20) out.push(c);
      }
    }
    return out;
  }

  getBuildingMeshes() {
    const out = [];
    for (const chunk of this.chunks.values()) if (chunk.buildingMesh) out.push(chunk.buildingMesh);
    return out;
  }

  getPropsNear(x, z, radius) {
    const out = [];
    for (const chunk of this.chunks.values()) {
      for (const prop of chunk.props) {
        if (prop.destroyed) continue;
        if (prop.mesh.position.distanceTo({ x, y: prop.mesh.position.y, z }) < radius) out.push(prop);
      }
    }
    return out;
  }

  getPropMeshes() {
    const out = [];
    for (const chunk of this.chunks.values()) {
      for (const prop of chunk.props) if (!prop.destroyed) out.push(prop.mesh);
    }
    return out;
  }

  // Aggregate sidewalk loops / road lanes near a point, used to seed AI.
  getNearChunks(x, z, radius = 1) {
    const [pcx, pcz] = this.worldToChunk(x, z);
    const out = [];
    for (const chunk of this.chunks.values()) {
      if (Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz)) <= radius) out.push(chunk);
    }
    return out;
  }
}
