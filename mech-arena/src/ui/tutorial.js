/**
 * TUTORIAL
 * ------------------------------------------------------------------
 * A sequence of short lessons that watch the live match state and advance
 * when the player actually does the thing. Nothing is modal and nothing
 * pauses the game -- a card sits in the corner and ticks off as you go.
 *
 * Each step is: a title, one line of instruction, and a `done(ctx)`
 * predicate. `ctx` is { mech, match, controller, input, elapsed }.
 */

const STEPS = [
  {
    id: 'move',
    title: 'WALK',
    body: 'W A S D to walk. Your legs turn to follow where the torso is looking, and they turn at the chassis\'s own rate — a heavy mech cannot pivot like a person.',
    touchBody: 'The stick walks: push it where you want to go and the legs turn to follow, at the chassis\'s own rate — a heavy mech cannot pivot like a person.',
    goal: 'Cover 40 metres',
    init: (ctx) => ({ from: ctx.mech.position.clone() }),
    done: (ctx, st) => ctx.mech.position.distanceTo(st.from) > 40,
  },
  {
    id: 'look',
    title: 'TWIST THE TORSO',
    body: 'Move the mouse to aim. The torso swings independently of the hips, so you can walk one way and shoot another — that is how you retreat without giving up your guns.',
    touchBody: 'Drag anywhere on the view to aim. The torso swings independently of the hips, so you can walk one way and shoot another — that is how you retreat without giving up your guns.',
    goal: 'Twist 60° off your heading',
    done: (ctx) => Math.abs(angle(ctx.mech.yaw, ctx.mech.aimYaw)) > 1.0,
  },
  {
    id: 'fire',
    title: 'FIRE',
    body: 'Left mouse fires the selected weapon. 1–6 pick a weapon; Z, X and C fire your Alpha group, your Beta group, or everything at once.',
    touchBody: 'FIRE shoots. ALL switches between one weapon and the whole loadout, and AUTO hands the trigger to the targeting computer — it fires whenever the reticle is on a hostile.',
    goal: 'Land 5 hits',
    init: () => ({ hits: 0 }),
    tick: (ctx, st, ev) => { if (ev?.type === 'hit') st.hits++; },
    done: (ctx, st) => st.hits >= 5,
  },
  {
    id: 'heat',
    title: 'WATCH THE HEAT',
    body: 'Every shot adds heat. Cross the red line and your reactor scrams: no movement, no weapons, for three seconds — a very long time in a five-minute match.',
    touchBody: 'Every shot adds heat. Cross the red line and your reactor scrams: no movement, no weapons, for three seconds — a very long time in a five-minute match.',
    goal: 'Push heat past 60%',
    done: (ctx) => ctx.mech.heatFraction > 0.6,
  },
  {
    id: 'sections',
    title: 'AIM FOR A SECTION',
    body: 'Armour is tracked per body section — the paper doll bottom-left is the target you are shooting, not a single health bar. Strip a side torso and the weapons mounted there die with it.',
    goal: 'Destroy any section on a target',
    init: () => ({ n: 0 }),
    tick: (ctx, st) => {
      for (const m of ctx.match.aliveMechs()) {
        if (m.team === ctx.mech.team) continue;
        for (const loc of ['LA', 'RA', 'LT', 'RT', 'LL', 'RL']) if (m.destroyed[loc]) st.n++;
      }
    },
    done: (ctx, st) => st.n > 0,
  },
  {
    id: 'ability',
    title: 'USE YOUR ABILITY',
    body: 'Q triggers your chassis special. Every mech has exactly one and it defines how it plays. An ability sitting on cooldown is doing nothing for you.',
    touchBody: 'ABIL triggers your chassis special. Every mech has exactly one and it defines how it plays. An ability sitting on cooldown is doing nothing for you.',
    goal: 'Trigger your ability',
    init: () => ({ used: false }),
    tick: (ctx, st) => { if (ctx.mech.abilityActive || ctx.mech.abilityCd > 0) st.used = true; },
    done: (ctx, st) => st.used,
  },
  {
    id: 'jets',
    title: 'JUMP JETS',
    body: 'SPACE burns jump-jet fuel. Fuel regenerates on the ground, and a hard landing damages your legs — jets are for taking an angle, not for flying.',
    touchBody: 'JETS burns jump-jet fuel. Fuel regenerates on the ground, and a hard landing damages your legs — jets are for taking an angle, not for flying.',
    goal: 'Leave the ground (skip if your chassis has no jets)',
    skipIf: (ctx) => ctx.mech.chassis.jets.thrust <= 0,
    done: (ctx) => !ctx.mech.grounded,
  },
  {
    id: 'lock',
    title: 'MISSILE LOCK',
    body: 'Guided launchers will not fire without a lock. Hold the target near your crosshair until the ring closes. Smoke, an ECM field, or simply breaking line of sight drops it.',
    goal: 'Acquire a lock (skip if you carry no lock-on weapon)',
    skipIf: (ctx) => !ctx.mech.weapons.some(w => w && w.def.mode === 'lock'),
    done: (ctx) => !!ctx.mech.lockedTarget,
  },
  {
    id: 'cockpit',
    title: 'COCKPIT VIEW',
    body: 'F switches between the chase camera and the cockpit. The cockpit is harder to fly and much better for long-range gunnery. Right mouse zooms in either view.',
    touchBody: 'ZOOM magnifies the view, which is what wins a long-range exchange. LOCK cycles which hostile your missiles are hunting.',
    goal: 'Switch views or zoom in',
    init: (ctx) => ({ start: ctx.controller.view }),
    // There is no cockpit key on a phone, so zooming counts as well.
    done: (ctx, st) => ctx.controller.view !== st.start || ctx.controller.targetZoom > 1.5,
  },
  {
    id: 'done',
    title: 'RANGE COMPLETE',
    body: 'That is the whole game: heat, sections, torso twist, and one ability used at the right moment. Take your lance into a real match when you are ready.',
    goal: null,
    done: (ctx, st, elapsed) => elapsed > 8,
  },
];

