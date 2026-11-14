'use strict';
/* ============================================================
   Input: keyboard, standard gamepads, and on-screen touch.
   ============================================================ */

const IN = {
  keys: Object.create(null), edge: new Set(), padPrev: [], device: 'kb',
  touch: { on: false, sx: 0, sy: 0, held: Object.create(null), edge: new Set(), id: null, ox: 0, oy: 0 },
};
const KEYMAP = {
  shoot: ['Space', 'KeyJ'], pass: ['KeyE', 'KeyK'], move: ['KeyQ', 'KeyL'], alt: ['KeyR', 'KeyU'],
  sprint: ['ShiftLeft', 'ShiftRight'], pause: ['Escape', 'KeyP'],
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  ok: ['Enter', 'NumpadEnter', 'Space'], back: ['Escape', 'Backspace'],
};
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

function inputInit() {
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) IN.edge.add(e.code);
    IN.keys[e.code] = true; IN.device = 'kb';
  });
  addEventListener('keyup', (e) => { IN.keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in IN.keys) IN.keys[k] = false; for (const k in IN.touch.held) IN.touch.held[k] = false; });
}
function anyKey(list) { for (const k of list) if (IN.keys[k]) return true; return false; }
function anyEdge(list) { for (const k of list) if (IN.edge.has(k)) return true; return false; }

function readPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
  for (const p of pads) if (p && p.connected) return p;
  return null;
}

/* Called once per animation frame. Returns the frame's merged intent. */
function pollInput() {
  const o = { sx: 0, sy: 0, sprint: false, shoot: false, pShoot: false, pPass: false, pMove: false, pAlt: false, pPause: false,
    mUp: false, mDown: false, mLeft: false, mRight: false, mOk: false, mBack: false };
  // keyboard
  let kx = (anyKey(KEYMAP.right) ? 1 : 0) - (anyKey(KEYMAP.left) ? 1 : 0);
  let ky = (anyKey(KEYMAP.up) ? 1 : 0) - (anyKey(KEYMAP.down) ? 1 : 0);
  if (kx && ky) { kx *= 0.7071; ky *= 0.7071; }
  o.sx = kx; o.sy = ky;
  o.sprint = anyKey(KEYMAP.sprint);
  o.shoot = anyKey(KEYMAP.shoot);
  o.pShoot = anyEdge(KEYMAP.shoot); o.pPass = anyEdge(KEYMAP.pass); o.pMove = anyEdge(KEYMAP.move); o.pAlt = anyEdge(KEYMAP.alt);
  o.pPause = anyEdge(KEYMAP.pause);
  o.mUp = anyEdge(KEYMAP.up); o.mDown = anyEdge(KEYMAP.down); o.mLeft = anyEdge(KEYMAP.left); o.mRight = anyEdge(KEYMAP.right);
  o.mOk = anyEdge(KEYMAP.ok); o.mBack = anyEdge(KEYMAP.back);
  IN.edge.clear();
  // gamepad
  const p = readPad();
  if (p) {
    const B = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
    const E = (i) => B(i) && !IN.padPrev[i];
    let ax = p.axes[0] || 0, ay = -(p.axes[1] || 0);
    const m = hyp(ax, ay);
    if (m < 0.22) { ax = 0; ay = 0; } else { const k = Math.min(1, (m - 0.22) / 0.7) / m; ax *= k; ay *= k; }
    if (B(14)) ax = -1; if (B(15)) ax = 1; if (B(12)) ay = 1; if (B(13)) ay = -1;
    if (ax || ay) { o.sx = ax; o.sy = ay; IN.device = 'pad'; }
    if (B(7) || B(5)) o.sprint = true;
    if (B(2)) o.shoot = true;
    if (E(2)) { o.pShoot = true; IN.device = 'pad'; }
    if (E(0)) { o.pPass = true; o.mOk = true; IN.device = 'pad'; }
    if (E(1)) { o.pMove = true; o.mBack = true; IN.device = 'pad'; }
    if (E(3)) { o.pAlt = true; IN.device = 'pad'; }
    if (E(9)) o.pPause = true;
    if (E(12)) o.mUp = true; if (E(13)) o.mDown = true; if (E(14)) o.mLeft = true; if (E(15)) o.mRight = true;
    const ly = p.axes[1] || 0, lx = p.axes[0] || 0;
    if (ly < -0.6 && !(IN.padPrev.ay < -0.6)) o.mUp = true;
    if (ly > 0.6 && !(IN.padPrev.ay > 0.6)) o.mDown = true;
    if (lx < -0.6 && !(IN.padPrev.ax < -0.6)) o.mLeft = true;
    if (lx > 0.6 && !(IN.padPrev.ax > 0.6)) o.mRight = true;
    IN.padPrev = p.buttons.map((b) => b.pressed || b.value > 0.5);
    IN.padPrev.ax = lx; IN.padPrev.ay = ly;
  }
  // touch
  const T = IN.touch;
  if (T.on) {
    if (T.sx || T.sy) { o.sx = T.sx; o.sy = T.sy; }
    if (T.held.sprint) o.sprint = true;
    if (T.held.shoot) o.shoot = true;
    if (T.edge.has('shoot')) o.pShoot = true;
    if (T.edge.has('pass')) o.pPass = true;
    if (T.edge.has('move')) o.pMove = true;
    if (T.edge.has('alt')) o.pAlt = true;
    T.edge.clear();
  }
  return o;
}

/* touch controls are DOM elements built by the UI; this wires them */
function touchInit(root) {
  const T = IN.touch, stick = root.querySelector('#tStick'), knob = root.querySelector('#tKnob');
  const zone = root.querySelector('#tZone');
  const R0 = 56;
  const setStick = (cx, cy) => {
    let dx = cx - T.ox, dy = cy - T.oy;
    const d = hyp(dx, dy);
    if (d > R0) { dx = dx / d * R0; dy = dy / d * R0; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = hyp(dx, dy) / R0;
    if (m < 0.18) { T.sx = 0; T.sy = 0; } else { T.sx = dx / R0; T.sy = -dy / R0; }
  };
  zone.addEventListener('touchstart', (e) => {
    e.preventDefault(); IN.device = 'touch';
    const t = e.changedTouches[0];
    T.id = t.identifier; T.ox = t.clientX; T.oy = t.clientY;
    stick.style.left = (t.clientX - 70) + 'px'; stick.style.top = (t.clientY - 70) + 'px';
    stick.classList.add('live'); knob.style.transform = 'translate(0,0)';
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === T.id) setStick(t.clientX, t.clientY);
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === T.id) {
      T.id = null; T.sx = T.sy = 0; stick.classList.remove('live'); knob.style.transform = 'translate(0,0)';
    }
  };
  zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
  root.querySelectorAll('[data-btn]').forEach((b) => {
    const name = b.dataset.btn;
    const down = (e) => { e.preventDefault(); IN.device = 'touch'; if (!T.held[name]) T.edge.add(name); T.held[name] = true; b.classList.add('on'); };
    const up = (e) => { e.preventDefault(); T.held[name] = false; b.classList.remove('on'); };
    b.addEventListener('touchstart', down, { passive: false });
    b.addEventListener('touchend', up, { passive: false });
    b.addEventListener('touchcancel', up, { passive: false });
    b.addEventListener('mousedown', down); b.addEventListener('mouseup', up); b.addEventListener('mouseleave', up);
  });
}
