// Shared game context. Modules attach themselves here so systems can reach
// each other without a tangle of circular imports.
export const G = {
  scene: null,
  camera: null,
  renderer: null,
  post: null,
  input: null,
  audio: null,
  world: null,
  terrain: null,
  sky: null,
  water: null,
  foliage: null,
  epochs: null,
  collision: null,
  player: null,
  cam: null,
  fx: null,
  ui: null,
  hud: null,
  game: null,
  // timing
  time: 0, // seconds since start (real, unscaled)
  gameTime: 0, // scaled time
  dt: 0,
  worldScale: 1, // time scale for enemies/projectiles (slow-mo)
  playerScale: 1,
  hitstop: 0,
  quality: 'high',
  settings: {
    quality: 'high',
    sensitivity: 1,
    invertY: false,
    volume: 0.8,
    music: 0.6,
    difficulty: 'balanced',
    fov: 70,
    shake: 1,
  },
  debug: {},
};

// Game-time scheduler: callbacks fire after N seconds of (unpaused) play.
const timers = [];
G.after = (sec, fn) => {
  timers.push({ t: sec, fn });
};
G.tickTimers = (dt) => {
  for (let i = timers.length - 1; i >= 0; i--) {
    const tm = timers[i];
    tm.t -= dt;
    if (tm.t <= 0) {
      timers.splice(i, 1);
      try {
        tm.fn();
      } catch (e) {
        console.error(e);
      }
    }
  }
};

export const WORLD_SIZE = 1600;
export const HALF_WORLD = WORLD_SIZE / 2;
