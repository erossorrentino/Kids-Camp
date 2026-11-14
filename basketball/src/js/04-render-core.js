'use strict';
/* ============================================================
   Render core: renderer, quality tiers, HDR post-processing
   (bloom, ACES, grade, vignette, grain, letterbox), planar
   floor reflections, lighting and the broadcast camera.
   Reads simulation state, never writes it.
   ============================================================ */

const R = { ready: false, players: [], prev: null, alpha: 1, slowmo: 0, slowSide: 0, shake: 0, camMode: 'broadcast', excite: 0,
  flash: 0, cine: 0, quality: 'high', t: 0, wave: -9, flashRate: 0 };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const FONT_D = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif';
const PI = Math.PI;
const vr = Math.random;
const vrr = (a, b) => a + (b - a) * Math.random();

function stdMat(color, rough, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough == null ? 0.7 : rough, metalness: 0 }, extra || {}));
}
function hdrBasic(color, k, extra) {
  const c = new THREE.Color(color).multiplyScalar(k);
  return new THREE.MeshBasicMaterial(Object.assign({ color: c, toneMapped: false }, extra || {}));
}
function canvasTex(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  if (srgb !== false) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = R.maxAniso || 4;
  return t;
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function shade(hex, f) {
  const c = new THREE.Color(hex);
  if (f >= 0) c.lerp(new THREE.Color('#ffffff'), f); else c.multiplyScalar(1 + f);
  return '#' + c.getHexString();
}
function mergeGeos(list) {
  let nv = 0, ni = 0;
  const hasUV = list.every((g) => g.attributes.uv), hasCol = list.some((g) => g.attributes.color);
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  const uv = hasUV ? new Float32Array(nv * 2) : null, col = hasCol ? new Float32Array(nv * 3) : null;
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3);
    if (uv) uv.set(g.attributes.uv.array, vo * 2);
    if (col) { if (g.attributes.color) col.set(g.attributes.color.array, vo * 3); else col.fill(1, vo * 3, (vo + n) * 3); }
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
function tintGeo(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/* ---------------- setup ---------------- */
function initRender(canvas, quality) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  R.r = r; R.gl2 = r.capabilities.isWebGL2; R.maxAniso = r.capabilities.getMaxAnisotropy();
  R.mobile = Math.min(innerWidth, innerHeight) < 600 || /Android|iPhone|iPad/i.test(navigator.userAgent);
  let hf = false;
  try {
    hf = R.gl2 ? !!(r.extensions.get('EXT_color_buffer_float') || r.extensions.get('EXT_color_buffer_half_float'))
      : !!(r.extensions.get('OES_texture_half_float') && r.extensions.get('EXT_color_buffer_half_float'));
  } catch (e) { hf = false; }
  R.hdrType = hf ? THREE.HalfFloatType : THREE.UnsignedByteType;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.shadowMap.autoUpdate = false;
  R.scene = new THREE.Scene();
  R.scene.background = new THREE.Color('#04060a');
  R.scene.fog = new THREE.Fog('#04060a', 160, 420);
  R.cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.8, 900);
  R.cam.position.set(0, 36, 60);
  R.camLook = V3(0, 3, 0); R.camPos = R.cam.position.clone();
  buildEnv();
  buildLights();
  initReflection();
  buildArena();
  buildHoops();
  buildBall();
  buildIndicators();
  buildFX();
  initPost();
  setQuality(quality || 'high');
  R.ready = true;
}

/* high: HDR post, bloom, reflections, 2K shadows, MSAA.
   medium: same pipeline at lower resolution with cheaper reflections.
   low: direct render, no shadow map or reflections, 1x pixels. */
