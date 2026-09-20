/* Star Kingdoms — the galaxy. A real flyable scene: you pilot the
   starship between five worlds rather than picking one off a menu. */
(function (SK) {
  'use strict';
  const U = SK.util;
  const B = SK.build;
  const D = SK.data;

  /* Paint a planet globe from its own palette so the map and the
     surface you land on visibly belong to the same world. */
  function planetTexture(planet) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    const T = planet.terrain;
    const hex = (v) => '#' + ('000000' + v.toString(16)).slice(-6);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, hex(T.peak));
    g.addColorStop(0.22, hex(T.high));
    g.addColorStop(0.5, hex(T.mid));
    g.addColorStop(0.78, hex(T.high));
    g.addColorStop(1, hex(T.peak));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);

    const n = U.makeNoise(planet.seed);
    // continents
    const img = ctx.getImageData(0, 0, 512, 256);
    const dt = img.data;
    const lowC = new THREE.Color(T.low), midC = new THREE.Color(T.mid);
    const seaC = T.water ? new THREE.Color(T.water.color) : new THREE.Color(T.low);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 512; x++) {
        const i = (y * 512 + x) * 4;
        const v = n.fbm(x * 0.017, y * 0.017, 5) + n.ridged(x * 0.04, y * 0.04, 3) * 0.28;
        const lat = Math.abs(y - 128) / 128;
        let col;
        if (T.water && v < -0.06) col = seaC;
        else if (v < 0.04) col = lowC;
        else col = midC;
        const shade = 0.72 + v * 0.55 + (1 - lat) * 0.16;
        dt[i] = U.clamp(dt[i] * 0.35 + col.r * 255 * shade, 0, 255);
        dt[i + 1] = U.clamp(dt[i + 1] * 0.35 + col.g * 255 * shade, 0, 255);
        dt[i + 2] = U.clamp(dt[i + 2] * 0.35 + col.b * 255 * shade, 0, 255);
      }
    }
    ctx.putImageData(img, 0, 0);

    // cloud band / storm swirl
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 90; i++) {
      const y = U.rand(0, 256);
      ctx.beginPath();
      ctx.ellipse(U.rand(0, 512), y, U.rand(24, 90), U.rand(3, 11), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ================================================================== */
  function Galaxy(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.t = 0;
    this.nodes = [];
    this._v = new THREE.Vector3();
    this.nearest = null;

    /* starfield */
    const sg = new THREE.BufferGeometry();
    const n = 2600;
    const sp = new Float32Array(n * 3);
    const sc = new Float32Array(n * 3);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(U.rand(-1, 1), U.rand(-1, 1), U.rand(-1, 1)).normalize()
        .multiplyScalar(U.rand(700, 1400));
      sp[i * 3] = v.x; sp[i * 3 + 1] = v.y; sp[i * 3 + 2] = v.z;
      col.setHSL(U.rand(0.5, 0.72), U.rand(0.1, 0.6), U.rand(0.6, 1));
      sc[i * 3] = col.r; sc[i * 3 + 1] = col.g; sc[i * 3 + 2] = col.b;
    }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
      size: 4.5, vertexColors: true, map: SK.World.softDot(0xffffff),
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
      depthWrite: false, sizeAttenuation: true
    })));

    // nebula wash
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: SK.World.softDot(0xffffff),
        color: B.SRGB([0x4a2fa0, 0xa02f80, 0x2f5aa0, 0x7a2fd0][i % 4]),
        transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      s.scale.setScalar(U.rand(400, 950));
      const a = U.rand(0, U.TAU);
      s.position.set(Math.cos(a) * U.rand(500, 900), U.rand(-300, 400), Math.sin(a) * U.rand(500, 900));
      this.scene.add(s);
    }

    /* central star */
    const star = new THREE.Mesh(B.sphere(20, 24), new THREE.MeshBasicMaterial({ color: B.SRGB(0xffe9a0) }));
    this.scene.add(star);
    for (let i = 0; i < 3; i++) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: SK.World.softDot(0xffffff), color: B.SRGB([0xffe08a, 0xff9a4a, 0xffd0a0][i]),
        transparent: true, opacity: 0.3 - i * 0.08, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      halo.scale.setScalar(52 + i * 36);
      this.scene.add(halo);
    }
    const starLight = new THREE.PointLight(0xfff0c0, 1.5, 1600, 0.9);
    this.scene.add(starLight);
    this.scene.add(new THREE.AmbientLight(0x46567c, 0.7));
    const fill = new THREE.DirectionalLight(0x9ab4e0, 0.55);
    fill.position.set(-1, 0.6, -0.5);
    this.scene.add(fill);
    const fill2 = new THREE.DirectionalLight(0xc0d4ff, 0.3);
    fill2.position.set(0.6, 0.8, 1);
    this.scene.add(fill2);
    this.star = star;

    /* planets */
    const radii = [110, 175, 245, 320, 400];
    D.PLANETS.forEach((p, i) => {
      const grp = new THREE.Group();
      const R = 13 + i * 1.6;
      const globe = new THREE.Mesh(B.sphere(R, 32), new THREE.MeshStandardMaterial({
        map: planetTexture(p), roughness: 0.95, metalness: 0.0
      }));
      grp.add(globe);
      // atmosphere shell
      const atmo = new THREE.Mesh(B.sphere(R * 1.13, 26), new THREE.MeshBasicMaterial({
        color: B.SRGB(p.sky.horizon), transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false
      }));
      grp.add(atmo);
      // approach ring: the thing you actually fly into
      const ring = new THREE.Mesh(B.ring(R * 2.1, R * 2.15), new THREE.MeshBasicMaterial({
        color: B.SRGB(p.faction.trim), transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
      }));
      ring.rotation.x = -Math.PI / 2 + 0.35;
      grp.add(ring);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * U.TAU;
        const bcn = new THREE.Mesh(B.ico(R * 0.07, 0), new THREE.MeshBasicMaterial({
          color: B.SRGB(p.faction.trim), transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        bcn.position.set(Math.cos(a) * R * 2.12, 0, Math.sin(a) * R * 2.12);
        ring.add(bcn);
        bcn.position.set(Math.cos(a) * R * 2.12, Math.sin(a) * R * 2.12, 0);
      }
      if (i === 4) {
        const dust = new THREE.Mesh(B.ring(R * 1.55, R * 1.92), new THREE.MeshBasicMaterial({
          color: B.SRGB(0xc46bff), transparent: true, opacity: 0.18,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
        }));
        dust.rotation.x = -Math.PI / 2 + 0.6;
        grp.add(dust);
      }
      if (i === 2) {
        const moon = new THREE.Mesh(B.sphere(3.4, 14), new THREE.MeshStandardMaterial({ color: B.SRGB(0x9aa6b4), roughness: 1 }));
        moon.position.set(R * 2.0, 3, 0);
        grp.add(moon);
        grp.userData.moon = moon;
      }
      this.scene.add(grp);
      this.nodes.push({
        planet: p, group: grp, globe: globe, ring: ring, atmo: atmo,
        orbitR: radii[i], angle: (i / 5) * U.TAU + 0.6, speed: 0.045 / (1 + i * 0.45),
        radius: R, pos: new THREE.Vector3()
      });
    });

    /* your ship */
    this.ship = B.buildStarship({ body: 0xdfe8f4, trim: 0x35e0ff });
    this.ship.group.scale.setScalar(1.0);
    this.scene.add(this.ship.group);
    this.shipPos = new THREE.Vector3(0, 12, 0);
    this.shipQuat = new THREE.Quaternion();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.speed = 22;
    this.camPos = new THREE.Vector3();
    this.camQuat = new THREE.Quaternion();
    this.trail = [];
  }

  Galaxy.prototype.enter = function (currentPlanetId) {
    const node = this.nodes.find((n) => n.planet.id === currentPlanetId) || this.nodes[0];
    this.updateOrbits(0);
    // start just outside the world you were on, pointed at the star
    const off = node.pos.clone().normalize().multiplyScalar(node.radius * 3.2);
    this.shipPos.copy(node.pos).add(off).add(new THREE.Vector3(0, node.radius, 0));
    this.yaw = Math.atan2(-this.shipPos.x, -this.shipPos.z);
    this.pitch = 0; this.roll = 0;
    this.speed = 26;
    this.camQuat.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camPos.copy(this.shipPos).add(new THREE.Vector3(0, 1.8, -13).applyQuaternion(this.camQuat));
    this.trail.length = 0;
    SK.Audio.setAmbient(58.3, true);
  };

  Galaxy.prototype.updateOrbits = function (dt) {
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      n.angle += n.speed * dt;
      n.pos.set(Math.cos(n.angle) * n.orbitR, Math.sin(n.angle * 0.6) * 12, Math.sin(n.angle) * n.orbitR);
      n.group.position.copy(n.pos);
      n.globe.rotation.y += dt * 0.09;
      if (n.group.userData.moon) {
        const a = this.t * 0.5 + i;
        n.group.userData.moon.position.set(Math.cos(a) * n.radius * 2.1, 3, Math.sin(a) * n.radius * 2.1);
      }
    }
  };

  Galaxy.prototype.update = function (dt, input, camera) {
    this.t += dt;
    this.updateOrbits(dt);

    const st = input.state;
    const mouse = input.consumeMouse();
    const hangar = this.game.state.buildings.hangar || 0;
    const tune = 1 + hangar * 0.07;

    // flight: mouse aims, W/S throttle, A/D roll, Space boosts
    this.yaw -= mouse.dx * 0.0022;
    this.pitch = U.clamp(this.pitch - mouse.dy * 0.0018, -1.2, 1.2);
    let rollInput = 0;
    if (st.left) rollInput += 1;
    if (st.right) rollInput -= 1;
    this.yaw += rollInput * dt * 0.7;
    this.roll = U.damp(this.roll, rollInput * 0.55, 5, dt);

    const boost = st.jump || st.sprint;
    const target = (st.forward ? 78 : st.back ? 8 : 34) * tune * (boost ? 1.9 : 1);
    this.speed = U.damp(this.speed, target, 1.6, dt);

    const e = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    this.shipQuat.setFromEuler(e);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.shipQuat);
    this.shipPos.addScaledVector(fwd, this.speed * dt);

    // soft boundary: the star's gravity well and the rim of the system
    const d = this.shipPos.length();
    if (d > 620) this.shipPos.multiplyScalar(620 / d);
    if (d < 40) this.shipPos.multiplyScalar(40 / d);

    this.ship.group.position.copy(this.shipPos);
    this.ship.group.quaternion.copy(this.shipQuat);
    this.ship.group.rotateY(Math.PI);   // model nose points -Z

    const load = U.clamp(this.speed / 90, 0, 1);
    this.ship.flames.forEach((f) => {
      f.scale.set(0.7 + load * 0.6, 0.7 + load * 0.6, 0.5 + load * 2.6);
      f.material.opacity = 0.4 + load * 0.5;
    });
    if (Math.random() < dt * 40 * load) {
      this.game.fx.dust(this.shipPos.clone().addScaledVector(fwd, -5), 0x7fd8ff, 0.8 + load);
    }

    /* chase camera */
    const back = new THREE.Vector3(0, 2.2, -14).applyQuaternion(this.shipQuat);
    this.camPos.lerp(this._v.copy(this.shipPos).add(back), 1 - Math.exp(-7 * dt));
    this.camQuat.slerp(this.shipQuat, 1 - Math.exp(-9 * dt));
    camera.position.copy(this.camPos);
    camera.quaternion.copy(this.camQuat);
    camera.rotateY(Math.PI);

    /* nearest world */
    let best = null, bestD = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const dd = this.shipPos.distanceTo(n.pos);
      const inRange = dd < n.radius * 3.0;
      n.ring.material.opacity = inRange ? 0.42 + Math.sin(this.t * 5) * 0.14 : 0.18;
      n.ring.rotation.z += dt * (inRange ? 0.9 : 0.25);
      if (dd < bestD) { bestD = dd; best = n; }
    }
    this.nearest = (best && bestD < best.radius * 3.0) ? best : null;
    this.nearestDist = bestD;
  };

  SK.Galaxy = Galaxy;
  SK.planetTexture = planetTexture;
})(window.SK);