function angle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Tutorial {
  constructor(audio) {
    this.audio = audio;
    this.index = 0;
    this.state = null;
    this.elapsed = 0;
    this.completing = 0;
    this.active = false;
    this.el = null;
    this._buildDom();
  }

  _buildDom() {
    const el = document.createElement('div');
    el.id = 'tutorial';
    el.innerHTML = `
      <div class="tut-head"><span class="tut-step"></span><span class="tut-title"></span></div>
      <p class="tut-body"></p>
      <div class="tut-goal"><i></i><span></span></div>
      <button class="tut-skip">SKIP LESSON</button>`;
    document.body.appendChild(el);
    this.el = el;
    this.parts = {
      step: el.querySelector('.tut-step'),
      title: el.querySelector('.tut-title'),
      body: el.querySelector('.tut-body'),
      goal: el.querySelector('.tut-goal span'),
      tick: el.querySelector('.tut-goal i'),
      skip: el.querySelector('.tut-skip'),
    };
    this.parts.skip.onclick = () => { this.audio.play('uiBack'); this._advance(); };
    el.style.display = 'none';
  }

  start(ctx) {
    this.active = true;
    this.index = 0;
    this.el.style.display = '';
    this._enter(ctx);
  }

  stop() {
    this.active = false;
    this.el.style.display = 'none';
  }

  _enter(ctx) {
    const step = STEPS[this.index];
    if (!step) { this.stop(); return; }
    if (step.skipIf && step.skipIf(ctx)) { this.index++; this._enter(ctx); return; }
    this.state = step.init ? step.init(ctx) : {};
    this.elapsed = 0;
    this.completing = 0;
    this.parts.step.textContent = `${this.index + 1}/${STEPS.length}`;
    this.parts.title.textContent = step.title;
    // On a touch screen the lesson has to name the buttons that exist.
    const touch = document.body.classList.contains('touch-ui');
    this.parts.body.textContent = (touch && step.touchBody) ? step.touchBody : step.body;
    this.parts.goal.textContent = step.goal || '';
    this.parts.goal.parentElement.style.display = step.goal ? '' : 'none';
    this.el.classList.remove('tut-done');
    this.audio.play('ui');
  }

  _advance() {
    this.index++;
    this._pendingEnter = true;
  }

  /** Called once per frame with the live match context. */
  update(dt, ctx, lastEvent) {
    if (!this.active || !ctx.mech) return;
    if (this._pendingEnter) { this._pendingEnter = false; this._enter(ctx); return; }
    const step = STEPS[this.index];
    if (!step) { this.stop(); return; }
    this.elapsed += dt;
    step.tick?.(ctx, this.state, lastEvent);
    if (this.completing) {
      // Hold the green state briefly so the player sees the tick land.
      this.completing -= dt;
      if (this.completing <= 0) { this.completing = 0; this._advance(); }
      return;
    }
    if (step.done(ctx, this.state, this.elapsed)) {
      this.el.classList.add('tut-done');
      this.audio.play('kill');
      this.completing = 0.9;
    }
  }

  dispose() { this.el?.remove(); }
}

export const TUTORIAL_STEP_COUNT = STEPS.length;
