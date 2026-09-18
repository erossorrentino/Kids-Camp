// Centralized input state: held keys, edge-triggered "just pressed" keys,
// pointer-lock mouse deltas, mouse buttons, and wheel deltas. Keyboard/mouse
// listeners and the on-screen touch controls both funnel through the same
// setKey/setMouseButton/addLookDelta/addWheelDelta methods below, so the rest
// of the game never needs to know which input source is driving it.
// Any touch signal counts — 'pointer: coarse' alone has been seen to
// misreport inside some embedded/WebView contexts, and getting this wrong
// means TouchControls never shows up and a touch-only player has no way to
// move at all, so every check below is deliberately an OR (permissive),
// never the sole source of truth. The screen-size check is the most
// important one in practice: it catches phones even when every touch-
// capability API above misreports (seen when this game runs embedded as a
// Claude Artifact on mobile) — a real desktop window is essentially never
// this small, so showing the on-screen controls there is a harmless,
// vanishingly rare false positive rather than a broken phone. It checks
// the SHORTER of width/height rather than raw width: a phone's short edge
// stays small in both portrait AND landscape (its width alone doesn't —
// landscape width is the long edge, easily 700-950px, well past a
// portrait-only threshold), so this catches both orientations the same way.
export const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0
  || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  || Math.min(window.innerWidth, window.innerHeight) <= 500;

// Arrow keys are the primary movement scheme (plus Space); WASD keeps
// working too. This is NOT a blanket alias on isDown() — the jet already
// binds arrow keys to yaw/pitch independently of its WASD throttle/roll, so
// callers that need "WASD or arrows" (on-foot movement, car steering, heli
// pitch/roll) check both codes explicitly instead, via isDownAny().
const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.mouseButtons = new Set();
    this.pointerLocked = false;
    this._fallbackOffsetX = 0;
    this._fallbackOffsetY = 0;

    window.addEventListener('keydown', (e) => {
      if (NAV_KEYS.has(e.code)) e.preventDefault(); // stop arrow/space page scroll
      this.setKey(e.code, true);
    });
    window.addEventListener('keyup', (e) => this.setKey(e.code, false));

    if (!isTouchDevice) {
      domElement.addEventListener('click', () => {
        if (this.pointerLocked) return;
        // requestPointerLock() returns a Promise in Chromium that REJECTS
        // when the browser denies the lock (e.g. running inside a sandboxed
        // embed/iframe without the pointer-lock permission, as a published
        // Claude Artifact does) — left uncaught, that becomes an unhandled
        // rejection, and main.js treats any of those as a fatal startup
        // error. Swallow it here and just fall through to the cursor-offset
        // look fallback below instead of crashing the whole game screen.
        const req = domElement.requestPointerLock();
        if (req && typeof req.catch === 'function') req.catch(() => {});
      });
      document.addEventListener('pointerlockerror', () => {}); // older event-based API; nothing to do, fallback covers it
      document.addEventListener('pointerlockchange', () => {
        this.pointerLocked = document.pointerLockElement === domElement;
      });
      document.addEventListener('mousemove', (e) => {
        if (this.pointerLocked) {
          this.addLookDelta(e.movementX || 0, e.movementY || 0);
          return;
        }
        // Fallback look, used whenever Pointer Lock isn't actually engaged
        // (denied, unsupported, or just not clicked into yet): the cursor's
        // offset from the canvas center acts like a look-rate stick, turned
        // into a continuous delta each frame by update() below. This is
        // what keeps mouse-look working inside a restrictive iframe embed.
        const rect = domElement.getBoundingClientRect();
        this._fallbackOffsetX = e.clientX - (rect.left + rect.width / 2);
        this._fallbackOffsetY = e.clientY - (rect.top + rect.height / 2);
      });
    }
    domElement.addEventListener('mousedown', (e) => this.setMouseButton(e.button, true));
    window.addEventListener('mouseup', (e) => this.setMouseButton(e.button, false));
    domElement.addEventListener('wheel', (e) => this.addWheelDelta(e.deltaY), { passive: true });
    domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code) { return this.keys.has(code); }

  // True if any of the given key codes is held (e.g. isDownAny('KeyW', 'ArrowUp')).
  isDownAny(...codes) { return codes.some((c) => this.keys.has(c)); }

  wasPressed(code) { return this.justPressed.has(code); }
  isMouseDown(btn) { return this.mouseButtons.has(btn); }

  setKey(code, down) {
    if (down) {
      if (!this.keys.has(code)) this.justPressed.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  // A single-frame "tap": shows up in wasPressed() this frame without ever
  // needing a matching key-up (used by tap-style touch buttons).
  pulseKey(code) {
    this.justPressed.add(code);
  }

  setMouseButton(btn, down) {
    if (down) this.mouseButtons.add(btn);
    else this.mouseButtons.delete(btn);
  }

  addLookDelta(dx, dy) {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  addWheelDelta(delta) {
    this.wheelDelta += delta;
  }

  // Call once per frame, before anything reads mouseDX/mouseDY, to turn the
  // fallback cursor-offset (see the mousemove listener above) into a look
  // delta for this frame — only relevant while Pointer Lock isn't engaged.
  update(dt) {
    if (this.pointerLocked) return;
    const DEAD = 40; // px near center that don't register as "looking"
    const RANGE = 220; // px of travel to reach full turn rate
    const RATE = 900; // look-delta units/sec at full deflection (matches locked-mode feel)
    const axis = (offset) => {
      if (Math.abs(offset) < DEAD) return 0;
      const mag = Math.min(1, (Math.abs(offset) - DEAD) / RANGE);
      return Math.sign(offset) * mag * RATE * dt;
    };
    this.addLookDelta(axis(this._fallbackOffsetX), axis(this._fallbackOffsetY));
  }

  // Call once per frame after all systems have read this frame's edges/deltas.
  endFrame() {
    this.justPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
  }
}
