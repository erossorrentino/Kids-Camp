/**
 * ON-SCREEN CONTROLS
 * ------------------------------------------------------------------
 * A phone has no WASD, no mouse buttons and no pointer lock, so a touch
 * device gets a stick, a trigger and a row of action keys drawn over the
 * viewport. They write the same intent fields the keyboard writes -- see
 * `Input.holdVirtual` -- so the simulation never learns which one is in
 * use, and a tablet with a keyboard attached can use both at once.
 *
 * Everything is driven by pointer events and keyed by `pointerId`, so
 * steering, firing and looking around all work at the same time.
 */

/** True on a device whose primary input is a finger. */
export function isTouchDevice() {
  try {
    if (matchMedia('(pointer: coarse)').matches) return true;
    return (navigator.maxTouchPoints || 0) > 1 && !matchMedia('(pointer: fine)').matches;
  } catch { return (navigator.maxTouchPoints || 0) > 1; }
}

const BUTTONS = [
  { id:'tc-fire',    hold:'fire',      label:'FIRE',  cls:'tc-big' },
  { id:'tc-jets',    hold:'jump',      label:'JETS' },
  { id:'tc-ability', tap:'ability',    label:'ABIL' },
  { id:'tc-melee',   tap:'melee',      label:'MELEE' },
  { id:'tc-zoom',    hold:'zoom',      label:'ZOOM' },
  { id:'tc-target',  tap:'target',     label:'LOCK' },
  { id:'tc-group',   tap:'groupAll',   label:'ALL' },
];

export class TouchControls {
  /**
   * @param {object} o
   * @param {import('../core/input.js').Input} o.input
   * @param {HTMLCanvasElement} o.canvas
   * @param {function():void} [o.onMenu]
   */
  constructor({ input, canvas, onMenu, onAutoFire }) {
    this.input = input;
    this.canvas = canvas;
    this.onMenu = onMenu;
    this.onAutoFire = onAutoFire;
    this.root = document.getElementById('touch-controls');
    this.visible = false;
    this.stickId = null;
    this.lookId = null;
    this.lookLast = { x: 0, y: 0 };
    this.stickCentre = { x: 0, y: 0 };
    this.stickRadius = 58;
    if (!this.root) return;
    this._build();
    this._wireLook();
  }

  _build() {
    const stick = this.root.querySelector('#tc-stick');
    this.knob = this.root.querySelector('#tc-knob');
    if (stick) {
      stick.addEventListener('pointerdown', (e) => {
        if (this.stickId !== null) return;
        this.stickId = e.pointerId;
        const r = stick.getBoundingClientRect();
        this.stickCentre.x = r.left + r.width / 2;
        this.stickCentre.y = r.top + r.height / 2;
        this.stickRadius = r.width * 0.42;
        stick.setPointerCapture?.(e.pointerId);
        this._stickTo(e.clientX, e.clientY);
        e.preventDefault();
      });
      stick.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.stickId) return;
        this._stickTo(e.clientX, e.clientY);
        e.preventDefault();
      });
      const end = (e) => {
        if (e.pointerId !== this.stickId) return;
        this.stickId = null;
        this.input.setTouchMove(0, 0);
        if (this.knob) this.knob.style.transform = 'translate(-50%,-50%)';
      };
      stick.addEventListener('pointerup', end);
      stick.addEventListener('pointercancel', end);
      stick.addEventListener('lostpointercapture', end);
    }

    for (const b of BUTTONS) {
      const el = this.root.querySelector('#' + b.id);
      if (!el) continue;
      const press = (e) => {
        el.classList.add('on');
        el.setPointerCapture?.(e.pointerId);
        if (b.tap) this.input.tapVirtual(b.tap);
        else if (b.hold === 'fire') { this.input.mouse.left = true; this.input.mouseEdges.left = true; }
        else if (b.hold === 'zoom') this.input.mouse.right = true;
        else if (b.hold) this.input.holdVirtual(b.hold, true);
        e.preventDefault();
      };
      const release = () => {
        el.classList.remove('on');
        if (b.hold === 'fire') this.input.mouse.left = false;
        else if (b.hold === 'zoom') this.input.mouse.right = false;
        else if (b.hold) this.input.holdVirtual(b.hold, false);
      };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    const menu = this.root.querySelector('#tc-menu');
    menu?.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onMenu?.(); });

    this.autoBtn = this.root.querySelector('#tc-auto');
    this.autoBtn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onAutoFire?.(!this.autoBtn.classList.contains('on'));
    });
  }

  _stickTo(px, py) {
    let dx = px - this.stickCentre.x;
    let dy = py - this.stickCentre.y;
    const r = this.stickRadius || 58;
    const len = Math.hypot(dx, dy);
    if (len > r) { dx *= r / len; dy *= r / len; }
    if (this.knob) this.knob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px),calc(-50% + ${dy.toFixed(1)}px))`;
    // Dead zone in the middle, then a linear ramp to full deflection: a
    // thumb resting on the stick should not creep the mech forward.
    const dead = 0.16;
    const nx = dx / r, ny = dy / r;
    const mag = Math.min(1, Math.hypot(nx, ny));
    if (mag < dead) { this.input.setTouchMove(0, 0); return; }
    const k = ((mag - dead) / (1 - dead)) / mag;
    this.input.setTouchMove(nx * k, -ny * k);
  }

  _wireLook() {
    // Anywhere on the viewport that is not a control is a look area: drag to
    // swing the torso, exactly like moving a mouse.
    const start = (e) => {
      if (!this.visible || e.pointerType !== 'touch' || this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lookLast.x = e.clientX; this.lookLast.y = e.clientY;
      this.canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (e.pointerId !== this.lookId) return;
      this.input.addTouchAim(e.clientX - this.lookLast.x, e.clientY - this.lookLast.y);
      this.lookLast.x = e.clientX; this.lookLast.y = e.clientY;
      e.preventDefault();
    };
    const end = (e) => { if (e.pointerId === this.lookId) this.lookId = null; };
    this.canvas.addEventListener('pointerdown', start);
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('lostpointercapture', end);
  }

  /** Reflect whether the guns are firing themselves. */
  setAutoFire(on) { this.autoBtn?.classList.toggle('on', !!on); }

  /** Show the controls and switch the input layer to touch aiming. */
  setVisible(on) {
    if (!this.root || on === this.visible) return;
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
    this.root.setAttribute('aria-hidden', on ? 'false' : 'true');
    // The HUD moves its readouts out of the corners the thumbs need.
    document.body.classList.toggle('touch-ui', on);
    if (!on) {
      this.input.setTouchMove(0, 0);
      this.input.mouse.left = false;
      this.input.mouse.right = false;
      this.input.virtual.clear();
      this.stickId = this.lookId = null;
      if (this.knob) this.knob.style.transform = 'translate(-50%,-50%)';
    }
  }
}
