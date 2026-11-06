import * as THREE from 'three';
import { G } from '../core/G.js';
import { Anim, newPose, setJ } from '../actors/rig.js';
import { EPOCHS } from '../world/epochs.js';

// Photo mode: the world freezes, the HUD hides and a free camera orbits the
// player. Pick a time of day, a filter and a pose, then save a picture.
const FILTERS = [
  ['None', ''],
  ['Vivid', 'saturate(1.4) contrast(1.06)'],
  ['Warm', 'sepia(0.3) saturate(1.25) hue-rotate(-6deg)'],
  ['Cool', 'saturate(0.95) hue-rotate(14deg) brightness(1.03)'],
  ['Dreamy', 'saturate(1.2) brightness(1.08) contrast(0.92)'],
  ['Sepia', 'sepia(0.85) contrast(1.05)'],
  ['Noir', 'grayscale(1) contrast(1.3)'],
];
const POSES = ['Natural', 'Wave', 'Cheer', 'Ready', 'Sit', 'Pray', 'Point'];

export class PhotoMode {
  constructor() {
    this.active = false;
    const root = document.getElementById('ui-root');
    const el = (this.el = document.createElement('div'));
    el.className = 'photo-mode';
    el.hidden = true;
    el.innerHTML = `
      <div class="ph-drag"></div>
      <div class="ph-vig"></div>
      <div class="ph-flash"></div>
      <aside class="ph-panel">
        <header><b>Photo Mode</b><button class="ph-hide" title="Hide panel">–</button></header>
        <label>Time of day <span class="ph-tv"></span><input type="range" class="ph-time" min="0" max="24" step="0.1"></label>
        <label>Zoom (field of view)<input type="range" class="ph-fov" min="20" max="100" step="1" value="55"></label>
        <label>Tilt<input type="range" class="ph-roll" min="-30" max="30" step="1" value="0"></label>
        <label>Vignette<input type="range" class="ph-vigr" min="0" max="1" step="0.05" value="0.3"></label>
        <div class="ph-row"><span>Filter</span><div class="ph-filters"></div></div>
        <div class="ph-row"><span>Pose</span><div class="ph-poses"></div></div>
        <label class="ph-check"><input type="checkbox" class="ph-hideme"> Hide Wayfarer</label>
        <label class="ph-check"><input type="checkbox" class="ph-blink"> Eyes closed</label>
        <p class="ph-help kbm-only">Drag to orbit · Wheel to move closer · WASD to move · Space / C up and down</p>
        <p class="ph-help touch-only">Drag to orbit · Pinch to move closer</p>
        <div class="ph-btns"><button class="primary ph-shot">Save Photo</button><button class="ph-exit">Exit</button></div>
      </aside>
      <button class="ph-show" hidden>Photo Mode ▸</button>`;
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.panel = q('.ph-panel');
    this.vig = q('.ph-vig');
    this.flash = q('.ph-flash');
    this.timeIn = q('.ph-time');
    this.timeV = q('.ph-tv');
    this.fovIn = q('.ph-fov');
    this.rollIn = q('.ph-roll');
    this.vigIn = q('.ph-vigr');
    this.filter = '';
    this.pose = 'Natural';
    const fb = q('.ph-filters');
    for (const [name, css] of FILTERS) {
      const b = document.createElement('button');
      b.textContent = name;
      b.onclick = () => { this.filter = css; fb.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this.applyLook(); };
      if (!css) b.classList.add('on');
      fb.appendChild(b);
    }
    const pb = q('.ph-poses');
    for (const name of POSES) {
      const b = document.createElement('button');
      b.textContent = name;
      b.onclick = () => { this.pose = name; pb.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
      if (name === 'Natural') b.classList.add('on');
      pb.appendChild(b);
    }
    this.timeIn.oninput = () => { G.atmo.timeOfDay = +this.timeIn.value; this.showTime(); G.atmo.updateEnvironment?.(G.renderer, true); };
    this.vigIn.oninput = () => this.applyLook();
    q('.ph-hideme').onchange = (e) => G.player.rig.setVisible(!e.target.checked);
    q('.ph-blink').onchange = (e) => (G.player.rig.eyesShut = e.target.checked);
    q('.ph-shot').onclick = () => this.capture();
    q('.ph-exit').onclick = () => this.close();
    q('.ph-hide').onclick = () => { this.panel.hidden = true; q('.ph-show').hidden = false; };
    q('.ph-show').onclick = () => { this.panel.hidden = false; q('.ph-show').hidden = true; };
    this.hideBox = q('.ph-hideme');
    this.blinkBox = q('.ph-blink');
    // orbit with mouse or one finger, zoom with wheel or pinch
    const drag = q('.ph-drag');
    const pts = new Map();
    let pinch = 0;
    drag.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag.setPointerCapture(e.pointerId); });
    drag.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        this.yaw -= (e.clientX - p.x) * 0.006;
        this.pitch = Math.max(-1.2, Math.min(1.35, this.pitch + (e.clientY - p.y) * 0.005));
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const d1 = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.dist = Math.max(0.6, Math.min(30, this.dist * (d0 / Math.max(1, d1))));
        pinch = 1;
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
    drag.addEventListener('pointerup', up);
    drag.addEventListener('pointercancel', up);
    drag.addEventListener('wheel', (e) => { this.dist = Math.max(0.6, Math.min(30, this.dist * (e.deltaY > 0 ? 1.12 : 0.9))); e.preventDefault(); }, { passive: false });
    this.pivot = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0.2;
    this.dist = 5;
    this.poseBuf = newPose();
    // ask early so a save does not wait on the viewer handshake
    setTimeout(() => this.downloads(), 0);
  }

  downloads() {
    if (!this._dl) this._dl = Promise.resolve(window.claude?.use?.('downloads')).catch(() => null);
    return this._dl;
  }

  canOpen() {
    return G.state === 'play' && !G.cutscene?.active && !G.dialogue?.active && !G.rift?.picking && !G.ui.blocking && !G.build?.active;
  }

  open() {
    if (this.active) return;
    if (G.ui.menuOpen) G.ui.closeMenu();
    if (!this.canOpen()) return;
    this.active = true;
    this.prevState = G.state;
    G.state = 'photo';
    G.input.exitLock();
    G.input.uiCapture = true;
    G.hud.show(false);
    G.touch?.setHidden?.(true);
    this.el.hidden = false;
    this.panel.hidden = false;
    this.el.querySelector('.ph-show').hidden = true;
    // start from the current view
    const P = G.player;
    this.pivot.set(P.pos.x, P.pos.y + 1.1, P.pos.z);
    const off = G.camera.position.clone().sub(this.pivot);
    this.dist = Math.max(1.5, off.length());
    this.yaw = Math.atan2(off.x, off.z);
    this.pitch = Math.asin(Math.max(-0.99, Math.min(0.99, off.y / this.dist)));
    this.startTime = G.atmo.timeOfDay;
    this.timeIn.value = G.atmo.timeOfDay;
    this.fovIn.value = Math.round(G.camera.fov);
    this.rollIn.value = 0;
    this.showTime();
    this.applyLook();
    G.audio?.sfx('menuOpen');
  }

  close() {
    if (!this.active) return;
    this.active = false;
    G.state = 'play';
    G.input.uiCapture = false;
    this.el.hidden = true;
    G.renderer.domElement.style.filter = '';
    G.hud.show(true);
    G.touch?.setHidden?.(false);
    G.player.rig.setVisible(true);
    G.player.rig.eyesShut = false;
    this.hideBox.checked = false;
    this.blinkBox.checked = false;
    G.camera.up.set(0, 1, 0);
    if (G.input.lastDevice === 'kbm') G.input.requestLock();
    G.audio?.sfx('menuClose');
  }

  showTime() {
    const t = +this.timeIn.value;
    const h = Math.floor(t), m = Math.floor((t - h) * 60);
    this.timeV.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  applyLook() {
    G.renderer.domElement.style.filter = this.filter;
    this.vig.style.opacity = this.vigIn.value;
  }

  update(dt) {
    if (!this.active) return;
    const inp = G.input;
    if (inp.hit('pause')) return this.close();
    // fly the pivot around (kept within reach of the player)
    const sp = 6 * dt;
    // forward is from the camera toward the pivot; right is 90 degrees clockwise of it
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const mv = inp.moveVec;
    this.pivot.x += (fx * -mv.y + rx * mv.x) * sp;
    this.pivot.z += (fz * -mv.y + rz * mv.x) * sp;
    if (inp.keys.has('Space')) this.pivot.y += sp;
    if (inp.keys.has('KeyC')) this.pivot.y -= sp;
    const P = G.player.pos;
    const dx = this.pivot.x - P.x, dz = this.pivot.z - P.z;
    const dl = Math.hypot(dx, dz);
    if (dl > 35) { this.pivot.x = P.x + (dx / dl) * 35; this.pivot.z = P.z + (dz / dl) * 35; }
    this.pivot.y = Math.max(G.terrain.heightAt(this.pivot.x, this.pivot.z) + 0.3, Math.min(P.y + 30, this.pivot.y));
    const cp = Math.cos(this.pitch);
    const c = G.camera;
    c.position.set(this.pivot.x + Math.sin(this.yaw) * cp * this.dist, this.pivot.y + Math.sin(this.pitch) * this.dist, this.pivot.z + Math.cos(this.yaw) * cp * this.dist);
    const gy = G.terrain.heightAt(c.position.x, c.position.z) + 0.25;
    if (c.position.y < gy) c.position.y = gy;
    c.up.set(0, 1, 0);
    c.lookAt(this.pivot);
    c.rotateZ((+this.rollIn.value * Math.PI) / 180);
    const fov = +this.fovIn.value;
    if (c.fov !== fov) { c.fov = fov; c.updateProjectionMatrix(); }
    // pose the Wayfarer
    if (this.pose !== 'Natural') {
      const p = this.poseBuf;
      const t = performance.now() / 1000;
      Anim.idle(p, t, this.pose === 'Ready');
      if (this.pose === 'Wave') Anim.wave(p, t);
      else if (this.pose === 'Sit') Anim.work(p, t, 'sit');
      else if (this.pose === 'Pray') Anim.work(p, t, 'pray');
      else if (this.pose === 'Cheer') {
        setJ(p, 'armL', -2.8, 0, 0.35); setJ(p, 'armR', -2.8, 0, -0.35);
        setJ(p, 'foreL', -0.3, 0, 0); setJ(p, 'foreR', -0.3, 0, 0);
        setJ(p, 'head', -0.3, 0, 0);
      } else if (this.pose === 'Point') {
        setJ(p, 'armR', -1.55, 0.3, -0.1); setJ(p, 'foreR', -0.1, 0, 0);
        setJ(p, 'head', -0.1, -0.3, 0);
      }
      G.player.rig.apply(p);
    }
  }

  capture() {
    // render now and read the pixels before the browser clears the buffer
    G.renderNow?.();
    const src = G.renderer.domElement;
    const w = src.width, h = src.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const g = out.getContext('2d');
    try { g.filter = this.filter || 'none'; } catch (e) {}
    g.drawImage(src, 0, 0);
    g.filter = 'none';
    const v = +this.vigIn.value;
    if (v > 0) {
      const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, `rgba(0,0,0,${0.85 * v})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }
    const fs = Math.max(12, Math.round(h * 0.022));
    g.font = `${fs}px Georgia, serif`;
    g.fillStyle = 'rgba(255,240,210,0.75)';
    g.textAlign = 'right';
    const ep = EPOCHS[G.epochs.current]?.name || '';
    g.fillText(`Chronos & Cosmos · ${ep}`, w - fs, h - fs);
    const name = `chronos-cosmos-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    const viaLink = (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
    const save = async (blob) => {
      // inside the Claude viewer files are offered through its downloads capability
      const framed = !!window.claude?.use;
      const dl = framed ? await this.downloads() : null;
      if (dl) {
        try {
          await dl.save({ filename: name, data: blob });
          G.hud.toast('Photo saved.', 'good');
        } catch (e) {
          if (e?.code !== 'declined') G.hud.toast('The picture could not be saved here.', 'warn');
        }
      } else if (framed) G.hud.toast('Saving pictures is not available in this view.', 'warn');
      else viaLink(blob);
    };
    try {
      out.toBlob((b) => b && save(b), 'image/png');
    } catch (e) {
      G.hud.toast('This browser blocked saving the picture.', 'warn');
      return;
    }
    G.game.stat('photos');
    this.flash.classList.remove('go');
    void this.flash.offsetWidth;
    this.flash.classList.add('go');
    G.audio?.sfx('select');
    this.lastShot = out;
  }
}
