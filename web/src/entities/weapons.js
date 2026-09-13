import * as THREE from 'three';
import { WEAPONS } from '../config.js';
import { Pool } from '../utils/pool.js';

const IMPACT_POOL_SIZE = 48;
const IMPACT_LIFETIME = 4;

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
    this.raycaster.far = 200;

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

  // targets: array of raycastable Object3D (building instanced meshes + enemy meshes)
  update(dt, input, camera, targets, onHit, audio) {
    for (let i = 1; i <= 3; i++) if (input.wasPressed(`Digit${i}`)) this.switchTo(i - 1);
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

    // expire impact marks
    const now = performance.now() / 1000;
    this._activeImpacts = this._activeImpacts.filter((it) => {
      if (now > it.expiry) { it.mesh.visible = false; this._impacts.release(it); return false; }
      return true;
    });
  }

  _fire(camera, targets, onHit, audio) {
    const w = this.current;
    this.fireTimer = 1 / w.fireRate;
    w.ammo -= 1;
    this._muzzleTimer = 0.06;
    this.muzzleFlash.material.opacity = 1;
    this.addBloom(0.18);
    if (audio) audio.playGunshot(w.id, this.player.mesh.position);

    const shots = w.pellets || 1;
    const dir = new THREE.Vector3();
    for (let s = 0; s < shots; s++) {
      camera.getWorldDirection(dir);
      const spread = w.spread * (1 + this.bloom * 1.5);
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();

      this.raycaster.set(camera.position, dir);
      const hits = this.raycaster.intersectObjects(targets, true);
      if (hits.length > 0) {
        const hit = hits[0];
        this._spawnImpact(hit.point);
        console.log(`[shot] hit ${hit.object.name || hit.object.userData?.kind || hit.object.type} at`, hit.point);
        if (onHit) onHit(hit, w.damage);
      }
    }
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
