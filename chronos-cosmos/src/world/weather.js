import { G } from '../core/G.js';
import { EPOCHS } from './epochs.js';

// Weather state machine per Age: clear, cloudy, rain, storm (lightning),
// ashfall, ember storms, meteors and auroras.
export class Weather {
  constructor() {
    this.kind = 'clear';
    this.timer = 120;
    this.state = { cloud: 0, rain: 0, storm: 0, fog: 0, ash: 0, snow: 0, meteors: 0, aurora: 0, wind: 0, wet: 0 };
    this.target = { ...this.state };
    this.boltT = 5;
    G.epochs.onChange((e) => this.pick(e, true));
  }
  pick(e, soon) {
    const list = EPOCHS[e].weather;
    this.kind = list[Math.floor(Math.random() * list.length)];
    this.timer = soon ? 60 + Math.random() * 60 : 150 + Math.random() * 200;
    const T = { cloud: 0, rain: 0, storm: 0, fog: 0, ash: 0, snow: 0, meteors: 0, aurora: 0, wind: 0 };
    switch (this.kind) {
      case 'cloudy': T.cloud = 0.6; T.wind = 0.2; break;
      case 'rain': T.cloud = 0.85; T.rain = 0.8; T.wind = 0.4; T.fog = 0.2; break;
      case 'storm': T.cloud = 1; T.rain = 1; T.storm = 1; T.wind = 0.9; T.fog = 0.3; break;
      case 'ashfall': T.ash = 0.8; T.cloud = 0.3; break;
      case 'emberstorm': T.ash = 1; T.wind = 0.8; T.cloud = 0.5; T.fog = 0.3; break;
      case 'meteors': T.meteors = 1; break;
      case 'aurora': T.aurora = 1; break;
    }
    this.target = T;
  }
  update(dt) {
    if (!dt) return;
    this.timer -= dt;
    if (this.timer <= 0) this.pick(G.epochs.current);
    const s = this.state, T = this.target;
    const k = Math.min(1, dt * 0.08);
    for (const key in T) s[key] += (T[key] - s[key]) * k;
    if (G.game?.inPocket) { s.rain = 0; s.storm = 0; s.ash = 0; }
    s.wet += ((s.rain > 0.3 ? 1 : 0) - s.wet) * Math.min(1, dt * (s.rain > 0.3 ? 0.05 : 0.02));
    G.atmo.weather.cloud = s.cloud;
    G.atmo.weather.rain = s.rain;
    G.atmo.weather.storm = s.storm;
    G.atmo.weather.fog = s.fog;
    G.atmo.weather.ash = s.ash;
    G.atmo.weather.aurora = s.aurora;
    // lightning
    if (s.storm > 0.6) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 4 + Math.random() * 10;
        G.atmo.flash = 1;
        G.after(0.3 + Math.random() * 1.5, () => G.audio?.sfx('thunderBig', { volume: 0.7 }));
      }
    }
    // shooting stars
    if (s.meteors > 0.5 && Math.random() < dt * 0.6 && G.atmo.isNight) {
      const c = G.camera.position;
      const x = c.x + (Math.random() - 0.5) * 400, z = c.z + (Math.random() - 0.5) * 400;
      for (let i = 0; i < 20; i++) G.fx.add.emit({ x: x + i * 2, y: c.y + 150 - i * 1.2, z, vx: 30, vy: -20, vz: 0, life: 0.6 + i * 0.02, size: 3 - i * 0.1, size1: 0.5, color: [3, 3, 4] });
    }
  }
}
