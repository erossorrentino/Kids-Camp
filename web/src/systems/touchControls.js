import { isTouchDevice } from '../input.js';

const JOY_RADIUS = 30; // px the knob can travel from center before clamping (keeps it inside the 108px base ring)
const JOY_DEADZONE = 0.28; // fraction of radius before a direction registers as "pressed"

const HOLD_BUTTONS = [
  ['btnFire', 'mouse0'],
  ['btnAim', 'mouse2'],
  ['btnBoost', 'ShiftLeft'],
  ['btnJump', 'Space'],
  ['btnYawL', 'KeyQ'],
  ['btnYawR', 'KeyE'],
];

const TAP_KEYS = [
  ['btnUse', 'KeyF'],
  ['btnReload', 'KeyR'],
  ['btnRadio', 'KeyT'],
  ['btnPaint', 'KeyC'],
  ['btnNeon', 'KeyN'],
];

// Drives the same Input state a keyboard/mouse would (see input.js's
// setKey/setMouseButton/addLookDelta/addWheelDelta) from an on-screen
// joystick, a drag-anywhere-to-look zone, and a cluster of buttons — nothing
// downstream (player/vehicle/weapon/camera code) has to know touch exists.
export class TouchControls {
  constructor(input, root = document) {
    this.input = input;
    this.el = {
      container: root.getElementById('touchControls'),
      joyBase: root.getElementById('joyBase'),
      joyKnob: root.getElementById('joyKnob'),
      lookZone: root.getElementById('lookZone'),
    };
    if (!this.el.container) return;

    this._joyTouchId = null;
    this._joyKeys = { up: false, down: false, left: false, right: false };
    this._lookTouchId = null;
    this._lookLast = { x: 0, y: 0 };

    // Handlers are always bound, touch device or not — CSS keeps the UI
    // hidden by default (no .show class) so this costs nothing on a mouse
    // setup. That way, if a real touch ever lands despite isTouchDevice
    // reading false (an embedded/WebView misreport), the controls are
    // already wired and just need revealing (see the fallback below).
    this._bindJoystick();
    this._bindLookZone();
    this._bindButtons(root);

    if (isTouchDevice) {
      this.el.container.classList.add('show');
    } else {
      // isTouchDevice (input.js) now also catches narrow/phone-sized
      // viewports, so this only matters for an unusual case it still
      // misses (e.g. a touch tablet in a wide landscape). Reveal on the
      // very first real touch, anywhere — classList.add is idempotent, so
      // it's safe to leave this listening indefinitely rather than
      // `once: true`, in case the first touch that lands is one this
      // listener somehow misses (a defensive belt-and-suspenders).
      const revealOnRealTouch = () => this.el.container.classList.add('show');
      window.addEventListener('touchstart', revealOnRealTouch, { passive: true });
      document.addEventListener('touchstart', revealOnRealTouch, { passive: true, capture: true });
    }
  }

  _bindJoystick() {
    const { joyBase, joyKnob } = this.el;
    const start = (e) => {
      if (this._joyTouchId !== null) return;
      const t = e.changedTouches[0];
      this._joyTouchId = t.identifier;
      this._updateJoystick(t);
      e.preventDefault();
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyTouchId) { this._updateJoystick(t); e.preventDefault(); }
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyTouchId) {
          this._joyTouchId = null;
          joyKnob.style.transform = 'translate(0, 0)';
          this._setJoyKeys(0, 0);
        }
      }
    };
    joyBase.addEventListener('touchstart', start, { passive: false });
    joyBase.addEventListener('touchmove', move, { passive: false });
    joyBase.addEventListener('touchend', end);
    joyBase.addEventListener('touchcancel', end);
  }

  _updateJoystick(touch) {
    const rect = this.el.joyBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > JOY_RADIUS) { dx = (dx / dist) * JOY_RADIUS; dy = (dy / dist) * JOY_RADIUS; }
    this.el.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    this._setJoyKeys(dx / JOY_RADIUS, dy / JOY_RADIUS);
  }

  _setJoyKeys(nx, ny) {
    const want = {
      up: ny < -JOY_DEADZONE, down: ny > JOY_DEADZONE,
      left: nx < -JOY_DEADZONE, right: nx > JOY_DEADZONE,
    };
    const map = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
    for (const dir of Object.keys(want)) {
      if (want[dir] !== this._joyKeys[dir]) this.input.setKey(map[dir], want[dir]);
    }
    this._joyKeys = want;
  }

  _bindLookZone() {
    const zone = this.el.lookZone;
    const start = (e) => {
      if (this._lookTouchId !== null) return;
      const t = e.changedTouches[0];
      this._lookTouchId = t.identifier;
      this._lookLast.x = t.clientX;
      this._lookLast.y = t.clientY;
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookTouchId) continue;
        this.input.addLookDelta(t.clientX - this._lookLast.x, t.clientY - this._lookLast.y);
        this._lookLast.x = t.clientX;
        this._lookLast.y = t.clientY;
        e.preventDefault();
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this._lookTouchId) this._lookTouchId = null;
    };
    zone.addEventListener('touchstart', start, { passive: false });
    zone.addEventListener('touchmove', move, { passive: false });
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
  }

  _bindButtons(root) {
    for (const [id, code] of HOLD_BUTTONS) {
      const btn = root.getElementById(id);
      if (!btn) continue;
      const down = (e) => { e.preventDefault(); this._setHold(code, true); };
      const up = (e) => { e.preventDefault(); this._setHold(code, false); };
      btn.addEventListener('touchstart', down, { passive: false });
      btn.addEventListener('touchend', up);
      btn.addEventListener('touchcancel', up);
    }

    for (const [id, keyCode] of TAP_KEYS) {
      const btn = root.getElementById(id);
      if (!btn) continue;
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.input.pulseKey(keyCode); });
    }

    const weaponBtn = root.getElementById('btnWeapon');
    if (weaponBtn) {
      weaponBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.input.addWheelDelta(2); });
    }
  }

  _setHold(code, down) {
    if (code === 'mouse0') this.input.setMouseButton(0, down);
    else if (code === 'mouse2') this.input.setMouseButton(2, down);
    else this.input.setKey(code, down);
  }
}
