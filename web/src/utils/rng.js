// Deterministic PRNG so chunks regenerate identically when revisited.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashChunk(cx, cz, seed) {
  let h = seed ^ 0x9e3779b9;
  h = Math.imul(h ^ cx, 0x85ebca6b);
  h = Math.imul(h ^ cz, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function rngForChunk(cx, cz, seed) {
  return mulberry32(hashChunk(cx, cz, seed));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}