function setQuality(q) {
  const r = R.r;
  R.quality = q;
  const post = q !== 'low';
  r.toneMapping = post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.12;
  r.outputEncoding = post ? THREE.LinearEncoding : THREE.sRGBEncoding;
  r.shadowMap.enabled = q !== 'low';
  const ms = q === 'high' ? 2048 : 1024;
  if (R.key.shadow.mapSize.x !== ms) {
    R.key.shadow.mapSize.set(ms, ms);
    if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; }
  }
  const dpr = devicePixelRatio || 1;
  const w = Math.max(320, innerWidth);
  R.dpr = q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.25, 1920 / w) : Math.min(dpr, R.mobile ? 1.5 : 2, 2560 / w);
  R.dpr = Math.max(0.5, R.dpr);
  r.setPixelRatio(R.dpr);
  R.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
  if (R.floorMat) R.floorMat.needsUpdate = true;
  resizeRender();
}
function resizeRender() {
  if (!R.r) return;
  const w = innerWidth, h = innerHeight;
  R.r.setSize(w, h, false);
  R.cam.aspect = w / h;
  R.cam.updateProjectionMatrix();
  const bw = Math.max(2, Math.floor(w * R.dpr)), bh = Math.max(2, Math.floor(h * R.dpr));
  resizePost(bw, bh);
  const rs = R.quality === 'high' ? 0.5 : 0.33;
  R.reflRT.setSize(Math.max(2, Math.floor(bw * rs)), Math.max(2, Math.floor(bh * rs)));
  if (R.floorU) R.floorU.reflTexel.value.set(1 / R.reflRT.width, 1 / R.reflRT.height);
}

/* ---------------- environment & lights ---------------- */
function buildEnv() {
  // a dark arena with a bright light rig and warm LED bands, prefiltered for glossy reflections
  const pm = new THREE.PMREMGenerator(R.r);
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(260, 120, 200), new THREE.MeshBasicMaterial({ color: '#0b0d12', side: THREE.BackSide }));
  room.position.y = 40; s.add(room);
  const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(6) });
  for (let i = -3; i <= 3; i++) for (const z of [-26, 0, 26]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 4), lm);
    l.position.set(i * 16, 85, z); s.add(l);
  }
  const ring = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8c3a').multiplyScalar(1.4) });
  for (const z of [-90, 90]) { const b = new THREE.Mesh(new THREE.BoxGeometry(240, 3, 1), ring); b.position.set(0, 24, z); s.add(b); }
  for (const x of [-120, 120]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 180), ring); b.position.set(x, 24, 0); s.add(b); }
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(100, 56), new THREE.MeshBasicMaterial({ color: new THREE.Color('#c08a50').multiplyScalar(0.9) }));
  floorGlow.rotation.x = -PI / 2; floorGlow.position.y = -15; s.add(floorGlow);
  R.env = pm.fromScene(s, 0.035).texture;
  R.scene.environment = R.env;
  pm.dispose();
}
function buildLights() {
  R.hemi = new THREE.HemisphereLight('#c9d4ff', '#2a1d12', 0.26);
  R.scene.add(R.hemi);
  // the key: one big overhead spot that pools light on the court and leaves the bowl darker
  const key = new THREE.SpotLight('#fff3e2', 1.05, 0, 0.62, 0.55, 0);
  key.position.set(6, 110, 22);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 60; key.shadow.camera.far = 160;
  key.shadow.bias = -0.00012; key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  R.scene.add(key); R.scene.add(key.target);
  R.key = key;
  // broadcast fill from the camera side, and a cool rim light from behind for player silhouettes
  const fill = new THREE.DirectionalLight('#ffe9d2', 0.26); fill.position.set(0, 40, 80); R.scene.add(fill);
  const rim = new THREE.DirectionalLight('#9fc2ff', 0.42); rim.position.set(-20, 30, -80); R.scene.add(rim);
  const bowl = new THREE.PointLight('#ffb070', 0.32, 220, 1.6); bowl.position.set(0, 60, 0); R.scene.add(bowl);
  R.fill = fill; R.rimL = rim; R.bowlL = bowl;
}

