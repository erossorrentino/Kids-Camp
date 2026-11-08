// Player profile, saved in this browser (localStorage). Every access is
// wrapped so the game still works in private windows / blocked storage.
import { catalog } from '../data/cars.js';

const KEY = 'apexVelocity.save.v1';
const START_CREDITS = 25000;

export const DEFAULT_SETTINGS = {
  quality: null, // auto
  difficulty: 'normal', // easy | normal | hard
  assists: { abs: true, tcs: true, stability: true, steering: true, autoBrake: false, line: true },
  manual: false,
  units: 'kmh',
  volume: 0.8,
  camera: 0,
};

function starterCar() {
  // a friendly, cheap little hatchback
  const list = catalog().filter((c) => c.cls === 'compact' && c.price >= 12000 && c.price <= 16000 && c.hp >= 100);
  return list[Math.floor(list.length / 2)] || catalog()[0];
}

export function newProfile() {
  const car = starterCar();
  return {
    version: 1,
    credits: START_CREDITS,
    garage: [{ uid: 'g1', carId: car.id, paint: 0xd0021b, finish: 'gloss', parts: {}, bought: Date.now(), wins: 0, races: 0 }],
    activeUid: 'g1',
    nextUid: 2,
    career: {}, // eventId -> best finishing position
    seriesDone: {}, // seriesId -> true (bonus paid)
    stats: { races: 0, wins: 0, podiums: 0, earned: 0 },
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    welcomeSeen: false,
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.garage && p.garage.length) {
        p.settings = { ...DEFAULT_SETTINGS, ...(p.settings || {}), assists: { ...DEFAULT_SETTINGS.assists, ...(p.settings?.assists || {}) } };
        p.career ||= {}; p.seriesDone ||= {}; p.stats ||= { races: 0, wins: 0, podiums: 0, earned: 0 };
        return p;
      }
    }
  } catch (e) { /* storage unavailable or corrupt */ }
  return newProfile();
}

export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
}

export function resetProfile() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  return newProfile();
}
