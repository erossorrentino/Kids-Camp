/**
 * WORLD MARKERS
 * ------------------------------------------------------------------
 * Screen-space overlays anchored to things in the world: enemy and ally
 * nameplates, objective waypoints, lock diamonds, floating damage
 * numbers and a damage-direction ring.
 *
 * All of it is pooled DOM. Projecting a handful of points per frame and
 * moving divs is far cheaper than any in-scene sprite approach, and it
 * gets crisp text for free.
 */
import * as THREE from 'three';
import { clamp, lerp } from '../core/rng.js';

const MAX_PLATES = 16;
const MAX_NUMBERS = 28;
const MAX_ARROWS = 8;

export class Markers {
  constructor(camera) {
    this.camera = camera;
    this.root = document.createElement('div');
    this.root.id = 'markers';
    document.body.appendChild(this.root);

    this.plates = [];
    for (let i = 0; i < MAX_PLATES; i++) {
      const el = document.createElement('div');
      el.className = 'plate';
      el.innerHTML = `<div class="pl-name"></div>
        <div class="pl-bar"><i></i></div>
        <div class="pl-sub"></div>`;
      el.style.display = 'none';
      this.root.appendChild(el);
      this.plates.push({ el, name: el.querySelector('.pl-name'), bar: el.querySelector('.pl-bar i'), sub: el.querySelector('.pl-sub') });
    }

    this.numbers = [];
    for (let i = 0; i < MAX_NUMBERS; i++) {
      const el = document.createElement('div');
      el.className = 'dmgnum';
      el.style.display = 'none';
      this.root.appendChild(el);
      this.numbers.push({ el, life: 0, pos: new THREE.Vector3(), drift: new THREE.Vector3() });
    }
    this.numHead = 0;

    this.arrows = [];
    for (let i = 0; i < MAX_ARROWS; i++) {
      const el = document.createElement('div');
      el.className = 'dmgarrow';
      el.style.display = 'none';
      this.root.appendChild(el);
      this.arrows.push({ el, life: 0, angle: 0, amount: 0 });
    }
    this.arrowHead = 0;

    this.waypoints = [];
    for (let i = 0; i < 6; i++) {
      const el = document.createElement('div');
      el.className = 'waypoint';
      el.innerHTML = '<span class="wp-name"></span><span class="wp-dist"></span>';
      el.style.display = 'none';
      this.root.appendChild(el);
      this.waypoints.push({ el, name: el.querySelector('.wp-name'), dist: el.querySelector('.wp-dist') });
    }

    this.visible = true;
    this.showNumbers = true;
    this.showPlates = true;
    this._v = new THREE.Vector3();
  }

  setVisible(v) {
    this.visible = v;
    this.root.style.display = v ? '' : 'none';
  }

  /** Spawn a floating damage number at a world position. */
  damage(pos, amount, kind = 'hit') {
    if (!this.showNumbers) return;
    const rec = this.numbers[this.numHead];
    this.numHead = (this.numHead + 1) % this.numbers.length;
    rec.life = kind === 'kill' ? 1.6 : 1.0;
    rec.max = rec.life;
    rec.pos.copy(pos);
    rec.drift.set((Math.random() - 0.5) * 3, 6 + Math.random() * 3, (Math.random() - 0.5) * 3);
    rec.el.textContent = kind === 'kill' ? 'DESTROYED' : Math.round(amount);
    rec.el.className = 'dmgnum ' + kind;
    rec.el.style.display = '';
  }

  /** Flash a ring segment pointing at where a hit came from. */
  incoming(angleRad, amount) {
    // Reuse the arrow already pointing this way if there is one: a burst of
    // machine-gun fire should pulse one marker, not stack eight.
    let rec = this.arrows.find(a => a.life > 0 && Math.abs(shortest(a.angle, angleRad)) < 0.4);
    if (!rec) {
      rec = this.arrows[this.arrowHead];
      this.arrowHead = (this.arrowHead + 1) % this.arrows.length;
      rec.amount = 0;
    }
    rec.angle = angleRad;
    rec.life = 1.1;
    rec.amount = Math.min(400, rec.amount + amount);
    rec.el.style.display = '';
  }

  /* ---------------------------------------------------------------- */
  update(dt, match, playerMech, controller) {
    if (!this.visible) return;
    const cam = this.camera;
    cam.updateMatrixWorld();

    this._updatePlates(match, playerMech);
    this._updateWaypoints(match, playerMech);
    this._updateNumbers(dt);
    this._updateArrows(dt, playerMech);
  }

