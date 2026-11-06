import * as THREE from 'three';
import { G } from '../core/G.js';

// Letterboxed camera sequences with subtitles. A sequence is a list of
// steps; each can move the camera, show a line, run a callback or wait.
export class Cutscene {
  constructor() {
    const root = document.getElementById('ui-root');
    this.el = document.createElement('div');
    this.el.className = 'cutscene';
    this.el.innerHTML = '<div class="lb top"></div><div class="lb bottom"></div><div class="sub"><div class="sub-s"></div><div class="sub-t"></div></div><div class="skip">Hold <span class="k">Esc</span> to skip</div>';
    root.appendChild(this.el);
    this.subS = this.el.querySelector('.sub-s');
    this.subT = this.el.querySelector('.sub-t');
    this.active = false;
    this.skipHold = 0;
    this._look = new THREE.Vector3();
  }

  play(steps, onDone) {
    this.steps = steps;
    this.i = -1;
    this.onDone = onDone;
    this.active = true;
    this.el.classList.add('on');
    G.hud.root.classList.add('in-cutscene');
    G.input.exitLock();
    G.player.vel.set(0, 0, 0);
    G.player.lockTarget = null;
    this.next();
  }

  next() {
    this.i++;
    if (this.i >= this.steps.length) return this.finish();
    const s = this.steps[this.i];
    this.cur = s;
    this.t = 0;
    this.dur = s.dur ?? (s.line ? Math.max(2.2, s.line.t.length * 0.055) : s.cam ? s.cam.dur : 0);
    if (s.fn) s.fn();
    if (s.cam) {
      const c = s.cam;
      this.cam = {
        from: typeof c.from === 'function' ? c.from() : c.from || G.camera.position.clone(),
        to: typeof c.to === 'function' ? c.to() : c.to,
        look: typeof c.look === 'function' ? c.look() : c.look,
        lookTo: typeof c.lookTo === 'function' ? c.lookTo() : c.lookTo,
        dur: c.dur,
        fov: c.fov || 55,
        t: 0,
      };
      if (!this.cam.to) this.cam.to = this.cam.from;
    }
    if (s.line) {
      this.subS.textContent = s.line.s || '';
      this.subT.textContent = s.line.t;
      this.el.querySelector('.sub').classList.add('show');
      this.el.querySelector('.sub').classList.toggle('narration', !s.line.s);
    } else if (!s.keepLine) this.el.querySelector('.sub').classList.remove('show');
    if (s.fade) G.fx.screenFade(s.fade);
    if (this.dur <= 0 && !s.cam) this.next();
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const c = this.cam;
    if (c) {
      c.t += dt;
      let u = Math.min(1, c.t / c.dur);
      u = u * u * (3 - 2 * u);
      G.camera.position.lerpVectors(c.from, c.to, u);
      this._look.lerpVectors(c.look, c.lookTo || c.look, u);
      G.camera.lookAt(this._look);
      if (G.camera.fov !== c.fov) { G.camera.fov = c.fov; G.camera.updateProjectionMatrix(); }
    }
    const inp = G.input;
    if (inp.keys.has('Escape') || (inp.gpState && inp.gpState.pause)) {
      this.skipHold += dt;
      if (this.skipHold > 0.8) return this.skipAll();
    } else this.skipHold = 0;
    if (this.cur && this.cur.line && (inp.hit('interact') || inp.hit('confirm') || inp.mousePressed.left) && this.t > 0.3) return this.next();
    if (this.t >= this.dur) this.next();
  }

  skipAll() {
    if (!this.active) return;
    // run remaining callbacks so story state stays consistent
    for (let k = this.i + 1; k < this.steps.length; k++) if (this.steps[k].fn) this.steps[k].fn();
    this.finish();
  }

  finish() {
    this.active = false;
    this.cam = null;
    this.el.classList.remove('on');
    this.el.querySelector('.sub').classList.remove('show');
    G.hud.root.classList.remove('in-cutscene');
    if (G.input.lastDevice === 'kbm' && !G.dialogue?.active) G.input.requestLock();
    G.cam.smoothTarget.copy(G.player.pos);
    G.cam.curDist = G.cam.dist;
    const cb = this.onDone;
    this.onDone = null;
    if (cb) cb();
  }
}
