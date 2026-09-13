import * as THREE from 'three';
import { WEAPONS } from '../config.js';
import { Pool } from '../utils/pool.js';

const IMPACT_POOL_SIZE = 48;
const IMPACT_LIFETIME = 4;
const HITSCAN_RANGE = 200;

export class WeaponSystem {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.inventory = WEAPONS.map((w) => ({ ...w, ammo: w.maxAmmo }));
    this.index = 0;
    this.fireTimer = 0;
    this.reloading = 0;
    this.bloom = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = HITSCAN_RANGE;
    this._projectiles = [];

    this.weaponMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.4),
      new THREE.MeshStandardMaterial({ color: this.current.color })
    );
    this.player.handAnchor.add(this.weaponMesh);

    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0 })
    );
    this.muzzleFlash.position.z = 0.25;
    this.weaponMesh.add(this.muzzleFlash);
    this._muzzleTimer = 0;

    this._impacts = new Pool(() => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x8a1010 })
      );
      m.visible = false;
      scene.add(m);
      return { mesh: m, expiry: 0 };
    }, IMPACT_POOL_SIZE);
    this._activeImpacts = [];
  }

  get current() { return this.inventory[this.index]; }

  switchTo(idx) {
    if (idx < 0 || idx >= this.inventory.length || idx === this.index) return;
    this.index = idx;
    this.weaponMesh.material.color.setHex(this.current.color);
  }

  cycle(dir) {
    const n = this.inventory.length;
    this.switchTo((this.index + dir + n) % n);
  }

  addBloom(amount) { this.bloom = Math.min(1, this.bloom + amount); }

  // targets: raycastable Object3D list (buildings, props, enemies, peds, traffic).
  // onHit(hit, damage): called per hitscan/pierce hit. onExplode(pos, radius, damage):
  // called when a rocket detonates, for splash damage + FX.
  update(dt, input, camera, targets, onHit, audio, onExplode) {
    this.firedThisFrame = false;
    for (let i = 1; i <= 5; i++) if (input.wasPressed(`Digit${i}`)) this.switchTo(i - 1);
    if (Math.abs(input.wheelDelta) > 1) this.cycle(input.wheelDelta > 0 ? 1 : -1);

    if (input.wasPressed('KeyR') && this.current.ammo < this.current.maxAmmo) this.reloading = 1.1;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.current.ammo = this.current.maxAmmo;
    }

    this.fireTimer -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.5);
    if (this._muzzleTimer > 0) {
      this._muzzleTimer -= dt;
      this.muzzleFlash.material.opacity = Math.max(0, this._muzzleTimer * 8);
    }

    if (input.isMouseDown(0) && this.fireTimer <= 0 && this.reloading <= 0 && this.current.ammo > 0) {
      this._fire(camera, targets, onHit, audio);
    }

    this._updateProjectiles(dt, targets, onExplode);

    // expire impact marks
    const now = performance.now() / 1000;
    this._activeImpacts = this._activeImpacts.filter((it) => {
      if (now > it.expiry) { it.mesh.visible = false; this._impacts.release(it); return false; }
      return true;
    });
  }

  _fire(camera, targets, onHit, audio) {
    const w = this.current;
    this.firedThisFrame = true;
    this.fireTimer = 1 / w.fireRate;
    w.ammo -= 1;
    this._muzzleTimer = 0.06;
    this.muzzleFlash.material.opacity = 1;
    this.addBloom(0.18);
    if (audio) audio.playGunshot(w.id, this.player.mesh.position);

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const spread = w.spread * (1 + this.bloom * 1.5);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    if (w.projectile) {
      this._spawnProjectile(camera.position, dir, w);
      return;
    }

    const shots = w.pellets || 1;
    for (let s = 0; s < shots; s++) {
      if (s > 0) {
        camera.getWorldDirection(dir);
        dir.x += (Math.random() - 0.5) * spread;
        dir.y += (Math.random() - 0.5) * spread;
        dir.z += (Math.random() - 0.5) * spread;
        dir.normalize();
      }
      this.raycaster.far = HITSCAN_RANGE;
      this.raycaster.set(camera.position, dir);
      const hits = this.raycaster.intersectObjects(targets, true);
      if (hits.length === 0) continue;

      if (w.pierce) {
        // punches through the first target into a second one behind it
        const seenRoots = new Set();
        let applied = 0;
        for (const hit of hits) {
          if (applied >= 2) break;
          if (seenRoots.has(hit.object)) continue;
          seenRoots.add(hit.object);
          this._spawnImpact(hit.point);
          if (onHit) onHit(hit, w.damage);
          applied++;
        }
        this._spawnBeam(camera.position, hits[Math.min(hits.length, 2) - 1].point, 0x33d6ff);
      } else {
        const hit = hits[0];
        this._spawnImpact(hit.point);
        if (onHit) onHit(hit, w.damage);
      }
    }
  }

  _spawnProjectile(origin, dir, w) {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.5, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa33 })
    );
    mesh.position.copy(origin).addScaledVector(dir, 0.6);
    mesh.lookAt(mesh.position.clone().add(dir));
    mesh.rotateX(-Math.PI / 2); // ConeGeometry's tip points +Y; lookAt faces -Z
    this.scene.add(mesh);
    this._projectiles.push({
      mesh, velocity: dir.clone().multiplyScalar(w.projectileSpeed), life: 4,
      splashRadius: w.splashRadius, blastDamage: w.blastDamage,
    });
  }

  _updateProjectiles(dt, targets, onExplode) {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.life -= dt;
      const prevPos = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.velocity, dt);

      let exploded = p.life <= 0 || p.mesh.position.y <= 0.1;
      if (!exploded) {
        const seg = p.mesh.position.clone().sub(prevPos);
        const dist = seg.length();
        if (dist > 1e-4) {
          seg.normalize();
          this.raycaster.set(prevPos, seg);
          this.raycaster.far = dist + 0.2;
          const hits = this.raycaster.intersectObjects(targets, true);
          if (hits.length > 0) { exploded = true; p.mesh.position.copy(hits[0].point); }
        }
      }

      if (exploded) {
        this.scene.remove(p.mesh);
        this._projectiles.splice(i, 1);
        if (onExplode) onExplode(p.mesh.position.clone(), p.splashRadius, p.blastDamage);
      }
    }
    this.raycaster.far = HITSCAN_RANGE;
  }

  _spawnBeam(start, end, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    setTimeout(() => { this.scene.remove(line); geo.dispose(); mat.dispose(); }, 90);
  }

  _spawnImpact(point) {
    const it = this._impacts.acquire();
    if (!it) return;
    it.mesh.position.copy(point);
    it.mesh.visible = true;
    it.expiry = performance.now() / 1000 + IMPACT_LIFETIME;
    this._activeImpacts.push(it);
  }
}