  _project(pos) {
    const v = this._v.copy(pos).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * innerWidth,
      y: (-v.y * 0.5 + 0.5) * innerHeight,
      z: v.z,
    };
  }

  _updatePlates(match, me) {
    let i = 0;
    if (me && this.showPlates) {
      const now = match.time;
      // Sort by distance so the nearest contacts always get a plate.
      const candidates = match.aliveMechs()
        .filter(o => o !== me)
        .map(o => ({ o, d: o.position.distanceTo(me.position) }))
        .sort((a, b) => a.d - b.d);

      for (const { o, d } of candidates) {
        if (i >= this.plates.length) break;
        const hostile = o.team !== me.team;

        // Hostiles need to be seen or revealed; allies are always tagged.
        if (hostile) {
          if (d > me.sensorRange * 1.4) continue;
          const known = o.revealedUntil > now || o.taggedUntil > now
            || (!o.radarHidden && !o.cloaked && match.world.lineOfSight(
              me.eyePosition(_a), _b.copy(o.position).setY(o.position.y + o.height * 0.5), o.radius * 0.8));
          if (!known) continue;
        } else if (d > 500) continue;

        const head = _b.copy(o.position).setY(o.position.y + o.height * 1.06);
        const p = this._project(head);
        if (!p) continue;

        const rec = this.plates[i++];
        rec.el.style.display = '';
        rec.el.style.transform = `translate(-50%,-100%) translate(${p.x.toFixed(0)}px,${p.y.toFixed(0)}px)`;
        rec.el.className = 'plate ' + (hostile ? 'hostile' : 'ally')
          + (o === me.lockedTarget ? ' locked' : '')
          + (o.juggernaut ? ' jugg' : '');
        // Fade with distance so a busy skyline does not become a wall of text.
        rec.el.style.opacity = clamp(1.15 - d / (me.sensorRange * 1.4), 0.25, 1).toFixed(2);
        rec.name.textContent = o.name;
        rec.bar.style.transform = `scaleX(${o.healthFraction.toFixed(3)})`;
        rec.bar.className = o.healthFraction < 0.3 ? 'crit' : o.healthFraction < 0.6 ? 'low' : '';
        rec.sub.textContent = `${o.chassis.name} · ${Math.round(d)}m`;
      }
    }
    for (; i < this.plates.length; i++) this.plates[i].el.style.display = 'none';
  }

  _updateWaypoints(match, me) {
    let i = 0;
    const show = match.mode.objective === 'points' || match.mode.objective === 'king';
    if (show && me) {
      for (let z = 0; z < match.zones.length; z++) {
        const zone = match.zones[z];
        if (match.mode.objective === 'king' && z !== match.activeZone) continue;
        if (i >= this.waypoints.length) break;
        const rec = this.waypoints[i++];
        const top = _b.copy(zone.pos).setY(zone.pos.y + 26);
        const p = this._project(top);
        const d = me.position.distanceTo(zone.pos);

        rec.el.style.display = '';
        rec.name.textContent = zone.name;
        rec.dist.textContent = `${Math.round(d)}m`;
        rec.el.className = 'waypoint ' + (zone.owner === me.team ? 'ours' : zone.owner ? 'theirs' : 'neutral')
          + (zone.contested ? ' contested' : '');

        if (p) {
          rec.el.style.transform = `translate(-50%,-100%) translate(${clamp(p.x, 40, innerWidth - 40).toFixed(0)}px,${clamp(p.y, 90, innerHeight - 140).toFixed(0)}px)`;
          rec.el.classList.toggle('offscreen', p.x < 0 || p.x > innerWidth || p.y < 0 || p.y > innerHeight);
        } else {
          // Behind the camera: pin it to the bottom edge on the correct side.
          const toZone = _a.subVectors(zone.pos, me.position);
          const right = toZone.x * Math.cos(me.aimYaw) - toZone.z * Math.sin(me.aimYaw);
          rec.el.style.transform = `translate(-50%,-100%) translate(${right > 0 ? innerWidth - 60 : 60}px,${(innerHeight - 150).toFixed(0)}px)`;
          rec.el.classList.add('offscreen');
        }
      }
    }
    for (; i < this.waypoints.length; i++) this.waypoints[i].el.style.display = 'none';
  }

  _updateNumbers(dt) {
    for (const rec of this.numbers) {
      if (rec.life <= 0) { if (rec.el.style.display !== 'none') rec.el.style.display = 'none'; continue; }
      rec.life -= dt;
      rec.pos.addScaledVector(rec.drift, dt);
      rec.drift.y -= 5 * dt;
      const p = this._project(rec.pos);
      if (!p) { rec.el.style.display = 'none'; continue; }
      const t = rec.life / rec.max;
      rec.el.style.display = '';
      rec.el.style.opacity = clamp(t * 1.6, 0, 1).toFixed(2);
      const scale = lerp(0.85, 1.25, clamp((1 - t) * 3, 0, 1));
      rec.el.style.transform = `translate(-50%,-50%) translate(${p.x.toFixed(0)}px,${p.y.toFixed(0)}px) scale(${scale.toFixed(2)})`;
      if (rec.life <= 0) rec.el.style.display = 'none';
    }
  }

  _updateArrows(dt, me) {
    for (const rec of this.arrows) {
      if (rec.life <= 0) { if (rec.el.style.display !== 'none') rec.el.style.display = 'none'; continue; }
      rec.life -= dt;
      if (rec.life <= 0) { rec.el.style.display = 'none'; continue; }
      // Rotate into view space so the marker points where the hit came from
      // relative to where the player is currently looking.
      const rel = me ? shortest(me.aimYaw, rec.angle) : rec.angle;
      rec.el.style.opacity = clamp(rec.life / 1.1, 0, 1).toFixed(2);
      rec.el.style.transform = `translate(-50%,-50%) rotate(${(rel * 180 / Math.PI).toFixed(1)}deg)`;
      rec.el.style.setProperty('--sev', clamp(rec.amount / 300, 0.25, 1).toFixed(2));
    }
  }

  dispose() { this.root.remove(); }
}

function shortest(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
