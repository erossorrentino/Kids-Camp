import * as THREE from 'three';
import { G } from '../core/G.js';
import { ITEMS } from './items.js';

// Branching dialogue with conditions, effects, companion approval and a
// cinematic over-the-shoulder camera.
export class Dialogue {
  constructor(library) {
    this.lib = library;
    this.active = false;
    const root = document.getElementById('ui-root');
    this.el = document.createElement('div');
    this.el.className = 'dialogue';
    this.el.hidden = true;
    this.el.innerHTML = `<div class="dlg-inner"><div class="dlg-speaker"><span class="dlg-name"></span><span class="dlg-title"></span></div><div class="dlg-text"></div><div class="dlg-choices"></div><div class="dlg-next">Continue <span class="k">E</span></div></div>`;
    root.appendChild(this.el);
    this.nameEl = this.el.querySelector('.dlg-name');
    this.titleEl = this.el.querySelector('.dlg-title');
    this.textEl = this.el.querySelector('.dlg-text');
    this.choicesEl = this.el.querySelector('.dlg-choices');
    this.nextEl = this.el.querySelector('.dlg-next');
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('.dlg-choice')) return;
      this.advance();
    });
    this.typing = 0;
    this.full = '';
  }

  get S() {
    return G.game.state;
  }

  start(id, npc) {
    const d = typeof id === 'string' ? this.lib[id] : id;
    if (!d) {
      console.warn('missing dialogue', id);
      return;
    }
    this.dlg = d;
    this.npc = npc || null;
    this.active = true;
    G.ui.blocking = true;
    G.input.exitLock();
    this.el.hidden = false;
    G.hud.root.classList.add('in-dialogue');
    G.player.vel.set(0, 0, 0);
    G.player.lockTarget = null;
    if (G.player.action && G.player.action.type !== 'drink') G.player.action = null;
    this.camShot();
    this.show(d.start || 'start');
    G.audio?.sfx('dlgOpen');
  }

  camShot() {
    const npc = this.npc;
    if (!npc || npc.orb) return;
    const P = G.player;
    const mid = new THREE.Vector3().addVectors(P.pos, npc.pos).multiplyScalar(0.5);
    const dx = npc.pos.x - P.pos.x, dz = npc.pos.z - P.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    // over the player's shoulder
    const from = new THREE.Vector3(P.pos.x - (dx / l) * 2.2 + (dz / l) * 1.1, P.pos.y + 1.85, P.pos.z - (dz / l) * 2.2 - (dx / l) * 1.1);
    const look = new THREE.Vector3(npc.pos.x, npc.pos.y + 1.55, npc.pos.z);
    // keep the camera above ground
    from.y = Math.max(from.y, G.terrain.heightAt(from.x, from.z) + 0.8);
    G.cam.play({ from: G.camera.position.clone(), to: from, lookFrom: mid.clone().setY(P.pos.y + 1.5), lookTo: look, dur: 0.6, fov: 50 });
    // turn the player toward the NPC
    P.yaw = Math.atan2(dx, dz);
  }

  show(nodeId) {
    const d = this.dlg;
    let node = d.nodes[nodeId];
    while (node && node.redirect) {
      const r = node.redirect(this.S);
      node = d.nodes[r];
      nodeId = r;
    }
    if (!node) return this.end();
    this.node = node;
    this.nodeId = nodeId;
    if (node.fx) this.applyFx(node.fx);
    if (node.action) node.action(this.S, this.npc);
    const speaker = node.s === undefined ? (this.npc ? this.npc.name : '') : node.s;
    this.nameEl.textContent = speaker === 'you' ? 'You' : speaker || '';
    this.titleEl.textContent = node.title || (this.npc && speaker === this.npc.name ? this.npc.title : '');
    this.el.classList.toggle('narration', !speaker);
    const text = typeof node.t === 'function' ? node.t(this.S) : node.t;
    this.full = text || '';
    this.typing = 0;
    this.textEl.textContent = '';
    this.choicesEl.innerHTML = '';
    this.nextEl.hidden = true;
    this.choices = (node.choices || []).filter((c) => !c.cond || c.cond(this.S));
    this.waiting = true;
    if (speaker && this.npc && speaker === this.npc.name) this.npc.talkPulse = 1;
  }

  renderChoices() {
    this.choicesEl.innerHTML = '';
    this.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'dlg-choice' + (c.tag ? ' tag-' + c.tag.toLowerCase() : '');
      b.innerHTML = `<span class="n">${i + 1}</span>${c.tag ? `<span class="tag">${c.tag}</span>` : ''}<span class="t">${typeof c.t === 'function' ? c.t(this.S) : c.t}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pick(i);
      });
      this.choicesEl.appendChild(b);
    });
    this.nextEl.hidden = this.choices.length > 0;
  }

  pick(i) {
    const c = this.choices[i];
    if (!c) return;
    G.audio?.sfx('select');
    if (c.fx) this.applyFx(c.fx);
    if (c.action) c.action(this.S, this.npc);
    if (c.end) return this.end();
    this.show(c.next);
  }

  advance() {
    if (!this.active) return;
    if (this.typing < this.full.length) {
      this.typing = this.full.length;
      this.textEl.textContent = this.full;
      this.renderChoices();
      return;
    }
    if (this.choices.length) return;
    const n = this.node;
    if (n.end || !n.next) return this.end();
    this.show(typeof n.next === 'function' ? n.next(this.S) : n.next);
  }

  end() {
    this.active = false;
    this.el.hidden = true;
    G.ui.blocking = false;
    G.hud.root.classList.remove('in-dialogue');
    if (G.input.lastDevice === 'kbm') G.input.requestLock();
    G.cam.stopShot();
    G.cam.smoothTarget.copy(G.player.pos).add(new THREE.Vector3(0, 1.5, 0));
    const done = this.dlg && this.dlg.onEnd;
    const npc = this.npc;
    this.npc = null;
    if (done) done(this.S, npc);
    if (this.queue && this.queue.length) {
      const [id, n] = this.queue.shift();
      setTimeout(() => this.start(id, n), 200);
    }
  }

  then(id, npc) {
    if (!this.queue) this.queue = [];
    this.queue.push([id, npc]);
  }

  applyFx(fx) {
    const S = this.S;
    if (fx.flag) S.flags[fx.flag] = true;
    if (fx.flags) Object.assign(S.flags, fx.flags);
    if (fx.aff) {
      for (const k in fx.aff) {
        S.affinity[k] = Math.max(-100, Math.min(100, (S.affinity[k] || 0) + fx.aff[k]));
        const name = { lyra: 'Lyra', kael: 'Kael', oriel: 'Oriel' }[k];
        const v = fx.aff[k];
        G.hud.toast(v > 0 ? `${name} ${v >= 10 ? 'greatly approves' : 'approves'}.` : `${name} ${v <= -10 ? 'is troubled' : 'disapproves'}.`, v > 0 ? 'approve' : 'disapprove');
      }
    }
    if (fx.faction) {
      for (const k in fx.faction) S.faction[k] = (S.faction[k] || 0) + fx.faction[k];
      const k = Object.keys(fx.faction)[0];
      G.hud.toast(`${k === 'covenant' ? 'The Iron Covenant' : 'The Verdant Circle'} will remember this.`, 'faction');
    }
    if (fx.give) for (const k in fx.give) G.game.give(k, fx.give[k]);
    if (fx.take) for (const k in fx.take) {
      G.game.take(k, fx.take[k]);
      G.hud.toast(`Gave ${fx.take[k] > 1 ? fx.take[k] + '× ' : ''}${ITEMS[k]?.name || k}`, '');
    }
    if (fx.xp) G.player.gainXP(fx.xp);
    if (fx.quest) G.quests.start(fx.quest);
    if (fx.advance) G.quests.complete(fx.advance);
    if (fx.element !== undefined) G.story.unlockElement(fx.element);
    if (fx.recruit) G.story.recruit(fx.recruit);
  }

  update(dt) {
    if (!this.active) return;
    if (this.typing < this.full.length) {
      this.typing = Math.min(this.full.length, this.typing + dt * 70);
      this.textEl.textContent = this.full.slice(0, Math.floor(this.typing));
      if (this.typing >= this.full.length) this.renderChoices();
      if (Math.random() < dt * 14 && this.npc) G.audio?.sfx('blip', { pitch: this.npc.def.voice || 1 });
    }
    const inp = G.input;
    if (inp.hit('interact') || inp.hit('confirm') || inp.hit('jump')) this.advance();
    for (let i = 0; i < Math.min(9, this.choices.length); i++) if (inp.hit('el' + (i + 1))) this.pick(i);
    if (inp.mousePressed.left && !this.choices.length && this.typing >= this.full.length) {/* handled by click */}
  }
}
