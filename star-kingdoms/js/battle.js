/* Star Kingdoms — territory battles.
   Fought on the real planet surface around the contested keep. You call
   units down at your own position, they march and fight on their own,
   and you shoot alongside them. Take the enemy keep to take the land. */
(function (SK) {
  'use strict';
  const U = SK.util;
  const B = SK.build;
  const D = SK.data;

  /* How each unit in the roster is physically built. */
  /* Each unit reads as a different soldier at a glance: silhouette from
     scale and gear, colour from a tint blended over the faction palette
     so the army still looks like one army. */
  const LOOK = {
    trooper: { weapon: 'rifle', scale: 1.0 },
    lancer: { weapon: 'blade', crest: 'fin', scale: 0.95,
      tint: { mix: 0.5, suit: 0x2f7fa8, accent: 0x6effe0, helmet: 0xdff6ff } },
    bulwark: { weapon: 'rifle', shield: true, heavy: true, scale: 1.1,
      tint: { mix: 0.55, suit: 0x3f4a5c, helmet: 0x8d9bab } },
    sniper: { weapon: 'longrifle', crest: 'halo', cape: true, scale: 1.0,
      tint: { mix: 0.55, suit: 0x2a2f46, helmet: 0x5f6880, accent: 0xb98cff } },
    swarm: { weapon: null, tiny: true, crest: 'horns', scale: 0.62,
      tint: { mix: 0.6, suit: 0x4a7a2e, accent: 0xc6ff6a, helmet: 0xd8f0a8 } },
    rocketeer: { weapon: 'launcher', scale: 1.05,
      tint: { mix: 0.55, suit: 0x8a4526, accent: 0xffb54a, helmet: 0xffd9a0 } },
    medic: { weapon: 'beamer', crest: 'halo', cape: true, scale: 1.0,
      tint: { mix: 0.62, suit: 0xdfe9ef, trim: 0x5dffa0, accent: 0x9affc8, helmet: 0xffffff } },
    warbot: { weapon: 'cannon', heavy: true, crest: 'horns', scale: 1.65,
      tint: { mix: 0.6, suit: 0x2b3038, accent: 0xffc247, helmet: 0x6a5230 } }
  };

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

  const PROJ = {
    trooper: { kind: 'tracer', speed: 0 },
    sniper: { kind: 'tracer', speed: 0, thick: 0.16 },
    rocketeer: { kind: 'bolt', speed: 34 },
    warbot: { kind: 'bolt', speed: 46 },
    medic: { kind: 'beam', speed: 0 },
    bulwark: { kind: 'tracer', speed: 0 }
  };

  const KEEP_RANGE = 26;
  // Keeps are fortifications, not soft targets: field units chew through
  // them slowly so a siege lasts long enough for the defenders to answer.
  const STRUCT_MUL = 0.42;
  const MAX_ALLIES = 14;
  const FIELD_LEN = 78;           // distance between the two keeps

  /* ================================================================== */
  function Battle(game) {
    this.game = game;
    this.units = [];
    this.active = false;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
  }

  Battle.prototype.start = function (territory) {
    const game = this.game;
    const world = game.world;
    const planet = world.planet;
    const st = D.tierStats(territory.tier);
    this.territory = territory;
    this.stats = st;
    this.planet = planet;
    this.active = true;
    this.t = 0;
    this.units = [];
    this.energy = 5;
    this.maxEnergy = 10;
    this.aiTimer = 2.5;
    this.playerDown = 0;
    this.result = null;
    this.endT = 0;

    const S = game.state;
    const lab = 1 + (S.buildings.lab || 0) * 0.05;
    const reactor = 1 + (S.buildings.reactor || 0) * 0.08;
    const shield = 1 + (S.buildings.shield || 0) * 0.10;
    this.allyBuff = lab;
    this.energyRate = 0.9 * reactor;

    // Enemy keep is the structure already standing on the territory.
    const ek = world.keeps[territory.id];
    this.enemyKeep = {
      team: 1, pos: new THREE.Vector3(territory.x, world.heightAt(territory.x, territory.z), territory.z),
      hp: st.keepHp, maxHp: st.keepHp, rig: ek, cooldown: 0, radius: 7
    };

    // Your staging keep drops on the side you approached from. The terrain
    // mesh is already built by now, so heightAt() must not be altered here —
    // flattening a pad after the fact would sink everything under the
    // visible ground. Instead, pick the flattest real spot in that arc.
    const px = game.player.pos.x, pz = game.player.pos.z;
    let dx = px - territory.x, dz = pz - territory.z;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    const baseAngle = Math.atan2(dz, dx);
    let hx = territory.x + dx * FIELD_LEN, hz = territory.z + dz * FIELD_LEN, bestFlat = Infinity;
    for (let i = 0; i < 40; i++) {
      const a = baseAngle + ((i % 9) - 4) * 0.13;
      const d = FIELD_LEN + (Math.floor(i / 9) - 2) * 6;
      const cx = territory.x + Math.cos(a) * d, cz = territory.z + Math.sin(a) * d;
      if (Math.hypot(cx, cz) > SK.World.WORLD_R * 0.9) continue;
      const y0 = world.heightAt(cx, cz);
      if (y0 < world.waterLevel + 1.5) continue;
      const slope = Math.abs(world.heightAt(cx + 8, cz) - y0) + Math.abs(world.heightAt(cx - 8, cz) - y0) +
        Math.abs(world.heightAt(cx, cz + 8) - y0) + Math.abs(world.heightAt(cx, cz - 8) - y0);
      if (slope < bestFlat) { bestFlat = slope; hx = cx; hz = cz; }
    }
    const ndx = hx - territory.x, ndz = hz - territory.z;
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

    // The only line worth drawing is the rule the player can break: drops
    // inside this radius get rerouted back to your own keep.
    this.noDropR = FIELD_LEN * 0.46;
    const ring = B.decor(B.ring(1, 1.028), B.glowMat(0xff4d6d, 0.34), 0, 0, 0);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(this.noDropR);
    ring.position.set(territory.x, world.heightAt(territory.x, territory.z) + 1.0, territory.z);
    world.scene.add(ring);
    this.ring = ring;
    // Marker pylons make the boundary legible where the ground rolls.
    const pylons = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * U.TAU;
      const cx = territory.x + Math.cos(a) * this.noDropR;
      const cz = territory.z + Math.sin(a) * this.noDropR;
      const py = B.decor(B.box(0.35, 2.6, 0.35), B.glowMat(0xff4d6d, 0.5),
        cx, world.heightAt(cx, cz) + 1.3, cz);
      pylons.add(py);
    }
    world.scene.add(pylons);
    this.deployRing = pylons;

    // A garrison is already dug in, so you arrive at a defended keep
    // instead of an empty one.
    const pool = D.ENEMY_UNITS[planet.faction.id] || ['trooper'];
    const garrisonLevel = Math.max(1, Math.round(territory.tier * 0.8));
    for (let i = 0; i < st.garrison; i++) {
      const def = D.UNITS.find((u) => u.id === pool[i % pool.length]);
      if (!def) continue;
      const a = (i / st.garrison) * U.TAU + 0.3;
      const r = 13 + (i % 2) * 5;
      this.spawnUnit(def, 1, territory.x + Math.cos(a) * r, territory.z + Math.sin(a) * r, garrisonLevel);
    }

    game.player.spawn(world, hx + this.homeDir.x * 9, hz + this.homeDir.z * 9);
    game.player.health = 100;

    SK.Audio.tone({ type: 'sawtooth', f0: 90, f1: 260, dur: 1.1, gain: 0.2, filter: [300, 1800] });
  };

  /* ------------------------------------------------------ deployment */
  Battle.prototype.canDeploy = function (defId) {
    const def = D.UNITS.find((u) => u.id === defId);
    if (!def) return false;
    return this.energy >= def.energy;
  };

  Battle.prototype.deploy = function (defId) {
    const def = D.UNITS.find((u) => u.id === defId);
    if (!def) return 'Unknown unit.';
    if (this.energy < def.energy) return 'Not enough energy.';
    const standing = this.units.filter((u) => u.team === 0 && !u.dead).length;
    if (standing + def.count > MAX_ALLIES) return 'Your field command is at capacity.';
    const p = this.game.player.pos;
    let sx = p.x, sz = p.z;
    const distToEnemy = Math.hypot(sx - this.enemyKeep.pos.x, sz - this.enemyKeep.pos.z);
    let warned = null;
    if (distToEnemy < this.noDropR) {
      // too deep in enemy ground — the drop reroutes to your own keep
      sx = this.homeKeep.pos.x; sz = this.homeKeep.pos.z;
      warned = 'Too close to their keep. Drop rerouted home.';
    }
    this.energy -= def.energy;
    const lv = this.game.state.army[def.id] || 1;
    for (let i = 0; i < def.count; i++) {
      const a = (i / def.count) * U.TAU;
      const r = def.count > 1 ? 1.6 : 0;
      this.spawnUnit(def, 0, sx + Math.cos(a) * r, sz + Math.sin(a) * r, lv);
    }
    SK.Audio.deploy();
    return warned;
  };

  Battle.prototype.spawnUnit = function (def, team, x, z, level) {
    const world = this.game.world;
    const look = LOOK[def.id];
    const pal = team === 0
      ? { skin: this.game.state.appearance.skin, suit: this.game.state.appearance.suit,
          trim: this.game.state.appearance.trim, visor: 0xbfefff, accent: this.game.state.appearance.accent }
      : this.planet.faction;

    const char = B.buildCharacter({
      pal: tintPalette(pal, look.tint), weapon: look.weapon, shield: look.shield,
      heavy: look.heavy, tiny: look.tiny, crest: look.crest, cape: look.cape,
      scale: look.scale
    });

    const lvMul = 1 + (level - 1) * 0.18;
    const buff = team === 0 ? this.allyBuff : 1;
    const enemyMul = team === 1 ? this.stats.hpMul : 1;
    const enemyDmg = team === 1 ? this.stats.dmgMul : 1;

    const hp = Math.round(def.hp * lvMul * buff * enemyMul);
    const unit = {
      def: def, team: team, level: level, char: char,
      pos: new THREE.Vector3(x, world.heightAt(x, z), z),
      vel: new THREE.Vector3(),
      yaw: team === 0 ? Math.atan2(this.enemyKeep.pos.x - x, this.enemyKeep.pos.z - z)
        : Math.atan2(this.homeKeep.pos.x - x, this.homeKeep.pos.z - z),
      hp: hp, maxHp: hp,
      dmg: def.dmg * lvMul * buff * enemyDmg,
      heal: (def.heal || 0) * lvMul * buff,
      range: def.range, speed: def.speed, atkRate: def.atkRate,
      splash: def.splash || 0,
      cooldown: U.rand(0, 0.4), target: null, dead: false, deadT: 0,
      attackAnim: 0, radius: look.heavy ? 1.2 : look.tiny ? 0.5 : 0.8
    };
    char.group.position.copy(unit.pos);
    world.scene.add(char.group);

    const bar = new SK.HealthBar(team === 0 ? 0x35e0ff : 0xff4d6d, look.heavy ? 2.0 : look.tiny ? 1.0 : 1.5);
    bar.group.position.set(0, (look.heavy ? 2.9 : look.tiny ? 1.4 : 2.45) * look.scale, 0);
    char.group.add(bar.group);
    unit.bar = bar;
    bar.group.visible = false;

    this.game.fx.teleportIn(unit.pos, team === 0 ? 0x35e0ff : pal.trim);
    this.units.push(unit);
    return unit;
  };

  /* ---------------------------------------------------------- enemy AI */
  Battle.prototype.aiDeploy = function () {
    const pool = D.ENEMY_UNITS[this.planet.faction.id] || ['trooper'];
    const id = U.pick(pool);
    const def = D.UNITS.find((u) => u.id === id);
    if (!def) return;
    const alive = this.units.filter((u) => u.team === 1 && !u.dead).length;
    if (alive >= this.stats.foeCap) return;
    const k = this.enemyKeep.pos;
    const level = Math.max(1, Math.round(this.territory.tier * 0.8));
    // higher-tier worlds send two squads at a time
    const squads = this.territory.tier >= 6 ? 2 : 1;
    for (let sq = 0; sq < squads; sq++) {
      const pickId = sq === 0 ? id : U.pick(pool);
      const sdef = D.UNITS.find((u) => u.id === pickId) || def;
      const a = U.rand(0, U.TAU);
      for (let i = 0; i < sdef.count; i++) {
        this.spawnUnit(sdef, 1, k.x + Math.cos(a) * (9 + i * 1.4), k.z + Math.sin(a) * (9 + i * 1.4), level);
      }
    }
  };

  /* ------------------------------------------------------------- tick */
  Battle.prototype.update = function (dt) {
    if (!this.active) return;
    this.t += dt;
    const game = this.game;
    const world = game.world;

    if (this.result) {
      this.endT += dt;
      this.updateUnits(dt, true);
      return;
    }

    this.energy = Math.min(this.maxEnergy, this.energy + this.energyRate * dt);

    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = this.stats.aiInterval * U.rand(0.8, 1.25);
      this.aiDeploy();
    }

    this.updateUnits(dt, false);
    this.updateKeep(this.enemyKeep, this.homeKeep, dt);
    this.updateKeep(this.homeKeep, this.enemyKeep, dt);

    // player downed → field respawn at your keep
    if (game.player.health <= 0 && this.playerDown <= 0) {
      this.playerDown = 5;
      game.fx.explosion(game.player.pos, 3, 0xff6a4a);
      game.toast('You were taken down. Respawning at your keep.');
      SK.Audio.defeat();
    }
    if (this.playerDown > 0) {
      this.playerDown -= dt;
      game.player.group.visible = false;
      if (this.playerDown <= 0) {
        game.player.health = 100;
        game.player.spawn(world, this.homeKeep.pos.x + this.homeDir.x * 8,
          this.homeKeep.pos.z + this.homeDir.z * 8);
        game.player.group.visible = true;
        game.fx.teleportIn(game.player.pos, 0x35e0ff);
      }
    }

    if (this.enemyKeep.hp <= 0) this.finish(true);
    else if (this.homeKeep.hp <= 0) this.finish(false);
  };

  Battle.prototype.updateKeep = function (keep, foeKeep, dt) {
    keep.rig.update(dt);
    keep.cooldown -= dt;
    if (keep.hp <= 0) return;
    if (keep.cooldown > 0) return;
    // keep guns punish anything that walks up to the wall
    let best = null, bestD = KEEP_RANGE;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.dead || u.team === keep.team) continue;
      const d = Math.hypot(u.pos.x - keep.pos.x, u.pos.z - keep.pos.z);
      if (d < bestD) { bestD = d; best = u; }
    }
    if (!best && keep.team === 1 && !this.game.player.vehicle) {
      const pd = Math.hypot(this.game.player.pos.x - keep.pos.x, this.game.player.pos.z - keep.pos.z);
      if (pd < KEEP_RANGE && this.playerDown <= 0) {
        keep.cooldown = 1.5;
        const from = this._v.copy(keep.pos).add(new THREE.Vector3(0, 13, 0));
        const to = this._v2.copy(this.game.player.pos).add(new THREE.Vector3(0, 1.4, 0));
        this.game.fx.tracer(from, to, this.planet.faction.trim, 0.14);
        this.game.fx.impact(to, this.planet.faction.trim);
        this.damagePlayer(9 * this.stats.dmgMul);
        return;
      }
    }
    if (!best) return;
    keep.cooldown = 1.3;
    const from = this._v.copy(keep.pos).add(new THREE.Vector3(0, 13, 0));
    const to = this._v2.copy(best.pos).add(new THREE.Vector3(0, 1.2, 0));
    const col = keep.team === 0 ? 0x35e0ff : this.planet.faction.trim;
    this.game.fx.tracer(from, to, col, 0.15);
    this.game.fx.impact(to, col);
    this.damageUnit(best, 46 * (keep.team === 1 ? this.stats.dmgMul : 1), col);
  };

  Battle.prototype.updateUnits = function (dt, frozen) {
    const world = this.game.world;
    const cam = this.game.camera;
    const units = this.units;

    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];

      if (u.dead) {
        u.deadT += dt;
        u.char.update(dt, {});
        if (u.deadT > 2.2) {
          world.scene.remove(u.char.group);
          units.splice(i, 1);
        }
        continue;
      }
      if (frozen) { u.char.update(dt, { speed: 0 }); continue; }

      // ---- target selection
      if (!u.target || u.target.dead || (u.target.hp != null && u.target.hp <= 0)) u.target = null;
      if (u.heal > 0) {
        // medics chase the most wounded friend
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
        // the player is a valid target for the enemy too
        if (u.team === 1 && this.playerDown <= 0) {
          const pd = Math.hypot(this.game.player.pos.x - u.pos.x, this.game.player.pos.z - u.pos.z);
          if (pd < bestD * 0.85) { best = this.playerTarget(); }
        }
        u.target = best;
      }

      const objective = u.team === 0 ? this.enemyKeep : this.homeKeep;
      const aim = u.target || objective;
      const ax = aim.pos.x, az = aim.pos.z;
      const distRaw = Math.hypot(ax - u.pos.x, az - u.pos.z);
      const reach = u.target ? u.range : u.range + (objective.radius || 6);
      const dist = distRaw;

      // ---- steering
      let move = 0;
      if (dist > reach * 0.85) move = 1;
      if (u.heal > 0 && dist < reach * 0.6) move = 0;

      let mx = 0, mz = 0;
      if (move) {
        mx = (ax - u.pos.x) / (dist || 1);
        mz = (az - u.pos.z) / (dist || 1);
      }
      // separation, so a squad spreads out instead of stacking
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
      const spd = u.speed * (this.planet.gravity < 0.8 ? 1.12 : 1);
      u.pos.x += (mx * spd + sx * spd * 1.4) * dt;
      u.pos.z += (mz * spd + sz * spd * 1.4) * dt;
      u.pos.y = U.damp(u.pos.y, world.heightAt(u.pos.x, u.pos.z), 14, dt);

      if (move || Math.abs(sx) + Math.abs(sz) > 0.01) {
        u.yaw = U.dampAngle(u.yaw, Math.atan2(ax - u.pos.x, az - u.pos.z), 8, dt);
      } else {
        u.yaw = U.dampAngle(u.yaw, Math.atan2(ax - u.pos.x, az - u.pos.z), 10, dt);
      }

      // ---- attacking
      u.cooldown -= dt;
      u.attackAnim = Math.max(0, u.attackAnim - dt * 3.5);
      if (dist <= reach && u.cooldown <= 0) {
        u.cooldown = u.atkRate;
        u.attackAnim = 1;
        this.resolveAttack(u, u.target || objective);
      }

      u.char.group.position.copy(u.pos);
      u.char.group.rotation.y = u.yaw;
      u.char.update(dt, {
        speed: move ? spd : 0,
        aiming: dist <= reach * 1.6 && u.range > 4,
        attack: u.attackAnim,
        lookYaw: 0, lookPitch: 0
      });

      const frac = u.hp / u.maxHp;
      u.bar.group.visible = frac < 0.999;
      if (u.bar.group.visible) { u.bar.set(frac); u.bar.face(cam); }
    }
  };

  Battle.prototype.playerTarget = function () {
    const g = this.game;
    const self = this;
    if (!this._playerProxy) {
      this._playerProxy = {
        isPlayer: true, dead: false, team: 0, radius: 0.8,
        pos: g.player.pos, get hp() { return g.player.health; }, maxHp: 100
      };
    }
    this._playerProxy.dead = g.player.health <= 0 || this.playerDown > 0;
    return this._playerProxy.dead ? null : this._playerProxy;
  };

  Battle.prototype.resolveAttack = function (u, target) {
    const fx = this.game.fx;
    const pal = u.team === 0 ? { trim: this.game.state.appearance.trim } : this.planet.faction;
    const col = u.team === 0 ? this.game.state.appearance.trim : pal.trim;
    const from = this._v.copy(u.pos).add(new THREE.Vector3(0, u.def.id === 'warbot' ? 2.6 : 1.5, 0))
      .add(this._v3.set(Math.sin(u.yaw) * 0.9, 0, Math.cos(u.yaw) * 0.9));
    const to = this._v2.copy(target.pos).add(new THREE.Vector3(0, 1.2, 0));

    // ---- healing
    if (u.heal > 0) {
      if (!target || target.isPlayer) return;
      target.hp = Math.min(target.maxHp, target.hp + u.heal);
      fx.beam(from, to, 0x5dffa0, 0.2);
      fx.popup(target.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), '+' + Math.round(u.heal), '#5dffa0');
      return;
    }

    const style = PROJ[u.def.id] || { kind: 'tracer' };
    const dmg = u.dmg;
    const self = this;

    fx.muzzle(from, col);
    if (u.def.id === 'trooper' || u.def.id === 'sniper' || u.def.id === 'bulwark') SK.Audio.laser();
    else if (u.def.id === 'warbot' || u.def.id === 'rocketeer') SK.Audio.heavyShot();

    if (style.kind === 'bolt') {
      const dir = to.clone().sub(from).normalize();
      const range = from.distanceTo(to) + 1;
      fx.bolt(from.clone(), dir, col, style.speed, range, function (hitPos) {
        self.applyDamage(u, target, dmg, hitPos, col);
      });
    } else if (style.kind === 'tracer') {
      fx.tracer(from, to, col, style.thick || 0.09);
      this.applyDamage(u, target, dmg, to.clone(), col);
    } else {
      // melee
      fx.sparks(to, col, 6, 5);
      SK.Audio.hit();
      this.applyDamage(u, target, dmg, to.clone(), col);
    }
  };

  Battle.prototype.applyDamage = function (attacker, target, dmg, hitPos, col) {
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
          this.damageUnit(o, dmg * (1 - d / attacker.splash * 0.55), col);
        }
      }
      // splash also reaches the keep and the player
      const keep = attacker.team === 0 ? this.enemyKeep : this.homeKeep;
      if (Math.hypot(keep.pos.x - hitPos.x, keep.pos.z - hitPos.z) < attacker.splash + keep.radius) {
        this.damageKeep(keep, dmg * STRUCT_MUL);
      }
      if (attacker.team === 1 && this.playerDown <= 0) {
        const pd = Math.hypot(this.game.player.pos.x - hitPos.x, this.game.player.pos.z - hitPos.z);
        if (pd <= attacker.splash) this.damagePlayer(dmg * 0.45);
      }
      return;
    }
    if (!target) return;
    if (target.isPlayer) { this.damagePlayer(dmg * 0.5); return; }
    if (target.maxHp != null && target.rig) { this.damageKeep(target, dmg * STRUCT_MUL); return; }
    this.damageUnit(target, dmg, col);
  };

  Battle.prototype.damageUnit = function (u, dmg, col) {
    if (!u || u.dead) return;
    if (u.isPlayer) { this.damagePlayer(dmg * 0.5); return; }
    u.hp -= dmg;
    u.bar.group.visible = true;
    this.game.fx.popup(u.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), String(Math.round(dmg)),
      u.team === 0 ? '#ff9db0' : '#ffe08a');
    if (u.hp <= 0) {
      u.dead = true;
      u.char.dead = true;
      u.bar.group.visible = false;
      this.game.fx.explosion(u.pos, u.def.id === 'warbot' ? 5 : 2.2, col || 0xffa23a);
      SK.Audio.explode();
      if (u.team === 1) {
        this.game.state.stats.kills++;
        this.energy = Math.min(this.maxEnergy, this.energy + 0.35);
      }
    }
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

  /* ---------------------------------------- player weapon during battle */
  Battle.prototype.playerShoot = function (origin, dir) {
    const fx = this.game.fx;
    const col = this.game.state.appearance.trim;
    const dmg = 34 * (1 + (this.game.state.buildings.lab || 0) * 0.05);
    let hit = null, hitT = 200;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.dead || u.team === 0) continue;
      tmp.copy(u.pos).add(new THREE.Vector3(0, 1.1, 0)).sub(origin);
      const along = tmp.dot(dir);
      if (along < 0 || along > 200) continue;
      const perp = Math.sqrt(Math.max(0, tmp.lengthSq() - along * along));
      if (perp < u.radius + 0.55 && along < hitT) { hitT = along; hit = u; }
    }
    // enemy keep is a big target
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
    const tr = this.territory;
    if (won) {
      SK.Audio.victory();
      const r = this.stats.reward;
      g.state.crystal += r.crystal;
      g.state.alloy += r.alloy;
      g.state.owned[tr.id] = true;
      g.state.stats.battlesWon++;
      g.onTerritoryCaptured(tr, r);
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
    if (this.homeKeepRig) world.scene.remove(this.homeKeepRig.group);
    if (this.ring) world.scene.remove(this.ring);
    if (this.deployRing) world.scene.remove(this.deployRing);
    this.active = false;
    this.result = null;
    this.game.fx.clear();
  };

  SK.Battle = Battle;
  SK.UNIT_LOOK = LOOK;
  SK.tintPalette = tintPalette;
})(window.SK);
