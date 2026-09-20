/* Star Kingdoms — territory battles and Citadel assaults.
   Fought on the real planet surface. You call units down at your own
   position, they march and fight on their own, and you shoot alongside
   them. Every unit trait and every unlocked perk is applied here: none
   of the 1,013 roster entries is a reskin. */
(function (SK) {
  'use strict';
  const U = SK.util;
  const B = SK.build;
  const D = SK.data;

  const PROJ_BY_FAMILY = {
    vanguard: { kind: 'tracer' },
    longshot: { kind: 'tracer', thick: 0.16 },
    rocketeer: { kind: 'bolt', speed: 34 },
    colossus: { kind: 'bolt', speed: 46 },
    aegis: { kind: 'beam' },
    bulwark: { kind: 'tracer' },
    warden: { kind: 'bolt', speed: 40 },
    seraph: { kind: 'tracer' },
    pyre: { kind: 'flame' },
    phantom: { kind: 'melee' },
    lancer: { kind: 'melee' },
    skitter: { kind: 'melee' }
  };

  const KEEP_RANGE = 26;
  /* Keeps are fortifications, not soft targets. The two sides are
     deliberately asymmetric: you are the one assaulting, so your units
     siege properly, while the defenders' job is to stop you rather than
     to win a race back to your staging keep. Without this the two armies
     simply run past each other and the fight is decided by who deploys
     free units, which is always the AI. */
  const STRUCT_MUL = 0.42;
  const STRUCT_MUL_VS_PLAYER = 0.12;
  const MAX_ALLIES = 14;
  const FIELD_LEN = 95;
  const LANE_HALF = 15;   // half-width of the road the fight happens on

  const _tc = new THREE.Color(), _tc2 = new THREE.Color();
  function tintPalette(base, tint) {
    if (!tint) return base;
    const out = Object.assign({}, base);
    const mix = tint.mix == null ? 0.5 : tint.mix;
    ['suit', 'trim', 'accent', 'helmet', 'visor'].forEach((k) => {
      if (tint[k] == null) return;
      const from = out[k] != null ? out[k] : (k === 'helmet' ? 0xdfe8f2 : out.suit);
      out[k] = _tc.setHex(from).lerp(_tc2.setHex(tint[k]), mix).getHex();
    });
    return out;
  }

  /* ================================================================== */
  function Battle(game) {
    this.game = game;
    this.units = [];
    this.active = false;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
  }

  /* --------------------------------------------------------- setup */
  Battle.prototype.start = function (territory, citadel) {
    const game = this.game;
    const world = game.world;
    const planet = world.planet;
    const st = citadel ? D.citadelStats(citadel) : D.tierStats(territory.tier);
    this.territory = territory;
    this.citadel = citadel || null;
    this.isCitadel = !!citadel;
    this.stats = st;
    this.planet = planet;
    this.active = true;
    this.t = 0;
    this.units = [];
    this.boss = null;
    this.spectating = false;
    this.result = null;
    this.endT = 0;
    this.tier = citadel ? citadel.tier : territory.tier;

    const S = game.state;
    this.allyBuff = 1 + (S.buildings.lab || 0) * 0.05;
    const shield = 1 + (S.buildings.shield || 0) * 0.10;

    const cx = citadel ? citadel.x : territory.x;
    const cz = citadel ? citadel.z : territory.z;
    this.center = { x: cx, z: cz };

    if (citadel && !world.citadelRig) world.syncCitadel(game.state, true, false);
    const ek = citadel ? world.citadelRig : world.keeps[territory.id];
    this.enemyKeep = {
      team: 1, pos: new THREE.Vector3(cx, world.heightAt(cx, cz), cz),
      hp: st.keepHp, maxHp: st.keepHp, rig: ek, cooldown: 0, radius: citadel ? 9 : 7
    };

    /* Your keep goes on the side you walked in from, on the flattest real
       ground in that arc — the terrain mesh is already built, so heightAt
       must not be altered here. */
    const px = game.player.pos.x, pz = game.player.pos.z;
    let dx = px - cx, dz = pz - cz;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    const baseAngle = Math.atan2(dz, dx);
    let hx = cx + dx * FIELD_LEN, hz = cz + dz * FIELD_LEN, bestFlat = Infinity;
    for (let i = 0; i < 40; i++) {
      const a = baseAngle + ((i % 9) - 4) * 0.13;
      const d = FIELD_LEN + (Math.floor(i / 9) - 2) * 6;
      const qx = cx + Math.cos(a) * d, qz = cz + Math.sin(a) * d;
      if (Math.hypot(qx, qz) > SK.World.WORLD_R * 0.9) continue;
      const y0 = world.heightAt(qx, qz);
      if (y0 < world.waterLevel + 1.5) continue;
      const slope = Math.abs(world.heightAt(qx + 8, qz) - y0) + Math.abs(world.heightAt(qx - 8, qz) - y0) +
        Math.abs(world.heightAt(qx, qz + 8) - y0) + Math.abs(world.heightAt(qx, qz - 8) - y0);
      if (slope < bestFlat) { bestFlat = slope; hx = qx; hz = qz; }
    }
    const ndx = hx - cx, ndz = hz - cz;
    const nl = Math.hypot(ndx, ndz) || 1;
    this.homeDir = new THREE.Vector3(ndx / nl, 0, ndz / nl);

    const hy = world.heightAt(hx, hz);
    const pk = SK.props.buildKeep({ trim: 0x35e0ff, accent: 0xffb23f, suit: 0x2a4a72 }, true);
    pk.group.position.set(hx, hy - 0.5, hz);
    pk.group.scale.setScalar(0.85);
    world.scene.add(pk.group);
    this.homeKeepRig = pk;
    this.homeKeep = {
      team: 0, pos: new THREE.Vector3(hx, hy, hz),
      hp: Math.round(st.homeKeepHp * shield), maxHp: Math.round(st.homeKeepHp * shield),
      rig: pk, cooldown: 0, radius: 6
    };

    /* The lane. Both armies stand on it from the first second; there is no
       energy bar and nothing to deploy. */
    this.lane = SK.props.buildLane(world, this.homeKeep.pos, this.enemyKeep.pos, LANE_HALF, 0x35e0ff);
    world.scene.add(this.lane.group);

    /* Your army: every soldier you own, lined up at your end. */
    const roster = game.roster();
    roster.forEach((ent, i) => {
      const def = D.unit(ent.id);
      if (!def) return;
      const col = i % 4, row = Math.floor(i / 4);
      const p = this.lanePoint(12 + row * 7, (col - 1.5) * 6.5);
      this.spawnUnit(def, 0, p.x, p.z, ent.lv || 1);
    });
    this.allyStart = roster.length;

    /* Their army: a fixed force scaled to the target, plus the Warlord on a
       Citadel. Nobody gets reinforcements — what stands here decides it. */
    const foeCount = Math.min(16, (citadel ? 7 : 4) + Math.round(this.tier * (citadel ? 1.0 : 0.9)));
    const foeLevel = Math.max(1, Math.round(this.tier * 0.8));
    for (let i = 0; i < foeCount; i++) {
      const def = this.pickEnemyDef(i);
      if (!def) continue;
      const col = i % 4, row = Math.floor(i / 4);
      const p = this.lanePoint(this.lane.len - (12 + row * 7), (col - 1.5) * 6.5);
      this.spawnUnit(def, 1, p.x, p.z, foeLevel);
    }
    this.foeStart = foeCount;

    if (citadel) {
      this.boss = this.spawnBoss(citadel);
      game.toast(citadel.warlord.name + ': "' + citadel.warlord.taunt + '"', 'bad');
    }

    game.player.spawn(world, hx + this.homeDir.x * 7, hz + this.homeDir.z * 7);
    game.player.health = 100;
    game.player.group.visible = true;
    SK.Audio.tone({ type: 'sawtooth', f0: 90, f1: citadel ? 200 : 260, dur: 1.3, gain: 0.22,
      filter: [300, 1800] });
  };

  /* A point on the lane: `along` metres from your keep, `across` sideways. */
  Battle.prototype.lanePoint = function (along, across) {
    const L = this.lane;
    const x = L.ax + L.ux * along + L.px * across;
    const z = L.az + L.uz * along + L.pz * across;
    return { x: x, z: z };
  };

  /* Keep a unit on the road. */
  Battle.prototype.clampToLane = function (u) {
    const L = this.lane;
    if (!L) return;
    const rx = u.pos.x - L.ax, rz = u.pos.z - L.az;
    const along = rx * L.ux + rz * L.uz;
    const across = rx * L.px + rz * L.pz;
    const lim = L.halfWidth - u.radius * 0.5;
    if (across > lim || across < -lim) {
      const c = U.clamp(across, -lim, lim);
      u.pos.x = L.ax + L.ux * along + L.px * c;
      u.pos.z = L.az + L.uz * along + L.pz * c;
    }
  };

  Battle.prototype.pickEnemyDef = function (i) {
    const cfg = D.ENEMY_UNITS[this.planet.faction.id] || { families: ['vanguard'], traits: ['std'] };
    const fam = cfg.families[(i == null ? (Math.random() * cfg.families.length) | 0 : i) % cfg.families.length];
    const trait = U.pick(cfg.traits);
    const mark = U.clamp(Math.round(this.tier * 0.72), 1, 7);
    return D.unit(fam + '-' + mark + '-' + trait) || D.unit(fam + '-1-std');
  };

  /* ---------------------------------------------------- unit factory */
  Battle.prototype.spawnUnit = function (def, team, x, z, level, bossSpec) {
    const world = this.game.world;
    const look = def.look || {};
    const basePal = team === 0
      ? { skin: this.game.state.appearance.skin, suit: this.game.state.appearance.suit,
          trim: this.game.state.appearance.trim, visor: 0xbfefff,
          accent: this.game.state.appearance.accent }
      : this.planet.faction;
    // family tint first, then the trait tint on top of it
    let pal = tintPalette(basePal, look.tint);
    pal = tintPalette(pal, def.traitTint);

    const scale = (look.scale || 1) * (bossSpec ? bossSpec.scale / (look.scale || 1) : 1);
    const char = B.buildCharacter({
      pal: pal, weapon: look.weapon, shield: look.shield, heavy: look.heavy,
      tiny: look.tiny, crest: look.crest, cape: look.cape,
      scale: bossSpec ? bossSpec.scale : (look.scale || 1)
    });

    const lvMul = 1 + (level - 1) * 0.14;
    const buff = team === 0 ? this.allyBuff : 1;
    const enemyHp = team === 1 ? this.stats.hpMul : 1;
    const enemyDmg = team === 1 ? this.stats.dmgMul : 1;
    const perks = team === 0 ? D.unitPerksAt(def, level) : [];
    const has = (p) => perks.indexOf(p) >= 0;

    let hp = def.hp * lvMul * buff * enemyHp;
    if (has('tough')) hp *= 1.22;
    let dmg = def.dmg * lvMul * buff * enemyDmg;
    let heal = (def.heal || 0) * lvMul * buff;
    if (has('swiftHeal')) heal *= 1.35;
    let atkRate = def.atkRate * (has('rapid') ? 0.8 : 1);
    let range = def.range * (has('reach') ? 1.28 : 1);
    let speed = def.speed * (has('haste') ? 1.22 : 1);
    let splash = def.splash || 0;
    if (has('splash')) splash = splash ? splash + 2 : 4;

    if (bossSpec) {
      hp = bossSpec.hp * (1 + (this.tier - 1) * 0.04);
      dmg = bossSpec.dmg;
      atkRate = bossSpec.atkRate;
      range = bossSpec.range;
      speed = bossSpec.speed;
      splash = 6;
    }

    const unit = {
      def: def, team: team, level: level, char: char, boss: !!bossSpec,
      pos: new THREE.Vector3(x, world.heightAt(x, z) + (def.hover || 0), z),
      yaw: Math.atan2((team === 0 ? this.center.x : this.homeKeep.pos.x) - x,
        (team === 0 ? this.center.z : this.homeKeep.pos.z) - z),
      hp: Math.round(hp), maxHp: Math.round(hp),
      dmg: dmg, heal: heal, range: range, speed: speed, atkRate: atkRate,
      splash: splash, burn: def.burn || 0, hover: def.hover || 0,
      keepDR: def.keepDR || 0, structMul: def.structMul || 1,
      lifesteal: def.lifesteal || 0, reflect: def.reflect || 0,
      deathBlast: def.deathBlast || null, slowSpec: def.slow || null,
      aura: def.aura || null,
      dr: has('guard') ? 0.2 : 0,
      perks: perks, hasPerk: has,
      crit: has('crit'), pierce: has('pierce'), multishot: has('multishot'),
      regen: has('regen'), chain: has('chain'), rally: has('rally'),
      overload: has('overload'), siegebreaker: has('siegebreaker'),
      guardAura: has('bulwarkAura'),
      firstAttack: true,
      slowT: 0, slowAmt: 0, burnT: 0, burnDps: 0,
      auraDmg: 0, auraDR: 0,
      cooldown: U.rand(0, 0.4), target: null, dead: false, deadT: 0,
      attackAnim: 0,
      radius: bossSpec ? 2.6 : (look.heavy ? 1.2 : look.tiny ? 0.5 : 0.8),
      abilities: bossSpec ? bossSpec.abilities.slice() : null,
      abilityT: bossSpec ? 4 : 0, abilityIdx: 0, beamT: 0
    };
    char.group.position.copy(unit.pos);
    world.scene.add(char.group);

    const barW = bossSpec ? 5 : look.heavy ? 2.0 : look.tiny ? 1.0 : 1.5;
    const bar = new SK.HealthBar(team === 0 ? 0x35e0ff : 0xff4d6d, barW);
    const sc = bossSpec ? bossSpec.scale : (look.scale || 1);
    bar.group.position.set(0, (look.heavy ? 2.9 : look.tiny ? 1.4 : 2.45) * sc, 0);
    char.group.add(bar.group);
    unit.bar = bar;
    bar.group.visible = !!bossSpec;

    this.game.fx.teleportIn(unit.pos, team === 0 ? 0x35e0ff : pal.trim);
    this.units.push(unit);
    return unit;
  };

  Battle.prototype.spawnBoss = function (citadel) {
    const w = citadel.warlord;
    const fake = {
      id: 'warlord-' + citadel.id, name: w.name, family: 'colossus',
      hp: w.hp, dmg: w.dmg, range: w.range, speed: w.speed, atkRate: w.atkRate,
      count: 1, splash: 6, look: Object.assign({ scale: w.scale }, w.look),
      traitTint: null, heal: 0
    };
    const k = this.enemyKeep.pos;
    const u = this.spawnUnit(fake, 1, k.x + 14, k.z + 6, 1, w);
    u.warlord = w;
    this.game.fx.explosion(u.pos, 8, this.planet.faction.trim);
    SK.Audio.explode();
    return u;
  };

  /* ------------------------------------------------------------- tick */
  Battle.prototype.update = function (dt) {
    if (!this.active) return;
    this.t += dt;
    const game = this.game;
    const world = game.world;

    if (this.result) { this.endT += dt; this.updateUnits(dt, true); return; }

    this.updateUnits(dt, false);
    this.updateKeep(this.enemyKeep, dt);
    this.updateKeep(this.homeKeep, dt);

    // Going down does not end the battle: you drop out and watch your army
    // finish it from the air.
    if (game.player.health <= 0 && !this.spectating) {
      this.spectating = true;
      game.fx.explosion(game.player.pos, 3.5, 0xff6a4a);
      game.player.group.visible = false;
      game.chase.shake = 1.0;
      game.onSpectate();
      SK.Audio.defeat();
    }

    if (this.isCitadel) {
      if (this.boss && this.boss.dead) this.finish(true);
      else if (this.homeKeep.hp <= 0) this.finish(false);
    } else {
      if (this.enemyKeep.hp <= 0) this.finish(true);
      else if (this.homeKeep.hp <= 0) this.finish(false);
    }
  };

  Battle.prototype.updateKeep = function (keep, dt) {
    if (keep.rig) keep.rig.update(dt);
    keep.cooldown -= dt;
    if (keep.hp <= 0 || keep.cooldown > 0) return;
    let best = null, bestD = KEEP_RANGE;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.dead || u.team === keep.team) continue;
      const d = Math.hypot(u.pos.x - keep.pos.x, u.pos.z - keep.pos.z);
      if (d < bestD) { bestD = d; best = u; }
    }
    const col = keep.team === 0 ? 0x35e0ff : this.planet.faction.trim;
    if (!best && keep.team === 1 && !this.game.player.vehicle && !this.spectating) {
      const pd = Math.hypot(this.game.player.pos.x - keep.pos.x, this.game.player.pos.z - keep.pos.z);
      if (pd < KEEP_RANGE) {
        keep.cooldown = 1.5;
        const from = this._v.copy(keep.pos).add(new THREE.Vector3(0, 13, 0));
        const to = this._v2.copy(this.game.player.pos).add(new THREE.Vector3(0, 1.4, 0));
        this.game.fx.tracer(from, to, col, 0.14);
        this.game.fx.impact(to, col);
        this.damagePlayer(9 * this.stats.dmgMul);
      }
      return;
    }
    if (!best) return;
    keep.cooldown = keep.team === 0 ? 0.6 : 1.3;
    const from = this._v.copy(keep.pos).add(new THREE.Vector3(0, 13, 0));
    const to = this._v2.copy(best.pos).add(new THREE.Vector3(0, 1.2, 0));
    this.game.fx.tracer(from, to, col, 0.15);
    this.game.fx.impact(to, col);
    // Veiled and Phantom units shrug off keep fire — that is their whole job.
    const raw = keep.team === 0
      ? 46 * (1 + this.tier * 0.75) * (1 + (this.game.state.buildings.shield || 0) * 0.08)
      : 46 * this.stats.dmgMul;
    const resist = keep.team === 0 ? (best.keepDR || 0) * 0.45 : (best.keepDR || 0);
    this.damageUnit(best, raw * (1 - resist), col);
  };

  /* -------------------------------------------------------- unit tick */
  Battle.prototype.updateUnits = function (dt, frozen) {
    const world = this.game.world;
    const cam = this.game.camera;
    const units = this.units;

    // auras: commanders and Radiant units buff everyone standing near them
    for (let i = 0; i < units.length; i++) { units[i].auraDmg = 0; units[i].auraDR = 0; }
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      if (a.dead) continue;
      const hasAura = a.aura || a.rally || a.guardAura;
      if (!hasAura) continue;
      const rad = a.aura ? a.aura.radius : 13;
      const dmgBonus = (a.aura ? a.aura.dmg : 0) + (a.rally ? 0.10 : 0);
      const drBonus = (a.aura ? a.aura.dr : 0) + (a.guardAura ? 0.15 : 0);
      for (let k = 0; k < units.length; k++) {
        const o = units[k];
        if (o.dead || o.team !== a.team) continue;
        if (Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) > rad) continue;
        o.auraDmg = Math.max(o.auraDmg, dmgBonus);
        o.auraDR = Math.max(o.auraDR, drBonus);
      }
    }

    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];

      if (u.dead) {
        u.deadT += dt;
        u.char.update(dt, {});
        if (u.deadT > 2.2) { world.scene.remove(u.char.group); units.splice(i, 1); }
        continue;
      }
      if (frozen) { u.char.update(dt, { speed: 0 }); continue; }

      // status effects
      if (u.slowT > 0) u.slowT -= dt;
      if (u.burnT > 0) {
        u.burnT -= dt;
        this.damageUnit(u, u.burnDps * dt, 0xff8a3a, true);
        if (u.dead) continue;
        if (Math.random() < dt * 6) {
          this.game.fx.dust(this._v.copy(u.pos).add(new THREE.Vector3(0, 1, 0)), 0xff8a3a, 0.5);
        }
      }
      if (u.regen && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02 * dt);

      if (u.boss) this.updateBoss(u, dt);

      /* target selection */
      if (!u.target || u.target.dead || (u.target.hp != null && u.target.hp <= 0)) u.target = null;
      if (u.heal > 0) {
        let best = null, bestFrac = 0.98;
        for (let k = 0; k < units.length; k++) {
          const o = units[k];
          if (o === u || o.dead || o.team !== u.team) continue;
          const f = o.hp / o.maxHp;
          if (f < bestFrac && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 48) { bestFrac = f; best = o; }
        }
        u.target = best;
      } else if (!u.target || this.t % 0.35 < dt) {
        let best = null, bestD = u.range + 22;
        for (let k = 0; k < units.length; k++) {
          const o = units[k];
          if (o.dead || o.team === u.team) continue;
          const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
          if (d < bestD) { bestD = d; best = o; }
        }
        if (u.team === 1 && !this.spectating) {
          const pd = Math.hypot(this.game.player.pos.x - u.pos.x, this.game.player.pos.z - u.pos.z);
          if (pd < bestD * 0.85) best = this.playerTarget();
        }
        u.target = best;
      }

      const objective = u.team === 0 ? this.enemyKeep : this.homeKeep;
      const aim = u.target || (u.guard ? u.post : objective);
      const dist = Math.hypot(aim.pos.x - u.pos.x, aim.pos.z - u.pos.z);
      const reach = u.target ? u.range
        : (u.guard ? 2.5 : u.range + (objective.radius || 6));

      /* steering */
      let move = dist > reach * 0.85 ? 1 : 0;
      if (u.heal > 0 && dist < reach * 0.6) move = 0;
      let mx = 0, mz = 0;
      if (move) { mx = (aim.pos.x - u.pos.x) / (dist || 1); mz = (aim.pos.z - u.pos.z) / (dist || 1); }
      let sx = 0, sz = 0;
      for (let k = 0; k < units.length; k++) {
        const o = units[k];
        if (o === u || o.dead) continue;
        const ddx = u.pos.x - o.pos.x, ddz = u.pos.z - o.pos.z;
        const dd = ddx * ddx + ddz * ddz;
        const minD = (u.radius + o.radius) * 1.15;
        if (dd < minD * minD && dd > 0.0001) {
          const d = Math.sqrt(dd);
          sx += (ddx / d) * (1 - d / minD);
          sz += (ddz / d) * (1 - d / minD);
        }
      }
      const slowMul = u.slowT > 0 ? (1 - u.slowAmt) : 1;
      const spd = u.speed * slowMul * (this.planet.gravity < 0.8 ? 1.12 : 1);
      u.pos.x += (mx * spd + sx * spd * 1.4) * dt;
      u.pos.z += (mz * spd + sz * spd * 1.4) * dt;
      if (!u.boss) this.clampToLane(u);
      const groundY = world.heightAt(u.pos.x, u.pos.z) + u.hover;
      u.pos.y = U.damp(u.pos.y, groundY, u.hover ? 5 : 14, dt);
      u.yaw = U.dampAngle(u.yaw, Math.atan2(aim.pos.x - u.pos.x, aim.pos.z - u.pos.z), move ? 8 : 10, dt);

      /* attacking */
      u.cooldown -= dt;
      u.attackAnim = Math.max(0, u.attackAnim - dt * 3.5);
      if (dist <= reach && u.cooldown <= 0 && !(u.guard && !u.target)) {
        u.cooldown = u.atkRate;
        u.attackAnim = 1;
        this.resolveAttack(u, u.target || objective);
      }

      u.char.group.position.copy(u.pos);
      u.char.group.rotation.y = u.yaw;
      u.char.update(dt, {
        speed: move ? spd : 0,
        aiming: dist <= reach * 1.6 && u.range > 4,
        attack: u.attackAnim, lookYaw: 0, lookPitch: 0
      });
      // hovering units bob instead of walking
      if (u.hover) u.char.group.position.y += Math.sin(this.t * 2.2 + u.pos.x) * 0.22;

      const frac = u.hp / u.maxHp;
      u.bar.group.visible = u.boss || frac < 0.999;
      if (u.bar.group.visible) { u.bar.set(frac); u.bar.face(cam); }
    }
  };

  /* -------------------------------------------------- Warlord abilities */
  Battle.prototype.updateBoss = function (u, dt) {
    u.abilityT -= dt;
    // Out of contact for a while, a Warlord starts repairing. You have to
    // commit to the fight rather than chip at it.
    let inContact = false;
    for (let i = 0; i < this.units.length; i++) {
      const o = this.units[i];
      if (o.dead || o.team === 1) continue;
      if (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 30) { inContact = true; break; }
    }
    if (!inContact && Math.hypot(this.game.player.pos.x - u.pos.x,
      this.game.player.pos.z - u.pos.z) < 30) inContact = true;
    if (!inContact && u.hp < u.maxHp) {
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02 * dt);
    }
    if (u.beamT > 0) {
      u.beamT -= dt;
      const dir = this._v.set(Math.sin(u.yaw), 0, Math.cos(u.yaw));
      const from = this._v2.copy(u.pos).add(new THREE.Vector3(0, 3.2, 0));
      const to = from.clone().addScaledVector(dir, 44);
      this.game.fx.beam(from, to, this.planet.faction.trim, 0.12);
      if (Math.random() < dt * 8) {
        // sweep damage along the beam line
        for (let i = 0; i < this.units.length; i++) {
          const o = this.units[i];
          if (o.dead || o.team === 1) continue;
          const rel = this._v3.copy(o.pos).sub(from);
          const along = rel.x * dir.x + rel.z * dir.z;
          if (along < 0 || along > 44) continue;
          const perp = Math.abs(rel.x * dir.z - rel.z * dir.x);
          if (perp < 3.2) this.damageUnit(o, u.dmg * 0.5, this.planet.faction.trim);
        }
        const pr = this._v3.copy(this.game.player.pos).sub(from);
        const pAlong = pr.x * dir.x + pr.z * dir.z;
        if (pAlong > 0 && pAlong < 44 && Math.abs(pr.x * dir.z - pr.z * dir.x) < 3.2) {
          this.damagePlayer(u.dmg * 0.22);
        }
      }
      return;
    }
    if (u.abilityT > 0) return;

    const ability = u.abilities[u.abilityIdx % u.abilities.length];
    u.abilityIdx++;
    u.abilityT = 4.8 + U.rand(-0.8, 1.2);

    if (ability === 'slam') {
      this.game.fx.explosion(u.pos, 14, this.planet.faction.trim);
      this.game.chase.shake = 1.0;
      SK.Audio.explode();
      for (let i = 0; i < this.units.length; i++) {
        const o = this.units[i];
        if (o.dead || o.team === 1) continue;
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < 14) this.damageUnit(o, u.dmg * 1.3 * (1 - d / 18), this.planet.faction.trim);
      }
      const pd = Math.hypot(this.game.player.pos.x - u.pos.x, this.game.player.pos.z - u.pos.z);
      if (pd < 14) this.damagePlayer(u.dmg * 0.3 * (1 - pd / 18));
      this.game.toast(u.warlord.name + ' slams the ground.', 'bad');
    } else if (ability === 'volley') {
      const targets = this.units.filter((o) => !o.dead && o.team === 0).slice(0, 5);
      const self = this;
      targets.forEach((o, i) => {
        setTimeout(() => {
          if (!self.active || o.dead) return;
          const from = u.pos.clone().add(new THREE.Vector3(0, 3, 0));
          const dir = o.pos.clone().add(new THREE.Vector3(0, 1, 0)).sub(from).normalize();
          self.game.fx.bolt(from, dir, self.planet.faction.trim, 40, from.distanceTo(o.pos) + 1,
            (hp) => { self.applyDamage(u, o, u.dmg * 0.8, hp, self.planet.faction.trim); });
        }, i * 130);
      });
      SK.Audio.heavyShot();
      this.game.toast(u.warlord.name + ' opens up with a volley.', 'bad');
    } else if (ability === 'beam') {
      u.beamT = 2.2;
      u.abilityT = 6.5;
      this.game.toast(u.warlord.name + ' is charging a beam. Get out of the line.', 'bad');
      SK.Audio.warp();
    } else if (ability === 'summon') {
      if ((u.summons || 0) >= 2) { u.abilityT = 2.5; return; }
      u.summons = (u.summons || 0) + 1;
      const level = Math.max(1, Math.round(this.tier * 0.8));
      for (let i = 0; i < 3; i++) {
        const def = this.pickEnemyDef(i);
        if (!def) continue;
        const a = U.rand(0, U.TAU);
        this.spawnUnit(def, 1, u.pos.x + Math.cos(a) * 7, u.pos.z + Math.sin(a) * 7, level);
      }
      this.game.toast(u.warlord.name + ' calls in reinforcements.', 'bad');
    }
  };

  /* ------------------------------------------------------ player proxy */
  Battle.prototype.counts = function () {
    let ally = 0, foe = 0;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.dead) continue;
      if (u.team === 0) ally++; else foe++;
    }
    return { ally: ally, foe: foe, allyStart: this.allyStart || 0, foeStart: this.foeStart || 0 };
  };

  Battle.prototype.playerTarget = function () {
    const g = this.game;
    if (!this._playerProxy) {
      this._playerProxy = {
        isPlayer: true, dead: false, team: 0, radius: 0.8,
        pos: g.player.pos, get hp() { return g.player.health; }, maxHp: 100
      };
    }
    this._playerProxy.dead = g.player.health <= 0 || this.spectating;
    return this._playerProxy.dead ? null : this._playerProxy;
  };

  /* ---------------------------------------------------------- attacks */
  Battle.prototype.resolveAttack = function (u, target) {
    const fx = this.game.fx;
    const col = u.team === 0 ? this.game.state.appearance.trim : this.planet.faction.trim;
    const from = this._v.copy(u.pos)
      .add(new THREE.Vector3(0, u.boss ? 3.4 : (u.def.look && u.def.look.heavy ? 2.6 : 1.5), 0))
      .add(this._v3.set(Math.sin(u.yaw) * 0.9, 0, Math.cos(u.yaw) * 0.9));
    const to = this._v2.copy(target.pos).add(new THREE.Vector3(0, 1.2, 0));

    if (u.heal > 0) {
      if (!target || target.isPlayer) return;
      target.hp = Math.min(target.maxHp, target.hp + u.heal);
      fx.beam(from, to, 0x5dffa0, 0.2);
      fx.popup(target.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), '+' + Math.round(u.heal), '#5dffa0');
      return;
    }

    // damage modifiers stack here so every trait and perk is visible in one place
    let dmg = u.dmg * (1 + u.auraDmg);
    if (u.overload && u.firstAttack) { dmg *= 3; fx.explosion(from, 3, col); }
    u.firstAttack = false;
    let isCrit = false;
    if (u.crit && Math.random() < 0.18) { dmg *= 2; isCrit = true; }
    if (u.pierce && target.def && target.def.look && target.def.look.heavy) dmg *= 1.35;

    const style = PROJ_BY_FAMILY[u.def.family] || { kind: 'tracer' };
    const self = this;
    fx.muzzle(from, col);
    if (style.kind === 'tracer') SK.Audio.laser();
    else if (style.kind === 'bolt') SK.Audio.heavyShot();

    const shots = u.multishot ? 2 : 1;
    for (let s = 0; s < shots; s++) {
      const shotDmg = s === 0 ? dmg : dmg * 0.6;
      const delay = s * 90;
      const fire = function () {
        if (!self.active || u.dead) return;
        const t2 = self._v2.copy(target.pos).add(new THREE.Vector3(0, 1.2, 0));
        if (style.kind === 'bolt') {
          const dir = t2.clone().sub(from).normalize();
          fx.bolt(from.clone(), dir, col, style.speed, from.distanceTo(t2) + 1, function (hp) {
            self.applyDamage(u, target, shotDmg, hp, col, isCrit);
          });
        } else if (style.kind === 'flame') {
          fx.explosion(t2.clone(), 4, 0xff8a3a);
          self.applyDamage(u, target, shotDmg, t2.clone(), col, isCrit);
        } else if (style.kind === 'melee') {
          fx.sparks(t2, col, 6, 5);
          SK.Audio.hit();
          self.applyDamage(u, target, shotDmg, t2.clone(), col, isCrit);
        } else {
          fx.tracer(from, t2, col, style.thick || 0.09);
          self.applyDamage(u, target, shotDmg, t2.clone(), col, isCrit);
        }
      };
      if (delay) setTimeout(fire, delay); else fire();
    }
  };

  Battle.prototype.applyDamage = function (attacker, target, dmg, hitPos, col, isCrit) {
    const fx = this.game.fx;
    fx.impact(hitPos, col);

    if (attacker.splash > 0) {
      fx.explosion(hitPos, attacker.splash * 0.9, col);
      SK.Audio.explode();
      for (let i = 0; i < this.units.length; i++) {
        const o = this.units[i];
        if (o.dead || o.team === attacker.team) continue;
        const d = Math.hypot(o.pos.x - hitPos.x, o.pos.z - hitPos.z);
        if (d <= attacker.splash) {
          this.hitUnit(attacker, o, dmg * (1 - d / attacker.splash * 0.55), col, isCrit);
        }
      }
      const keep = attacker.team === 0 ? this.enemyKeep : this.homeKeep;
      if (Math.hypot(keep.pos.x - hitPos.x, keep.pos.z - hitPos.z) < attacker.splash + keep.radius) {
        this.damageKeep(keep, dmg * STRUCT_MUL * this.structBonus(attacker));
      }
      if (attacker.team === 1 && !this.spectating) {
        const pd = Math.hypot(this.game.player.pos.x - hitPos.x, this.game.player.pos.z - hitPos.z);
        if (pd <= attacker.splash) this.damagePlayer(dmg * 0.45);
      }
      return;
    }
    if (!target) return;
    if (target.isPlayer) { this.damagePlayer(dmg * 0.5); return; }
    if (target.maxHp != null && target.rig) {
      this.damageKeep(target, dmg * STRUCT_MUL * this.structBonus(attacker));
      return;
    }
    this.hitUnit(attacker, target, dmg, col, isCrit);
  };

  Battle.prototype.structBonus = function (u) {
    const base = u.team === 0 ? 1 : (STRUCT_MUL_VS_PLAYER / STRUCT_MUL);
    return base * (u.structMul || 1) * (u.siegebreaker ? 1.45 : 1);
  };

  /* One unit hitting another: where lifesteal, burn, slow, reflect and
     arcing all actually happen. */
  Battle.prototype.hitUnit = function (attacker, target, dmg, col, isCrit) {
    if (!target || target.dead) return;
    if (target.isPlayer) { this.damagePlayer(dmg * 0.5); return; }
    this.damageUnit(target, dmg, col, false, isCrit);

    if (attacker.lifesteal && !attacker.dead) {
      const heal = dmg * attacker.lifesteal;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      this.game.fx.popup(attacker.pos.clone().add(new THREE.Vector3(0, 2.6, 0)),
        '+' + Math.round(heal), '#ff9de0');
    }
    if (attacker.burn && !target.dead) {
      target.burnT = 3.0;
      target.burnDps = Math.max(target.burnDps, dmg * attacker.burn * 0.4);
    }
    if (attacker.slowSpec && !target.dead) {
      target.slowT = attacker.slowSpec.time;
      target.slowAmt = attacker.slowSpec.amount;
    }
    if (target.reflect && !attacker.dead && attacker.range <= 4) {
      this.damageUnit(attacker, dmg * target.reflect, 0x9aff5a);
    }
    if (attacker.chain && !attacker.dead) {
      let best = null, bestD = 9;
      for (let i = 0; i < this.units.length; i++) {
        const o = this.units[i];
        if (o.dead || o === target || o.team === attacker.team) continue;
        const d = Math.hypot(o.pos.x - target.pos.x, o.pos.z - target.pos.z);
        if (d < bestD) { bestD = d; best = o; }
      }
      if (best) {
        this.game.fx.beam(target.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
          best.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0x9fe8ff, 0.14);
        this.damageUnit(best, dmg * 0.45, 0x9fe8ff);
      }
    }
  };

  Battle.prototype.damageUnit = function (u, dmg, col, silent, isCrit) {
    if (!u || u.dead) return;
    if (u.isPlayer) { this.damagePlayer(dmg * 0.5); return; }
    const reduced = dmg * (1 - Math.min(0.7, (u.dr || 0) + (u.auraDR || 0)));
    u.hp -= reduced;
    u.bar.group.visible = true;
    if (!silent) {
      this.game.fx.popup(u.pos.clone().add(new THREE.Vector3(0, 2.2, 0)),
        (isCrit ? '' : '') + Math.round(reduced), u.team === 0 ? '#ff9db0' : (isCrit ? '#fff0a0' : '#ffe08a'),
        isCrit || u.boss);
    }
    if (u.hp <= 0) this.killUnit(u, col);
  };

  Battle.prototype.killUnit = function (u, col) {
    u.dead = true;
    u.char.dead = true;
    u.bar.group.visible = false;
    const big = u.boss ? 16 : (u.def.look && u.def.look.heavy) ? 5 : 2.2;
    this.game.fx.explosion(u.pos, big, col || 0xffa23a);
    SK.Audio.explode();
    if (u.boss) {
      this.game.chase.shake = 1.8;
      for (let i = 0; i < 6; i++) {
        const p = u.pos.clone().add(new THREE.Vector3(U.rand(-7, 7), U.rand(1, 9), U.rand(-7, 7)));
        setTimeout(() => { if (this.game.fx) this.game.fx.explosion(p, 8, col || 0xffa23a); }, i * 160);
      }
    }
    if (u.deathBlast) {
      const r = u.deathBlast.radius;
      this.game.fx.explosion(u.pos, r, 0xff9a1a);
      for (let i = 0; i < this.units.length; i++) {
        const o = this.units[i];
        if (o.dead || o.team === u.team) continue;
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d <= r) this.damageUnit(o, u.maxHp * 0.12 * u.deathBlast.dmg * (1 - d / (r * 1.6)), 0xff9a1a);
      }
    }
    if (u.team === 1) this.game.state.stats.kills++;
  };

  Battle.prototype.damageKeep = function (keep, dmg) {
    if (keep.hp <= 0) return;
    keep.hp -= dmg;
    this.game.fx.popup(keep.pos.clone().add(new THREE.Vector3(0, 12, 0)), String(Math.round(dmg)),
      keep.team === 0 ? '#ff9db0' : '#ffe08a', true);
    this.game.fx.sparks(keep.pos.clone().add(new THREE.Vector3(U.rand(-4, 4), U.rand(3, 10), U.rand(-4, 4))),
      0xffa23a, 5, 6);
    if (keep.hp <= 0) {
      keep.hp = 0;
      for (let i = 0; i < 8; i++) {
        const p = keep.pos.clone().add(new THREE.Vector3(U.rand(-6, 6), U.rand(1, 14), U.rand(-6, 6)));
        setTimeout(() => { if (this.game.fx) this.game.fx.explosion(p, 6, 0xff8a3a); }, i * 130);
      }
      SK.Audio.explode();
      this.game.chase.shake = 1.4;
      if (this.isCitadel && keep.team === 1) {
        this.game.toast('Their keep guns are down. Only the Warlord is left.', 'good');
      }
    }
  };

  Battle.prototype.damagePlayer = function (dmg) {
    const g = this.game;
    if (g.player.health <= 0) return;
    g.player.health -= dmg;
    g.chase.shake = Math.max(g.chase.shake, 0.55);
    g.flashDamage();
    if (g.player.health < 0) g.player.health = 0;
  };

  /* ---------------------------------------- player weapon in battle */
  Battle.prototype.playerShoot = function (origin, dir) {
    const fx = this.game.fx;
    const col = this.game.state.appearance.trim;
    const dmg = 34 * (1 + (this.game.state.buildings.lab || 0) * 0.05);
    let hit = null, hitT = 200;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.dead || u.team === 0) continue;
      tmp.copy(u.pos).add(new THREE.Vector3(0, u.boss ? 2.4 : 1.1, 0)).sub(origin);
      const along = tmp.dot(dir);
      if (along < 0 || along > 200) continue;
      const perp = Math.sqrt(Math.max(0, tmp.lengthSq() - along * along));
      if (perp < u.radius + 0.55 && along < hitT) { hitT = along; hit = u; }
    }
    tmp.copy(this.enemyKeep.pos).add(new THREE.Vector3(0, 4, 0)).sub(origin);
    const kAlong = tmp.dot(dir);
    if (kAlong > 0 && kAlong < hitT) {
      const kPerp = Math.sqrt(Math.max(0, tmp.lengthSq() - kAlong * kAlong));
      if (kPerp < 6.5) { hitT = kAlong; hit = this.enemyKeep; }
    }
    const end = origin.clone().addScaledVector(dir, hit ? hitT : 120);
    fx.tracer(origin, end, col, 0.1);
    fx.muzzle(origin, col);
    SK.Audio.laser();
    if (hit) {
      fx.impact(end, col);
      if (hit === this.enemyKeep) this.damageKeep(this.enemyKeep, dmg * 0.75);
      else this.damageUnit(hit, dmg, col);
    }
  };

  /* ----------------------------------------------------------- finish */
  Battle.prototype.finish = function (won) {
    if (this.result) return;
    this.result = won ? 'win' : 'lose';
    this.endT = 0;
    const g = this.game;
    if (won) {
      SK.Audio.victory();
      const reward = this.stats.reward;
      g.state.coins += reward.coins;
      g.state.stats.battlesWon++;
      if (this.isCitadel) g.onCitadelTaken(this.planet, this.citadel, reward);
      else { g.state.owned[this.territory.id] = true; g.onTerritoryCaptured(this.territory, reward); }
    } else {
      SK.Audio.defeat();
      g.state.stats.battlesLost++;
    }
    g.showBattleResult(won, this.stats.reward);
  };

  Battle.prototype.cleanup = function () {
    const world = this.game.world;
    this.units.forEach((u) => world.scene.remove(u.char.group));
    this.units.length = 0;
    this.boss = null;
    if (this.homeKeepRig) world.scene.remove(this.homeKeepRig.group);
    if (this.lane) { world.scene.remove(this.lane.group); this.lane = null; }
    this.spectating = false;
    this.active = false;
    this.result = null;
    this.game.fx.clear();
  };

  SK.Battle = Battle;
  SK.tintPalette = tintPalette;
})(window.SK);
