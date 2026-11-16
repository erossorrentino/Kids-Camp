// Keyboard + gamepad + touch input, merged into one driving state.
export class Input {
  constructor(root) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, analog: false };
    this.touch = { left: false, right: false, gas: false, brake: false, nitro: false, steer: 0 };
    this._kbSteer = 0;
    this.onKey = (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (e.type === 'keydown') {
        if (!this.keys.has(k)) this.pressed.add(k);
        this.keys.add(k);
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k) && this.capture) e.preventDefault();
      } else this.keys.delete(k);
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', () => this.keys.clear());
    this.capture = false;
    this.gpPrev = [];
    this.root = root;
  }

  isTouchDevice() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

  // edge-triggered actions: 'shiftUp','shiftDown','camera','reset','pause','lookBack','mute'
  consumeActions() {
    const a = new Set();
    const P = this.pressed;
    if (P.has('KeyE') || P.has('PageUp')) a.add('shiftUp');
    if (P.has('KeyQ') || P.has('PageDown')) a.add('shiftDown');
    if (P.has('KeyC')) a.add('camera');
    if (P.has('KeyR')) a.add('reset');
    if (P.has('Escape') || P.has('KeyP')) a.add('pause');
    if (P.has('KeyM')) a.add('mute');
    if (P.has('KeyH')) a.add('hud');
    this.pressed.clear();
    // gamepad buttons (edge)
    const gp = this.gamepad();
    if (gp) {
      const b = gp.buttons.map((x) => x.pressed);
      const edge = (i) => b[i] && !this.gpPrev[i];
      if (edge(5)) a.add('shiftUp');
      if (edge(4)) a.add('shiftDown');
      if (edge(3)) a.add('camera');
      if (edge(8)) a.add('reset');
      if (edge(9)) a.add('pause');
      this.gpPrev = b;
    }
    for (const t of this._touchActions || []) a.add(t);
    this._touchActions = [];
    return a;
  }

  gamepad() {
    if (!navigator.getGamepads) return null;
    try {
      for (const g of navigator.getGamepads()) if (g && g.connected) return g;
    } catch (e) { /* permissions policy may block gamepads in iframes */ }
    return null;
  }

  update(dt) {
    const K = this.keys, s = this.state, T = this.touch;
    let thr = K.has('KeyW') || K.has('ArrowUp') ? 1 : 0;
    let brk = K.has('KeyS') || K.has('ArrowDown') ? 1 : 0;
    let left = K.has('KeyA') || K.has('ArrowLeft');
    let right = K.has('KeyD') || K.has('ArrowRight');
    let hand = K.has('Space');
    let nitro = K.has('KeyN') || K.has('ShiftLeft') || K.has('ShiftRight');
    // keyboard steering ramps so taps make small corrections
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    const rate = target === 0 ? 8 : Math.sign(target) !== Math.sign(this._kbSteer) ? 10 : 5.5;
    this._kbSteer += Math.max(-rate * dt, Math.min(rate * dt, target - this._kbSteer));
    let steer = this._kbSteer;
    let analog = false;
    // touch
    if (T.gas) thr = 1;
    if (T.brake) brk = 1;
    if (T.nitro) nitro = true;
    if (T.left || T.right) { const t2 = (T.left ? 1 : 0) - (T.right ? 1 : 0); steer = t2 * Math.min(1, Math.abs(steer) + dt * 7) || t2; this._kbSteer = steer; }
    if (T.steer) { steer = T.steer; analog = true; }
    // gamepad
    const gp = this.gamepad();
    if (gp) {
      const ax = gp.axes[0] || 0;
      const dz = 0.08;
      if (Math.abs(ax) > dz) { steer = -Math.sign(ax) * Math.pow((Math.abs(ax) - dz) / (1 - dz), 1.6); analog = true; }
      const rt = gp.buttons[7]?.value || 0, lt = gp.buttons[6]?.value || 0;
      if (rt > 0.02) thr = Math.max(thr, rt);
      if (lt > 0.02) brk = Math.max(brk, lt);
      if (gp.buttons[0]?.pressed) thr = Math.max(thr, 1);
      if (gp.buttons[1]?.pressed) hand = true;
      if (gp.buttons[2]?.pressed) nitro = true;
    }
    s.throttle = thr; s.brake = brk; s.steer = steer; s.handbrake = hand; s.nitro = nitro; s.analog = analog;
    return s;
  }

  // On-screen controls for phones/tablets
  buildTouchControls(container) {
    const el = document.createElement('div');
    el.className = 'touch-controls';
    el.innerHTML = `
      <div class="tc-left"><button data-k="left" aria-label="Steer left">◀</button><button data-k="right" aria-label="Steer right">▶</button></div>
      <div class="tc-right"><button data-k="nitro" class="tc-nitro" aria-label="Nitro">N2O</button><button data-k="brake" class="tc-brake" aria-label="Brake">BRAKE</button><button data-k="gas" class="tc-gas" aria-label="Accelerate">GAS</button></div>
      <button class="tc-pause" data-a="pause" aria-label="Pause">❚❚</button><button class="tc-cam" data-a="camera" aria-label="Camera">CAM</button>`;
    const set = (k, v) => { this.touch[k] = v; };
    el.querySelectorAll('button[data-k]').forEach((b) => {
      const k = b.dataset.k;
      const on = (e) => { e.preventDefault(); set(k, true); b.classList.add('on'); };
      const off = (e) => { e.preventDefault(); set(k, false); b.classList.remove('on'); };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off, { passive: false });
      b.addEventListener('touchcancel', off, { passive: false });
      b.addEventListener('mousedown', on); b.addEventListener('mouseup', off); b.addEventListener('mouseleave', off);
    });
    el.querySelectorAll('button[data-a]').forEach((b) => {
      const fire = (e) => { e.preventDefault(); (this._touchActions ||= []).push(b.dataset.a); };
      b.addEventListener('touchstart', fire, { passive: false });
      b.addEventListener('click', fire);
    });
    container.appendChild(el);
    this.touchEl = el;
    return el;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
  }
}
