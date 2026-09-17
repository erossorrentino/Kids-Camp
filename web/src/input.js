// Centralized input state: held keys, edge-triggered "just pressed" keys,
// pointer-lock mouse deltas, mouse buttons, and wheel deltas. Keyboard/mouse
// listeners and the on-screen touch controls both funnel through the same
// setKey/setMouseButton/addLookDelta/addWheelDelta methods below, so the rest
// of the game never needs to know which input source is driving it.
// Any touch signal counts — 'pointer: coarse' alone has been seen to
// misreport inside some embedded/WebView contexts, and getting this wrong
// means TouchControls never shows up and a touch-only player has no way to
// move at all, so every check below is deliberately an OR (permissive),
// never the sole source of truth.
export const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0
  || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

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

    window.addEventListener('keydown', (e) => {
      if (NAV_KEYS.has(e.code)) e.preventDefault(); // stop arrow/space page scroll
      this.setKey(e.code, true);
    });
    window.addEventListener('keyup', (e) => this.setKey(e.code, false));

    if (!isTouchDevice) {
      domElement.addEventListener('click', () => {
        if (!this.pointerLocked) domElement.requestPointerLock();
      });
      document.addEventListener('pointerlockchange', () => {
        this.pointerLocked = document.pointerLockElement === domElement;
      });
      document.addEventListener('mousemove', (e) => {
        if (this.pointerLocked) this.addLookDelta(e.movementX || 0, e.movementY || 0);
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

  // Call once per frame after all systems have read this frame's edges/deltas.
  endFrame() {
    this.justPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
  }
}
