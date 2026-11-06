import { G } from '../core/G.js';
import { icon } from './icons.js';

// Touch controls for phones, tablets and touchscreen Chromebooks.
// Left half: a floating joystick wherever your thumb lands (push it all the
// way to sprint). Right half: drag to look. Buttons change with context
// (build mode, riding, talking). Shown only once the screen is touched.
const BTN = [
  // id, action, label, class
  ['strike', 'attack', 'Strike', 'big'],
  ['jump', 'jump', 'Jump', 'mid'],
  ['dodge', 'sprint', 'Dodge', 'mid'],
  ['guard', 'block', 'Guard', 'mid'],
  ['spell', 'cast', 'Spell', 'sm'],
  ['use', 'interact', 'Use', 'sm'],
  ['lock', 'lock', 'Lock', 'xs'],
  ['elem', 'nextEl', 'Elem', 'xs'],
  ['age', 'epoch', 'Age', 'xs'],
  ['heal', 'heal', 'Heal', 'xs'],
  ['weave', 'weave', 'Weave', 'xs'],
];

export class TouchControls {
  constructor() {
    const root = document.getElementById('ui-root');
    const ui = document.createElement('div');
    ui.className = 'touch-ui';
    ui.hidden = true;
    ui.innerHTML = `<div class="t-layer"></div><div class="t-stick"><i></i></div>
      ${BTN.map(([id, , label, cls]) => `<button class="tb tb-${id} ${cls}" data-id="${id}" aria-label="${label}"><span class="ico"></span><span class="lbl">${label}</span><span class="cnt"></span></button>`).join('')}
      <div class="t-top"><button class="tb xs tb-menu" data-id="menu" aria-label="Menu"><span class="lbl">Menu</span></button><button class="tb xs tb-map" data-id="map" aria-label="Map"><span class="lbl">Map</span></button><button class="tb xs tb-build" data-id="build" aria-label="Build"><span class="lbl">Build</span></button><button class="tb xs tb-call" data-id="call" aria-label="Call mount"><span class="lbl">Call</span></button><button class="tb xs tb-stance" data-id="stance" aria-label="Stance"><span class="lbl">Stance</span></button></div>`;
    root.appendChild(ui);
    this.el = ui;
    const portrait = document.createElement('div');
    portrait.className = 'portrait-hint';
    portrait.hidden = true;
    portrait.innerHTML = '<div class="ph-icon"></div><p>Turn your device sideways for the best view.</p><button class="tbtn" id="ph-ok">Play anyway</button>';
    root.appendChild(portrait);
    this.portrait = portrait;
    portrait.querySelector('#ph-ok').onclick = () => { this.portraitOk = true; portrait.hidden = true; };

    this.stick = ui.querySelector('.t-stick');
    this.knob = this.stick.querySelector('i');
    this.sid = null;
    this.lookId = null;
    this.held = {};
    this.fullT = 0;
    const inp = G.input;
    const layer = ui.querySelector('.t-layer');

    layer.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.45 && this.sid === null) {
          this.sid = t.identifier;
          this.sx = t.clientX;
          this.sy = t.clientY;
          this.stick.style.left = t.clientX + 'px';
          this.stick.style.top = t.clientY + 'px';
          this.stick.classList.add('on');
          this.knob.style.transform = '';
        } else if (this.lookId === null) {
          this.lookId = t.identifier;
          this.lx = t.clientX;
          this.ly = t.clientY;
          this.lookStart = performance.now();
          this.lookMoved = 0;
        }
      }
    }, { passive: false });
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.sid) {
          const R = Math.min(70, window.innerHeight * 0.13);
          let dx = (t.clientX - this.sx) / R, dy = (t.clientY - this.sy) / R;
          const l = Math.hypot(dx, dy);
          if (l > 1) { dx /= l; dy /= l; }
          // let the stick follow a thumb that slides far past the ring
          if (l > 1.6) { this.sx = t.clientX - dx * R; this.sy = t.clientY - dy * R; this.stick.style.left = this.sx + 'px'; this.stick.style.top = this.sy + 'px'; }
          inp.touch.move.x = dx;
          inp.touch.move.y = dy;
          this.knob.style.transform = `translate(${dx * R * 0.65}px, ${dy * R * 0.65}px)`;
        } else if (t.identifier === this.lookId) {
          const dx = t.clientX - this.lx, dy = t.clientY - this.ly;
          inp.touch.look.x += dx * 0.0062;
          inp.touch.look.y += dy * 0.0062;
          this.lookMoved += Math.abs(dx) + Math.abs(dy);
          this.lx = t.clientX;
          this.ly = t.clientY;
          G.cam.lastLookInput = G.time;
        }
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.sid) {
          this.sid = null;
          inp.touch.move.x = inp.touch.move.y = 0;
          this.stick.classList.remove('on');
          if (this.autoSprint) { this.autoSprint = false; inp.touch.buttons.sprint = false; }
        }
        if (t.identifier === this.lookId) {
          this.lookId = null;
          // a quick tap on the right side with no drag attacks (one-thumb play)
          if (this.lookMoved < 12 && performance.now() - this.lookStart < 220 && G.state === 'play' && !G.build?.active) {
            inp.mouse.left = true; inp.mousePressed.left = true;
            setTimeout(() => { inp.mouse.left = false; inp.mouseReleased.left = true; }, 60);
          }
        }
      }
    };
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    ui.querySelectorAll('.tb').forEach((b) => {
      const id = b.dataset.id;
      const def = BTN.find((x) => x[0] === id);
      const action = def ? def[1] : id;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('on');
        this.press(action, true);
      }, { passive: false });
      const up = (e) => {
        e.preventDefault();
        b.classList.remove('on');
        this.press(action, false);
      };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
    });
    this.refreshT = 0;
  }

  press(a, down) {
    const inp = G.input;
    if (a === 'attack') {
      inp.mouse.left = down;
      if (down) inp.mousePressed.left = true; else inp.mouseReleased.left = true;
      return;
    }
    if (a === 'block') {
      inp.mouse.right = down;
      if (down) inp.mousePressed.right = true; else inp.mouseReleased.right = true;
      return;
    }
    if (!down) {
      if (['nextEl', 'menu', 'map', 'build', 'call', 'heal', 'stance'].includes(a)) return;
      inp.touch.buttons[a] = false;
      inp.released.add(a);
      return;
    }
    switch (a) {
      case 'menu': inp.pressed.add('pause'); return;
      case 'map': inp.pressed.add('map'); return;
      case 'build': inp.pressed.add('build'); return;
      case 'call': inp.pressed.add('whistle'); return;
      case 'stance': inp.pressed.add(G.build?.active ? 'rotate' : 'stance'); return;
      case 'heal': G.game.useItem(G.game.quickItem()); return;
      case 'nextEl': inp.pressed.add('nextEl'); return;
      default:
        inp.touch.buttons[a] = true;
        inp.pressed.add(a);
    }
  }

  update(dt) {
    const inp = G.input;
    const ui = G.ui;
    const active = G.state === 'play' && inp.lastDevice === 'touch';
    const blocked = !ui || ui.menuOpen || ui.blocking || G.dialogue?.active || G.cutscene?.active || G.rift?.picking || G.ui?.paused;
    const show = active && !blocked;
    if (this.el.hidden === show) this.el.hidden = !show;
    document.documentElement.classList.toggle('touching', active);
    // portrait hint
    const portrait = active && window.innerHeight > window.innerWidth * 1.05 && !this.portraitOk;
    if (this.portrait.hidden === portrait) this.portrait.hidden = !portrait;
    if (!show) {
      if (this.sid !== null) { this.sid = null; inp.touch.move.x = inp.touch.move.y = 0; this.stick.classList.remove('on'); }
      return;
    }
    // auto-sprint when the stick is pushed all the way
    const m = Math.hypot(inp.touch.move.x, inp.touch.move.y);
    if (m > 0.93) this.fullT += dt; else this.fullT = 0;
    if (this.fullT > 0.35 && !this.autoSprint && !G.build?.active) { this.autoSprint = true; inp.touch.buttons.sprint = true; }
    if (this.autoSprint && this.fullT === 0) { this.autoSprint = false; inp.touch.buttons.sprint = false; }
    // contextual labels a few times a second
    this.refreshT -= dt;
    if (this.refreshT > 0) return;
    this.refreshT = 0.2;
    const P = G.player;
    const q = (s) => this.el.querySelector(s);
    const set = (id, label) => { const e = q('.tb-' + id + ' .lbl'); if (e && e.textContent !== label) e.textContent = label; };
    const build = G.build?.active;
    const ride = P.mode === 'mounted';
    set('strike', build ? 'Place' : ride ? 'Slash' : 'Strike');
    set('guard', build ? 'Remove' : 'Guard');
    set('elem', build ? 'Next' : 'Elem');
    set('stance', build ? 'Rotate' : 'Stance');
    set('dodge', ride ? 'Spur' : 'Dodge');
    const it = G.game.currentInteractable;
    const useLbl = ride && !it ? 'Dismount' : it ? (it.verb || 'Use').trim().split(' ')[0] : 'Use';
    set('use', useLbl);
    q('.tb-use').classList.toggle('ready', !!it || ride);
    q('.tb-age').classList.toggle('off', !!G.epochs.locked);
    // spell button shows the element
    const ico = q('.tb-spell .ico');
    const want = 'el' + P.element;
    if (ico.dataset.el !== want) { ico.dataset.el = want; ico.style.backgroundImage = `url(${icon(want)})`; }
    const hi = q('.tb-heal .ico');
    const qi = G.game.quickItem();
    if (qi && hi.dataset.it !== qi) { hi.dataset.it = qi; hi.style.backgroundImage = `url(${icon(qi)})`; }
    q('.tb-heal .cnt').textContent = qi ? G.game.count(qi) : '0';
    q('.tb-heal').classList.toggle('off', !qi);
    q('.tb-call').hidden = !G.mounts?.tamed;
    q('.tb-lock').classList.toggle('ready', !!P.lockTarget);
  }
}
