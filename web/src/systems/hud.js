const STAR_SVG = '<svg viewBox="0 0 24 24"><path fill="#ffd23f" d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9L5.7 21l1.7-7-5.4-4.7 7.1-.6z"/></svg>';
const MINIMAP_RANGE = 70; // world units shown edge-to-edge

export class HUD {
  constructor() {
    this.el = {
      health: document.getElementById('healthBar'),
      armor: document.getElementById('armorBar'),
      stars: document.getElementById('stars'),
      weaponIcon: document.getElementById('weaponIcon'),
      weaponName: document.getElementById('weaponName'),
      ammo: document.getElementById('ammoCount'),
      minimap: document.getElementById('minimap'),
      speedo: document.getElementById('speedo'),
      state: document.getElementById('stateIndicator'),
      crosshair: document.getElementById('crosshair'),
      prompt: document.getElementById('prompt'),
      radioTag: document.getElementById('radioTag'),
    };
    this.mmCtx = this.el.minimap.getContext('2d');
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'star';
      d.innerHTML = STAR_SVG;
      this.el.stars.appendChild(d);
    }
  }

  setPrompt(text) {
    if (text) { this.el.prompt.textContent = text; this.el.prompt.classList.add('show'); }
    else this.el.prompt.classList.remove('show');
  }

  setRadioTag(text) {
    if (text) { this.el.radioTag.textContent = `📻 ${text}`; this.el.radioTag.classList.add('show'); }
    else this.el.radioTag.classList.remove('show');
  }

  update(state) {
    const { player, weaponSystem, wanted, controlMode, speedKmh, weather } = state;

    this.el.health.style.width = `${Math.max(0, player.health)}%`;
    this.el.armor.style.width = `${Math.max(0, player.armor)}%`;

    const starEls = this.el.stars.children;
    for (let i = 0; i < 5; i++) starEls[i].classList.toggle('on', i < wanted.stars);

    if (controlMode.mode === 'FOOT' && weaponSystem) {
      const w = weaponSystem.current;
      this.el.weaponIcon.style.background = `#${w.color.toString(16).padStart(6, '0')}`;
      this.el.weaponName.textContent = w.name;
      this.el.ammo.textContent = weaponSystem.reloading > 0 ? 'RELOADING' : `${w.ammo} / ${w.maxAmmo}`;
      this.el.crosshair.classList.add('show');
      const bloomScale = 1 + weaponSystem.bloom * 1.8;
      this.el.crosshair.style.transform = `translate(-50%,-50%) scale(${bloomScale})`;
    } else {
      this.el.crosshair.classList.remove('show');
    }

    const weatherTag = weather?.isWet ? ' · RAIN' : '';
    if (controlMode.mode === 'FOOT') {
      this.el.speedo.textContent = '';
      this.el.state.textContent = player.state + weatherTag;
    } else {
      this.el.speedo.textContent = `${Math.round(speedKmh)} km/h`;
      this.el.state.textContent = controlMode.mode + weatherTag;
    }

    this._drawMinimap(state);
  }

  _drawMinimap({ player, world, ai, wanted, heading, position }) {
    const ctx = this.mmCtx;
    const size = this.el.minimap.width;
    const scale = size / MINIMAP_RANGE;
    const pos = position || player.mesh.position;
    const px = pos.x, pz = pos.z;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#1a1e24';
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(size / 2, size / 2);

    ctx.fillStyle = '#3a4048';
    for (const c of world.getCollidersNear(px, pz, MINIMAP_RANGE)) {
      const cx = ((c.minX + c.maxX) / 2 - px) * scale;
      const cz = ((c.minZ + c.maxZ) / 2 - pz) * scale;
      const w = Math.max(2, (c.maxX - c.minX) * scale);
      const h = Math.max(2, (c.maxZ - c.minZ) * scale);
      ctx.fillRect(cx - w / 2, cz - h / 2, w, h);
    }

    const dot = (wx, wz, color, r = 3) => {
      const x = (wx - px) * scale, z = (wz - pz) * scale;
      if (Math.hypot(x, z) > size / 2) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, z, r, 0, Math.PI * 2);
      ctx.fill();
    };

    if (ai) {
      for (const t of ai.traffic) dot(t.vehicle.mesh.position.x, t.vehicle.mesh.position.z, t.vehicle.destroyed ? '#552211' : '#888', 2);
      for (const e of ai.enemies) if (e.alive) dot(e.mesh.position.x, e.mesh.position.z, '#ff5533', 3);
    }
    if (wanted) {
      for (const p of wanted.police) dot(p.vehicle.mesh.position.x, p.vehicle.mesh.position.z, '#3d6bff', 3);
    }

    ctx.restore();

    // player arrow, always centered, rotated to heading
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(heading ?? player.heading ?? player.mesh.rotation.y);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