/* ---------------- planar reflection ---------------- */
function initReflection() {
  R.reflRT = new THREE.WebGLRenderTarget(4, 4, { type: R.hdrType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  R.reflRT.texture.generateMipmaps = false;
  R.reflCam = new THREE.PerspectiveCamera();
  R.texMatrix = new THREE.Matrix4();
  R.reflHide = [];
}
const _rf = { f: new THREE.Vector3(), u: new THREE.Vector3(), t: new THREE.Vector3() };
function renderReflection() {
  const cam = R.cam, rc = R.reflCam, r = R.r;
  rc.fov = cam.fov; rc.aspect = cam.aspect; rc.near = cam.near; rc.far = cam.far;
  rc.position.set(cam.position.x, -cam.position.y, cam.position.z);
  _rf.f.set(0, 0, -1).applyQuaternion(cam.quaternion); _rf.f.y = -_rf.f.y;
  _rf.u.set(0, 1, 0).applyQuaternion(cam.quaternion); _rf.u.y = -_rf.u.y;
  rc.up.copy(_rf.u);
  _rf.t.copy(rc.position).add(_rf.f);
  rc.lookAt(_rf.t);
  rc.updateMatrixWorld(); rc.updateProjectionMatrix();
  R.texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  R.texMatrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
  const hidden = [];
  for (const o of R.reflHide) if (o.visible) { o.visible = false; hidden.push(o); }
  for (const h of R.players) if (h.blob.visible) { h.blob.visible = false; hidden.push(h.blob); }
  if (R.refs) for (const r of R.refs) if (r.h.blob.visible) { r.h.blob.visible = false; hidden.push(r.h.blob); }
  if (R.reflOnly) for (const o of R.reflOnly) o.visible = true;
  const fog = R.scene.fog; R.scene.fog = null;
  r.setRenderTarget(R.reflRT);
  r.clear();
  r.render(R.scene, rc);
  R.scene.fog = fog;
  for (const o of hidden) o.visible = true;
  if (R.reflOnly) for (const o of R.reflOnly) o.visible = false;
}

/* ---------------- post-processing ---------------- */
const PP_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function ppMat(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: PP_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
}
function initPost() {
  const P = R.pp = { levels: 6 };
  P.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  P.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  P.quad.frustumCulled = false;
  P.scene = new THREE.Scene(); P.scene.add(P.quad);
  const o = { type: R.hdrType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
  if (R.gl2 && THREE.WebGLMultisampleRenderTarget) { P.main = new THREE.WebGLMultisampleRenderTarget(4, 4, { type: R.hdrType, format: THREE.RGBAFormat, stencilBuffer: false }); P.main.samples = 4; }
  else P.main = new THREE.WebGLRenderTarget(4, 4, { type: R.hdrType, format: THREE.RGBAFormat, stencilBuffer: false });
  P.main.texture.generateMipmaps = false;
  P.down = []; P.up = [];
  for (let i = 0; i < P.levels; i++) { P.down.push(new THREE.WebGLRenderTarget(4, 4, o)); P.up.push(new THREE.WebGLRenderTarget(4, 4, o)); }
  P.mPre = ppMat(`
    uniform sampler2D tex; uniform vec2 texel; uniform float threshold; uniform float knee; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tex, vUv + texel * vec2(-0.5,-0.5)).rgb + texture2D(tex, vUv + texel * vec2(0.5,-0.5)).rgb
             + texture2D(tex, vUv + texel * vec2(-0.5,0.5)).rgb + texture2D(tex, vUv + texel * vec2(0.5,0.5)).rgb;
      c *= 0.25;
      c = min(c, vec3(40.0));
      float br = max(c.r, max(c.g, c.b));
      float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
      soft = soft * soft / (4.0 * knee + 1e-4);
      float w = max(soft, br - threshold) / max(br, 1e-4);
      gl_FragColor = vec4(c * w, 1.0);
    }`, { tex: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.15 }, knee: { value: 0.5 } });
  P.mDown = ppMat(`
    uniform sampler2D tex; uniform vec2 texel; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tex, vUv).rgb * 4.0;
      c += texture2D(tex, vUv + texel * vec2(-1.0,-1.0)).rgb;
      c += texture2D(tex, vUv + texel * vec2( 1.0,-1.0)).rgb;
      c += texture2D(tex, vUv + texel * vec2(-1.0, 1.0)).rgb;
      c += texture2D(tex, vUv + texel * vec2( 1.0, 1.0)).rgb;
      gl_FragColor = vec4(c / 8.0, 1.0);
    }`, { tex: { value: null }, texel: { value: new THREE.Vector2() } });
  P.mUp = ppMat(`
    uniform sampler2D tex; uniform sampler2D tBase; uniform vec2 texel; uniform float spread; varying vec2 vUv;
    void main(){
      vec2 t = texel * spread;
      vec3 c = texture2D(tex, vUv + vec2(-2.0*t.x, 0.0)).rgb + texture2D(tex, vUv + vec2(2.0*t.x, 0.0)).rgb
             + texture2D(tex, vUv + vec2(0.0, -2.0*t.y)).rgb + texture2D(tex, vUv + vec2(0.0, 2.0*t.y)).rgb;
      c += 2.0 * (texture2D(tex, vUv + vec2(-t.x, t.y)).rgb + texture2D(tex, vUv + vec2(t.x, t.y)).rgb
             + texture2D(tex, vUv + vec2(-t.x, -t.y)).rgb + texture2D(tex, vUv + vec2(t.x, -t.y)).rgb);
      gl_FragColor = vec4(c / 12.0 + texture2D(tBase, vUv).rgb, 1.0);
    }`, { tex: { value: null }, tBase: { value: null }, texel: { value: new THREE.Vector2() }, spread: { value: 1.0 } });
  P.mComp = ppMat(`
    uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 uRes;
    uniform float uBloom; uniform float uExposure; uniform float uTime; uniform float uVig; uniform float uGrain;
    uniform float uFlash; uniform float uCine; uniform float uCA; uniform float uSat;
    varying vec2 vUv;
    vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
      const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
      c = I * (c / 0.6); c = rrt(c); c = O * c; return clamp(c, 0.0, 1.0);
    }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec2 uv = vUv, d = uv - 0.5;
      float ca = uCA * dot(d, d);
      vec3 col = vec3(texture2D(tScene, uv - d * ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv + d * ca).b);
      col += texture2D(tBloom, uv).rgb * uBloom;
      col = aces(col * uExposure);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(l), col, uSat - uCine * 0.3), 0.0);
      col *= mix(vec3(0.94, 0.98, 1.06), vec3(1.04, 1.0, 0.95), smoothstep(0.15, 0.85, l));
      float vg = smoothstep(1.2, 0.3, length(d * vec2(uRes.x / uRes.y, 1.0)));
      col *= mix(1.0 - uVig - uCine * 0.3, 1.0, vg);
      col = toSRGB(clamp(col, 0.0, 1.0));
      col += (hash(uv * uRes + fract(uTime * 7.31) * 113.0) - 0.5) * uGrain;
      col = mix(col, vec3(1.0), uFlash);
      float bars = uCine * 0.105;
      col *= step(bars, uv.y) * step(uv.y, 1.0 - bars);
      gl_FragColor = vec4(col, 1.0);
    }`, { tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uBloom: { value: 0.45 },
    uExposure: { value: 1.12 }, uTime: { value: 0 }, uVig: { value: 0.32 }, uGrain: { value: 0.028 }, uFlash: { value: 0 },
    uCine: { value: 0 }, uCA: { value: 0.006 }, uSat: { value: 1.1 } });
}
function resizePost(w, h) {
  const P = R.pp;
  P.main.setSize(w, h);
  let bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
  for (let i = 0; i < P.levels; i++) {
    P.down[i].setSize(bw, bh); P.up[i].setSize(bw, bh);
    bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
  }
  P.mComp.uniforms.uRes.value.set(w, h);
}
function ppPass(mat, target) { const P = R.pp; P.quad.material = mat; R.r.setRenderTarget(target); R.r.render(P.scene, P.cam); }
function renderPost() {
  const P = R.pp, L = R.quality === 'high' ? P.levels : P.levels - 1;
  P.mPre.uniforms.tex.value = P.main.texture;
  P.mPre.uniforms.texel.value.set(1 / P.main.width, 1 / P.main.height);
  ppPass(P.mPre, P.down[0]);
  for (let i = 1; i < L; i++) {
    P.mDown.uniforms.tex.value = P.down[i - 1].texture;
    P.mDown.uniforms.texel.value.set(1 / P.down[i - 1].width, 1 / P.down[i - 1].height);
    ppPass(P.mDown, P.down[i]);
  }
  let src = P.down[L - 1];
  for (let i = L - 2; i >= 0; i--) {
    P.mUp.uniforms.tex.value = src.texture; P.mUp.uniforms.tBase.value = P.down[i].texture;
    P.mUp.uniforms.texel.value.set(1 / src.width, 1 / src.height);
    ppPass(P.mUp, P.up[i]);
    src = P.up[i];
  }
  const U = P.mComp.uniforms;
  U.tScene.value = P.main.texture; U.tBloom.value = src.texture;
  U.uTime.value = R.t; U.uFlash.value = R.flash; U.uCine.value = R.cine;
  U.uBloom.value = 0.42 + R.excite * 0.1;
  ppPass(P.mComp, null);
}

/* ---------------- per frame ---------------- */
function snapshotPrev() {
  if (!R.prev) return;
  G.players.forEach((p, i) => { const q = R.prev[i]; q.x = p.x; q.y = p.y; q.z = p.z; q.f = p.face; });
  const b = G.ball; R.prevBall.x = b.x; R.prevBall.y = b.y; R.prevBall.z = b.z;
}
function renderFrame(dt, rdt) {
  if (!R.ready) return;
  R.t += rdt;
  R.flash = Math.max(0, R.flash - rdt * 3);
  R.cine = damp(R.cine, R.slowmo > 0 ? 1 : 0, 6, rdt);
  if (R.players.length) updateWorld(dt, rdt);
  updateCamera(rdt);
  const r = R.r;
  if (R.quality === 'low') {
    if (R.floorU) R.floorU.reflStr.value = 0;
    r.setRenderTarget(null);
    r.render(R.scene, R.cam);
    return;
  }
  r.shadowMap.needsUpdate = true;
  if (R.floorU) R.floorU.reflStr.value = R.reflStrength == null ? 2.1 : R.reflStrength;
  renderReflection();
  if (R.debugView === 'refl') {
    if (!R.pp.mCopy) R.pp.mCopy = ppMat('uniform sampler2D tex; varying vec2 vUv; void main(){ gl_FragColor = vec4(pow(texture2D(tex, vUv).rgb, vec3(0.4545)), 1.0); }', { tex: { value: null } });
    R.pp.mCopy.uniforms.tex.value = R.reflRT.texture; ppPass(R.pp.mCopy, null); return;
  }
  r.setRenderTarget(R.pp.main);
  r.clear();
  r.render(R.scene, R.cam);
  renderPost();
}

/* ---------------- camera ---------------- */
const CAMS = {
  broadcast: { H: 33, D: 58, fov: 34 },
  close: { H: 22, D: 44, fov: 40 },
  sky: { H: 58, D: 56, fov: 40 },
};
function camTargets(dt) {
  if (R.debugCam) return { pos: R.debugCam.pos.clone(), look: R.debugCam.look.clone(), fov: R.debugCam.fov || 40 };
  const b = G.ball, C = CAMS[R.camMode] || CAMS.broadcast;
  let fx = b.x, fz = b.z;
  if (b.state === 'held' && b.holder) { fx = b.holder.x + b.holder.vx * 0.35; fz = b.holder.z; }
  if (b.state === 'shot' && b.shooter) fx = lerp(b.x, b.shooter.team.dir * CT.RIM_X, 0.5);
  if (G.state === 'dead' && G.dead) { fx = lerp(G.dead.sx, G.dead.rx, 0.5); fz = 0; }
  const lx = clamp(fx * 0.85, -31, 31), lz = clamp(fz * 0.22, -4, 5) + 1.5;
  const sway = Math.sin(R.t * 0.37) * 0.35 + Math.sin(R.t * 0.71) * 0.2;
  let pos = V3(lx * 0.92 + sway, C.H + Math.sin(R.t * 0.29) * 0.25, C.D + lz * 0.5), look = V3(lx, 3.2, lz);
  let fov = C.fov;
  R.camRate = null;
  if (R.camMode === 'third' && G.ctrl && G.userTeam >= 0 && !G.auto && !G.attract && G.mode !== 'threept') {
    const t = thirdPerson(dt);
    if (t) { pos = t.pos; look = t.look; fov = t.fov; R.camRate = [7, 9]; }
  }
  if ((G.state === 'ft' || G.state === 'ftcut') && G.ft && G.ft.placed) {
    const sh = G.ft.shooter, s = sh.team.dir;
    pos = V3(sh.x - s * 16, 10.5, sh.z + 8); look = V3(s * CT.RIM_X, 8, 0); fov = 40;
  } else if (G.mode === 'threept' && G.tp) {
    const sh = G.tp.sh;
    let dx = sh.x - CT.RIM_X, dz = sh.z; const dl = hyp(dx, dz) || 1; dx /= dl; dz /= dl;
    const side = sh.z >= 0 ? 1 : -1;
    pos = V3(sh.x + dx * 15 - dz * 6 * side, 9.5, sh.z + dz * 15 + dx * 6 * side);
    look = V3(lerp(sh.x, CT.RIM_X, 0.42), 6.2, sh.z * 0.58); fov = 44;
  } else if (G.state === 'tip') {
    const u = clamp(G.stT / 1.3, 0, 1), a = lerp(-0.9, -0.15, smooth(u));
    pos = V3(Math.sin(a) * 40, lerp(9, 22, smooth(u)), Math.cos(a) * 40); look = V3(0, lerp(9, 5, u), 0); fov = 40;
  } else if (G.state === 'final' && !G.attract) {
    const a = R.t * 0.12;
    pos = V3(Math.sin(a) * 34, 12, Math.cos(a) * 34); look = V3(0, 5, 0); fov = 42;
  }
  if (G.attract) {
    // cinematic cuts in the menu: broadcast, low baseline, slow orbit
    const shot = Math.floor(R.t / 9) % 3;
    if (shot === 1) {
      const s = b.x >= 0 ? 1 : -1;
      pos = V3(s * 58, 7, -10 + Math.sin(R.t * 0.2) * 6); look = V3(s * 20, 5, 0); fov = 44;
    } else if (shot === 2) {
      const a = R.t * 0.09;
      pos = V3(Math.sin(a) * 52, 15, Math.cos(a) * 44); look = V3(b.x * 0.4, 4, b.z * 0.3); fov = 42;
    } else { pos.y += 4; }
    if (R.lastShot !== shot) { R.lastShot = shot; R.snapCam = true; }
  }
  if (R.show > 0) {
    const u = 1 - R.show / R.showDur, a = -1.6 + u * 2.4;
    pos = V3(Math.sin(a) * lerp(46, 36, u), lerp(5, 15, smooth(u)), Math.cos(a) * lerp(46, 36, u)); look = V3(0, lerp(10, 5, u), 0); fov = 46;
  }
  if (R.slowmo > 0 && R.slowSide) {
    const s = R.slowSide;
    pos = V3(s * 26, 9, 24); look = V3(s * CT.RIM_X, 8.6, 0); fov = 34;
  }
  return { pos, look, fov };
}
/* Third person: over the controlled player's shoulder. Offense looks at the basket being attacked,
   defense looks at the ball handler, loose balls and shots pull the view toward the ball. */
function thirdPerson(dt) {
  const p = G.ctrl, b = G.ball;
  if (!p || p.z < -100) return null;
  const off = p.team.idx === G.offense;
  const hx = hoopX(p.team);
  let tx, tz;
  if (b.state === 'shot' && b.shooter) { tx = b.shooter.team.dir * CT.RIM_X; tz = 0; }
  else if (b.state === 'loose') { tx = b.x; tz = b.z; }
  else if (off) { const own = p.hasBall; tx = own ? hx : lerp(hx, b.x, 0.4); tz = own ? 0 : lerp(0, b.z, 0.4); }
  else { const h = b.holder || (b.state === 'pass' ? b.passTo : null); tx = h ? h.x : b.x; tz = h ? h.z : b.z; }
  if (G.state === 'dead' && G.dead) { tx = G.dead.inb.x; tz = G.dead.inb.z; if (G.dead.inb === p) { tx = 0; tz = 0; } }
  const dx = tx - p.x, dz = tz - p.z;
  let want = R.tpYaw == null ? Math.atan2(dz, dx) : R.tpYaw;
  if (hyp(dx, dz) > 6) want = Math.atan2(dz, dx);
  if (R.tpYaw == null || R.snapCam) R.tpYaw = want;
  else R.tpYaw += angDiff(R.tpYaw, want) * (1 - Math.exp(-2.4 * dt));
  const fx = Math.cos(R.tpYaw), fz = Math.sin(R.tpYaw);
  const dist = 13.5, height = 8.4, side = 2.0;
  let cx = p.x - fx * dist - fz * side, cz = p.z - fz * dist + fx * side;
  cx = clamp(cx, -54, 54); cz = clamp(cz, -32, 32);
  const lift = b.state === 'shot' ? clamp(b.y - 8, 0, 8) * 0.45 : 0;
  return { pos: V3(cx, height + p.y * 0.35, cz), look: V3(p.x + fx * 7, 3.4 + lift, p.z + fz * 7), fov: 54 };
}
function updateCamera(dt) {
  const t = camTargets(dt);
  const aspect = R.cam.aspect;
  let fov = t.fov;
  if (aspect < 1.4) fov = 2 * Math.atan(Math.tan(fov * PI / 360) * 1.42 / aspect) * 180 / PI;
  fov = Math.min(fov, 80);
  if (Math.abs(R.cam.fov - fov) > 0.02) { R.cam.fov = R.snapCam ? fov : lerp(R.cam.fov, fov, 1 - Math.exp(-3 * dt)); R.cam.updateProjectionMatrix(); }
  const rr = R.camRate || [2.6, 3.6];
  const kp = R.snapCam ? 1 : 1 - Math.exp(-rr[0] * dt), kl = R.snapCam ? 1 : 1 - Math.exp(-rr[1] * dt);
  R.snapCam = false;
  R.camPos.lerp(t.pos, kp); R.camLook.lerp(t.look, kl);
  R.cam.position.copy(R.camPos);
  if (R.shake > 0) {
    R.shake = Math.max(0, R.shake - dt * 2.5);
    const s = R.shake * R.shake * 0.5;
    R.cam.position.x += (Math.random() - 0.5) * s; R.cam.position.y += (Math.random() - 0.5) * s;
  }
  R.cam.lookAt(R.camLook);
  R.cam.updateMatrixWorld();
}
/* camera-relative stick mapping: returns world (x, z) for a stick pointing (sx right, sy up) */
function stickToWorld(sx, sy) {
  const f = new THREE.Vector3(); R.cam.getWorldDirection(f);
  f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize();
  const rx = -f.z, rz = f.x;
  return { x: rx * sx + f.x * sy, z: rz * sx + f.z * sy };
}
function projectToScreen(x, y, z) {
  const v = V3(x, y, z).project(R.cam);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, vis: v.z < 1 };
}
