'use strict';
// ============================================================
// WebGL2 renderer
// ============================================================

const LIGHT_GLSL = `
uniform vec4 uL[32];
uniform vec3 uLC[32];
uniform int uLN;
vec3 pointLights(vec3 w) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= uLN) break;
    vec4 L = uL[i];
    float a = clamp(1.0 - distance(w, L.xyz) / L.w, 0.0, 1.0);
    s += uLC[i] * a * a;
  }
  return s;
}`;

const CHUNK_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aShade;
layout(location=3) in float aSky;
layout(location=4) in float aFlag;
uniform mat4 uVP; uniform vec3 uCam; uniform float uTime;
out vec2 vUV; out float vShade; out float vSky; out vec3 vW; out float vFlag; out float vDist;
void main() {
  vec3 p = aPos; float f = aFlag;
  if (f > 1.5 && f < 2.5) { p.x += sin(uTime * 1.8 + p.x * 0.5 + p.z * 0.7) * 0.07; p.z += cos(uTime * 1.5 + p.z * 0.5 + p.x * 0.3) * 0.07; }
  else if (f > 2.5 && f < 3.5) { p.x += sin(uTime * 1.3 + p.y + p.z * 0.5) * 0.022; }
  else if ((f > 3.5 && f < 4.5) || (f > 4.5 && f < 5.5)) { p.y += sin(uTime * 1.6 + p.x * 0.6 + p.z * 0.4) * 0.035 - 0.035; }
  vUV = aUV; vShade = aShade; vSky = aSky; vW = p; vFlag = f; vDist = length(p - uCam);
  gl_Position = uVP * vec4(p, 1.0);
}`;
const CHUNK_FS = `#version 300 es
precision highp float;
in vec2 vUV; in float vShade; in float vSky; in vec3 vW; in float vFlag; in float vDist;
uniform sampler2D uTex;
uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
uniform float uSun; uniform vec3 uSunTint; uniform float uAmb; uniform float uAlphaCut; uniform float uTime;
${LIGHT_GLSL}
out vec4 o;
void main() {
  vec4 c = texture(uTex, vUV);
  if (c.a < uAlphaCut) discard;
  vec3 light;
  bool emit = (vFlag > 0.5 && vFlag < 1.5) || vFlag > 4.5;
  if (emit) light = vec3(1.0);
  else {
    vec3 sky = vec3(vSky * uSun) * uSunTint;
    light = min(max(sky, vec3(uAmb)) + pointLights(vW), vec3(1.25)) * vShade;
  }
  vec3 col = c.rgb * light;
  if (vFlag > 4.5) col *= 0.88 + 0.16 * sin(uTime * 2.0 + vW.x * 0.8 + vW.z * 0.6);
  float fog = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  o = vec4(mix(col, uFog, fog), c.a);
}`;

const ENT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
layout(location=2) in float aShade;
layout(location=3) in float aSky;
uniform mat4 uVP; uniform vec3 uCam;
out vec4 vCol; out float vShade; out float vSky; out vec3 vW; out float vDist;
void main() { vCol = aCol; vShade = aShade; vSky = aSky; vW = aPos; vDist = length(aPos - uCam); gl_Position = uVP * vec4(aPos, 1.0); }`;
const ENT_FS = `#version 300 es
precision highp float;
in vec4 vCol; in float vShade; in float vSky; in vec3 vW; in float vDist;
uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
uniform float uSun; uniform vec3 uSunTint; uniform float uAmb; uniform float uNoFog;
${LIGHT_GLSL}
out vec4 o;
void main() {
  vec3 light;
  if (vShade > 1.5) light = vec3(1.0);
  else light = min(max(vec3(vSky * uSun) * uSunTint, vec3(uAmb)) + pointLights(vW), vec3(1.25)) * vShade;
  vec3 col = vCol.rgb * light;
  float fog = uNoFog > 0.5 ? 0.0 : clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  o = vec4(mix(col, uFog, fog), vCol.a);
}`;

