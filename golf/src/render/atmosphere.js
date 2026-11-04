// Aerial perspective for every material: three.js's fog chunks are replaced
// (once, before anything compiles) with haze that is thickest near the
// ground and thins with height, so distant hills fade into the sky while
// their peaks stay crisp, and that glows warmer toward the sun. The fog
// object's near/far mean "clear distance" and "visibility" here.
import * as THREE from '../../vendor/three.module.min.js';

let done = false;
export function installAtmosphere() {
  if (done) return;
  done = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogView;
#endif`;
  C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogView = mvPosition.xyz;
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogView;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    vec3 fogCol = fogColor;
  #else
    float fogDist = length( vFogView );
    vec3 fogDirW = ( vec4( vFogView, 0.0 ) * viewMatrix ).xyz / max( fogDist, 1e-4 );
    float fd = max( fogDist - fogNear, 0.0 );
    // exponential height haze: integrate the density along the view ray
    const float fogB = 1.0 / 380.0;
    float dy = fogDirW.y * fd * fogB;
    float hTerm = abs( dy ) > 1e-3 ? ( 1.0 - exp( -dy ) ) / dy : 1.0;
    float dens = 2.6 / max( fogFar - fogNear, 1.0 );
    float fogFactor = 1.0 - exp( -fd * dens * exp( -clamp( cameraPosition.y, -60.0, 600.0 ) * fogB ) * hTerm );
    vec3 fogCol = fogColor;
    #if defined( LAMBERT ) || defined( PHONG ) || defined( STANDARD ) || defined( TOON )
      #if NUM_DIR_LIGHTS > 0
        float fcs = max( dot( normalize( vFogView ), directionalLights[ 0 ].direction ), 0.0 );
        fogCol += directionalLights[ 0 ].color * ( pow( fcs, 6.0 ) * 0.05 + pow( fcs, 48.0 ) * 0.09 );
      #endif
    #endif
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, clamp( fogFactor, 0.0, 1.0 ) );
#endif`;
}

// Shadows of the clouds drifting across the ground (shared by the terrain
// and the trees). uCloudOffset moves with the wind; uCloudCover follows the
// sky's cloud cover.
export const CLOUD_UNIFORMS = {
  uCloudOffset: { value: new THREE.Vector2(0, 0) },
  uCloudCover: { value: 0.35 },
  uCloudShadow: { value: 1 },
};
export const CLOUD_GLSL = `
uniform vec2 uCloudOffset;
uniform float uCloudCover, uCloudShadow;
float csHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float csNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(csHash(i), csHash(i + vec2(1, 0)), u.x), mix(csHash(i + vec2(0, 1)), csHash(i + vec2(1, 1)), u.x), u.y); }
float cloudShadow(vec2 wp){
  if (uCloudShadow <= 0.0) return 1.0;
  vec2 p = (wp + uCloudOffset) / 320.0;
  float n = csNoise(p) * 0.55 + csNoise(p * 2.1 + 7.3) * 0.28 + csNoise(p * 4.3 + 1.7) * 0.17;
  float c = smoothstep(1.02 - uCloudCover, 1.18 - uCloudCover, n);
  return 1.0 - 0.72 * c * uCloudShadow;
}
`;
