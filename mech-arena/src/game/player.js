/**
 * PLAYER CONTROLLER
 * ------------------------------------------------------------------
 * Translates input into the same intent fields a bot writes, then drives
 * the camera. Two views:
 *
 *   chase    third person, over the shoulder -- the default, because a
 *            mech's silhouette is half the appeal
 *   cockpit  first person from the canopy, with the torso frame visible
 *
 * The camera does a short sphere-cast back from the mech so it never
 * clips through a wall, and it leads the torso slightly so fast torso
 * twists feel weighty instead of snappy.
 */
import * as THREE from 'three';
import { clamp, damp, lerp, angleDelta } from '../core/rng.js';

export class PlayerController {
  constructor(input, engine, world, audio) {
    this.input = input;
    this.engine = engine;
    this.camera = engine.camera;
    this.world = world;
    this.audio = audio;

    this.view = 'chase';
    this.zoom = 1;
    this.targetZoom = 1;
    this.camDist = 19;
    this.camHeight = 0.86;
    this.camSide = 2.6;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.smoothYaw = 0;
    this.smoothPitch = 0;
    this.fireGroup = 'single';   // single | alpha | beta | all
    this.scoreboardOpen = false;
    this.onEvent = null;
    this.enabled = true;
    this._inited = false;
  }

  /** Write intent onto the mech and update the camera. */
  apply(mech, dt, live) {
    const inp = this.input;
    if (!this._inited) {
      this.smoothYaw = mech.aimYaw;
      this.smoothPitch = mech.aimPitch;
      this._inited = true;
    }

    /* ---- look ---- */
    if (inp.locked && this.enabled) {
      const sens = 1 / Math.max(0.4, this.zoom);
      mech.aimYaw -= inp.mouse.dx * sens;
      mech.aimPitch = clamp(mech.aimPitch - inp.mouse.dy * sens, -0.72, 0.72);
    }

    /* ---- move ---- */
    if (this.enabled && live && !mech.shutdown) {
      const mv = inp.moveVector();
      mech.moveX = mv.x;
      mech.moveZ = mv.z;
      // The legs follow the torso, but lag behind it: this is what makes a
      // mech feel like a mech rather than a first-person shooter body.
      const twist = angleDelta(mech.yaw, mech.aimYaw);
      const deadzone = 0.42;
      if (Math.abs(twist) > deadzone || Math.abs(mv.x) + Math.abs(mv.z) > 0.05) {
        mech.desiredYaw = mech.aimYaw;
      }
      mech.wantJump = inp.isDown('jump');
      mech.wantBrake = inp.isDown('brake');
      if (inp.pressed('ability')) mech.wantAbility = true;
    } else {
      mech.moveX = mech.moveZ = 0;
      mech.wantJump = false;
      mech.wantBrake = inp.isDown('brake');   // still allowed: forces a restart
    }

    /* ---- weapon selection & fire groups ---- */
    for (let i = 0; i < 6; i++) {
      if (inp.pressed('weapon' + (i + 1))) {
        const w = mech.weapons[i];
        if (w && !w.destroyed) {
          mech.selected = i;
          this.fireGroup = 'single';
          this.audio.play('ui');
          this.onEvent?.({ type: 'weaponSelect', index: i });
        }
      }
    }
    if (inp.pressed('groupAlpha')) { this.fireGroup = this.fireGroup === 'alpha' ? 'single' : 'alpha'; this.audio.play('ui'); }
    if (inp.pressed('groupBeta')) { this.fireGroup = this.fireGroup === 'beta' ? 'single' : 'beta'; this.audio.play('ui'); }
    if (inp.pressed('groupAll')) { this.fireGroup = this.fireGroup === 'all' ? 'single' : 'all'; this.audio.play('ui'); }

    // Mouse wheel cycles weapons.
    if (inp.mouse.wheel !== 0) {
      const usable = mech.weapons.map((w, i) => (w && !w.destroyed ? i : -1)).filter(i => i >= 0);
      if (usable.length) {
        const cur = usable.indexOf(mech.selected);
        const next = usable[(cur + (inp.mouse.wheel > 0 ? 1 : -1) + usable.length) % usable.length];
        mech.selected = next;
        this.fireGroup = 'single';
        this.audio.play('ui');
      }
    }

    /* ---- firing ---- */
    mech.firing.clear();
    if (this.enabled && live && inp.mouse.left && !mech.shutdown) {
      if (this.fireGroup === 'single') mech.firing.add(mech.selected);
      else for (const i of mech.weaponGroups[this.fireGroup === 'all' ? 'all' : this.fireGroup]) mech.firing.add(i);
    }
    // Right mouse is zoom, not a second trigger -- mechs do not have hipfire.
    this.targetZoom = inp.mouse.right ? (this.view === 'cockpit' ? 3.2 : 2.4) : 1;
    if (inp.pressed('zoom')) this.targetZoom = this.targetZoom > 1 ? 1 : 3.4;
    this.zoom = damp(this.zoom, this.targetZoom, 11, dt);
    this.engine.setZoom(this.zoom);

    if (inp.pressed('cockpit')) {
      this.view = this.view === 'chase' ? 'cockpit' : 'chase';
      this.audio.play('ui');
    }
    if (inp.pressed('powerdown')) {
      // Manual shutdown: instantly dumps heat, leaves you helpless.
      if (!mech.shutdown) { mech.shutdown = true; mech.shutdownTimer = 1.6; this.audio.play('shutdown', mech.position); }
    }
    this.scoreboardOpen = inp.isDown('scoreboard');

    this._updateCamera(mech, dt);
  }

