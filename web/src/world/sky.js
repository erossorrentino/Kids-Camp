import * as THREE from '../../vendor/three/three.module.js';

const VERTEX = `
varying vec3 vWorldPos;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// Three-stop vertical gradient (horizon haze -> sky blue -> deep zenith) plus
// a soft sun glow disc, replacing a flat background color with something
// that actually reads as atmosphere. Cheap: one big inverted sphere, no
// lighting interaction, drawn first with depthWrite off so it always sits
// behind everything else.
const FRAGMENT = `
uniform vec3 horizonColor;
uniform vec3 skyColor;
uniform vec3 zenithColor;
uniform vec3 sunDirection;
uniform vec3 sunColor;
varying vec3 vWorldPos;

void main() {
  float h = normalize(vWorldPos).y;
  vec3 col = mix(horizonColor, skyColor, smoothstep(0.0, 0.35, h));
  col = mix(col, zenithColor, smoothstep(0.35, 1.0, h));

  float sunAmount = max(dot(normalize(vWorldPos), sunDirection), 0.0);
  col += sunColor * pow(sunAmount, 340.0) * 3.0; // tight bright disc
  col += sunColor * pow(sunAmount, 6.0) * 0.25;  // wider soft glow

  gl_FragColor = vec4(col, 1.0);
}
`;

// A touch smaller than CAMERA.far so the dome is always drawn (never
// clipped) without importing config here and creating a cycle.
const CAMERA_FAR_SAFE = 1300;

const CLEAR = {
  horizon: new THREE.Color(0xcdd9dd), sky: new THREE.Color(0x8fbfe0), zenith: new THREE.Color(0x2f6fb0),
};
// Matches WeatherSystem's old flat storm sky color (0x3a4048) at the
// horizon, darkening further toward the zenith, so a storm rolling in
// dims the whole dome instead of just tinting a flat background color that
// the dome now sits in front of and would otherwise hide completely.
const STORM = {
  horizon: new THREE.Color(0x3a4048), sky: new THREE.Color(0x2c343c), zenith: new THREE.Color(0x1c2126),
};

// Builds the dome and returns update()/setWeather() to call each frame (see
// Game._updateSunFollow and WeatherSystem.update) so the glow disc tracks
// the sun and the palette tracks the clear/storm transition.
export function buildSky(scene) {
  const uniforms = {
    horizonColor: { value: CLEAR.horizon.clone() },
    skyColor: { value: CLEAR.sky.clone() },
    zenithColor: { value: CLEAR.zenith.clone() },
    sunDirection: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xfff6df) },
  };
  const geo = new THREE.SphereGeometry(CAMERA_FAR_SAFE, 24, 16);
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1000;
  scene.add(mesh);

  return {
    mesh,
    // Recenters the dome on the viewer every frame — without this it stays
    // fixed at the world origin, so anywhere far from (0,0,0) (this island
    // is 1400 units across) the camera would be looking at the sphere from
    // off-center, warping the horizon and putting parts of it outside the
    // camera's far plane.
    update(cameraPos, sunWorldPos) {
      mesh.position.copy(cameraPos);
      uniforms.sunDirection.value.copy(sunWorldPos).normalize();
    },
    // t: 0 = fully clear, 1 = fully storm (WeatherSystem.transition).
    setWeather(t) {
      uniforms.horizonColor.value.lerpColors(CLEAR.horizon, STORM.horizon, t);
      uniforms.skyColor.value.lerpColors(CLEAR.sky, STORM.sky, t);
      uniforms.zenithColor.value.lerpColors(CLEAR.zenith, STORM.zenith, t);
    },
  };
}
