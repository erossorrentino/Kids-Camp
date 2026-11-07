import { G } from '../core/G.js';
import { QUALITY } from '../core/renderer.js';

// Contextual one-time hints, adaptive quality and auto-pause.
const HINTS = {
  combat: 'Tab locks on. Left mouse attacks, hold it to charge. Right mouse blocks. Tap it as a gold glint flashes to parry.',
  red: 'A red glint means the attack cannot be blocked or parried. Tap Shift to dodge through it.',
  climb: 'Climbing drains stamina (the wheel beside you). Rest on flat ledges, or press C to let go.',
  glide: 'Press Space in mid-air to glide. Fire and campfires create updrafts that lift you.',
  harvest: 'Strike trees and rocks with your sword to gather wood and stone.',
  build: 'You have materials! Press B to build. Bridges, shelters, traps and bounce pads.',
  rest: 'Campfires are safe havens. Rest to heal, save and craft gear.',
  shift: 'Tap T to shift to the next Age. Hold T to choose from the Age wheel.',
  magic: 'Q casts your selected spell, hold Q for a greater spell. F weaves the element into your blade. 1–4 switch elements.',
  skills: 'You have a skill point. Open the menu (Esc) and spend it under Skills.',
  dodge: 'Dodge at the very last moment to trigger a Timeslip and slow the world around you.',
  swim: 'Swimming uses stamina. Frost magic turns water into ice you can walk on.',
  mount: 'Sneak (C) up to a Duskhorn and press E to try to tame it.',
  fox: 'A little fox is napping under the trees. Walk up and press E to befriend it.',
  echo: 'A glowing Echo is close by. Thirty are hidden across the three Ages, and each one only shows in its own Age.',
  photo: 'Press V for Photo Mode: freeze time, strike a pose and save a picture.',
  tower: 'Towers can be climbed: walk into a wall to grab it. Rest on ledges and rings to refill stamina, then glide down from the top with Space.',
};

// Same hints, phrased for touch screens.
const TOUCH_HINTS = {
  combat: 'Tap Strike (or tap the right side of the screen) to attack. Lock targets a foe. Tap Guard just as a gold glint flashes to parry.',
  red: 'A red glint cannot be blocked. Tap Dodge to roll through it.',
  climb: 'Climbing drains stamina. Rest on flat ledges.',
  glide: 'Tap Jump in mid-air to glide. Campfires and fire create updrafts.',
  build: 'You have materials! Tap Build (top left) to place bridges, shelters and traps.',
  shift: 'Tap Age to shift to the next Age. Hold it and push the joystick to choose one.',
  magic: 'Spell casts your element (hold for a greater spell). Elem switches element. Weave enchants your blade.',
  skills: 'You have a skill point. Tap Menu and open Skills.',
  dodge: 'Dodge at the very last moment to slow time around you.',
  mount: 'Walk slowly up to a Duskhorn and tap Use to try to tame it.',
  fox: 'A little fox is napping under the trees. Walk up and tap Use to befriend it.',
  photo: 'Open the Menu and tap Photo for Photo Mode: freeze time, strike a pose and save a picture.',
  tower: 'Towers can be climbed: push the stick into a wall to grab it. Rest on ledges and rings to refill stamina, then tap Jump at the top to glide down.',
};

export class Tutorial {
  constructor() {
    this.t = 0;
    this.fpsT = 0;
    this.frames = 0;
    this.downgrades = 0;
    this.warm = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && G.state === 'play' && !G.ui.menuOpen && !G.cutscene.active && !G.dialogue.active && !G.rift?.picking) G.ui.openMenu('map');
    });
    G.input.onUserUnlock = () => {
      if (G.state === 'play' && !G.ui.blocking && !G.cutscene.active && !G.build?.active && !G.rift?.picking) {
        // the browser swallows the Esc that released the mouse: open the menu for it
        setTimeout(() => { if (!document.pointerLockElement && !G.input.lockWanted && !G.ui.menuOpen && G.state === 'play' && !G.ui.blocking) G.ui.openMenu(G.ui.tab || 'map'); }, 50);
      }
    };
  }

  hint(id) {
    const S = G.game.state;
    S.flags.hints = S.flags.hints || {};
    if (S.flags.hints[id]) return;
    S.flags.hints[id] = true;
    const touch = G.input.lastDevice === 'touch';
    G.hud.toast((touch && TOUCH_HINTS[id]) || HINTS[id], 'tip');
  }

  update(dt, rdt) {
    if (G.state !== 'play') return;
    // adaptive quality: step down if the frame rate stays low
    this.warm += rdt;
    if (this.warm > 6 && !G.ui.paused && !G.cutscene.active) {
      this.fpsT += rdt;
      this.frames++;
      if (this.fpsT >= 4) {
        const fps = this.frames / this.fpsT;
        this.fpsT = 0;
        this.frames = 0;
        const order = ['low', 'medium', 'high', 'ultra'];
        const qi = order.indexOf(G.settings.quality);
        if (fps < 26 && qi > 0 && this.downgrades < 2 && !G.settings.manualQuality) {
          this.downgrades++;
          G.settings.quality = order[qi - 1];
          G.qualityCfg = QUALITY[G.settings.quality];
          G.quality = G.settings.quality;
          G.applyQuality();
          G.ui.saveSettings();
          G.hud.toast(`Graphics lowered to ${G.settings.quality} for smoother play. You can change this in Settings.`, 'tip');
        }
      }
    }
    if (!dt) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const P = G.player;
    const S = G.game.state;
    for (const e of G.enemies) {
      if (!e.dead && e.state !== 'idle' && e.distTo(P.pos) < 25) { this.hint('combat'); break; }
    }
    if (G.enemies.some((e) => !e.dead && e.attack && e.attack.def.parryable === false && e.distTo(P.pos) < 12)) this.hint('red');
    if (P.mode === 'climb' && P.stamina < P.maxStamina * 0.6) this.hint('climb');
    if (P.mode === 'air' && P.vel.y < -6 && P.pos.y - G.terrain.heightAt(P.pos.x, P.pos.z) > 4) this.hint('glide');
    if (P.mode === 'swim') this.hint('swim');
    if (S.flags.hints?.combat && S.stats.kills >= 2) this.hint('dodge');
    if (G.veg && S.flags.met_lyra && S.stats.kills >= 1) this.hint('harvest');
    if ((S.inv.wood >= 4 || S.inv.stone >= 4) && !G.build.active) this.hint('build');
    if (G.content.campfires.some((c) => Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 8)) this.hint('rest');
    if (S.flags.shift_unlocked) this.hint('shift');
    if (S.flags.hints?.combat && S.stats.kills >= 1) this.hint('magic');
    if ((P.skillPoints || 0) > 0) this.hint('skills');
    if (G.mounts && G.mounts.list.some((m) => m.visibleNow() && !m.tamed && m.pos.distanceTo(P.pos) < 30)) this.hint('mount');
    if (G.fox && !S.flags.fox && G.fox.pos.distanceTo(P.pos) < 14) this.hint('fox');
    const sp = G.content?.spire, obs = G.content?.hearthmere?.obs;
    if ((sp && Math.hypot(sp.x - P.pos.x, sp.z - P.pos.z) < 26) || (obs && Math.hypot(obs.x - P.pos.x, obs.z - 4 - P.pos.z) < 9)) this.hint('tower');
    if (G.echoes && G.echoes.nearestUnfound(P.pos, 30)) this.hint('echo');
    this.playT = (this.playT || 0) + 0.5;
    if (this.playT > 300) this.hint('photo');
  }
}
