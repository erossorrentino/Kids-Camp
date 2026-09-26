// Drag swing: press, pull DOWN to take the club back (distance = power),
// then push UP. The ball is struck when the pointer crosses back over the
// starting point. The angle of that forward push decides hook / slice:
// straight up is pure; drifting right fades or slices, left draws or hooks.

export class SwingInput {
  constructor(target, app) {
    this.target = target;
    this.app = app;
    this.state = null;
    target.addEventListener('pointerdown', (e) => this.down(e));
    target.addEventListener('pointermove', (e) => this.move(e));
    target.addEventListener('pointerup', (e) => this.up(e));
    target.addEventListener('pointercancel', () => this.cancel());
  }

  get pmax() {
    const h = this.target.clientHeight || window.innerHeight;
    return Math.max(120, Math.min(260, h * 0.3));
  }

  down(e) {
    const round = this.app.round;
    if (!round) return;
    if (round.phase === 'intro') { round.skipIntro(); return; }
    if (e.button !== undefined && e.button !== 0) return;
    if (!round.beginDrag()) return;
    this.target.setPointerCapture(e.pointerId);
    this.state = { x0: e.clientX, y0: e.clientY, maxDepth: 0, phase: 'back', pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }], top: null };
    this.app.hud.meterShow(e.clientX, e.clientY);
    e.preventDefault();
  }

  move(e) {
    const s = this.state;
    if (!s) return;
    const now = performance.now();
    s.pts.push({ x: e.clientX, y: e.clientY, t: now });
    if (s.pts.length > 400) s.pts.shift();
    const depth = (e.clientY - s.y0) / this.pmax;
    if (s.phase === 'back') {
      if (depth > s.maxDepth) {
        s.maxDepth = Math.min(1.1, depth);
        s.top = { x: e.clientX, y: e.clientY, t: now };
      }
      this.app.round.dragPower(s.maxDepth);
      this.app.hud.meterSet(s.maxDepth, 'back');
      // Start of the forward swing once they come back up a little
      if (s.maxDepth > 0.02 && depth < s.maxDepth - 0.05) {
        s.phase = 'down';
        s.downStart = s.top;
      }
    } else {
      this.app.hud.meterSet(s.maxDepth, 'down');
      const q = this.deviation(e.clientX, e.clientY);
      this.app.hud.trail(s.pts.filter((p) => p.t >= s.downStart.t), Math.abs(q));
      if (e.clientY <= s.y0) this.strike(e.clientX, e.clientY, now);
    }
  }

  deviation(x, y) {
    const s = this.state;
    const top = s.downStart || s.top;
    const dy = top.y - y;
    const dx = x - top.x;
    if (dy < 4) return 0;
    return (Math.atan2(dx, dy) * 180) / Math.PI;
  }

  strike(x, y, now) {
    const s = this.state;
    const dev = this.deviation(x, y);
    const tDown = (now - s.downStart.t) / 1000;
    // A slow, hesitant forward swing loses speed
    const tempo = tDown > 0.8 ? Math.max(0.85, 1 - (tDown - 0.8) * 0.3) : 1;
    this.state = null;
    this.app.hud.meterHide();
    this.app.round.release(s.maxDepth, dev, tempo);
  }

  up(e) {
    const s = this.state;
    if (!s) return;
    // Let go during the forward swing (common on touch screens): strike if
    // they got most of the way back up; otherwise cancel.
    if (s.phase === 'down') {
      const prog = (s.downStart.y - e.clientY) / Math.max(1, s.downStart.y - s.y0);
      if (prog > 0.45) {
        this.strike(e.clientX, s.y0, performance.now());
        return;
      }
    }
    this.cancel();
  }

  cancel() {
    if (!this.state) return;
    this.state = null;
    this.app.hud.meterHide();
    if (this.app.round) this.app.round.cancelDrag();
    if (this.app.hud) this.app.hud.message('Swing cancelled', 'Pull down, then push back up past where you started', 'neutral');
  }
}
