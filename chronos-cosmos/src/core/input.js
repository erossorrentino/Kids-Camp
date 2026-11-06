// Keyboard, mouse (pointer lock with drag fallback), gamepad and touch.
// Gameplay code reads abstract actions, never raw keys.

const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft'],
  interact: ['KeyE'],
  cast: ['KeyQ'],
  weave: ['KeyF'],
  stance: ['KeyR'],
  lock: ['Tab'],
  epoch: ['KeyT'],
  build: ['KeyB'],
  whistle: ['KeyH'],
  map: ['KeyM'],
  journal: ['KeyJ'],
  inventory: ['KeyI'],
  pause: ['Escape', 'KeyP'],
  el1: ['Digit1'],
  el2: ['Digit2'],
  el3: ['Digit3'],
  el4: ['Digit4'],
  el5: ['Digit5'],
  el6: ['Digit6'],
  el7: ['Digit7'],
  el8: ['Digit8'],
  el9: ['Digit9'],
  confirm: ['Enter', 'NumpadEnter'],
  rotate: ['KeyR'],
  photo: ['KeyV'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // actions pressed this frame
    this.released = new Set();
    this.held = {}; // action -> seconds held
    this.mouse = { dx: 0, dy: 0, wheel: 0, left: false, right: false, middle: false, x: 0, y: 0 };
    this.mousePressed = { left: false, right: false, middle: false };
    this.mouseReleased = { left: false, right: false, middle: false };
    this.locked = false;
    this.dragging = false;
    this.enabled = true;
    this.uiCapture = false; // when menus are open
    this.gp = null;
    this.gpPrev = {};
    this.touch = { active: false, move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };
    this.lastDevice = 'kbm';
    this.moveVec = { x: 0, y: 0 };
    this.lookVec = { x: 0, y: 0 };
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (this.lastDevice === 'touch' && !e.repeat) this.lastDevice = 'kbm';
      if (e.code === 'Space' && !this.uiCapture) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.lastDevice = 'kbm';
      for (const a in BINDINGS) if (BINDINGS[a].includes(e.code)) this.pressed.add(a);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      for (const a in BINDINGS) if (BINDINGS[a].includes(e.code)) this.released.add(a);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = this.mouse.middle = false;
    });
    // Phones fire emulated mouse events after every touch; ignore those so a
    // drag to look around never turns into a sword swing.
    this.lastTouch = -1e9;
    const touched = () => {
      this.lastTouch = performance.now();
      this.lastDevice = 'touch';
    };
    window.addEventListener('touchstart', touched, { passive: true, capture: true });
    window.addEventListener('touchend', touched, { passive: true, capture: true });
    const fromTouch = () => performance.now() - this.lastTouch < 900;
    this.fromTouch = fromTouch;
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (fromTouch()) return;
      this.lastDevice = 'kbm';
      if (!this.locked && this.wantLock && (!this.canLock || this.canLock())) this.requestLock();
      const b = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      this.mouse[b] = true;
      this.mousePressed[b] = true;
      if (!this.locked) this.dragging = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (fromTouch()) return;
      const b = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      if (this.mouse[b]) this.mouseReleased[b] = true;
      this.mouse[b] = false;
      if (!this.mouse.left && !this.mouse.right) this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (fromTouch()) return;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.locked) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      } else if (this.dragging && !this.uiCapture) {
        this.mouse.dx += e.movementX * 1.4;
        this.mouse.dy += e.movementY * 1.4;
      }
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.uiCapture) return;
        this.mouse.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) {
        // a lock request granted after we already let go (e.g. a cutscene began)
        if (!this.lockWanted) this._release();
      } else if (was) {
        // the lock ended without us asking while play wanted it: the player's Esc
        const ours = this.selfExit;
        this.selfExit = false;
        if (!ours && this.lockWanted) {
          this.lockWanted = false;
          this.onUserUnlock?.();
        }
      }
    });
    document.addEventListener('pointerlockerror', () => {
      this.locked = false;
      this.lockWanted = false;
      this.lockFailed = true;
      // browsers refuse a re-lock right after Esc; allow retrying shortly after
      clearTimeout(this._lfT);
      this._lfT = setTimeout(() => (this.lockFailed = false), 1500);
    });
    window.addEventListener('gamepadconnected', () => (this.lastDevice = 'pad'));
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  requestLock() {
    if (this.lockFailed || this.lastDevice === 'touch') return;
    this.lockWanted = true;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      this.lockFailed = true;
    }
  }
  exitLock() {
    this.lockWanted = false;
    if (document.pointerLockElement) this._release();
  }
  _release() {
    // remember that we released the mouse ourselves (not the player's Esc)
    this.selfExit = true;
    try {
      document.exitPointerLock();
    } catch (e) {
      this.selfExit = false;
    }
  }

  down(action) {
    if (!this.enabled) return false;
    const b = BINDINGS[action];
    if (b) for (const k of b) if (this.keys.has(k)) return true;
    if (this.gpState && this.gpState[action]) return true;
    if (this.touch.buttons[action]) return true;
    return false;
  }
  hit(action) {
    return this.enabled && this.pressed.has(action);
  }
  up(action) {
    return this.enabled && this.released.has(action);
  }
  attackDown() {
    return this.enabled && (this.mouse.left || this.down('attack'));
  }
  attackHit() {
    return this.enabled && (this.mousePressed.left || this.pressed.has('attack'));
  }
  attackUp() {
    return this.enabled && (this.mouseReleased.left || this.released.has('attack'));
  }
  blockDown() {
    return this.enabled && (this.mouse.right || this.down('block'));
  }
  blockHit() {
    return this.enabled && (this.mousePressed.right || this.pressed.has('block'));
  }

  update(dt) {
    // gamepad polling
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.gpState = null;
    let gmx = 0, gmy = 0, glx = 0, gly = 0;
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      gmx = dz(gp.axes[0] || 0);
      gmy = dz(gp.axes[1] || 0);
      glx = dz(gp.axes[2] || 0);
      gly = dz(gp.axes[3] || 0);
      const B = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      // Standard mapping: A jump, B dodge/sprint, X attack, Y interact,
      // RB block/parry, RT cast, LB lock-on, LT weave, d-pad epoch/whistle/elements.
      const st = {
        jump: B(0), sprint: B(1), attack: B(2), interact: B(3), lock: B(4), block: B(5), weave: B(6),
        cast: B(7), map: B(8), pause: B(9), crouch: B(10), stance: B(11), epoch: B(12), whistle: B(13),
        prevEl: B(14), nextEl: B(15), confirm: B(0),
      };
      for (const k in st) {
        if (st[k] && !this.gpPrev[k]) {
          this.pressed.add(k);
          this.lastDevice = 'pad';
        }
        if (!st[k] && this.gpPrev[k]) this.released.add(k);
      }
      if (Math.abs(gmx) + Math.abs(gmy) + Math.abs(glx) + Math.abs(gly) > 0.1) this.lastDevice = 'pad';
      this.gpPrev = st;
      this.gpState = st;
    }
    // movement vector
    let mx = 0, my = 0;
    if (this.down('forward')) my -= 1;
    if (this.down('back')) my += 1;
    if (this.down('left')) mx -= 1;
    if (this.down('right')) mx += 1;
    mx += gmx + this.touch.move.x;
    my += gmy + this.touch.move.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.moveVec.x = this.enabled ? mx : 0;
    this.moveVec.y = this.enabled ? my : 0;
    const sens = 0.0022;
    this.lookVec.x = this.mouse.dx * sens + glx * dt * 3.2 + this.touch.look.x;
    this.lookVec.y = this.mouse.dy * sens + gly * dt * 2.4 + this.touch.look.y;
    this.touch.look.x = this.touch.look.y = 0;
    for (const a in BINDINGS) {
      if (this.down(a)) this.held[a] = (this.held[a] || 0) + dt;
      else this.held[a] = 0;
    }
    this.held.attack = this.attackDown() ? (this.held.attack || 0) + dt : 0;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.wheel = 0;
    this.mousePressed.left = this.mousePressed.right = this.mousePressed.middle = false;
    this.mouseReleased.left = this.mouseReleased.right = this.mouseReleased.middle = false;
  }
}
