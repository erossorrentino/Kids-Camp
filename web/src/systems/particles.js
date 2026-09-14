import * as THREE from '../../vendor/three/three.module.js';

function makeSoftDiscTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const MAX_PARTICLES = 260;

// Pooled sprite-based particles for exhaust/drift smoke, muzzle flashes, and
// explosions — sprites always face the camera, so no billboard math needed,
// and the shared pool keeps this GC-free during sustained gunfights.
export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.tex = makeSoftDiscTexture();
    this.slots = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      scene.add(sprite);
      this.slots.push({ sprite, life: 0, maxLife: 1, vel: new THREE.Vector3(), growth: 0, active: false, color: 0xffffff });
    }
    this._cursor = 0;
  }

  _acquire() {
    for (let n = 0; n < MAX_PARTICLES; n++) {
      const i = (this._cursor + n) % MAX_PARTICLES;
      if (!this.slots[i].active) { this._cursor = (i + 1) % MAX_PARTICLES; return this.slots[i]; }
    }
    return this.slots[this._cursor]; // pool full: steal the oldest slot
  }

  spawnSmoke(position, { color = 0xcccccc, size = 0.6, life = 1.2, spread = 0.6, rise = 1.0 } = {}) {
    const p = this._acquire();
    p.active = true;
    p.life = p.maxLife = life;
    p.growth = size * 1.8;
    p.color = color;
    p.vel.set((Math.random() - 0.5) * spread, rise + Math.random() * 0.4, (Math.random() - 0.5) * spread);
    p.sprite.position.copy(position);
    p.sprite.scale.setScalar(size);
    p.sprite.material.color.setHex(color);
    p.sprite.material.opacity = 0.55;
    p.sprite.visible = true;
  }

  spawnMuzzleFlash(position, color = 0xffdd66) {
    const p = this._acquire();
    p.active = true;
    p.life = p.maxLife = 0.08;
    p.growth = -2;
    p.color = color;
    p.vel.set(0, 0, 0);
    p.sprite.position.copy(position);
    p.sprite.scale.setScalar(0.5);
    p.sprite.material.color.setHex(color);
    p.sprite.material.opacity = 1;
    p.sprite.visible = true;
  }

  spawnExplosion(position) {
    for (let i = 0; i < 14; i++) {
      const p = this._acquire();
      p.active = true;
      p.life = p.maxLife = 0.6 + Math.random() * 0.6;
      p.growth = 2.2;
      p.color = i < 4 ? 0xffbb44 : 0x555555;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      p.vel.set(Math.sin(angle) * speed, 1 + Math.random() * 3, Math.cos(angle) * speed);
      p.sprite.position.copy(position);
      p.sprite.scale.setScalar(0.4);
      p.sprite.material.color.setHex(p.color);
      p.sprite.material.opacity = 1;
      p.sprite.visible = true;
    }
  }

  update(dt) {
    for (const p of this.slots) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; p.sprite.visible = false; continue; }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.y += 0.6 * dt; // gentle drift deceleration/buoyancy
      p.vel.multiplyScalar(1 - 0.6 * dt);
      const t = p.life / p.maxLife;
      p.sprite.material.opacity = Math.max(0, t) * 0.8;
      p.sprite.scale.addScalar(p.growth * dt);
    }
  }
}
