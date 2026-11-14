// Player profile, saved in this browser (localStorage). Every access is
// wrapped so the game still works in private windows / blocked storage.
import { catalog } from '../data/cars.js';

const KEY = 'apexVelocity.save.v1';
const START_CREDITS = 25000;

export const DEFAULT_SETTINGS = {
  quality: null, // auto
  difficulty: 'normal', // easy | normal | hard
  assists: { abs: true, tcs: true, stability: true, steering: true, autoBrake: false, autoGas: false, line: true },
  manual: false,
  units: 'kmh',
  volume: 0.8,
  camera: 0,
};

// A phone or tablet: the main pointer is a finger. Touchscreen laptops and
// Chromebooks report a fine pointer (trackpad/mouse) and are not "touch first".
export function isTouchFirst() {
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  } catch (e) { return false; }
}

// Every device starts with the driver in charge of gas and brake
// (Auto accelerate / Auto brake can be switched on in Settings).
const SETTINGS_REV = 2;
function defaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function starterCar() {
  // a friendly, cheap little hatchback
  const list = catalog().filter((c) => c.cls === 'compact' && c.price >= 17000 && c.price <= 21000 && c.hp >= 100);
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
    settings: defaultSettings(),
    settingsRev: SETTINGS_REV,
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
        // Older saves had Auto accelerate + Auto brake switched on for phones: switch them off once
        if (!(p.settingsRev >= SETTINGS_REV)) { p.settings.assists.autoGas = false; p.settings.assists.autoBrake = false; p.settingsRev = SETTINGS_REV; }
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
