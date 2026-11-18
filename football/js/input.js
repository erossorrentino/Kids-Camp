/* Gridiron Kings — input: keyboard, touch (virtual stick + buttons) and gamepad, merged into one state.
   Stick is in screen space (x right, y up). Buttons: a = juke / switch, b = snap / throw / spin / tackle,
   c = throw away / truck / big hit. Number keys pick a play on the call screen or throw to that receiver:
   tap the key for a touch pass, hold it for a bullet. */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});
  const mkBtn = () => ({ down: false, pressed: false, released: false, heldT: 0, t0: 0 });
  const I = {
    state: { mx: 0, my: 0, sprint: false, a: mkBtn(), b: mkBtn(), c: mkBtn(), throwTo: -1, bullet: false },
    pendThrow: null, BULLET_MS: 230,
    onDigit: null,
    keys: {}, touch: { mx: 0, my: 0, a: false, b: false, c: false, id: null, ox: 0, oy: 0 },
    usedTouch: false, usedPad: false, pausePressed: false, active: false, onPause: null,
  };
  const S = I.state;

  const KEYMAP = {
    ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', KeyA: 'l', KeyD: 'r', KeyW: 'u', KeyS: 'd',
    KeyX: 'a', KeyJ: 'a', Space: 'b', KeyK: 'b', KeyC: 'c', KeyL: 'c', ShiftLeft: 's', ShiftRight: 's', KeyM: 's',
  };

  function setBtn(b, down, now) {
    if (down && !b.down) { b.down = true; b.pressed = true; b.t0 = now; }
    else if (!down && b.down) { b.down = false; b.released = true; b.heldT = (now - b.t0) / 1000; }
  }

  I.poll = function () {
    const now = performance.now();
    const k = I.keys, t = I.touch;
    let mx = (k.r ? 1 : 0) - (k.l ? 1 : 0), my = (k.u ? 1 : 0) - (k.d ? 1 : 0);
    let a = !!k.a, b = !!k.b, c = !!k.c, sprint = !!k.s;
    if (t.id != null) { mx = t.mx; my = t.my; if (Math.hypot(t.mx, t.my) > 0.9) sprint = true; }
    a = a || t.a; b = b || t.b; c = c || t.c;
    let pads = [];
    if (!I.noPads) { try { pads = navigator.getGamepads ? navigator.getGamepads() || [] : []; } catch (e) { I.noPads = true; } }
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.25) { mx = ax; my = -ay; I.usedPad = true; }
      const B = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      if (B(14)) mx = -1; if (B(15)) mx = 1; if (B(12)) my = 1; if (B(13)) my = -1;
      a = a || B(2) || B(1); b = b || B(0); c = c || B(3); sprint = sprint || B(7) || B(5) || B(6);
      if (B(9) && !I._padStart) { I.pausePressed = true; }
      I._padStart = B(9);
      break;
    }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    S.mx = mx; S.my = my; S.sprint = sprint;
    setBtn(S.a, a, now); setBtn(S.b, b, now); setBtn(S.c, c, now);
    const pt = I.pendThrow;
    if (pt && now - pt.t >= I.BULLET_MS) { I.pendThrow = null; I.fireThrow(pt.i, true); }
    if (I.pausePressed) { I.pausePressed = false; if (I.onPause) I.onPause(); }
  };
  /* edges are latched until a simulation step has seen them */
  I.consume = function () { for (const k of ['a', 'b', 'c']) { S[k].pressed = false; S[k].released = false; } S.throwTo = -1; S.bullet = false; };
  I.fireThrow = function (i, bullet) { S.throwTo = i; S.bullet = !!bullet; if (I.onThrow) I.onThrow(i, !!bullet); };
  /* start a throw that becomes a bullet if held; release() turns it into a touch pass */
  I.holdThrow = function (i, src) { I.pendThrow = { i, t: performance.now(), src }; };
  I.releaseThrow = function (src) { const pt = I.pendThrow; if (pt && (src == null || pt.src === src)) { I.pendThrow = null; I.fireThrow(pt.i, false); } };
  I.reset = function () {
    I.keys = {}; const t = I.touch; t.mx = t.my = 0; t.a = t.b = t.c = false; t.id = null;
    for (const k of ['a', 'b', 'c']) Object.assign(S[k], mkBtn());
    S.mx = S.my = 0; S.sprint = false; S.throwTo = -1; S.bullet = false; I.pendThrow = null;
  };

  window.addEventListener('keydown', (e) => {
    if (!I.active) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { I.pausePressed = true; e.preventDefault(); return; }
    const dm = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (dm) { e.preventDefault(); if (e.repeat) return; const n = +dm[1]; if (!(I.onDigit && I.onDigit(n))) I.holdThrow(n - 1, e.code); return; }
    const m = KEYMAP[e.code];
    if (m) { I.keys[m] = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { I.releaseThrow(e.code); const m = KEYMAP[e.code]; if (m) I.keys[m] = false; });
  window.addEventListener('blur', () => { I.keys = {}; });

  /* ---------- touch ---------- */
  I.bindTouch = function (zone, stick, knob, buttons) {
    const t = I.touch;
    const R = 56;
    const place = (x, y) => { stick.style.left = x + 'px'; stick.style.top = y + 'px'; };
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      I.usedTouch = true;
      if (t.id != null) return;
      t.id = e.pointerId; t.ox = e.clientX; t.oy = e.clientY; t.mx = t.my = 0;
      const r = zone.getBoundingClientRect();
      place(e.clientX - r.left, e.clientY - r.top);
      stick.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)';
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* older webviews */ }
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== t.id) return;
      let dx = e.clientX - t.ox, dy = e.clientY - t.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      t.mx = dx / R; t.my = -dy / R;
      if (Math.hypot(t.mx, t.my) < 0.14) { t.mx = 0; t.my = 0; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      e.preventDefault();
    });
    const end = (e) => {
      if (e.pointerId !== t.id) return;
      t.id = null; t.mx = t.my = 0; stick.classList.remove('on');
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    Object.keys(buttons).forEach((k) => {
      const el = buttons[k];
      const dn = (e) => { I.usedTouch = e.pointerType !== 'mouse' || I.usedTouch; t[k] = true; el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } e.preventDefault(); };
      const up = () => { t[k] = false; el.classList.remove('down'); };
      el.addEventListener('pointerdown', dn); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  };

  FG.input = I;
})();
