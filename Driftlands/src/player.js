import * as THREE from 'three';
import { clamp, damp, angleDiff } from './noise.js';
import { buildPerson, animatePerson } from './geom.js';
import { SEA_Y } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);
export const GRAPPLE_RANGE = [34, 48, 64];
const GLIDE_SPEED = [14, 17, 20];
const GLIDE_SINK = [-2.8, -2.1, -1.5];

export class Player {
  constructor(G) {
    this.G = G;
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.camYaw = 0; this.camPitch = 0.25;
    this.modelYaw = 0;
    this.onGround = false;
    this.platform = null;
    this.mode = 'normal';    // normal | glide | grapple | wallrun | helm
    this.airJumps = 1;
    this.hp = 100;
    this.lastHurt = -10;
    this.coyote = 0;
    this.walkPhase = 0;
    this.grapple = null;
    this.wall = null;
    this.wallCd = 0;
    this.dashCd = 0;
    this.aiming = false;
    this.camDist = 6.5;
    this.fov = 70;
    this.helmYawOffset = 0; this.helmIdle = 0;
    this.camPos = new THREE.Vector3();
    this.camInit = false;
    this.ray = new THREE.Raycaster();
    this.fallTime = 0;

    this.model = buildPerson({ body: 0x2f6fd0, accent: 0xe8483a });
    G.scene.add(this.model);
    // glider: a striped paraglider canopy with lines to the hands
    this.glider = new THREE.Group();
    const canopyGeo = new THREE.CylinderGeometry(3.2, 3.2, 2.4, 18, 1, true, -1.05, 2.1);
    canopyGeo.rotateX(-Math.PI / 2);
    const cc = new Float32Array(canopyGeo.attributes.position.count * 3);
    const cpos = canopyGeo.attributes.position;
    for (let i = 0; i < cpos.count; i++) { const st = Math.floor((cpos.getX(i) + 3.3) / 0.9) % 2; const v = st ? 1 : 0.92; cc[i * 3] = v; cc[i * 3 + 1] = st ? 1 : 0.95; cc[i * 3 + 2] = st ? 1 : 0.85; }
    canopyGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    this.gliderMat = new THREE.MeshStandardMaterial({ color: 0xe8483a, vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
    const canopy = new THREE.Mesh(canopyGeo, this.gliderMat);
    canopy.position.y = -0.4; canopy.castShadow = true;
    const lineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
      -0.45, -1.0, 0, -2.75, 1.2, 0, -0.45, -1.0, 0, -1.2, 2.5, 0, 0.45, -1.0, 0, 2.75, 1.2, 0, 0.45, -1.0, 0, 1.2, 2.5, 0,
    ], 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x3a2a1a }));
    this.glider.add(canopy, lines);
    this.glider.position.y = 2.4;
    this.glider.visible = false;
    this.model.add(this.glider);
    // bow
    const bow = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 5, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x6a3a1a, roughness: 0.6 }));
    arc.rotation.z = Math.PI / 2;
    this.bowString = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 3), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
    bow.add(arc, this.bowString);
    bow.position.set(0, 1.3, 0.42); bow.rotation.set(0, Math.PI / 2, 0.3);
    this.bow = bow;
    this.model.add(bow);
    // grapple rope
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1), new THREE.MeshStandardMaterial({ color: 0xd8c8a0, emissive: 0x4a3a20 }));
    this.rope.geometry.translate(0, 0.5, 0);
    this.rope.visible = false;
    G.scene.add(this.rope);
    this.hook = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x9a9aa8, metalness: 0.8, roughness: 0.3 }));
    this.hook.visible = false;
    G.scene.add(this.hook);
    this.ropeAnim = null;
  }

  get maxHp() { return this.G.save.maxHp(); }

  respawnOnShip(msg) {
    const G = this.G;
    this.cancelGrapple();
    this.mode = 'normal';
    this.glider.visible = false;
    const local = new THREE.Vector3(0, 0.05, 6.5);
    G.ship.toWorld(local, this.pos);
    this.prev.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.onGround = true; this.platform = G.ship;
    this.camYaw = G.ship.yaw; this.camPitch = 0.25;
    this.camInit = false;
    if (msg) G.ui.toast(msg, 3.5);
  }

  enterHelm() {
    this.mode = 'helm';
    this.cancelGrapple();
    this.glider.visible = false;
    this.helmYawOffset = 0;
    this.G.ui.toast('At the helm: W/S throttle · A/D steer · Space/Shift rise/sink · E to leave', 4);
  }
  leaveHelm() {
    const G = this.G;
    this.mode = 'normal';
    this.camPitch = Math.max(this.camPitch, 0.25);
    G.ship.toWorld(new THREE.Vector3(0, 0.05, 10.4), this.pos);
    this.vel.set(0, 0, 0);
    this.onGround = true; this.platform = G.ship;
    this.camYaw = G.ship.yaw;
  }

  damage(n, from) {
    const G = this.G;
    if (this.hp <= 0 || G.state !== 'play') return;
    this.hp -= n;
    this.lastHurt = G.time;
    G.ui.hurt(clamp(n / 30, 0.3, 1));
    G.audio.play('hurt');
    G.cameraShake = Math.max(G.cameraShake, 0.25);
    if (from && this.mode !== 'helm') {
      const k = this.pos.clone().sub(from); k.y = 0; k.normalize().multiplyScalar(6);
      this.vel.add(k); this.vel.y = Math.max(this.vel.y, 4);
      this.onGround = false;
    }
    if (this.hp <= 0) {
      const lost = Math.floor(G.save.res.shards * 0.1);
      G.save.res.shards -= lost;
      this.hp = this.maxHp;
      G.ui.fadeFlash();
      this.respawnOnShip(`You were knocked out! The crew hauled you aboard${lost ? ` (dropped ${lost} ◆)` : ''}.`);
    }
  }

  cancelGrapple() {
    this.grapple = null;
    this.rope.visible = false; this.hook.visible = false;
    if (this.mode === 'grapple') this.mode = 'normal';
  }

  tryGrapple() {
    const G = this.G;
    const range = GRAPPLE_RANGE[G.save.upg.grapple - 1];
    const cam = G.camera;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const origin = cam.position.clone();
    const handOff = this.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const meshes = G.islands.meshesNear(this.pos, range + 10).concat(G.ship.raycastMeshes);
    if (G.storm && G.storm.active) meshes.push(...G.storm.raycastMeshes());
    this.ray.set(origin, dir);
    this.ray.far = range + origin.distanceTo(handOff) + 2;
    const hits = this.ray.intersectObjects(meshes, false);
    const hit = hits.find((h) => h.point.distanceTo(handOff) > 2.5 && h.point.distanceTo(handOff) <= range);
    G.audio.play('grapple');
    if (!hit) {
      this.ropeAnim = { to: origin.clone().addScaledVector(dir, range), t: 0.25 };
      return;
    }
    const obj = hit.object;
    obj.updateMatrixWorld();
    this.grapple = { obj, local: obj.worldToLocal(hit.point.clone()), t: 0 };
    this.mode = 'grapple';
    this.glider.visible = false;
    this.onGround = false; this.platform = null;
    this.vel.y = Math.max(this.vel.y, 3);
    if (G.particles) G.particles.burst(hit.point, 10, { color: [1, 0.9, 0.6], speed: 4, size: 0.3, life: 0.4 });
  }

  update(dt) {
    const G = this.G, inp = G.input;
    const save = G.save;
    this.prev.copy(this.pos);
    this.wallCd -= dt; this.dashCd -= dt;
    // ---- look
    const sens = inp.sensitivity;
    if (this.mode === 'helm') {
      this.helmYawOffset -= inp.mouse.dx * sens;
      this.camPitch = clamp(this.camPitch + inp.mouse.dy * sens, -0.6, 1.2);
      if (inp.mouse.dx !== 0) this.helmIdle = 0; else this.helmIdle += dt;
      if (this.helmIdle > 2) this.helmYawOffset = damp(this.helmYawOffset, 0, 1.5, dt);
      this.camYaw = G.ship.yaw + this.helmYawOffset;
    } else {
      this.camYaw -= inp.mouse.dx * sens;
      this.camPitch = clamp(this.camPitch + inp.mouse.dy * sens, -1.0, 1.3);
    }

    // ---- platform carry
    if (this.onGround && this.platform && this.mode !== 'helm') {
      if (this.platform === G.ship) {
        this.pos.applyMatrix4(G.ship.delta);
        this.camYaw += G.ship.deltaYaw; this.modelYaw += G.ship.deltaYaw;
      } else if (this.platform.dy) this.pos.y += this.platform.dy;
    }

    if (this.mode === 'helm') { this.updateHelm(dt); return; }

    // ---- input
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const mv = new THREE.Vector3();
    if (inp.down('KeyW')) mv.add(fwd);
    if (inp.down('KeyS')) mv.sub(fwd);
    if (inp.down('KeyD')) mv.add(right);
    if (inp.down('KeyA')) mv.sub(right);
    if (mv.lengthSq() > 0) mv.normalize();
    this.aiming = inp.mouse.left && G.combat.canShoot();
    const sprint = inp.down('ShiftLeft') || inp.down('ShiftRight');

    if (inp.mouse.rightPressed || inp.hit('KeyQ')) {
      if (this.mode === 'grapple') this.cancelGrapple(); else this.tryGrapple();
    }

    const jumpPressed = inp.hit('Space');
    const gravity = 26;
    if (this.mode === 'grapple') {
      const g = this.grapple;
      if (!g.obj.parent) { this.cancelGrapple(); }
      else {
        g.t += dt;
        const anchor = g.obj.localToWorld(g.local.clone());
        const to = anchor.clone().sub(this.pos).sub(new THREE.Vector3(0, 1.2, 0));
        const dist = to.length();
        to.normalize();
        const pull = save.questDone.includes('lumen') ? 75 : 52;
        this.vel.addScaledVector(to, pull * dt);
        this.vel.addScaledVector(mv, 12 * dt);
        this.vel.y -= gravity * 0.35 * dt;
        // damp sideways motion so the pull feels tight
        const along = this.vel.dot(to);
        const side = this.vel.clone().addScaledVector(to, -along);
        this.vel.addScaledVector(side, -Math.min(1, 2.5 * dt));
        if (this.vel.length() > 34) this.vel.setLength(34);
        this.updateRope(anchor);
        if (dist < 2.2 || g.t > 3.5) {
          this.cancelGrapple();
          this.vel.multiplyScalar(0.5);
          this.vel.y = Math.max(this.vel.y, 8);
          this.airJumps = 1;
        } else if (jumpPressed) {
          this.cancelGrapple();
          this.vel.y = Math.max(this.vel.y + 6, 9);
          this.airJumps = 1;
          G.audio.play('jump');
        }
      }
    } else if (this.mode === 'wallrun') {
      const w = this.wall;
      w.t += dt;
      const n = w.normal;
      const tangent = this.vel.clone(); tangent.y = 0;
      tangent.addScaledVector(n, -tangent.dot(n));
      if (tangent.lengthSq() < 0.01) tangent.crossVectors(UP, n);
      tangent.normalize();
      const sp = Math.max(10, Math.hypot(this.vel.x, this.vel.z));
      this.vel.x = tangent.x * sp - n.x * 2; this.vel.z = tangent.z * sp - n.z * 2;
      this.vel.y = w.t < 0.25 ? Math.max(this.vel.y, 3.5) : this.vel.y - gravity * 0.22 * dt;
      if (jumpPressed) {
        this.mode = 'normal';
        this.vel.set(tangent.x * 8 + n.x * 9, 10, tangent.z * 8 + n.z * 9);
        this.airJumps = 1; this.wallCd = 0.35;
        G.audio.play('jump');
        G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 8, { color: [0.9, 0.9, 1], speed: 3, size: 0.4, life: 0.4 });
      } else if (w.t > 1.6 || w.lost > 0.15 || !inp.down('KeyW')) {
        this.mode = 'normal'; this.wallCd = 0.4;
      }
      if (Math.random() < 0.5) G.particles.norm.emit({ x: this.pos.x - n.x * 0.4, y: this.pos.y + 0.3, z: this.pos.z - n.z * 0.4, vy: 0.5, color: [0.8, 0.78, 0.7], size: 0.5, size1: 1.2, alpha: 0.4, life: 0.6 });
    } else if (this.mode === 'glide') {
      const lv = save.upg.glider - 1;
      let speed = GLIDE_SPEED[lv], sink = GLIDE_SINK[lv];
      if (inp.down('KeyW')) { speed += 7; sink -= 4; }
      if (inp.down('KeyS')) { speed -= 6; sink -= 0.6; }
      const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
      const desired = fwd.clone().multiplyScalar(speed);
      hv.lerp(desired, 1 - Math.exp(-1.6 * dt));
      this.vel.x = hv.x; this.vel.z = hv.z;
      this.vel.y = damp(this.vel.y, sink, 2.2, dt);
      const lift = this.liftAt(this.pos);
      if (lift > 0) this.vel.y = Math.min(this.vel.y + lift * dt, 16);
      this.vel.x += G.world.wind.x * dt * 0.9; this.vel.z += G.world.wind.z * dt * 0.9;
      if (sprint && this.dashCd <= 0 && save.questDone.includes('juno')) {
        this.dashCd = 2.2; this.vel.addScaledVector(fwd, 22); this.vel.y += 3; G.audio.play('glide');
        G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 2, 0)), 16, { color: [1, 1, 1], speed: 5, size: 0.4, life: 0.5 });
      }
      if (jumpPressed) { this.mode = 'normal'; this.glider.visible = false; }
    } else {
      // normal ground/air movement
      const speed = this.onGround ? (sprint ? 11 : 6.5) * (this.aiming ? 0.55 : 1) : 8.5;
      const accel = this.onGround ? 70 : 16;
      const target = mv.clone().multiplyScalar(speed);
      const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
      const diff = target.sub(hv);
      if (!this.onGround && mv.lengthSq() === 0) diff.multiplyScalar(0.0);
      const mx = accel * dt;
      if (diff.length() > mx) diff.setLength(mx);
      this.vel.x += diff.x; this.vel.z += diff.z;
      if (this.onGround) { this.coyote = 0.12; this.airJumps = 1; } else this.coyote -= dt;
      if (jumpPressed) {
        if (this.onGround || this.coyote > 0) {
          this.vel.y = 9.5; this.onGround = false; this.coyote = 0; this.platform = null;
          G.audio.play('jump');
        } else if (this.airJumps > 0) {
          this.airJumps--; this.vel.y = 9;
          G.audio.play('jump');
          G.particles.burst(this.pos.clone(), 12, { color: [1, 1, 1], speed: 3, size: 0.5, life: 0.5, alpha: 0.6 });
        } else {
          this.mode = 'glide'; this.glider.visible = true;
          G.audio.play('glide');
          if (!G.save.flags.glided) { G.save.flags.glided = true; G.ui.toast('Gliding! Steer with the mouse · W dive · S flare · ride updrafts & fire heat', 4.5); }
        }
      }
      if (!this.onGround) this.vel.y -= gravity * dt;
      // updrafts also push walkers upward a bit
      if (!this.onGround) { const l = this.liftAt(this.pos); if (l > 0) this.vel.y += l * 0.6 * dt; }
    }
    if (this.vel.y < -45) this.vel.y = -45;

    // ---- integrate
    this.pos.addScaledVector(this.vel, dt);

    // ---- walls
    const wallN = G.physics.collideWalls(this.pos, 0.42, 1.8);
    if (wallN) {
      // remove velocity into the wall
      const into = this.vel.x * wallN.x + this.vel.z * wallN.z;
      if (into < 0) { this.vel.x -= wallN.x * into; this.vel.z -= wallN.z * into; }
      if (this.mode === 'wallrun') this.wall.lost = 0;
      else if (this.mode === 'normal' && !this.onGround && this.wallCd <= 0 && inp.down('KeyW') && Math.hypot(this.vel.x, this.vel.z) > 3.5 && this.vel.y > -10) {
        this.mode = 'wallrun';
        this.wall = { normal: wallN.clone(), t: 0, lost: 0 };
        if (!G.save.flags.wallrun) { G.save.flags.wallrun = true; G.ui.toast('Wall-running! Hold W along walls · Space to wall-jump', 3.5); }
      }
    } else if (this.mode === 'wallrun') this.wall.lost += dt;

    // ---- ground
    const tol = this.onGround ? 0.75 : 0.3;
    const g = G.physics.groundAt(this.pos.x, Math.max(this.prev.y, this.pos.y), this.pos.z, tol);
    const wasGround = this.onGround;
    if (g && this.vel.y <= 0.01 && (this.pos.y <= g.h || (wasGround && this.pos.y - g.h < 0.9))) {
      // block walking off the ship's deck (jumping over the rail still works)
      if (wasGround && this.platform === G.ship && g.plat !== G.ship && g.h < this.prev.y - 0.9) this.blockStep();
      else {
        if (!wasGround) this.land(this.vel.y);
        this.pos.y = g.h;
        this.vel.y = 0;
        this.onGround = true; this.platform = g.plat;
        if (this.mode === 'glide' || this.mode === 'wallrun') { this.mode = 'normal'; this.glider.visible = false; }
      }
    } else if (wasGround && this.platform === G.ship && this.vel.y <= 0.01) {
      this.blockStep();
    } else {
      this.onGround = false;
    }
    if (!this.onGround) this.fallTime += dt; else this.fallTime = 0;

    // ---- fell into the storm
    const killY = G.storm && G.storm.active ? G.storm.origin.y - 160 : SEA_Y + 2;
    if (this.pos.y < killY) {
      this.hp = Math.max(1, this.hp - 20);
      G.ui.hurt(1);
      G.audio.play('thunder', 0.6);
      this.respawnOnShip('The Storm spat you back onto your ship!');
    }

    // ---- regen
    const regenDelay = save.questDone.includes('bram') ? 3 : 5;
    if (G.time - this.lastHurt > regenDelay) {
      let r = save.questDone.includes('bram') ? 8 : 4;
      if (this.platform === G.ship && G.ship.garden) r *= 3;
      this.hp = Math.min(this.maxHp, this.hp + r * dt);
    }

    // ---- recall ship
    if (inp.hit('KeyR')) this.recallShip();

    this.updateModel(dt, mv);
    if (this.ropeAnim) {
      this.ropeAnim.t -= dt;
      this.updateRope(this.ropeAnim.to);
      if (this.ropeAnim.t <= 0) { this.ropeAnim = null; this.rope.visible = this.hook.visible = false; }
    }
  }

  blockStep() {
    this.pos.x = this.prev.x; this.pos.z = this.prev.z;
    this.pos.y = this.prev.y;
    this.vel.x = 0; this.vel.z = 0; this.vel.y = 0;
    this.onGround = true;
  }

  land(vy) {
    const G = this.G;
    if (vy < -12) {
      G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 14, { additive: false, color: [0.75, 0.7, 0.6], speed: 4, size: 0.8, size1: 2, alpha: 0.5, life: 0.7 });
      G.audio.play('thud', 0.6);
    }
    if (vy < -34) this.damage(Math.round((-vy - 34) * 1.5));
  }

  liftAt(p) {
    const G = this.G;
    let lift = 0;
    for (const isl of G.islands.near(p, 60)) {
      for (const v of isl.vents) {
        const vx = isl.pos.x + v.x, vy = isl.pos.y + v.y, vz = isl.pos.z + v.z;
        if ((p.x - vx) ** 2 + (p.z - vz) ** 2 < v.radius * v.radius * 1.4 && p.y > vy - 1 && p.y < vy + v.height) {
          lift = Math.max(lift, 40);
          if (Math.random() < 0.3) G.particles.add.emit({ x: p.x + (Math.random() - 0.5) * 2, y: p.y - 1, z: p.z + (Math.random() - 0.5) * 2, vy: 10, color: [0.8, 0.95, 1], size: 0.25, life: 0.6 });
        }
      }
    }
    lift = Math.max(lift, G.combat.fireLiftAt(p));
    return lift;
  }

  recallShip() {
    const G = this.G;
    if (this.platform === G.ship) { G.ui.toast('You are already aboard', 1.5); return; }
    const d = this.pos.distanceTo(G.ship.pos);
    if (d < 30) { G.ui.toast('Your ship is right here', 1.5); return; }
    const off = new THREE.Vector3(Math.cos(this.camYaw) * 14, 0, -Math.sin(this.camYaw) * 14);
    const target = this.pos.clone().add(off);
    target.y = this.pos.y + 6;
    // keep it above any island surface below the target
    const g = G.physics.groundAt(target.x, target.y + 40, target.z, 0);
    if (g && g.plat !== G.ship) target.y = Math.max(target.y, g.h + 5);
    G.ship.autopilot = target;
    G.audio.play('click');
    G.ui.toast('📯 You whistle for your ship — it\'s on the way', 2.5);
  }

  updateRope(anchor) {
    const hand = this.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const d = anchor.clone().sub(hand);
    const len = d.length();
    this.rope.visible = true; this.hook.visible = true;
    this.rope.position.copy(hand);
    this.rope.scale.set(1, len, 1);
    this.rope.quaternion.setFromUnitVectors(UP, d.normalize());
    this.hook.position.copy(anchor);
    this.hook.quaternion.copy(this.rope.quaternion);
  }

  updateHelm(dt) {
    const G = this.G, inp = G.input;
    const ctrl = {
      throttle: (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0),
      turn: (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0),
      lift: (inp.down('Space') ? 1 : 0) - (inp.down('ShiftLeft') || inp.down('ShiftRight') || inp.down('KeyC') ? 1 : 0),
      boost: inp.down('KeyF'),
    };
    this.helmCtrl = ctrl;
    G.ship.toWorld(G.ship.helmPos, this.pos);
    this.vel.copy(G.ship.vel || this.vel);
    this.onGround = true; this.platform = G.ship;
    this.modelYaw = G.ship.yaw;
    this.updateModel(dt, new THREE.Vector3());
    const u = this.model.userData;
    u.armL.rotation.x = -1.2; u.armR.rotation.x = -1.2;
    const regen = 4;
    if (G.time - this.lastHurt > 5) this.hp = Math.min(this.maxHp, this.hp + regen * dt);
  }

  updateModel(dt, mv) {
    const G = this.G;
    const m = this.model;
    m.position.copy(this.pos);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let targetYaw = this.modelYaw;
    if (this.aiming || this.mode === 'glide') targetYaw = this.camYaw;
    else if (this.mode === 'wallrun' || this.mode === 'grapple') { if (hs > 1) targetYaw = Math.atan2(-this.vel.x, -this.vel.z); }
    else if (mv.lengthSq() > 0 && this.mode !== 'helm') targetYaw = Math.atan2(-mv.x, -mv.z);
    this.modelYaw += angleDiff(this.modelYaw, targetYaw) * (1 - Math.exp(-12 * dt));
    m.rotation.set(0, this.modelYaw, 0);
    if (this.mode === 'glide') { m.rotation.x = -0.35; this.glider.rotation.z = Math.sin(G.time * 3) * 0.04; this.glider.rotation.x = 0.35; }
    if (this.mode === 'wallrun') m.rotation.z = (this.wall.normal.x * Math.cos(this.modelYaw) - this.wall.normal.z * Math.sin(this.modelYaw)) * 0.35;
    this.walkPhase += dt * hs * 1.5;
    animatePerson(m, this.walkPhase, this.onGround ? Math.min(1, hs / 7) : 0.6, !this.onGround && this.mode !== 'helm', G.time);
    const u = m.userData;
    if (this.mode === 'glide' || this.mode === 'grapple') { u.armL.rotation.x = -2.9; u.armR.rotation.x = -2.9; u.armL.rotation.z = 0.2; u.armR.rotation.z = -0.2; }
    // bow pose
    const charge = G.combat.charge;
    if (this.aiming) {
      this.bow.position.set(-0.2, 1.45, -0.6); this.bow.rotation.set(0, Math.PI / 2, 0);
      u.armR.rotation.x = -1.57; u.armL.rotation.x = -1.57 + charge * 0.2;
      this.bowString.position.x = 0; this.bowString.position.z = 0;
      this.bowString.scale.set(1, 1, 1);
      this.bowString.position.y = 0;
      this.bowString.position.z = charge * 0.35;
    } else {
      this.bow.position.set(0, 1.3, 0.42); this.bow.rotation.set(0, Math.PI / 2, 0.3);
      this.bowString.position.z = 0;
    }
    m.visible = !(this.camActual !== undefined && this.camActual < 1.3 && this.mode !== 'helm');
  }

  updateCamera(dt) {
    const G = this.G, cam = G.camera;
    const helm = this.mode === 'helm';
    let target, dist, fov;
    if (helm) {
      target = G.ship.pos.clone().add(new THREE.Vector3(0, 7, 0));
      dist = 30 + Math.abs(G.ship.speed) * 0.2;
      fov = 68 + Math.abs(G.ship.speed) * 0.2 + (G.ship.boosting ? 10 : 0);
    } else {
      target = this.pos.clone().add(new THREE.Vector3(0, 1.75, 0));
      dist = this.mode === 'glide' ? 8.5 : this.aiming ? 3.6 : 6.5;
      fov = this.mode === 'glide' ? 74 + Math.min(12, this.vel.length() * 0.4) : this.aiming ? 56 : this.mode === 'grapple' ? 78 : 70;
      if (this.aiming || this.mode === 'glide') {
        const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
        target.addScaledVector(right, this.aiming ? 0.95 : 0.4);
      }
    }
    this.camDist = damp(this.camDist, dist, 8, dt);
    this.fov = damp(this.fov, fov, 6, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const back = new THREE.Vector3(Math.sin(this.camYaw) * cp, sp, Math.cos(this.camYaw) * cp);
    let d = this.camDist;
    // keep the camera above whatever surface is beneath it (raise rather than zoom in)
    let desired = target.clone().addScaledVector(back, d);
    if (!helm) {
      const g = G.physics.groundAt(desired.x, target.y + 0.5, desired.z, 0);
      if (g && desired.y < g.h + 0.7 && g.h > target.y - 6) {
        desired.y = g.h + 0.7;
        back.subVectors(desired, target);
        d = back.length(); back.divideScalar(d || 1);
      }
    }
    // camera collision with terrain and the ship
    const meshes = G.islands.meshesNear(target, d + 5);
    if (G.storm && G.storm.active) meshes.push(...G.storm.raycastMeshes());
    if (!helm) for (const m of G.ship.raycastMeshes) if (m !== G.ship.balloon) meshes.push(m);
    if (meshes.length) {
      this.ray.set(target, back); this.ray.far = d + 0.5;
      const hit = this.ray.intersectObjects(meshes, false)[0];
      if (hit) d = Math.max(0.8, hit.distance - 0.4);
    }
    desired = target.clone().addScaledVector(back, d);
    this.camActual = d;
    if (!this.camInit) { this.camPos.copy(desired); this.camInit = true; }
    // follow tightly (platforms move) but smooth jitter
    this.camPos.lerp(desired, 1 - Math.exp(-25 * dt));
    cam.position.copy(this.camPos);
    if (G.cameraShake > 0) {
      const s = G.cameraShake * 0.5;
      cam.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
      G.cameraShake = Math.max(0, G.cameraShake - dt * 1.5);
    }
    cam.lookAt(target);
    if (this.mode === 'wallrun') cam.rotateZ((this.wall.normal.x * Math.cos(this.camYaw) - this.wall.normal.z * Math.sin(this.camYaw)) * -0.12);
  }
}
