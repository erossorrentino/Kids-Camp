/**
 * INPUT
 * ------------------------------------------------------------------
 * Keyboard + pointer-lock mouse, with a remappable action table. Actions
 * are polled by the simulation (`isDown`) or consumed as edges
 * (`pressed`) so a tap never registers twice.
 */

export const DEFAULT_BINDS = {
  forward:['KeyW'], back:['KeyS'], left:['KeyA'], right:['KeyD'],
  jump:['Space'], ability:['KeyQ'], brake:['ShiftLeft','ShiftRight'],
  weapon1:['Digit1'], weapon2:['Digit2'], weapon3:['Digit3'],
  weapon4:['Digit4'], weapon5:['Digit5'], weapon6:['Digit6'],
  groupAlpha:['KeyZ'], groupBeta:['KeyX'], groupAll:['KeyC'],
  zoom:['KeyV'], cockpit:['KeyF'], scoreboard:['Tab'], target:['KeyE'],
  powerdown:['KeyP'], menu:['Escape'], radarPing:['KeyG'], nextTarget:['KeyR'],
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
    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (this.down.has(e.code)) return;
      this.down.add(e.code);
      this.edges.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.mouse.left = this.mouse.right = false; });

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
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
      if (!this.locked) return;
      this.mouse.dx += e.movementX * this.sensitivity;
      this.mouse.dy += e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
    });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive:true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    if (!this.locked) this.canvas.requestPointerLock?.();
  }
  releaseLock() { if (this.locked) document.exitPointerLock?.(); }

  /** True while any key bound to `action` is held. */
  isDown(action) {
    if (!this.enabled) return false;
    const codes = this.binds[action];
    if (!codes) return false;
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** True exactly once per physical press. */
  pressed(action) {
    if (!this.enabled) return false;
    const codes = this.binds[action];
    if (!codes) return false;
    for (const c of codes) if (this.edges.has(c)) return true;
    return false;
  }

  /** Movement vector in local space: x = strafe, z = forward. */
  moveVector() {
    let x = 0, z = 0;
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
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouseEdges.left = false; this.mouseEdges.right = false;
  }

  rebind(action, code) { this.binds[action] = [code]; }
}
