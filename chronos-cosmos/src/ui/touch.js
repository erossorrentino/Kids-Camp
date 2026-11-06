import { G } from '../core/G.js';

// On-screen controls for phones and tablets: left stick to move, drag the
// right side to look, buttons for the core actions.
export class TouchControls {
  constructor() {
    const root = document.getElementById('ui-root');
    const ui = document.createElement('div');
    ui.className = 'touch-ui';
    ui.innerHTML = `<div class="tstick"><i></i></div>
      <div class="tbtns">
        <button class="tb" data-a="cast">Spell</button><button class="tb" data-a="block">Guard</button><button class="tb" data-a="interact">Use</button>
        <button class="tb" data-a="epoch">Age</button><button class="tb" data-a="sprint">Dodge</button><button class="tb" data-a="attack">Strike</button>
        <button class="tb" data-a="lock">Lock</button><button class="tb" data-a="jump">Jump</button><button class="tb" data-a="el">Elem</button>
      </div><button class="tb tpause" data-a="pause">Menu</button>`;
    root.appendChild(ui);
    this.el = ui;
    const inp = G.input;
    const stick = ui.querySelector('.tstick');
    const knob = stick.querySelector('i');
    let sid = null, sx = 0, sy = 0;
    stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sid = t.identifier; const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; e.preventDefault(); }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) {
          let dx = (t.clientX - sx) / 55, dy = (t.clientY - sy) / 55;
          const l = Math.hypot(dx, dy);
          if (l > 1) { dx /= l; dy /= l; }
          inp.touch.move.x = dx; inp.touch.move.y = dy;
          knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
        } else if (t.identifier === this.lookId) {
          inp.touch.look.x += (t.clientX - this.lx) * 0.006;
          inp.touch.look.y += (t.clientY - this.ly) * 0.006;
          this.lx = t.clientX; this.ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) { sid = null; inp.touch.move.x = inp.touch.move.y = 0; knob.style.transform = ''; }
        if (t.identifier === this.lookId) this.lookId = null;
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    document.getElementById('viewport').addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (t.clientX > window.innerWidth * 0.4) { this.lookId = t.identifier; this.lx = t.clientX; this.ly = t.clientY; }
    }, { passive: true });
    ui.querySelectorAll('.tb').forEach((b) => {
      const a = b.dataset.a;
      const down = (e) => {
        e.preventDefault();
        b.classList.add('on');
        if (a === 'attack') { inp.mouse.left = true; inp.mousePressed.left = true; }
        else if (a === 'block') { inp.mouse.right = true; inp.mousePressed.right = true; }
        else if (a === 'el') { inp.pressed.add('nextEl'); }
        else { inp.touch.buttons[a] = true; inp.pressed.add(a); }
      };
      const up = (e) => {
        e.preventDefault();
        b.classList.remove('on');
        if (a === 'attack') { inp.mouse.left = false; inp.mouseReleased.left = true; }
        else if (a === 'block') { inp.mouse.right = false; inp.mouseReleased.right = true; }
        else if (a !== 'el') { inp.touch.buttons[a] = false; inp.released.add(a); }
        if (a === 'sprint') { G.player.sprintHeld = 0.05; }
      };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
    });
    setInterval(() => { ui.hidden = G.state !== 'play' || G.ui?.menuOpen; }, 300);
  }
}
