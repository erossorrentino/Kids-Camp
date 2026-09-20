/**
 * SPECIAL ABILITIES
 * ------------------------------------------------------------------
 * Every chassis carries exactly one. An ability is data plus two optional
 * hooks that the simulation calls:
 *
 *   onActivate(ctx)  -- fired once when the pilot presses the key
 *   onTick(ctx, dt)  -- fired every frame while `duration` has not expired
 *   onEnd(ctx)       -- fired once when the duration runs out
 *
 * `ctx` carries { mech, match, world, fx, audio }. Abilities never touch
 * rendering directly; they set flags on the mech that the renderer reads.
 */

const A = (o) => o;

export const ABILITIES = {

  /* ---------------- Mobility ---------------- */
  blink: A({
    id:'blink', name:'PHASE BLINK', icon:'⚡', cooldown:9, duration:0,
    desc:'Teleport 45m along your current heading. Passes through anything thinner than a building.',
    onActivate(ctx) {
      const { mech, world } = ctx;
      const dir = mech.aimForward();
      const dest = world.raycastTeleport(mech.position, dir, 45, mech.radius);
      ctx.fx.blink(mech.position.clone(), dest.clone());
      mech.position.copy(dest);
      mech.velocity.multiplyScalar(0.35);
      mech.iFrames = 0.25;
      ctx.audio.play('blink', mech.position);
    },
  }),

  afterburn: A({
    id:'afterburn', name:'AFTERBURNER', icon:'🔥', cooldown:11, duration:3.4,
    desc:'Ignite the secondary thrusters: +70% top speed and free jump-jet fuel for 3.4s.',
    onActivate(ctx) { ctx.mech.speedMul *= 1.7; ctx.mech.freeJets = true; ctx.audio.play('burner', ctx.mech.position); },
    onTick(ctx, dt) { ctx.fx.thrusterTrail(ctx.mech, dt); ctx.mech.heat += 3.5 * dt; },
    onEnd(ctx) { ctx.mech.speedMul /= 1.7; ctx.mech.freeJets = false; },
  }),

  vault: A({
    id:'vault', name:'VAULT DRIVE', icon:'🦿', cooldown:10, duration:2.6,
    desc:'Overcharged jump jets. Triple thrust and full directional control while airborne.',
    onActivate(ctx) { ctx.mech.jetMul = 3.0; ctx.mech.airControl = 1.0; ctx.mech.jetFuel = ctx.mech.chassis.jets.fuel; ctx.audio.play('jets', ctx.mech.position); },
    onTick(ctx, dt) { ctx.fx.thrusterTrail(ctx.mech, dt, 1.6); },
    onEnd(ctx) { ctx.mech.jetMul = 1; ctx.mech.airControl = 0.35; },
  }),

  overdrive: A({
    id:'overdrive', name:'OVERDRIVE', icon:'💨', cooldown:8, duration:4.0,
    desc:'Redline the myomer bundles: +55% speed, +40% turn rate, and you take 15% more damage.',
    onActivate(ctx) { const m = ctx.mech; m.speedMul *= 1.55; m.turnMul *= 1.4; m.damageTakenMul *= 1.15; ctx.audio.play('overdrive', m.position); },
    onTick(ctx, dt) { ctx.mech.heat += 2.2 * dt; ctx.fx.speedLines(ctx.mech, dt); },
    onEnd(ctx) { const m = ctx.mech; m.speedMul /= 1.55; m.turnMul /= 1.4; m.damageTakenMul /= 1.15; },
  }),

  charge: A({
    id:'charge', name:'SHOULDER CHARGE', icon:'🐏', cooldown:12, duration:1.25,
    desc:'Launch forward and ram. Damage scales with your tonnage and impact speed; knocks the target down.',
    onActivate(ctx) {
      const m = ctx.mech;
      m.chargeActive = true; m.chargeHits = new Set();
      const dir = m.bodyForward();
      m.velocity.addScaledVector(dir, m.chassis.speed * 0.55);
      m.speedMul *= 2.2; m.turnMul *= 0.35; m.damageTakenMul *= 0.75;
      ctx.audio.play('charge', m.position);
    },
    onTick(ctx, dt) {
      const m = ctx.mech;
      ctx.fx.chargeAura(m, dt);
      for (const other of ctx.match.aliveMechs()) {
        if (other === m || m.chargeHits.has(other.id)) continue;
        if (other.position.distanceTo(m.position) > m.radius + other.radius + 1.6) continue;
        m.chargeHits.add(other.id);
        const speed = m.velocity.length();
        const dmg = Math.min(420, m.chassis.tons * 1.9 * (speed / 22));
        ctx.match.applyDamage(other, m, dmg, { location:'CT', source:'ram', stagger:2.4 });
        ctx.match.applyDamage(m, m, dmg * 0.18, { location:'CT', source:'ram-recoil', silent:true });
        ctx.fx.impactBurst(other.position, 2.4);
        ctx.audio.play('slam', m.position);
      }
    },
    onEnd(ctx) { const m = ctx.mech; m.chargeActive = false; m.speedMul /= 2.2; m.turnMul /= 0.35; m.damageTakenMul /= 0.75; },
  }),

  deathdrop: A({
    id:'deathdrop', name:'DEATH FROM ABOVE', icon:'☄️', cooldown:16, duration:0,
    desc:'Slam straight down. Everything inside 14m takes crushing damage and is knocked flat.',
    onActivate(ctx) {
      const m = ctx.mech;
      if (m.grounded) { m.velocity.y = 26; m.pendingSlam = true; ctx.audio.play('jets', m.position); }
      else { m.velocity.y = -70; m.pendingSlam = true; }
    },
  }),

  /* ---------------- Defensive ---------------- */
  bulwark: A({
    id:'bulwark', name:'BULWARK', icon:'🛡️', cooldown:14, duration:5.0,
    desc:'Angle the shield arm forward. Frontal damage is cut by 55% but you move at half speed.',
    onActivate(ctx) { const m = ctx.mech; m.frontalDR = 0.45; m.speedMul *= 0.5; m.bulwark = true; ctx.audio.play('shield', m.position); },
    onTick(ctx) { ctx.fx.bulwarkPlate(ctx.mech); },
    onEnd(ctx) { const m = ctx.mech; m.frontalDR = 1; m.speedMul /= 0.5; m.bulwark = false; },
  }),

  braced: A({
    id:'braced', name:'BRACE', icon:'⚓', cooldown:13, duration:4.5,
    desc:'Lock the legs. You cannot walk, but recoil vanishes, spread halves and you take 35% less damage.',
    onActivate(ctx) { const m = ctx.mech; m.braced = true; m.speedMul *= 0.08; m.spreadMul *= 0.45; m.damageTakenMul *= 0.65; m.recoilMul = 0.2; ctx.audio.play('brace', m.position); },
    onEnd(ctx) { const m = ctx.mech; m.braced = false; m.speedMul /= 0.08; m.spreadMul /= 0.45; m.damageTakenMul /= 0.65; m.recoilMul = 1; },
  }),

  shieldwall: A({
    id:'shieldwall', name:'SHIELD WALL', icon:'🧱', cooldown:18, duration:8.0,
    desc:'Deploy a hard-light barrier 12m wide. Blocks enemy fire; your team shoots straight through it.',
    onActivate(ctx) {
      const m = ctx.mech;
      const pos = m.position.clone().addScaledVector(m.aimForward(), 7);
      m.deployed = ctx.world.spawnBarrier(pos, m.yaw, m.team, 8.0);
      ctx.audio.play('deploy', m.position);
    },
    onEnd(ctx) { ctx.world.removeBarrier(ctx.mech.deployed); ctx.mech.deployed = null; },
  }),

  ams_dome: A({
    id:'ams_dome', name:'AEGIS DOME', icon:'🌐', cooldown:20, duration:9.0,
    desc:'Project a 26m point-defence umbrella. Every missile that enters it is shot down.',
    onActivate(ctx) { ctx.mech.amsDome = 26; ctx.audio.play('deploy', ctx.mech.position); },
    onTick(ctx) { ctx.fx.domeShell(ctx.mech, 26); },
    onEnd(ctx) { ctx.mech.amsDome = 0; },
  }),

  smoke: A({
    id:'smoke', name:'SMOKE SCREEN', icon:'🌫️', cooldown:14, duration:7.0,
    desc:'Fire a chaff canister. Blocks line of sight and breaks every missile lock inside 20m.',
    onActivate(ctx) {
      const m = ctx.mech;
      const pos = m.position.clone().addScaledVector(m.aimForward(), 12);
      ctx.world.spawnSmoke(pos, 20, 7.0);
      ctx.match.breakLocksNear(pos, 20);
      ctx.audio.play('smoke', m.position);
    },
  }),

  cloak: A({
    id:'cloak', name:'OPTICAL CLOAK', icon:'👻', cooldown:19, duration:6.0,
    desc:'Near-total invisibility and no radar signature. Firing a weapon ends it early.',
    onActivate(ctx) { const m = ctx.mech; m.cloaked = true; m.radarHidden = true; ctx.audio.play('cloak', m.position); },
    onTick(ctx) { if (ctx.mech.firedThisFrame) ctx.mech.endAbility(); },
    onEnd(ctx) { const m = ctx.mech; m.cloaked = false; m.radarHidden = false; ctx.fx.decloak(m); },
  }),

  /* ---------------- Offensive / utility ---------------- */
  overclock: A({
    id:'overclock', name:'OVERCLOCK', icon:'⚙️', cooldown:15, duration:5.5,
    desc:'+65% rate of fire and instant weapon cycling. Heat generation rises by the same amount.',
    onActivate(ctx) { const m = ctx.mech; m.fireRateMul *= 1.65; m.heatGenMul *= 1.65; ctx.audio.play('overclock', m.position); },
    onTick(ctx) { ctx.fx.overclockGlow(ctx.mech); },
    onEnd(ctx) { const m = ctx.mech; m.fireRateMul /= 1.65; m.heatGenMul /= 1.65; },
  }),

  alpha: A({
    id:'alpha', name:'ALPHA STRIKE', icon:'💥', cooldown:22, duration:3.0,
    desc:'Every weapon fires together, ignoring cooldowns, and generates no heat for three seconds.',
    onActivate(ctx) { const m = ctx.mech; m.alphaMode = true; m.heatGenMul *= 0.0; ctx.audio.play('alpha', m.position); },
    onEnd(ctx) { const m = ctx.mech; m.alphaMode = false; m.heatGenMul = m.baseHeatGenMul; },
  }),

  stomp: A({
    id:'stomp', name:'SEISMIC STOMP', icon:'💢', cooldown:13, duration:0,
    desc:'Drive a foot into the ground. A shockwave staggers and damages everything within 18m.',
    onActivate(ctx) {
      const m = ctx.mech;
      ctx.fx.shockwave(m.position.clone(), 18);
      ctx.audio.play('stomp', m.position);
      for (const other of ctx.match.aliveMechs()) {
        if (other === m) continue;
        const d = other.position.distanceTo(m.position);
        if (d > 18 || Math.abs(other.position.y - m.position.y) > 9) continue;
        const falloff = 1 - d / 18;
        ctx.match.applyDamage(other, m, 150 * falloff, { location:'RL', source:'stomp', stagger:2.0 * falloff });
      }
    },
  }),

  emp_burst: A({
    id:'emp_burst', name:'EMP BURST', icon:'🔌', cooldown:17, duration:0,
    desc:'Detonate a capacitor bank. Dumps 45 heat into every enemy within 24m and scrambles their HUD.',
    onActivate(ctx) {
      const m = ctx.mech;
      ctx.fx.empRing(m.position.clone(), 24);
      ctx.audio.play('emp', m.position);
      for (const other of ctx.match.aliveMechs()) {
        if (other === m || other.team === m.team) continue;
        const d = other.position.distanceTo(m.position);
        if (d > 24) continue;
        const f = 1 - d / 24;
        other.heat += 45 * f;
        other.jammedFor = Math.max(other.jammedFor, 3.5 * f);
      }
    },
  }),

  jammer: A({
    id:'jammer', name:'ECM JAMMER', icon:'📡', cooldown:16, duration:9.0,
    desc:'Radiate a 90m null field: enemies inside it lose radar and cannot hold a missile lock on anyone.',
    onActivate(ctx) { ctx.mech.ecmRadius = 90; ctx.audio.play('ecm', ctx.mech.position); },
    onTick(ctx) { ctx.fx.ecmPulse(ctx.mech, 90); },
    onEnd(ctx) { ctx.mech.ecmRadius = 0; },
  }),

  scan: A({
    id:'scan', name:'DEEP SCAN', icon:'🔍', cooldown:15, duration:8.0,
    desc:'Reveal every enemy on the map through walls for your whole team, and hand them free missile locks.',
    onActivate(ctx) {
      ctx.match.revealAll(ctx.mech.team, 8.0);
      ctx.fx.scanPulse(ctx.mech.position.clone());
      ctx.audio.play('scan', ctx.mech.position);
    },
  }),

  targetlock: A({
    id:'targetlock', name:'TARGETING COMPUTER', icon:'🎯', cooldown:16, duration:6.0,
    desc:'Zero spread, +25% damage, and every shot lands on the section you are aiming at.',
    onActivate(ctx) { const m = ctx.mech; m.spreadMul *= 0.02; m.damageMul *= 1.25; m.pinpoint = true; ctx.audio.play('lockon', m.position); },
    onEnd(ctx) { const m = ctx.mech; m.spreadMul /= 0.02; m.damageMul /= 1.25; m.pinpoint = false; },
  }),

  artillery: A({
    id:'artillery', name:'ARTILLERY CALL', icon:'📮', cooldown:24, duration:0,
    desc:'Mark where you are aiming. Four seconds later, off-map guns saturate a 22m circle.',
    onActivate(ctx) {
      const m = ctx.mech;
      const target = ctx.world.aimPoint(m, 700);
      ctx.match.callArtillery(target, m, { delay:4.0, radius:22, shells:9, damage:120 });
      ctx.fx.markerBeacon(target);
      ctx.audio.play('callout', m.position);
    },
  }),

  skyfall: A({
    id:'skyfall', name:'SKYFALL BARRAGE', icon:'🌠', cooldown:20, duration:0,
    desc:'Empty every missile rack at once in a single saturating volley, free of heat.',
    onActivate(ctx) { const m = ctx.mech; m.barrageShots = 3; m.barrageFree = true; ctx.audio.play('volley', m.position); },
  }),

  repairfield: A({
    id:'repairfield', name:'REPAIR FIELD', icon:'✚', cooldown:18, duration:7.0,
    desc:'Project a 22m nanite field. Friendly mechs inside it regain structure and shed heat fast.',
    onActivate(ctx) { ctx.mech.repairField = 22; ctx.audio.play('repair', ctx.mech.position); },
    onTick(ctx, dt) {
      const m = ctx.mech;
      ctx.fx.repairField(m, 22);
      for (const ally of ctx.match.aliveMechs()) {
        if (ally.team !== m.team) continue;
        if (ally.position.distanceTo(m.position) > 22) continue;
        ctx.match.repair(ally, 62 * dt, m);
        ally.heat = Math.max(0, ally.heat - 10 * dt);
      }
    },
    onEnd(ctx) { ctx.mech.repairField = 0; },
  }),
};

export const ABILITY_LIST = Object.values(ABILITIES);
export function getAbility(id) { return ABILITIES[id] || ABILITIES.overdrive; }