  _updateCamera(mech, dt) {
    const cam = this.camera;
    // Smooth the aim angles for the camera only; the guns use the raw values,
    // so aiming stays exact while the view stays calm.
    this.smoothYaw += angleDelta(this.smoothYaw, mech.aimYaw) * clamp(dt * 22, 0, 1);
    this.smoothPitch = damp(this.smoothPitch, mech.aimPitch, 20, dt);

    if (this.view === 'cockpit') {
      const head = _v1.set(0, mech.height * 0.80, 0);
      // Sit just behind the canopy glass, offset with the torso twist.
      const yaw = mech.yaw + mech.torsoYaw;
      const fwd = _v2.set(Math.sin(yaw), 0, Math.cos(yaw));
      this.camPos.copy(mech.position).add(head).addScaledVector(fwd, mech.radius * 0.45);
      this.camPos.y += Math.sin(mech.gait * 2) * 0.16 + mech.lean * 0.6;
      cam.position.copy(this.camPos);
      cam.rotation.set(0, 0, 0);
      cam.rotateY(this.smoothYaw);
      cam.rotateX(this.smoothPitch);
      // A touch of roll from lateral motion sells the mass.
      const lateral = mech.velocity.x * Math.cos(mech.yaw) - mech.velocity.z * Math.sin(mech.yaw);
      cam.rotateZ(clamp(-lateral / Math.max(1, mech.maxSpeed), -1, 1) * 0.035);
      return;
    }

    /* ---- chase ---- */
    const dist = this.camDist * lerp(1, 0.52, clamp(this.zoom - 1, 0, 1) / 2.4) * (mech.height / 10);
    const pivot = _v1.copy(mech.position);
    pivot.y += mech.height * this.camHeight;

    const cp = Math.cos(this.smoothPitch), sp = Math.sin(this.smoothPitch);
    const back = _v2.set(-Math.sin(this.smoothYaw) * cp, -sp, -Math.cos(this.smoothYaw) * cp);
    const right = _v3.set(Math.cos(this.smoothYaw), 0, -Math.sin(this.smoothYaw));

    const want = _v4.copy(pivot)
      .addScaledVector(back, dist)
      .addScaledVector(right, this.camSide * (this.zoom > 1.5 ? 0.35 : 1));

    // Pull the camera in if a wall is in the way. Pulling all the way to the
    // mech puts the lens inside its own cockpit, so once the available room
    // drops below a usable minimum the camera climbs instead and looks down
    // over the shoulder -- which is what a player in an alley actually wants.
    const dir = _v5.copy(want).sub(pivot);
    const len = dir.length();
    dir.multiplyScalar(1 / len);
    const minDist = mech.radius * 1.8 + 2.5;
    const hit = this.world.raycast(pivot, dir, len + 1.4);
    if (hit) {
      const room = hit.t - 1.4;
      if (room >= minDist) {
        want.copy(pivot).addScaledVector(dir, room);
      } else {
        // Try straight up: there is almost always headroom.
        const up = _v6.set(0, 1, 0);
        const upHit = this.world.raycast(pivot, up, mech.height * 1.6);
        const rise = Math.min(mech.height * 1.3, (upHit ? upHit.t - 1.2 : mech.height * 1.3));
        want.copy(pivot)
          .addScaledVector(dir, Math.max(minDist * 0.55, room))
          .addScaledVector(up, Math.max(0, rise));
      }
    }

    // Critically damped follow; snap on teleport-scale jumps.
    if (cam.position.distanceTo(want) > 60) cam.position.copy(want);
    else {
      cam.position.x = damp(cam.position.x, want.x, 14, dt);
      cam.position.y = damp(cam.position.y, want.y, 14, dt);
      cam.position.z = damp(cam.position.z, want.z, 14, dt);
    }

    // Look at a point slightly ahead of the mech so the crosshair sits where
    // the weapons actually converge.
    const aimDir = mech.aimForward(_v8);
    const convergence = 240;
    this.camLook.copy(mech.eyePosition(_v7)).addScaledVector(aimDir, convergence);
    cam.lookAt(this.camLook);
  }

  /** Where the crosshair points in the world, for the HUD. */
  crosshairWorld(mech, maxDist = 900) {
    const o = mech.eyePosition(_v1);
    const d = mech.aimForward(_v2);
    const hit = this.world.raycast(o, d, maxDist);
    return o.clone().addScaledVector(d, hit ? hit.t : maxDist);
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
const _v8 = new THREE.Vector3();
