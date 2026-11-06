import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared GLSL helpers
// ---------------------------------------------------------------------------
export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz+33.33); return fract((p3.xxy + p3.yxx)*p3.zyx); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float vnoise3(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),u.x), mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),u.x),u.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),u.x), mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),u.x),u.y), u.z); }
const mat2 NROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm2(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=NROT*p; a*=.5; } return s; }
float fbm3(vec2 p){ float a=.5, s=0.; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=NROT*p; a*=.5; } return s/0.875; }
float fbm3d(vec3 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
// Voronoi-ish crack pattern: returns distance to cell edge (0 at crack)
float cracks(vec2 p){
  vec2 n = floor(p), f = fract(p); float md = 8.0; vec2 mr;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(float(i),float(j)); vec2 o=hash22(n+g); vec2 r=g+o-f; float d=dot(r,r); if(d<md){md=d; mr=r;} }
  md = 8.0;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(float(i),float(j)); vec2 o=hash22(n+g); vec2 r=g+o-f; if(dot(mr-r,mr-r)>0.00001) md=min(md, dot(0.5*(mr+r), normalize(r-mr))); }
  return md;
}
vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }
`;

// Epoch-wave helpers. Every epoch-aware shader gets the same uniforms so a
// single expanding ring can repaint the whole world.
export const GLSL_EPOCH = /* glsl */ `
uniform int uEpochNew;
uniform int uEpochOld;
uniform vec3 uShiftCenter;
uniform float uShiftRadius;
// returns 0 inside the wave (new epoch), 1 outside (old epoch)
float epochOldMix(vec3 wp){ float d = distance(wp.xz, uShiftCenter.xz); return smoothstep(uShiftRadius - 6.0, uShiftRadius + 6.0, d); }
float epochRing(vec3 wp){ float d = distance(wp.xz, uShiftCenter.xz); float w = abs(d - uShiftRadius); return (1.0 - smoothstep(0.0, 9.0, w)) * step(1.0, uShiftRadius) * (1.0 - smoothstep(900.0, 1300.0, uShiftRadius)); }
`;

// Shared uniforms (plain objects so they are shared by reference across
// every cloned material uniform set; see patchFogChunks).
export const SHARED = {
  sunDir: { x: 0.3, y: 0.8, z: 0.2 },
  sunColor: { x: 1, y: 0.9, z: 0.7 },
  fogParams: { x: 0.0022, y: 0.012, z: 0, w: 0.6 }, // density, height falloff, base height, sun scatter
};

export const EPOCH_UNIFORMS = {
  uEpochNew: { value: 0 },
  uEpochOld: { value: 0 },
  uShiftCenter: { value: new THREE.Vector3() },
  uShiftRadius: { value: 0 },
};
export const TIME_UNIFORM = { value: 0 };
export const WIND_UNIFORM = { value: new THREE.Vector2(1, 0.3) };
export const WET_UNIFORM = { value: 0 };
export const PLAYER_UNIFORM = { value: new THREE.Vector3() };
export const NIGHT_UNIFORM = { value: 0 };

export function fogUniforms() {
  return {
    uFogSunDir: { value: SHARED.sunDir },
    uFogSunColor: { value: SHARED.sunColor },
    uFogParams: { value: SHARED.fogParams },
  };
}

// Replace three's distance fog with an analytic exponential height fog with
// sun in-scattering. Applied globally so every material shares the same
// atmosphere.
export function patchFogChunks() {
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying vec3 vFogWorldPos;
#endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogWorldPos = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorldPos;
  uniform vec3 uFogSunDir;
  uniform vec3 uFogSunColor;
  uniform vec4 uFogParams;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  {
    vec3 fr = vFogWorldPos - cameraPosition;
    float fdist = length(fr);
    vec3 fdir = fr / max(fdist, 1e-4);
    float fh = uFogParams.y;
    float camH = max(cameraPosition.y - uFogParams.z, -50.0);
    float k = fh * fdir.y * fdist;
    float term = abs(k) > 1e-3 ? (1.0 - exp(-k)) / k : 1.0 - 0.5 * k;
    float amt = uFogParams.x * exp(-fh * camH) * fdist * term;
    float fogF = clamp(1.0 - exp(-amt), 0.0, 1.0);
    float sunAmt = pow(max(dot(fdir, uFogSunDir), 0.0), 6.0) * uFogParams.w;
    vec3 fcol = mix(fogColor, uFogSunColor, clamp(sunAmt, 0.0, 1.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fcol, fogF);
  }
#endif`;

  const libs = ['basic', 'lambert', 'phong', 'standard', 'physical', 'toon', 'matcap', 'points', 'sprite'];
  for (const k of libs) {
    const lib = THREE.ShaderLib[k];
    if (!lib) continue;
    Object.assign(lib.uniforms, fogUniforms());
  }
}

// Compose several onBeforeCompile hooks on one material.
export function addCompileHook(mat, fn, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    fn(shader, renderer);
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => prevKey + '|' + (key || fn.toString().length);
  return mat;
}