const SKY_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vPos;
void main() { vPos = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vPos;
uniform mat4 uInvVP; uniform vec3 uCam; uniform vec3 uSunDir;
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunCol; uniform vec3 uCloudCol;
uniform float uTime; uniform float uStars; uniform float uSunVis; uniform float uMoonVis; uniform float uSunBig;
uniform float uAurora; uniform float uPlanet; uniform float uRainbow; uniform float uNebula;
uniform float uClouds; uniform float uCloudY; uniform float uCloudSea; uniform float uDark;
out vec4 o;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  vec4 w = uInvVP * vec4(vPos, 1.0, 1.0);
  vec3 dir = normalize(w.xyz / w.w - uCam);
  float h = dir.y;
  vec3 col = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.55));
  if (h < 0.0) col = mix(uHor, uHor * 0.55, clamp(-h * 2.5, 0.0, 1.0));
  if (uNebula > 0.0) {
    float n = fbm(dir.xz / (abs(dir.y) + 0.6) * 2.2 + vec2(uTime * 0.004, 0.0));
    col += uNebula * smoothstep(0.45, 0.85, n) * mix(vec3(0.5, 0.15, 0.7), vec3(0.1, 0.5, 0.7), fbm(dir.zx * 3.1)) * 0.6 * smoothstep(-0.1, 0.3, h);
  }
  if (uStars > 0.01 && h > -0.05) {
    vec3 d = dir * 160.0; vec3 c = floor(d); float r = h31(c);
    if (r > 0.986) { float tw = 0.55 + 0.45 * sin(uTime * 2.5 + r * 120.0); float dd = length(fract(d) - 0.5);
      col += uStars * tw * smoothstep(0.32, 0.0, dd) * mix(vec3(1.0), vec3(0.75, 0.85, 1.0), fract(r * 53.0)); }
  }
  if (uAurora > 0.0 && h > 0.05) {
    float band = sin(dir.x * 5.0 + uTime * 0.25 + fbm(dir.xz * 2.5 + uTime * 0.03) * 5.0);
    float a = smoothstep(0.35, 1.0, band) * smoothstep(0.05, 0.35, h) * (1.0 - smoothstep(0.55, 0.95, h));
    col += uAurora * a * mix(vec3(0.15, 1.0, 0.55), vec3(0.6, 0.3, 1.0), smoothstep(0.2, 0.7, h)) * 0.7;
  }
  if (uRainbow > 0.0 && h > -0.02) {
    vec3 rd = normalize(vec3(-uSunDir.x, 0.0, -uSunDir.z));
    float ang = acos(clamp(dot(dir, rd), -1.0, 1.0));
    float t = (ang - 0.62) / 0.09;
    if (t > 0.0 && t < 1.0) col = mix(col, hue(t * 0.8), 0.32 * uRainbow * sin(t * 3.14159) * smoothstep(-0.02, 0.15, h));
  }
  float sd = dot(dir, uSunDir);
  float sr = uSunBig > 0.5 ? 0.9975 : 0.9989;
  col += uSunCol * uSunVis * (smoothstep(sr, sr + 0.0004, sd) * 2.0 + pow(max(sd, 0.0), 48.0) * 0.35 + pow(max(sd, 0.0), 6.0) * 0.08);
  float md = dot(dir, -uSunDir);
  if (uMoonVis > 0.0 && md > 0.9988) { float cr = vn(dir.xy * 900.0); col = mix(col, vec3(0.88, 0.9, 0.96) * (0.8 + 0.2 * cr), uMoonVis); }
  if (uPlanet > 0.0) {
    vec3 pd = normalize(vec3(0.45, 0.42, -0.79));
    float pc = dot(dir, pd);
    if (pc > 0.982) {
      vec3 up = normalize(cross(pd, vec3(0, 1, 0))); vec3 vv = cross(up, pd);
      vec2 uv = vec2(dot(dir, up), dot(dir, vv)) / 0.19;
      float land = smoothstep(0.52, 0.56, fbm(uv * 3.0 + 7.0));
      vec3 pcol = mix(vec3(0.15, 0.4, 0.95), vec3(0.3, 0.75, 0.3), land);
      pcol = mix(pcol, vec3(1.0), smoothstep(0.6, 0.75, fbm(uv * 4.0 + uTime * 0.01)) * 0.8);
      float lit = clamp(dot(normalize(vec3(uv, sqrt(max(0.0, 1.0 - dot(uv, uv))))), normalize(vec3(-0.6, 0.3, 0.75))), 0.08, 1.0);
      col = mix(col, pcol * lit, smoothstep(0.982, 0.9835, pc));
    } else if (pc > 0.978) col += vec3(0.3, 0.5, 1.0) * smoothstep(0.978, 0.982, pc) * 0.5;
  }
  if (uClouds > 0.0 && h > 0.01 && uCam.y < uCloudY) {
    float t = (uCloudY - uCam.y) / h; vec2 p = uCam.xz + dir.xz * t;
    float n = fbm(p * 0.006 + vec2(uTime * 0.008, 0.0));
    float cl = smoothstep(0.5, 0.72, n) * (1.0 - smoothstep(600.0, 2600.0, t));
    col = mix(col, uCloudCol * (0.85 + 0.25 * n), cl * 0.9 * uClouds);
  }
  if (uCloudSea > 0.0 && h < -0.005) {
    float t = (uCam.y - 8.0) / -h; vec2 p = uCam.xz + dir.xz * t;
    float n = fbm(p * 0.01 + vec2(uTime * 0.01, uTime * 0.004));
    float cl = smoothstep(0.25, 0.55, n);
    col = mix(col, uCloudCol * (0.7 + 0.45 * n), cl * (1.0 - smoothstep(800.0, 4000.0, t)) * 0.95);
  }
  o = vec4(col * (1.0 - uDark), 1.0);
}`;

const Renderer = {
  gl: null, canvas: null,
  init(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) return false;
    this.gl = gl;
    this.pChunk = this.program(CHUNK_VS, CHUNK_FS);
    this.pEnt = this.program(ENT_VS, ENT_FS);
    this.pSky = this.program(SKY_VS, SKY_FS);
    // atlas
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ATLAS_CANVAS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // sky quad
    this.skyVao = gl.createVertexArray(); gl.bindVertexArray(this.skyVao);
    const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // dynamic entity buffer
    this.entVao = gl.createVertexArray(); gl.bindVertexArray(this.entVao);
    this.entBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.entBuf);
    this.setupEntAttribs();
    // dynamic chunk-format buffer (crack overlay)
    this.dynVao = gl.createVertexArray(); gl.bindVertexArray(this.dynVao);
    this.dynBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
    this.setupChunkAttribs();
    gl.bindVertexArray(null);
    this.lightArr = new Float32Array(128); this.lightCol = new Float32Array(96); this.lightN = 0;
    return true;
  },
  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace('[0]', ''); u[name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  },
  setupChunkAttribs() {
    const gl = this.gl, st = 32;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, st, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 24);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, st, 28);
  },
  setupEntAttribs() {
    const gl = this.gl, st = 36;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, st, 28);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 32);
  },
  uploadChunk(c, opaque, trans) {
    const gl = this.gl;
    if (!c.gl) {
      c.gl = { vaoO: gl.createVertexArray(), bufO: gl.createBuffer(), vaoT: gl.createVertexArray(), bufT: gl.createBuffer(), nO: 0, nT: 0 };
      gl.bindVertexArray(c.gl.vaoO); gl.bindBuffer(gl.ARRAY_BUFFER, c.gl.bufO); this.setupChunkAttribs();
      gl.bindVertexArray(c.gl.vaoT); gl.bindBuffer(gl.ARRAY_BUFFER, c.gl.bufT); this.setupChunkAttribs();
      gl.bindVertexArray(null);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, c.gl.bufO); gl.bufferData(gl.ARRAY_BUFFER, opaque, gl.STATIC_DRAW); c.gl.nO = opaque.length / 8;
    gl.bindBuffer(gl.ARRAY_BUFFER, c.gl.bufT); gl.bufferData(gl.ARRAY_BUFFER, trans, gl.STATIC_DRAW); c.gl.nT = trans.length / 8;
  },
  freeChunk(c) {
    if (!c.gl) return;
    const gl = this.gl;
    gl.deleteBuffer(c.gl.bufO); gl.deleteBuffer(c.gl.bufT); gl.deleteVertexArray(c.gl.vaoO); gl.deleteVertexArray(c.gl.vaoT);
    c.gl = null;
  },
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, Settings.data.pixelRatio);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  },
  setLights(list) {
    const n = Math.min(32, list.length);
    for (let i = 0; i < n; i++) {
      const l = list[i];
      this.lightArr[i * 4] = l[0]; this.lightArr[i * 4 + 1] = l[1]; this.lightArr[i * 4 + 2] = l[2]; this.lightArr[i * 4 + 3] = l[3];
      this.lightCol[i * 3] = l[4] * 0.95; this.lightCol[i * 3 + 1] = l[5] * 0.95; this.lightCol[i * 3 + 2] = l[6] * 0.95;
    }
    this.lightN = n;
  },
  commonUniforms(prog, s) {
    const gl = this.gl, u = prog.u;
    gl.uniformMatrix4fv(u.uVP, false, s.vp);
    gl.uniform3fv(u.uCam, s.cam);
    gl.uniform3fv(u.uFog, s.fog);
    gl.uniform1f(u.uFogNear, s.fogNear); gl.uniform1f(u.uFogFar, s.fogFar);
    gl.uniform1f(u.uSun, s.sun); gl.uniform3fv(u.uSunTint, s.sunTint); gl.uniform1f(u.uAmb, s.amb);
    gl.uniform4fv(u.uL, this.lightArr); gl.uniform3fv(u.uLC, this.lightCol); gl.uniform1i(u.uLN, this.lightN);
  },
  drawEnt(data, count, mode, s, depth = true, noFog = 0) {
    if (!count) return;
    const gl = this.gl;
    gl.useProgram(this.pEnt.p);
    this.commonUniforms(this.pEnt, s);
    gl.uniform1f(this.pEnt.u.uNoFog, noFog);
    gl.bindVertexArray(this.entVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.entBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 9), gl.DYNAMIC_DRAW);
    if (!depth) gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(mode, 0, count);
    if (!depth) gl.enable(gl.DEPTH_TEST);
  },
  // s = scene: { vp, invVP, cam, fog, fogNear, fogFar, sun, sunTint, amb, time, sky, world, ents, entN, parts, partN, lines, lineN, crack, xray, xrayN, echo, echoN }
  render(s) {
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(s.fog[0], s.fog[1], s.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky
    if (s.sky) {
      const k = s.sky, u = this.pSky.u;
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.useProgram(this.pSky.p);
      gl.uniformMatrix4fv(u.uInvVP, false, s.invVP);
      gl.uniform3fv(u.uCam, s.cam); gl.uniform3fv(u.uSunDir, k.sunDir);
      gl.uniform3fv(u.uZen, k.zen); gl.uniform3fv(u.uHor, k.hor); gl.uniform3fv(u.uSunCol, k.sunCol); gl.uniform3fv(u.uCloudCol, k.cloudCol);
      gl.uniform1f(u.uTime, s.time); gl.uniform1f(u.uStars, k.stars); gl.uniform1f(u.uSunVis, k.sunVis); gl.uniform1f(u.uMoonVis, k.moonVis);
      gl.uniform1f(u.uSunBig, k.sunBig); gl.uniform1f(u.uAurora, k.aurora); gl.uniform1f(u.uPlanet, k.planet); gl.uniform1f(u.uRainbow, k.rainbow);
      gl.uniform1f(u.uNebula, k.nebula); gl.uniform1f(u.uClouds, k.clouds); gl.uniform1f(u.uCloudY, k.cloudY); gl.uniform1f(u.uCloudSea, k.cloudSea);
      gl.uniform1f(u.uDark, k.dark || 0);
      gl.bindVertexArray(this.skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
    // opaque chunks
    const P = this.pChunk;
    gl.useProgram(P.p);
    this.commonUniforms(P, s);
    gl.uniform1f(P.u.uTime, s.time); gl.uniform1f(P.u.uAlphaCut, 0.5);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(P.u.uTex, 0);
    const planes = frustumPlanes(s.vp), vis = [];
    for (const c of s.world.chunks.values()) {
      if (!c.gl) continue;
      const x0 = c.cx * 16, z0 = c.cz * 16;
      if (!boxInFrustum(planes, x0, 0, z0, x0 + 16, c.maxY + 2, z0 + 16)) continue;
      const d = (x0 + 8 - s.cam[0]) ** 2 + (z0 + 8 - s.cam[2]) ** 2;
      vis.push([c, d]);
    }
    vis.sort((a, b) => a[1] - b[1]);
    for (const [c] of vis) if (c.gl.nO) { gl.bindVertexArray(c.gl.vaoO); gl.drawArrays(gl.TRIANGLES, 0, c.gl.nO); }
    // entities
    gl.disable(gl.CULL_FACE);
    this.drawEnt(s.ents, s.entN, gl.TRIANGLES, s);
    // crack overlay
    if (s.crack) {
      gl.useProgram(P.p);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -1); gl.depthMask(false);
      gl.uniform1f(P.u.uAlphaCut, 0.02);
      gl.bindVertexArray(this.dynVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
      gl.bufferData(gl.ARRAY_BUFFER, s.crack, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, s.crack.length / 8);
      gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true); gl.disable(gl.BLEND);
    }
    // selection outline
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawEnt(s.lines, s.lineN, gl.LINES, s);
    // transparent chunks (far to near)
    gl.useProgram(P.p);
    this.commonUniforms(P, s);
    gl.uniform1f(P.u.uAlphaCut, 0.02);
    gl.depthMask(false);
    for (let i = vis.length - 1; i >= 0; i--) { const c = vis[i][0]; if (c.gl.nT) { gl.bindVertexArray(c.gl.vaoT); gl.drawArrays(gl.TRIANGLES, 0, c.gl.nT); } }
    // particles (alpha)
    this.drawEnt(s.parts, s.partN, gl.TRIANGLES, s);
    // x-ray / echo overlays
    if (s.xrayN) this.drawEnt(s.xray, s.xrayN, gl.TRIANGLES, s, false, 1);
    if (s.echoN) this.drawEnt(s.echo, s.echoN, gl.TRIANGLES, s, false, 1);
    gl.depthMask(true); gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  },
};

// ---------------- Box batching for entities / particles ----------------
class Batch {
  constructor(maxVerts) { this.d = new Float32Array(maxVerts * 9); this.n = 0; this.max = maxVerts; }
  reset() { this.n = 0; }
  v(x, y, z, r, g, b, a, shade, sky) {
    if (this.n >= this.max) return;
    const d = this.d, i = this.n * 9;
    d[i] = x; d[i + 1] = y; d[i + 2] = z; d[i + 3] = r; d[i + 4] = g; d[i + 5] = b; d[i + 6] = a; d[i + 7] = shade; d[i + 8] = sky;
    this.n++;
  }
  // axis-aligned box
  box(x0, y0, z0, x1, y1, z1, r, g, b, a, sky, emissive) {
    const C = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    this.faces(C, r, g, b, a, sky, emissive);
  }
  faces(C, r, g, b, a, sky, emissive) {
    const F = [[4, 5, 6, 7, 0.88], [1, 0, 3, 2, 0.88], [5, 1, 2, 6, 0.74], [0, 4, 7, 3, 0.74], [7, 6, 2, 3, 1], [0, 1, 5, 4, 0.55]];
    for (const f of F) {
      const sh = emissive ? 2 : f[4];
      for (const k of [0, 1, 2, 0, 2, 3]) { const p = C[f[k]]; this.v(p[0], p[1], p[2], r, g, b, a, sh, sky); }
    }
  }
  line(x0, y0, z0, x1, y1, z1, r, g, b, a) { this.v(x0, y0, z0, r, g, b, a, 2, 1); this.v(x1, y1, z1, r, g, b, a, 2, 1); }
  wireBox(x0, y0, z0, x1, y1, z1, r, g, b, a) {
    const E = [[x0, y0, z0, x1, y0, z0], [x0, y1, z0, x1, y1, z0], [x0, y0, z1, x1, y0, z1], [x0, y1, z1, x1, y1, z1],
      [x0, y0, z0, x0, y1, z0], [x1, y0, z0, x1, y1, z0], [x0, y0, z1, x0, y1, z1], [x1, y0, z1, x1, y1, z1],
      [x0, y0, z0, x0, y0, z1], [x1, y0, z0, x1, y0, z1], [x0, y1, z0, x0, y1, z1], [x1, y1, z0, x1, y1, z1]];
    for (const e of E) this.line(e[0], e[1], e[2], e[3], e[4], e[5], r, g, b, a);
  }
}

// crack overlay vertices (chunk vertex format) for a block
function crackVerts(x, y, z, stage) {
  const tile = TILE['crack' + clamp(stage, 0, 7)], u0 = (tile & 15) / 16, v0 = (tile >> 4) / 16;
  const out = new Float32Array(36 * 8); let n = 0;
  const e = 0.003;
  for (let f = 0; f < 6; f++) {
    const verts = FACE_V[f];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const v = verts[k];
      out[n++] = x + (v[0] ? 1 + e : -e); out[n++] = y + (v[1] ? 1 + e : -e); out[n++] = z + (v[2] ? 1 + e : -e);
      out[n++] = u0 + v[3] / 16; out[n++] = v0 + v[4] / 16; out[n++] = FACE_SHADE[f]; out[n++] = 1; out[n++] = 1;
    }
  }
  return out;
}
