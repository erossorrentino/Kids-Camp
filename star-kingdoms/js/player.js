/* Star Kingdoms — the player: on-foot controller, third-person camera,
   and the hoverbike / hovercar rigs you can mount on any planet. */
(function (SK) {
  'use strict';
  const U = SK.util;
  const B = SK.build;

  const UP = new THREE.Vector3(0, 1, 0);

  /* ================================================================== */
  function Player(game, appearance) {
    this.game = game;
    this.appearance = appearance;
    const pal = {
      skin: appearance.skin, suit: appearance.suit, trim: appearance.trim,
      visor: 0xbfefff, accent: appearance.accent
    };
    this.pal = pal;
    this.char = B.buildCharacter({
      pal: pal, weapon: 'rifle', crest: appearance.crest, cape: true, scale: 1.0
    });
    this.group = new THREE.Group();
    this.group.add(this.char.group);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.mode = 'foot';      // 'foot' | 'bike' | 'car' | 'ship'
    this.vehicle = null;
    this.health = 100;
    this.fireCooldown = 0;
    this.aimT = 0;
    this.speedScalar = 1;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
  }

  Player.prototype.spawn = function (world, x, z) {
    this.world = world;
    this.pos.set(x, world.heightAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.group.position.copy(this.pos);
  };

  Player.prototype.eyePos = function (out) {
    return (out || this._v).copy(this.pos).add(new THREE.Vector3(0, 1.55, 0));
  };

  /* Muzzle position in world space, so tracers start at the barrel. */
  Player.prototype.muzzlePos = function (out) {
    out = out || this._v2;
    if (this.char.weapon) {
      this.char.weapon.updateWorldMatrix(true, false);
      out.set(0, 0, 0.72).applyMatrix4(this.char.weapon.matrixWorld);
    } else {
      this.eyePos(out);
    }
    return out;
  };

  Player.prototype.update = function (dt, input, cam) {
    if (this.mode === 'foot') this.updateFoot(dt, input, cam);
    else if (this.vehicle) this.updateVehicle(dt, input, cam);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
  };

  Player.prototype.updateFoot = function (dt, input, cam) {
    const w = this.world;
    const run = (input.sprint || (input.axisMag || 0) > 0.88) ? 1.85 : 1.0;
    const maxSpeed = 7.2 * run * this.speedScalar;

    // movement is relative to where the camera looks
    const f = this._v.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    const r = this._v2.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    const wish = new THREE.Vector3();
    const ax = input.axisX || 0, ay = input.axisY || 0;
    const analog = Math.abs(ax) + Math.abs(ay) > 0.06;
    if (analog) {
      // stick or gamepad: keep the magnitude so you can walk as well as run
      wish.addScaledVector(f, -ay);
      wish.addScaledVector(r, ax);
    } else {
      if (input.forward) wish.add(f);
      if (input.back) wish.sub(f);
      if (input.right) wish.add(r);
      if (input.left) wish.sub(r);
    }
    const mag = Math.min(1, wish.length());
    const moving = mag > 0.06;
    if (moving) wish.normalize();

    const accel = this.grounded ? 34 : 9;
    const want = maxSpeed * (analog ? Math.max(0.35, mag) : 1);
    this.vel.x = U.damp(this.vel.x, wish.x * want, accel / 5, dt);
    this.vel.z = U.damp(this.vel.z, wish.z * want, accel / 5, dt);

    // gravity + jump
    const g = 26 * (this.world.planet.gravity || 1);
    this.vel.y -= g * dt;
    if (input.jump && this.grounded) {
      this.vel.y = 10.5 / Math.sqrt(this.world.planet.gravity || 1);
      this.grounded = false;
      SK.Audio.tone({ type: 'sine', f0: 320, f1: 520, dur: 0.14, gain: 0.08 });
    }

    this.pos.addScaledVector(this.vel, dt);

    // stay inside the bowl
    const d = Math.hypot(this.pos.x, this.pos.z);
    const R = SK.World.WORLD_R;
    if (d > R) {
      this.pos.x *= R / d; this.pos.z *= R / d;
      this.vel.x *= 0.2; this.vel.z *= 0.2;
    }

    const gh = w.heightAt(this.pos.x, this.pos.z);
    // In deep water you wade: chest-deep, slower, but you do not drown.
    const wading = w.waterLevel > -9000 && gh < w.waterLevel - 1.0;
    const floor = wading ? w.waterLevel - 1.15 : gh;
    if (wading) { this.vel.x *= 0.965; this.vel.z *= 0.965; }
    if (this.pos.y <= floor + 0.02) {
      this.pos.y = floor;
      this.vel.y = 0;
      if (!this.grounded) {
        this.grounded = true;
        this.game.fx.dust(this.pos, wading ? 0x9fd8e8 : 0xcccccc, wading ? 1.2 : 0.8);
        SK.Audio.burst({ f0: 700, f1: 160, dur: 0.14, gain: 0.12 });
      }
    } else {
      this.grounded = false;
    }

    // face the direction of travel, or the camera while aiming
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    if (input.aim || input.fire) {
      this.yaw = U.dampAngle(this.yaw, cam.yaw, 14, dt);
    } else if (moving && hspeed > 0.4) {
      this.yaw = U.dampAngle(this.yaw, Math.atan2(wish.x, wish.z), 11, dt);
    }

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.aimT = U.damp(this.aimT, input.aim || input.fire ? 1 : 0, 10, dt);
    this.char.update(dt, {
      speed: hspeed, aiming: this.aimT > 0.4,
      attack: this.fireCooldown > 0.1 ? this.fireCooldown : 0,
      lookYaw: U.angleDelta(this.yaw, cam.yaw),
      lookPitch: -cam.pitch * 0.5
    });

    // footfall dust on dusty worlds
    if (this.grounded && hspeed > 5 && Math.random() < dt * 9) {
      this.game.fx.dust(this._v.copy(this.pos).add(new THREE.Vector3(U.rand(-0.3, 0.3), 0.1, U.rand(-0.3, 0.3))),
        this.world.planet.terrain.detail, 0.5);
    }
  };

  /* ----------------------------------------------------- vehicle mode */
  Player.prototype.updateVehicle = function (dt, input, cam) {
    const v = this.vehicle;
    const w = this.world;
    const isCar = v.kind === 'car';
    const hangar = this.game.state.buildings.hangar || 0;
    const tune = 1 + hangar * 0.07;

    const maxSpeed = (isCar ? 34 : 44) * tune * (input.sprint ? 1.45 : 1);
    const accel = isCar ? 18 : 26;
    const turn = (isCar ? 1.5 : 2.4) * (1 - Math.min(0.55, v.speed / (maxSpeed * 1.6)));

    let throttle = 0, steer = 0;
    if (Math.abs(input.axisY || 0) > 0.06 || Math.abs(input.axisX || 0) > 0.06) {
      throttle = -(input.axisY || 0);
      if (throttle < 0) throttle *= 0.75;
      steer = -(input.axisX || 0);
    } else {
      if (input.forward) throttle += 1;
      if (input.back) throttle -= 0.75;
      if (input.left) steer += 1;
      if (input.right) steer -= 1;
    }

    v.speed = U.damp(v.speed, throttle * maxSpeed, throttle !== 0 ? accel / 8 : 1.4, dt);
    if (Math.abs(v.speed) > 0.4) v.yaw += steer * turn * dt * U.clamp(Math.abs(v.speed) / 12, 0.25, 1.4) * Math.sign(v.speed);

    // hover suspension: spring toward a target ride height
    const targetH = (isCar ? 2.1 : 1.7);
    const fwd = this._v.set(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
    v.pos.addScaledVector(fwd, v.speed * dt);

    const d = Math.hypot(v.pos.x, v.pos.z);
    const R = SK.World.WORLD_R;
    if (d > R) { v.pos.x *= R / d; v.pos.z *= R / d; v.speed *= 0.4; }

    const gh = w.heightAt(v.pos.x, v.pos.z);
    const rest = Math.max(gh, w.waterLevel > -9000 ? w.waterLevel : -9999) + targetH;
    let boost = 0;
    if (input.jump) { boost = isCar ? 16 : 20; }
    v.vy += ((rest - v.pos.y) * 42 - v.vy * 9 + boost) * dt;
    v.pos.y += v.vy * dt;

    // read the slope ahead and behind so the craft pitches over terrain
    const ahead = w.heightAt(v.pos.x + fwd.x * 2.4, v.pos.z + fwd.z * 2.4);
    const behind = w.heightAt(v.pos.x - fwd.x * 2.4, v.pos.z - fwd.z * 2.4);
    const pitchTarget = U.clamp((behind - ahead) * 0.09, -0.45, 0.45) - U.clamp(v.speed * 0.004, -0.2, 0.2);
    const rollTarget = U.clamp(-steer * Math.abs(v.speed) * (isCar ? 0.008 : 0.016), -0.6, 0.6);

    v.pitch = U.damp(v.pitch, pitchTarget, 6, dt);
    v.roll = U.damp(v.roll, rollTarget, 7, dt);

    v.rig.group.position.copy(v.pos);
    v.rig.group.rotation.set(0, v.yaw, 0);
    v.rig.body.rotation.set(v.pitch, 0, v.roll);
    // idle float so a parked craft never looks dead
    v.rig.body.position.y = Math.sin(this.game.clockT * 2.2) * 0.07;

    // thruster + dust response
    const load = U.clamp(Math.abs(v.speed) / maxSpeed, 0, 1);
    if (v.rig.pods) v.rig.pods.forEach((p) => {
      p.material.opacity = 0.35 + load * 0.35 + Math.sin(this.game.clockT * 14) * 0.05;
      p.scale.setScalar(0.9 + load * 0.25);
    });
    const flames = v.rig.flames || (v.rig.flame ? [v.rig.flame] : []);
    flames.forEach((f) => {
      f.scale.set(0.8 + load * 0.5, 0.8 + load * 0.5, 0.5 + load * 1.6 + (input.jump ? 0.7 : 0));
      f.material.opacity = 0.35 + load * 0.5;
    });
    if (load > 0.25 && Math.random() < dt * 30 * load) {
      this.game.fx.dust(this._v2.set(v.pos.x - fwd.x * 2, gh + 0.25, v.pos.z - fwd.z * 2),
        this.world.planet.terrain.detail, 0.9 + load);
    }

    // the rider sits in the seat
    this.pos.copy(v.pos);
    this.yaw = v.yaw;
    this.group.position.copy(v.pos).add(
      this._v.copy(v.rig.seat).applyAxisAngle(UP, v.yaw));
    this.group.position.y = v.pos.y + v.rig.seat.y + v.rig.body.position.y;
    this.group.rotation.set(0, v.yaw, 0);
    this.char.group.rotation.x = isCar ? 0 : 0.28;
    this.char.update(dt, {
      speed: 0, aiming: false, attack: 0,
      lookYaw: U.angleDelta(v.yaw, cam.yaw) * 0.6, lookPitch: 0
    });
    // hands on the controls
    this.char.arms[0].arm.rotation.x = -1.25;
    this.char.arms[1].arm.rotation.x = -1.25;
    this.char.arms[0].shoulder.rotation.z = 0.5;
    this.char.arms[1].shoulder.rotation.z = -0.5;
    this.char.legs[0].rotation.x = isCar ? -1.1 : -0.55;
    this.char.legs[1].rotation.x = isCar ? -1.1 : -0.55;

    v.engineLoad = load;
  };

  /* ----------------------------------------------------- mount / exit */
  Player.prototype.mount = function (v) {
    this.mode = v.kind;
    this.vehicle = v;
    v.pos.copy(v.rig.group.position);
    v.speed = 0; v.vy = 0;
    if (this.char.weapon) this.char.weapon.visible = false;
    SK.Audio.tone({ type: 'sawtooth', f0: 120, f1: 320, dur: 0.5, gain: 0.14, filter: [400, 2400] });
  };

  Player.prototype.dismount = function () {
    const v = this.vehicle;
    if (!v) return;
    const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).multiplyScalar(3.2);
    this.pos.copy(v.pos).add(side);
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
    this.vel.set(0, 0, 0);
    this.mode = 'foot';
    this.vehicle = null;
    this.char.group.rotation.x = 0;
    if (this.char.weapon) this.char.weapon.visible = true;
    v.speed = 0;
    SK.Audio.tone({ type: 'sine', f0: 300, f1: 140, dur: 0.3, gain: 0.1 });
  };

  /* ================================================================== */
  function makeVehicle(kind, pal, x, y, z, yaw) {
    const rig = kind === 'bike' ? B.buildHoverBike(pal)
      : kind === 'car' ? B.buildHoverCar(pal) : B.buildStarship(pal);
    rig.group.position.set(x, y, z);
    rig.group.rotation.y = yaw || 0;
    return {
      kind: kind, rig: rig,
      pos: new THREE.Vector3(x, y, z),
      yaw: yaw || 0, pitch: 0, roll: 0, speed: 0, vy: 0, engineLoad: 0,
      label: kind === 'bike' ? 'Hoverbike' : kind === 'car' ? 'Hovercar' : 'Starship'
    };
  }

  /* ==================================================================
     THIRD-PERSON CAMERA
     ================================================================== */
  function ChaseCamera(camera) {
    this.cam = camera;
    this.yaw = 0;
    this.pitch = 0.22;
    this.dist = 8.5;
    this.targetDist = 8.5;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this._v = new THREE.Vector3();
  }

  ChaseCamera.prototype.rotate = function (dx, dy) {
    this.yaw -= dx * 0.0026;
    this.pitch = U.clamp(this.pitch + dy * 0.0022, -0.55, 1.15);
  };

  ChaseCamera.prototype.zoom = function (d) {
    this.targetDist = U.clamp(this.targetDist + d * 0.012, 3.2, 22);
  };

  ChaseCamera.prototype.update = function (dt, target, world, mode) {
    this.dist = U.damp(this.dist, this.targetDist * (mode === 'car' ? 1.5 : mode === 'bike' ? 1.25 : 1), 7, dt);
    const h = mode === 'foot' ? 1.75 : 2.6;
    this.look.set(target.x, target.y + h, target.z);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const want = this._v.set(
      this.look.x + Math.sin(this.yaw) * cp * this.dist,
      this.look.y + sp * this.dist + 0.8,
      this.look.z + Math.cos(this.yaw) * cp * this.dist
    );
    // never let the camera sink into a hill
    if (world) {
      const gh = world.heightAt(want.x, want.z) + 1.4;
      if (want.y < gh) want.y = gh;
    }
    this.pos.lerp(want, 1 - Math.exp(-13 * dt));

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.4);
      const s = this.shake * this.shake;
      this.pos.x += U.rand(-1, 1) * s * 0.6;
      this.pos.y += U.rand(-1, 1) * s * 0.6;
      this.pos.z += U.rand(-1, 1) * s * 0.6;
    }
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
  };

  ChaseCamera.prototype.snap = function (target, mode) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const h = mode === 'foot' ? 1.75 : 2.6;
    this.look.set(target.x, target.y + h, target.z);
    this.pos.set(
      this.look.x + Math.sin(this.yaw) * cp * this.dist,
      this.look.y + sp * this.dist + 0.8,
      this.look.z + Math.cos(this.yaw) * cp * this.dist
    );
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
  };

  /* ==================================================================
     INPUT
     ================================================================== */
  function Input(dom) {
    const st = {
      forward: false, back: false, left: false, right: false,
      sprint: false, jump: false, fire: false, aim: false,
      mx: 0, my: 0, wheel: 0, locked: false,
      pressed: {}, justPressed: {}
    };
    this.state = st;
    const keymap = {
      KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump'
    };
    this.keymap = keymap;

    const self = this;
    this._onKeyDown = function (e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      const k = keymap[e.code];
      if (k) { st[k] = true; e.preventDefault(); }
      if (!st.pressed[e.code]) st.justPressed[e.code] = true;
      st.pressed[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = function (e) {
      const k = keymap[e.code];
      if (k) st[k] = false;
      st.pressed[e.code] = false;
    };
    this._onMouseDown = function (e) {
      if (e.button === 0) st.fire = true;
      if (e.button === 2) st.aim = true;
    };
    this._onMouseUp = function (e) {
      if (e.button === 0) st.fire = false;
      if (e.button === 2) st.aim = false;
    };
    this._onMouseMove = function (e) {
      if (st.locked) { st.mx += e.movementX || 0; st.my += e.movementY || 0; }
      else if (self.dragging) { st.mx += e.movementX || (e.clientX - self.lastX); st.my += e.movementY || (e.clientY - self.lastY); }
      self.lastX = e.clientX; self.lastY = e.clientY;
    };
    this._onWheel = function (e) { st.wheel += e.deltaY; e.preventDefault(); };
    this._onLockChange = function () { st.locked = document.pointerLockElement === dom; };
    this._onContext = function (e) { e.preventDefault(); };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    dom.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
    dom.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.dom = dom;

    /* ------------------------------------------------ touch controls */
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    st.axisX = 0; st.axisY = 0; st.axisMag = 0;
    this._setupTouch(dom);
    this._gamepadIndex = null;
    window.addEventListener('gamepadconnected', (e) => { this._gamepadIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this._gamepadIndex = null; });
  }

  /* A real thumbstick plus four action buttons. The canvas only ever
     handles look, because the controls sit above it and swallow their
     own touches. */
  Input.prototype._setupTouch = function (dom) {
    const st = this.state;
    const self = this;
    const layer = document.getElementById('touch');
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    if (!layer || !stick || !knob) return;

    if (this.isTouch) {
      layer.hidden = false;
      document.body.classList.add('touch-mode');
    }

    let stickId = -1, cx = 0, cy = 0, radius = 52;
    const setKnob = (dx, dy) => {
      knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    };
    const onStickMove = (t) => {
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > radius) { dx = dx / d * radius; dy = dy / d * radius; }
      setKnob(dx, dy);
      st.axisX = dx / radius;
      st.axisY = dy / radius;
      st.axisMag = Math.min(1, d / radius);
    };
    stick.addEventListener('touchstart', function (e) {
      const t = e.changedTouches[0];
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      radius = r.width * 0.4;
      stick.classList.add('active');
      onStickMove(t);
      e.preventDefault();
    }, { passive: false });
    const stickEnd = function (e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier !== stickId) continue;
        stickId = -1;
        stick.classList.remove('active');
        setKnob(0, 0);
        st.axisX = 0; st.axisY = 0; st.axisMag = 0;
      }
    };
    window.addEventListener('touchmove', function (e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === stickId) { onStickMove(t); e.preventDefault(); }
      }
    }, { passive: false });
    window.addEventListener('touchend', stickEnd, { passive: true });
    window.addEventListener('touchcancel', stickEnd, { passive: true });

    /* action buttons */
    const hold = (id, down, up) => {
      const b = document.getElementById(id);
      if (!b) return;
      b.addEventListener('touchstart', function (e) { b.classList.add('down'); down(); e.preventDefault(); }, { passive: false });
      b.addEventListener('touchend', function (e) { b.classList.remove('down'); if (up) up(); e.preventDefault(); }, { passive: false });
      b.addEventListener('touchcancel', function () { b.classList.remove('down'); if (up) up(); });
      b.addEventListener('mousedown', function () { b.classList.add('down'); down(); });
      b.addEventListener('mouseup', function () { b.classList.remove('down'); if (up) up(); });
      b.addEventListener('mouseleave', function () { if (b.classList.contains('down')) { b.classList.remove('down'); if (up) up(); } });
    };
    hold('t-fire', () => { st.fire = true; }, () => { st.fire = false; });
    hold('t-jump', () => { st.jump = true; }, () => { st.jump = false; });
    hold('t-act', () => { st.pressed.KeyE = true; }, () => { st.pressed.KeyE = false; });
    hold('t-ride', () => { st.pressed.KeyF = true; st.justPressed.KeyF = true; },
      () => { st.pressed.KeyF = false; });

    /* look: any touch on the canvas that is not a control */
    let lookId = -1, lx = 0, ly = 0;
    dom.addEventListener('touchstart', function (e) {
      if (lookId >= 0) return;
      const t = e.changedTouches[0];
      lookId = t.identifier; lx = t.clientX; ly = t.clientY;
    }, { passive: true });
    dom.addEventListener('touchmove', function (e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== lookId) continue;
        st.mx += (t.clientX - lx) * 1.5;
        st.my += (t.clientY - ly) * 1.5;
        lx = t.clientX; ly = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    const lookEnd = function (e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookId) lookId = -1;
      }
    };
    dom.addEventListener('touchend', lookEnd, { passive: true });
    dom.addEventListener('touchcancel', lookEnd, { passive: true });
  };

  /* Gamepads feed the same axes the thumbstick does. */
  Input.prototype.pollGamepad = function () {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (let i = 0; i < pads.length; i++) { if (pads[i] && pads[i].connected) { pad = pads[i]; break; } }
    if (!pad) return;
    const st = this.state;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const lx = dz(pad.axes[0] || 0), ly = dz(pad.axes[1] || 0);
    if (lx || ly) { st.axisX = lx; st.axisY = ly; st.axisMag = Math.min(1, Math.hypot(lx, ly)); }
    const rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
    st.mx += rx * 16; st.my += ry * 12;
    const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    st.jump = st.jump || btn(0);
    st.fire = st.fire || btn(7) || btn(5);
    st.sprint = st.sprint || btn(10) || btn(6);
    if (btn(2)) st.pressed.KeyE = true; else if (this._padE) st.pressed.KeyE = false;
    this._padE = btn(2);
    if (btn(1) && !this._padF) st.justPressed.KeyF = true;
    this._padF = btn(1);
    if (btn(3) && !this._padY) st.justPressed.KeyU = true;
    this._padY = btn(3);
  };

  Input.prototype.consumeMouse = function () {
    const st = this.state;
    const r = { dx: st.mx, dy: st.my, wheel: st.wheel };
    st.mx = 0; st.my = 0; st.wheel = 0;
    return r;
  };
  Input.prototype.consumeKey = function (code) {
    if (this.state.justPressed[code]) { this.state.justPressed[code] = false; return true; }
    return false;
  };
  Input.prototype.clearFrameKeys = function () { this.state.justPressed = {}; };
  Input.prototype.releaseAll = function () {
    const st = this.state;
    st.forward = st.back = st.left = st.right = st.sprint = st.jump = st.fire = st.aim = false;
    st.axisX = 0; st.axisY = 0; st.axisMag = 0;
    st.pressed = {}; st.justPressed = {};
    const k = document.getElementById('stick-knob');
    if (k) k.style.transform = 'translate(0px,0px)';
  };
  Input.prototype.requestLock = function () {
    if (this.dom.requestPointerLock) this.dom.requestPointerLock();
  };
  Input.prototype.exitLock = function () {
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  };

  SK.Player = Player;
  SK.ChaseCamera = ChaseCamera;
  SK.Input = Input;
  SK.makeVehicle = makeVehicle;
})(window.SK);
