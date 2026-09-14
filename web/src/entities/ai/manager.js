import * as THREE from '../../../vendor/three/three.module.js';
import { AI } from '../../config.js';
import { Pedestrian } from './pedestrian.js';
import { TrafficAI } from './traffic.js';
import { EnemyAI } from './enemy.js';

const MAX_ENEMIES = 6;
const ENEMY_SPAWN_RADIUS = [40, 90];
const ENEMY_RESPAWN_TIME = 12;

// Populates the streamed city with ambient life: spawns pedestrians/traffic
// per chunk as it loads (and tears them down when the chunk unloads), plus a
// small rotating pool of hostile NPCs around the player.
export class AIManager {
  constructor(scene) {
    this.scene = scene;
    this.pedestrians = [];
    this.traffic = [];
    this.enemies = [];
    this._spawnedChunks = new Set();
    this._enemyRespawnTimer = 3;
  }

  syncWithWorld(world) {
    const liveKeys = new Set(world.chunks.keys());

    for (const key of liveKeys) {
      if (this._spawnedChunks.has(key)) continue;
      const chunk = world.chunks.get(key);
      if (!chunk || chunk.sidewalkLoop.length === 0) continue;
      this._spawnedChunks.add(key);

      for (let i = 0; i < AI.pedestrianCountPerChunk; i++) {
        const ped = new Pedestrian(this.scene, chunk.sidewalkLoop, i % chunk.sidewalkLoop.length);
        ped.chunkKey = key;
        this.pedestrians.push(ped);
      }
      for (let i = 0; i < AI.trafficCountPerChunk && i < chunk.roadLanes.length; i++) {
        const car = new TrafficAI(this.scene, chunk.roadLanes[i]);
        car.chunkKey = key;
        this.traffic.push(car);
      }
    }

    for (const key of [...this._spawnedChunks]) {
      if (liveKeys.has(key)) continue;
      this._spawnedChunks.delete(key);
      this.pedestrians = this.pedestrians.filter((p) => {
        if (p.chunkKey === key) { p.dispose(this.scene); return false; }
        return true;
      });
      this.traffic = this.traffic.filter((t) => {
        if (t.chunkKey === key) { t.dispose(this.scene); return false; }
        return true;
      });
    }
  }

  update(dt, world, playerPos, onEnemyFire, traction = 1) {
    for (const ped of this.pedestrians) ped.update(dt, world);

    const obstacleMeshes = this.traffic.map((t) => t.vehicle.mesh);
    for (const car of this.traffic) car.update(dt, world, obstacleMeshes, traction);

    // destroyed traffic cars stay put as wrecks for a few seconds, then get
    // cleaned up so the active list doesn't grow forever
    const now = performance.now();
    for (const t of this.traffic) {
      if (t.vehicle.destroyed && t._wreckedAt === undefined) t._wreckedAt = now;
    }
    this.traffic = this.traffic.filter((t) => {
      if (!t.vehicle.destroyed) return true;
      if (now - t._wreckedAt > 6000) { t.dispose(this.scene); return false; }
      return true;
    });

    this.enemies = this.enemies.filter((e) => e.alive);
    for (const enemy of this.enemies) enemy.update(dt, world, playerPos, onEnemyFire);

    this._enemyRespawnTimer -= dt;
    if (this._enemyRespawnTimer <= 0 && this.enemies.length < MAX_ENEMIES) {
      this._enemyRespawnTimer = ENEMY_RESPAWN_TIME / MAX_ENEMIES;
      const angle = Math.random() * Math.PI * 2;
      const r = THREE.MathUtils.lerp(ENEMY_SPAWN_RADIUS[0], ENEMY_SPAWN_RADIUS[1], Math.random());
      const pos = new THREE.Vector3(playerPos.x + Math.sin(angle) * r, 0, playerPos.z + Math.cos(angle) * r);
      this.enemies.push(new EnemyAI(this.scene, pos));
    }
  }

  // Spooks any pedestrian within earshot of a gunshot into fleeing the source.
  notifyGunfire(position, radius = 20) {
    for (const ped of this.pedestrians) {
      if (ped.mesh.position.distanceTo(position) < radius) ped.spookFrom(position);
    }
  }

  get enemyMeshes() { return this.enemies.filter((e) => e.alive).map((e) => e.bodyMesh); }

  enemyForMesh(mesh) { return this.enemies.find((e) => e.bodyMesh === mesh); }
}
