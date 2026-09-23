/**
 * INPUT
 * ------------------------------------------------------------------
 * Keyboard + pointer-lock mouse, with a remappable action table. Actions
 * are polled by the simulation (`isDown`) or consumed as edges
 * (`pressed`) so a tap never registers twice.
 */

export const DEFAULT_BINDS = {
  // Arrows sit beside WASD, not instead of it: a laptop or a Chromebook is
  // often played with one hand on the arrow cluster.
  forward:['KeyW', 'ArrowUp'], back:['KeyS', 'ArrowDown'],
  left:['KeyA', 'ArrowLeft'], right:['KeyD', 'ArrowRight'],
  jump:['Space'], ability:['KeyQ'], brake:['ShiftLeft','ShiftRight'],
  weapon1:['Digit1'], weapon2:['Digit2'], weapon3:['Digit3'],
  weapon4:['Digit4'], weapon5:['Digit5'], weapon6:['Digit6'],
  groupAlpha:['KeyZ'], groupBeta:['KeyX'], groupAll:['KeyC'],
  zoom:['KeyV'], cockpit:['KeyF'], scoreboard:['Tab'], target:['KeyE'],
  powerdown:['KeyP'], menu:['Escape'], radarPing:['KeyG'], melee:['KeyR'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.binds = { ...DEFAULT_BINDS };
    this.down = new Set();
    this.edges = new Set();
    this.mouse = { dx:0, dy:0, left:false, right:false, middle:false, wheel:0 };
    this.mouseEdges = { left:false, right:false };
    this.locked = false;
    this.sensitivity = 0.0022;
    this.invertY = false;
    this.enabled = true;

    /* ---- aiming mode ----
     * Pointer lock is the good way to aim, but it is not always available:
     * an embedded frame without `allow="pointer-lock"` refuses it, and so do
     * some browsers after a user has dismissed the prompt. Rather than
     * leaving the player with no way to turn, we fall back to steering --
     * the further the cursor sits from the centre of the viewport, the
     * faster the torso swings that way, with a dead zone in the middle.
     */
    this.aimMode = 'lock';          // 'lock' | 'steer' | 'touch'
    this.lockDenied = false;
    this.cursor = { x: 0, y: 0, inside: false };
    this.steerSpeed = 2.6;          // radians per second at full deflection
    this.steerDeadzone = 0.08;
    this.onAimModeChange = null;

    /* ---- touch ----
     * A phone has no keyboard, no mouse buttons and no pointer lock. The
     * on-screen controls write the same intent the keys and mouse write --
     * a virtual action set beside the key set, a stick vector beside the
     * WASD vector, drag pixels beside mouse pixels -- so nothing downstream
     * has to know which one a player is using.
     */
    this.touch = { move:{ x:0, z:0 }, aimDx:0, aimDy:0, active:false };
    this.touchSensitivity = 0.0052;
    this.virtual = new Set();       // actions held by an on-screen button
    this.virtualEdges = new Set();  // and their press edges

    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      // Arrows scroll the page and space presses whatever has focus. Both
      // are the player trying to drive -- unless they are actually on a
      // control, in which case the browser's behaviour is the right one.
      const tag = document.activeElement?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'BUTTON'
          && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault();
      if (this.down.has(e.code)) return;
      this.down.add(e.code);
      this.edges.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => {
      this.down.clear();
      this.virtual.clear();
      this.touch.move.x = this.touch.move.z = 0;
      this.mouse.left = this.mouse.right = false;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      // In steering mode there is no lock to gate on -- a click on the
      // viewport is a trigger pull.
      if (!this.locked && this.aimMode !== 'steer') return;
      if (e.button === 0) { this.mouse.left = true; this.mouseEdges.left = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouseEdges.right = true; }
      if (e.button === 1) this.mouse.middle = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      if (e.button === 1) this.mouse.middle = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      // Always track the cursor: steering mode needs it, and it costs nothing.
      const r = this.canvas.getBoundingClientRect();
      this.cursor.x = (e.clientX - r.left) / r.width * 2 - 1;
      this.cursor.y = (e.clientY - r.top) / r.height * 2 - 1;
      this.cursor.inside = e.clientX >= r.left && e.clientX <= r.right
        && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    this.canvas.addEventListener('mouseleave', () => { this.cursor.inside = false; });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive:true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    if (this.locked || this.aimMode !== 'lock') return;
    let p;
    try { p = this.canvas.requestPointerLock?.(); } catch { this._denyLock(); return; }
    // Chrome returns a promise; a frame without pointer-lock permission
    // rejects it rather than throwing.
    if (p && typeof p.catch === 'function') p.catch(() => this._denyLock());
    // Some browsers neither throw nor reject -- they simply never lock.
    clearTimeout(this._lockProbe);
    this._lockProbe = setTimeout(() => { if (!this.locked) this._denyLock(); }, 900);
  }

  _denyLock() {
    if (this.aimMode === 'steer') return;
    this.lockDenied = true;
    this.aimMode = 'steer';
    this.onAimModeChange?.('steer');
  }

  /** Let the player choose steering even where pointer lock works. */
  setAimMode(mode) {
    if (mode === this.aimMode) return;
    this.aimMode = mode;
    if (mode === 'steer') this.releaseLock();
    this.onAimModeChange?.(mode);
  }
  releaseLock() { if (this.locked) document.exitPointerLock?.(); }

  /* ---- on-screen controls ---------------------------------------- */

  /** Switch aiming to drag-to-look and movement to the virtual stick. */
  setTouchMode(on) {
    const mode = on ? 'touch' : 'lock';
    if (this.aimMode === mode) return;
    this.touch.active = !!on;
    if (on) this.releaseLock();
    this.aimMode = mode;
    this.onAimModeChange?.(mode);
  }

  /** Hold or release an action from an on-screen button. */
  holdVirtual(action, on) {
    if (on) {
      if (!this.virtual.has(action)) this.virtualEdges.add(action);
      this.virtual.add(action);
    } else this.virtual.delete(action);
  }

  /** Fire one press edge without a hold -- for taps on an on-screen button. */
  tapVirtual(action) { this.virtualEdges.add(action); }

  /** Stick deflection: x = strafe, z = forward, each -1..1. */
  setTouchMove(x, z) { this.touch.move.x = x; this.touch.move.z = z; }

  /** Drag pixels for this frame, consumed like mouse-lock deltas. */
  addTouchAim(dx, dy) { this.touch.aimDx += dx; this.touch.aimDy += dy; }

  /** True while any key bound to `action` is held. */
  isDown(action) {
    if (!this.enabled) return false;
    if (this.virtual.has(action)) return true;
    const codes = this.binds[action];
    if (!codes) return false;
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** True exactly once per physical press. */
  pressed(action) {
    if (!this.enabled) return false;
    if (this.virtualEdges.has(action)) return true;
    const codes = this.binds[action];
    if (!codes) return false;
    for (const c of codes) if (this.edges.has(c)) return true;
    return false;
  }

  /**
   * Aim change for this frame, in radians.
   *
   * Pointer lock gives raw pixel deltas, which scale by sensitivity. Steering
   * gives a rate from how far the cursor sits off centre, which scales by
   * time. Returning radians from one place keeps the caller from having to
   * know which mode is active.
   *
   * @param {number} dt seconds
   * @param {number} zoom current magnification; aiming slows as you zoom in
   */
  aimDelta(dt, zoom = 1) {
    const scale = 1 / Math.max(0.4, zoom);
    if (this.aimMode === 'touch') {
      if (!this.enabled) return ZERO_AIM;
      _aim.x = this.touch.aimDx * this.touchSensitivity * scale;
      _aim.y = this.touch.aimDy * this.touchSensitivity * scale * (this.invertY ? -1 : 1);
      return _aim;
    }
    if (this.aimMode === 'lock') {
      if (!this.locked || !this.enabled) return ZERO_AIM;
      _aim.x = this.mouse.dx * this.sensitivity * scale;
      _aim.y = this.mouse.dy * this.sensitivity * scale * (this.invertY ? -1 : 1);
      return _aim;
    }
    if (!this.enabled || !this.cursor.inside) return ZERO_AIM;
    const dz = this.steerDeadzone;
    const ramp = (v) => {
      const a = Math.abs(v);
      if (a < dz) return 0;
      // Squared past the dead zone: precise near the middle, fast at the edge.
      const t = (a - dz) / (1 - dz);
      return Math.sign(v) * t * t;
    };
    _aim.x = ramp(this.cursor.x) * this.steerSpeed * scale * dt;
    _aim.y = ramp(this.cursor.y) * this.steerSpeed * 0.7 * scale * dt * (this.invertY ? -1 : 1);
    return _aim;
  }

  /** Movement vector in local space: x = strafe, z = forward. */
  moveVector() {
    let x = 0, z = 0;
    if (this.touch.move.x || this.touch.move.z) { x = this.touch.move.x; z = this.touch.move.z; }
    if (this.isDown('forward')) z += 1;
    if (this.isDown('back')) z -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('left')) x -= 1;
    const len = Math.hypot(x, z);
    return len > 1 ? { x: x / len, z: z / len } : { x, z };
  }

  /** Consume per-frame deltas. Called once at the end of every update. */
  endFrame() {
    this.edges.clear();
    this.virtualEdges.clear();
    this.touch.aimDx = 0; this.touch.aimDy = 0;
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouseEdges.left = false; this.mouseEdges.right = false;
  }

  rebind(action, code) { this.binds[action] = [code]; }
}

const ZERO_AIM = { x: 0, y: 0 };
const _aim = { x: 0, y: 0 };
