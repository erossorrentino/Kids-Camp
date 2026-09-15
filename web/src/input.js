// Centralized input state: held keys, edge-triggered "just pressed" keys,
// pointer-lock mouse deltas, mouse buttons, and wheel deltas. Keyboard/mouse
// listeners and the on-screen touch controls both funnel through the same
// setKey/setMouseButton/addLookDelta/addWheelDelta methods below, so the rest
// of the game never needs to know which input source is driving it.
// Prefer "what's the primary pointer" (so a touchscreen laptop with a mouse
// still gets keyboard/mouse controls) and fall back to raw touch support.
export const isTouchDevice = window.matchMedia
  ? window.matchMedia('(pointer: coarse)').matches
  : ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// Movement is primarily arrow keys + Space; WASD still works as an alias so
// either scheme drives the same isDown() checks everywhere (on foot, driving,
// flying) without every call site needing to know about both.
const ARROW_ALIAS = { KeyW: 'ArrowUp', KeyS: 'ArrowDown', KeyA: 'ArrowLeft', KeyD: 'ArrowRight' };
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

  isDown(code) {
    if (this.keys.has(code)) return true;
    const alias = ARROW_ALIAS[code];
    return alias ? this.keys.has(alias) : false;
  }
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
