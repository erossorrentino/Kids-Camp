import { G } from '../core/G.js';

// Quest tracker. Each quest is a list of steps; a step completes through
// flags (dialogue), kills, items, reaching places or epoch changes.
export class Quests {
  constructor(defs) {
    this.defs = defs;
    this.st = {}; // id -> {step, done, counts}
    this.tracked = null;
    this.checkT = 0;
  }
  serialize() {
    return { st: this.st, tracked: this.tracked };
  }
  deserialize(d) {
    this.st = d.st || {};
    this.tracked = d.tracked || null;
    this.refresh();
  }
  isActive(id) {
    return this.st[id] && !this.st[id].done;
  }
  isDone(id) {
    return !!(this.st[id] && this.st[id].done);
  }
  stepId(id) {
    const s = this.st[id];
    if (!s || s.done) return null;
    return this.defs[id].steps[s.step]?.id;
  }
  start(id) {
    if (this.st[id]) return;
    const q = this.defs[id];
    if (!q) return console.warn('no quest', id);
    this.st[id] = { step: 0, done: false, counts: {} };
    if (q.kind === 'main' || !this.tracked) this.tracked = id;
    G.hud.banner(q.title, q.kind === 'main' ? 'Main quest begun' : 'Quest begun', 'quest');
    G.audio?.sfx('questStart');
    this.enterStep(id);
    this.refresh();
  }
  enterStep(id) {
    const q = this.defs[id];
    const s = this.st[id];
    const step = q.steps[s.step];
    if (step && step.onStart) step.onStart(G.game.state);
  }
  // complete the current step (or a named step) of a quest
  complete(ref) {
    const [id, stepName] = ref.split('.');
    const s = this.st[id];
    if (!s || s.done) return;
    const q = this.defs[id];
    if (stepName) {
      const idx = q.steps.findIndex((x) => x.id === stepName);
      if (idx < 0 || idx < s.step) return;
      s.step = idx;
    }
    const step = q.steps[s.step];
    if (step && step.onDone) step.onDone(G.game.state);
    s.step++;
    s.counts = {};
    G.audio?.sfx('questStep');
    if (s.step >= q.steps.length) {
      s.done = true;
      if (q.reward) this.reward(q.reward);
      if (q.onComplete) q.onComplete(G.game.state);
      G.hud.banner(q.title, 'Quest complete', 'quest done');
      G.audio?.sfx('questDone');
      if (this.tracked === id) this.tracked = this.nextTracked();
    } else {
      G.hud.toast(`<b>${q.title}</b> — ${this.stepText(id)}`, 'quest');
      this.enterStep(id);
    }
    this.refresh();
  }
  reward(r) {
    if (r.xp) G.player.gainXP(r.xp);
    if (r.items) for (const k in r.items) G.game.give(k, r.items[k]);
  }
  nextTracked() {
    for (const id in this.st) if (!this.st[id].done && this.defs[id].kind === 'main') return id;
    for (const id in this.st) if (!this.st[id].done) return id;
    return null;
  }
  stepText(id) {
    const q = this.defs[id];
    const s = this.st[id];
    const step = q.steps[s.step];
    if (!step) return '';
    let t = typeof step.text === 'function' ? step.text(G.game.state) : step.text;
    if (step.count) t += ` (${s.counts.n || 0}/${step.count})`;
    return t;
  }
  currentStep(id) {
    const s = this.st[id];
    if (!s || s.done) return null;
    return this.defs[id].steps[s.step];
  }
  waypoint() {
    const id = this.tracked;
    if (!id) return null;
    const step = this.currentStep(id);
    if (!step || !step.target) return null;
    const t = typeof step.target === 'function' ? step.target(G.game.state) : step.target;
    if (!t) return null;
    if (step.epoch !== undefined && step.epoch !== G.epochs.current) return { ...t, color: '#c9a8ff', epochHint: step.epoch };
    return t;
  }
  refresh() {
    const lines = [];
    const order = Object.keys(this.st).filter((id) => !this.st[id].done);
    order.sort((a, b) => (a === this.tracked ? -1 : b === this.tracked ? 1 : (this.defs[a].kind === 'main' ? -1 : 1)));
    for (const id of order.slice(0, 3)) {
      const q = this.defs[id];
      const step = this.currentStep(id);
      const steps = [this.stepText(id)];
      if (step && step.epoch !== undefined && step.epoch !== G.epochs.current) steps.push(`<i class="ep">In the ${['Age of Bloom', 'Age of Ash', 'Age of Stars'][step.epoch]}</i>`);
      lines.push({ title: q.title, steps, kind: (q.kind || 'side') + (id === this.tracked ? ' tracked' : '') });
    }
    G.hud.setTracker(lines);
  }
  // ---- events
  onKill(e) {
    for (const id in this.st) {
      const step = this.currentStep(id);
      if (!step || !step.kill) continue;
      if (!step.kill(e)) continue;
      const s = this.st[id];
      s.counts.n = (s.counts.n || 0) + 1;
      if (s.counts.n >= (step.count || 1)) this.complete(id);
      else this.refresh();
    }
  }
  onCampCleared(c) {
    for (const id in this.st) {
      const step = this.currentStep(id);
      if (step && step.camp && step.camp === c.id) this.complete(id);
    }
  }
  onItem(item) {
    for (const id in this.st) {
      const step = this.currentStep(id);
      if (step && step.item && step.item === item && G.game.count(item) >= (step.count || 1)) this.complete(id);
    }
  }
  onEpoch(e) {
    for (const id in this.st) {
      const step = this.currentStep(id);
      if (step && step.reachEpoch !== undefined && step.reachEpoch === e) this.complete(id);
    }
    this.refresh();
  }
  onFlag() {
    this.checkT = 0;
  }
  update(dt) {
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 0.3;
    const P = G.player.pos;
    for (const id in this.st) {
      const step = this.currentStep(id);
      if (!step) continue;
      if (step.flag && G.game.state.flags[step.flag]) { this.complete(id); continue; }
      if (step.check && step.check(G.game.state)) { this.complete(id); continue; }
      if (step.reach) {
        const t = typeof step.target === 'function' ? step.target(G.game.state) : step.target;
        if (!t) continue;
        if (step.epoch !== undefined && step.epoch !== G.epochs.current) continue;
        const d = Math.hypot(P.x - t.x, P.z - t.z);
        const dy = t.y !== undefined ? Math.abs(G.player.pos.y - t.y) : 0;
        if (d < (step.reach === true ? 8 : step.reach) && dy < (step.reachY || 6)) this.complete(id);
      }
    }
  }
}
